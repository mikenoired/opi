import { normalizeTagTitle, uniqueTagTitles } from "@synapse/core";
import type { createContentSchema, updateContentSchema } from "@synapse/shared/schemas";
import { and, asc, desc, eq, gt, ilike, inArray, isNull, lt, lte, ne, or, type SQL, sql } from "drizzle-orm";
import type z from "zod";

import type { Context } from "../context";
import { content, contentTags, edges, nodes, tags } from "../db/schema";
import { ApiError } from "../lib/api-error";
import { requireAuth } from "../lib/auth-guard";
import { isAutomaticTagColorEnabled, randomTagColor } from "../lib/tag-colors";

type DatabaseExecutor = Context["db"];

const LIST_CONTENT_PREVIEW_CHARS = 6_000;

type ContentType = z.infer<typeof createContentSchema>["type"];

const contentListColumns = {
	id: content.id,
	type: content.type,
	content: sql<string>`case
		when ${content.type} in ('media', 'audio', 'todo') then ${content.content}
		else left(${content.content}, ${LIST_CONTENT_PREVIEW_CHARS})
	end`.as("content"),
	title: content.title,
	thumbnailBase64: content.thumbnailBase64,
	documentImages: sql<null>`null`.as("document_images"),
	createdAt: content.createdAt,
	updatedAt: content.updatedAt,
	userId: content.userId,
};

export default class ContentRepository {
	constructor(
		private readonly ctx: Context,
		private readonly database: DatabaseExecutor = ctx.db
	) {}

	withDb(database: DatabaseExecutor) {
		return new ContentRepository(this.ctx, database);
	}

	private buildContentConditions(
		search: string | undefined,
		types: ContentType[] | undefined,
		cursor: string | undefined,
		extraConditions: SQL[] = []
	) {
		const conditions: SQL[] = [eq(content.userId, this.ctx.user!.id), ...extraConditions];

		if (search && search.trim().length > 0) {
			const term = `%${search.trim()}%`;
			conditions.push(or(ilike(content.title, term), ilike(content.content, term))!);
		}

		if (types?.length) {
			conditions.push(inArray(content.type, types));
		}

		if (cursor) {
			const [ts, id] = cursor.split("|");
			if (ts && id) {
				conditions.push(
					or(
						lt(content.createdAt, new Date(ts)),
						and(eq(content.createdAt, new Date(ts)), lt(content.id, id))!
					)!
				);
			}
		}

		return conditions;
	}

	async getAll(
		search: string | undefined,
		types: ContentType[] | undefined,
		cursor: string | undefined,
		limit: number
	) {
		requireAuth(this.ctx);

		const conditions = this.buildContentConditions(search, types, cursor);

		const data = await this.database
			.select(contentListColumns)
			.from(content)
			.where(and(...conditions))
			.orderBy(desc(content.createdAt))
			.limit(limit);

		return data;
	}

	/** No preview truncation: initial Desktop synchronization needs canonical content. */
	async getAllForSync() {
		requireAuth(this.ctx);
		return this.database.select().from(content).where(eq(content.userId, this.ctx.user!.id));
	}

	async getSuggestionTagPriorities(tagIds: string[]) {
		requireAuth(this.ctx);
		if (tagIds.length === 0) return [];

		return await this.database
			.select({
				color: tags.color,
				id: tags.id,
				title: tags.title,
				itemCount: sql<number>`count(${contentTags.contentId})::int`,
			})
			.from(tags)
			.innerJoin(contentTags, and(eq(contentTags.tagId, tags.id), eq(contentTags.userId, this.ctx.user.id)))
			.innerJoin(content, and(eq(content.id, contentTags.contentId), eq(content.userId, this.ctx.user.id)))
			.where(and(inArray(tags.id, tagIds), or(eq(tags.userId, this.ctx.user.id), isNull(tags.userId))!))
			.groupBy(tags.id, tags.color, tags.title)
			.orderBy(asc(sql`count(${contentTags.contentId})`), asc(tags.title), asc(tags.id));
	}

	async getSuggestionsForTag(
		tagId: string,
		higherPriorityTagIds: string[],
		excludedContentId: string,
		cursor: string | undefined,
		limit: number
	) {
		requireAuth(this.ctx);

		const conditions: SQL[] = [
			eq(content.userId, this.ctx.user.id),
			eq(contentTags.userId, this.ctx.user.id),
			eq(contentTags.tagId, tagId),
			ne(content.id, excludedContentId),
		];

		if (higherPriorityTagIds.length > 0) {
			const tagList = sql.join(
				higherPriorityTagIds.map((higherPriorityTagId) => sql`${higherPriorityTagId}`),
				sql`, `
			);
			conditions.push(sql`not exists (
				select 1
				from ${contentTags} higher_priority_tags
				where higher_priority_tags.content_id = ${content.id}
					and higher_priority_tags.user_id = ${this.ctx.user.id}
					and higher_priority_tags.tag_id in (${tagList})
			)`);
		}

		if (cursor) {
			const [timestamp, id] = cursor.split("|");
			if (timestamp && id) {
				const cursorDate = new Date(timestamp);
				if (!Number.isNaN(cursorDate.getTime())) {
					conditions.push(
						or(
							lt(content.createdAt, cursorDate),
							and(eq(content.createdAt, cursorDate), lt(content.id, id))!
						)!
					);
				}
			}
		}

		return await this.database
			.select(contentListColumns)
			.from(content)
			.innerJoin(contentTags, eq(content.id, contentTags.contentId))
			.where(and(...conditions))
			.orderBy(desc(content.createdAt), desc(content.id))
			.limit(limit);
	}

	async searchFtsFiltered(
		search: string,
		types: ContentType[] | undefined,
		tagIds: string[] | undefined,
		limit: number
	) {
		requireAuth(this.ctx);

		const searchQuery = sql`replace(
			plainto_tsquery('russian', ${search})::text,
			' & ',
			' | '
		)::tsquery`;
		const score = sql<number>`ts_rank_cd(${content.searchVector}, ${searchQuery})`;
		const conditions = [eq(content.userId, this.ctx.user.id), sql`${content.searchVector} @@ ${searchQuery}`];

		if (types?.length) conditions.push(inArray(content.type, types));
		if (tagIds?.length) {
			const tagList = sql.join(
				tagIds.map((tagId) => sql`${tagId}`),
				sql`, `
			);
			conditions.push(sql`(
				select count(distinct search_content_tags.tag_id)
				from ${contentTags} search_content_tags
				where search_content_tags.content_id = ${content.id}
					and search_content_tags.user_id = ${this.ctx.user.id}
					and search_content_tags.tag_id in (${tagList})
			) = ${tagIds.length}`);
		}

		return await this.database
			.select(contentListColumns)
			.from(content)
			.where(and(...conditions))
			.orderBy(desc(score), desc(content.createdAt), desc(content.id))
			.limit(limit);
	}

	async getWithTagFilter(
		tagIds: string[],
		limit: number,
		search: string | undefined,
		types: ContentType[] | undefined,
		cursor: string | undefined
	) {
		requireAuth(this.ctx);

		const conditions = this.buildContentConditions(search, types, cursor, [
			inArray(contentTags.tagId, tagIds),
		]);

		const data = await this.database
			.select(contentListColumns)
			.from(content)
			.innerJoin(contentTags, eq(content.id, contentTags.contentId))
			.where(and(...conditions))
			.groupBy(
				content.id,
				content.type,
				content.content,
				content.title,
				content.thumbnailBase64,
				content.createdAt,
				content.updatedAt,
				content.userId
			)
			.having(sql`count(distinct ${contentTags.tagId}) = ${tagIds.length}`)
			.orderBy(desc(content.createdAt))
			.limit(limit);

		return data;
	}

	async contentTagsWithTitles(ids: string[]) {
		requireAuth(this.ctx);

		const data = await this.database
			.select({
				content_id: contentTags.contentId,
				tag_ids: sql<string[]>`array_agg(${contentTags.tagId})`.as("tag_ids"),
				tag_titles: sql<string[]>`array_agg(${tags.title})`.as("tag_titles"),
			})
			.from(contentTags)
			.innerJoin(tags, eq(contentTags.tagId, tags.id))
			.where(
				and(
					inArray(contentTags.contentId, ids),
					eq(contentTags.userId, this.ctx.user.id),
					or(eq(tags.userId, this.ctx.user.id), isNull(tags.userId))!
				)
			)
			.groupBy(contentTags.contentId);

		return data;
	}

	async getAvailableTypes() {
		requireAuth(this.ctx);

		return await this.database
			.select({ type: content.type })
			.from(content)
			.where(eq(content.userId, this.ctx.user.id))
			.groupBy(content.type)
			.orderBy(asc(content.type));
	}

	async getContentTagPage(limit: number, cursor?: { title: string; id: string }) {
		requireAuth(this.ctx);

		const conditions: SQL[] = [
			eq(contentTags.userId, this.ctx.user.id),
			or(eq(tags.userId, this.ctx.user.id), isNull(tags.userId))!,
		];
		if (cursor) {
			conditions.push(
				or(gt(tags.title, cursor.title), and(eq(tags.title, cursor.title), gt(tags.id, cursor.id))!)!
			);
		}

		return await this.database
			.select({
				color: tags.color,
				id: tags.id,
				title: tags.title,
			})
			.from(tags)
			.innerJoin(contentTags, eq(contentTags.tagId, tags.id))
			.where(and(...conditions))
			.groupBy(tags.id, tags.color, tags.title)
			.orderBy(asc(tags.title), asc(tags.id))
			.limit(limit);
	}

	async getTagsWithContentPreview(limitPerTag: number, tagIds?: string[]) {
		requireAuth(this.ctx);

		const rankedContent = this.database
			.select({
				contentId: contentTags.contentId,
				tagId: contentTags.tagId,
				rowNumber:
					sql<number>`row_number() over (partition by ${contentTags.tagId} order by ${content.createdAt} desc, ${content.id} desc)`.as(
						"row_number"
					),
			})
			.from(contentTags)
			.innerJoin(content, eq(content.id, contentTags.contentId))
			.where(
				and(
					eq(contentTags.userId, this.ctx.user.id),
					eq(content.userId, this.ctx.user.id),
					tagIds?.length ? inArray(contentTags.tagId, tagIds) : undefined
				)
			)
			.as("ranked_content");

		const data = await this.database
			.select({
				...contentListColumns,
				tagColor: tags.color,
				tagId: rankedContent.tagId,
				tagTitle: tags.title,
			})
			.from(rankedContent)
			.innerJoin(content, eq(content.id, rankedContent.contentId))
			.innerJoin(tags, eq(tags.id, rankedContent.tagId))
			.where(
				and(
					lte(rankedContent.rowNumber, limitPerTag),
					or(eq(tags.userId, this.ctx.user.id), isNull(tags.userId))!
				)
			)
			.orderBy(asc(tags.title), desc(content.createdAt), desc(content.id));

		return data;
	}

	async getById(id: string) {
		requireAuth(this.ctx);

		const data = await this.database.query.content.findFirst({
			where: and(eq(content.id, id), eq(content.userId, this.ctx.user.id)),
		});

		if (!data) throw new ApiError({ code: "NOT_FOUND", message: "Content not found" });

		return data;
	}

	async getNodeByContentId(id: string) {
		requireAuth(this.ctx);

		const data = await this.database.query.nodes.findFirst({
			where: and(eq(nodes.userId, this.ctx.user.id), sql`${nodes.metadata}->>'content_id' = ${id}`),
			columns: {
				id: true,
			},
		});

		return data;
	}

	async create(contentData: z.infer<typeof createContentSchema>, id?: string) {
		requireAuth(this.ctx);

		const [data] = await this.database
			.insert(content)
			.values({
				...contentData,
				id,
				userId: this.ctx.user.id,
				thumbnailBase64: contentData.thumbnail_base64,
				documentImages: contentData.document_images,
			})
			.returning();

		if (!data) throw new ApiError({ code: "INTERNAL_SERVER_ERROR", message: "Content creation error" });

		return data;
	}

	async getOrCreateTagNodeIds(tagIds: string[]): Promise<Record<string, string>> {
		requireAuth(this.ctx);

		const result: Record<string, string> = {};
		const uniqueIds = Array.from(new Set(tagIds));
		if (uniqueIds.length === 0) return result;

		const existingNodes = await this.database.query.nodes.findMany({
			where: and(
				eq(nodes.userId, this.ctx.user.id),
				eq(nodes.type, "tag"),
				inArray(sql`${nodes.metadata}->>'tag_id'`, uniqueIds)
			),
		});

		for (const row of existingNodes) {
			const meta = row.metadata as { tag_id?: string } | null;
			const tagId = meta?.tag_id;
			if (tagId) result[tagId] = row.id;
		}

		const missing = uniqueIds.filter((id) => !result[id]);
		if (!missing.length) return result;

		const tagsList = await this.database.query.tags.findMany({
			where: and(inArray(tags.id, missing), or(eq(tags.userId, this.ctx.user.id), isNull(tags.userId))!),
		});
		if (tagsList.length !== missing.length) {
			throw new ApiError({ code: "NOT_FOUND", message: "Tag not found" });
		}

		const rows = tagsList.map((t) => ({
			content: t.title ?? "",
			type: "tag",
			userId: this.ctx.user!.id,
			metadata: { tag_id: t.id },
		}));

		if (rows.length) {
			const created = await this.database.insert(nodes).values(rows).returning();

			for (const row of created) {
				const meta = row.metadata as { tag_id?: string } | null;
				const tagId = meta?.tag_id;
				if (tagId) result[tagId] = row.id;
			}
		}

		return result;
	}

	async getOrCreateContentNode(params: { content_id: string; title?: string; type: string }) {
		requireAuth(this.ctx);

		const existing = await this.database.query.nodes.findFirst({
			where: and(
				eq(nodes.userId, this.ctx.user.id),
				sql`${nodes.metadata}->>'content_id' = ${params.content_id}`
			),
			columns: {
				id: true,
			},
		});

		if (existing?.id) return existing.id;

		const [data] = await this.database
			.insert(nodes)
			.values({
				content: params.title ?? "",
				type: params.type,
				userId: this.ctx.user.id,
				metadata: { content_id: params.content_id },
			})
			.returning({ id: nodes.id });

		if (!data) throw new ApiError({ code: "INTERNAL_SERVER_ERROR", message: "Node creation error" });

		return data.id;
	}

	async createContentNode(params: { content_id: string; title?: string; type: string }) {
		requireAuth(this.ctx);

		const [data] = await this.database
			.insert(nodes)
			.values({
				content: params.title ?? "",
				type: params.type,
				userId: this.ctx.user.id,
				metadata: { content_id: params.content_id },
			})
			.returning({ id: nodes.id });

		if (!data) throw new ApiError({ code: "INTERNAL_SERVER_ERROR", message: "Node creation error" });

		return data.id;
	}

	async updateContentNode(params: { content_id: string; title?: string; type: string }) {
		requireAuth(this.ctx);

		const [data] = await this.database
			.update(nodes)
			.set({
				content: params.title ?? "",
				type: params.type,
			})
			.where(
				and(eq(nodes.userId, this.ctx.user.id), sql`${nodes.metadata}->>'content_id' = ${params.content_id}`)
			)
			.returning({ id: nodes.id });

		return data ?? null;
	}

	async createContentTags(tagIds: string[], contentId: string) {
		requireAuth(this.ctx);

		const uniqueTagIds = Array.from(new Set(tagIds));
		if (!uniqueTagIds.length) return;

		const data = await this.database
			.insert(contentTags)
			.values(uniqueTagIds.map((id) => ({ contentId, tagId: id, userId: this.ctx.user!.id })))
			.onConflictDoNothing();

		return data;
	}

	async createEdges(
		edgeRows: {
			from_node: string;
			to_node: string;
			relation_type: string;
			user_id: string;
		}[]
	) {
		const data = await this.database.insert(edges).values(
			edgeRows.map((row) => ({
				fromNode: row.from_node,
				toNode: row.to_node,
				relationType: row.relation_type,
				userId: row.user_id,
			}))
		);

		return data;
	}

	async createContentTagEdges(
		contentNodeId: string,
		tagNodeIdByTagId: Record<string, string>,
		tagIds: string[]
	): Promise<void> {
		const edgeRows = tagIds
			.map((tagId) => ({
				from_node: contentNodeId,
				to_node: tagNodeIdByTagId[tagId],
				relation_type: "content_tag",
				user_id: this.ctx.user!.id,
			}))
			.filter((row): row is { from_node: string; to_node: string; relation_type: string; user_id: string } =>
				Boolean(row.to_node)
			);
		if (edgeRows.length) await this.createEdges(edgeRows);
	}

	async createNode(content: string) {
		requireAuth(this.ctx);

		const [data] = await this.database
			.insert(nodes)
			.values({
				content,
				type: "tag",
				userId: this.ctx.user.id,
			})
			.returning();

		if (!data) throw new ApiError({ code: "INTERNAL_SERVER_ERROR", message: "Node creation error" });

		return data;
	}

	async getTagsByTitle(titles: string[]) {
		requireAuth(this.ctx);

		const normalizedTitles = Array.from(new Set(titles.map(normalizeTagTitle).filter(Boolean)));
		if (!normalizedTitles.length) return [];

		const data = await this.database.query.tags.findMany({
			where: and(
				inArray(sql`lower(btrim(${tags.title}))`, normalizedTitles),
				or(eq(tags.userId, this.ctx.user.id), isNull(tags.userId))!
			),
			columns: {
				color: true,
				id: true,
				title: true,
			},
		});

		return data;
	}

	async getTagById(id: string) {
		requireAuth(this.ctx);

		const data = await this.database.query.tags.findFirst({
			where: and(eq(tags.id, id), or(eq(tags.userId, this.ctx.user.id), isNull(tags.userId))!),
			columns: {
				color: true,
				id: true,
				title: true,
			},
		});

		if (!data) throw new ApiError({ code: "NOT_FOUND", message: "Tag not found" });

		return data;
	}

	async getTags(ids: string[]) {
		requireAuth(this.ctx);

		const data = await this.database.query.tags.findMany({
			where: and(inArray(tags.id, ids), or(eq(tags.userId, this.ctx.user.id), isNull(tags.userId))!),
			columns: {
				color: true,
				id: true,
				title: true,
				userId: true,
			},
		});

		return data;
	}

	async getAllOwnedTagsForSync(): Promise<Array<{ color: number; id: string; title: string }>> {
		requireAuth(this.ctx);
		return this.database
			.select({ color: tags.color, id: tags.id, title: tags.title })
			.from(tags)
			.where(eq(tags.userId, this.ctx.user.id));
	}

	async getTagsForAi(limit = 60): Promise<Array<{ id: string; title: string }>> {
		requireAuth(this.ctx);

		const rows = await this.database
			.select({
				color: tags.color,
				id: tags.id,
				title: tags.title,
			})
			.from(tags)
			.leftJoin(contentTags, and(eq(contentTags.tagId, tags.id), eq(contentTags.userId, this.ctx.user.id)))
			.where(or(eq(tags.userId, this.ctx.user.id), isNull(tags.userId))!)
			.groupBy(tags.id, tags.color, tags.title)
			.orderBy(desc(sql`count(*)`), asc(tags.title))
			.limit(limit);

		return rows.map((row) => ({ id: row.id, title: row.title }));
	}

	async createTags(titles: { title: string }[]) {
		requireAuth(this.ctx);

		const cleanTitles = uniqueTagTitles(titles.map((tag) => tag.title));
		if (!cleanTitles.length) return [];
		const automaticColorEnabled = await isAutomaticTagColorEnabled(this.database, this.ctx.user.id);

		await this.database
			.insert(tags)
			.values(
				cleanTitles.map((title) => ({
					color: randomTagColor(automaticColorEnabled),
					title,
					userId: this.ctx.user!.id,
				}))
			)
			.onConflictDoNothing();

		return await this.getTagsByTitle(cleanTitles);
	}

	async updateTagColor(id: string, color: number) {
		requireAuth(this.ctx);

		const [updated] = await this.database
			.update(tags)
			.set({ color })
			.where(and(eq(tags.id, id), eq(tags.userId, this.ctx.user.id)))
			.returning({ color: tags.color, id: tags.id, title: tags.title });

		if (!updated) throw new ApiError({ code: "NOT_FOUND", message: "Tag not found" });
		return updated;
	}

	async updateContent(updData: z.infer<typeof updateContentSchema>) {
		requireAuth(this.ctx);

		const [data] = await this.database
			.update(content)
			.set({
				...updData,
				updatedAt: new Date(),
				thumbnailBase64: updData.thumbnail_base64,
			})
			.where(and(eq(content.id, updData.id), eq(content.userId, this.ctx.user.id)))
			.returning();

		if (!data) throw new ApiError({ code: "NOT_FOUND", message: "Content not found" });

		return data;
	}

	async updateSearchText(id: string, searchText: string) {
		requireAuth(this.ctx);

		await this.database
			.update(content)
			.set({ searchText, searchVector: sql`to_tsvector('russian', ${searchText})` })
			.where(and(eq(content.id, id), eq(content.userId, this.ctx.user.id)));
	}

	async deleteEdge(contentNodeId: string) {
		requireAuth(this.ctx);

		await this.database
			.delete(edges)
			.where(
				and(
					or(eq(edges.fromNode, contentNodeId), eq(edges.toNode, contentNodeId))!,
					eq(edges.userId, this.ctx.user.id)
				)
			);
	}

	async deleteNode(contentNodeId: string) {
		requireAuth(this.ctx);

		await this.database
			.delete(nodes)
			.where(and(eq(nodes.id, contentNodeId), eq(nodes.userId, this.ctx.user.id)));
	}

	async deleteContentNodeGraph(contentNodeId: string): Promise<void> {
		await this.deleteEdge(contentNodeId);
		await this.deleteNode(contentNodeId);
	}

	async getContentTags() {
		requireAuth(this.ctx);

		const data = await this.database
			.select({
				tag_id: contentTags.tagId,
				content_id: contentTags.contentId,
			})
			.from(contentTags)
			.where(eq(contentTags.userId, this.ctx.user.id));

		return data;
	}

	async deleteContent(id: string) {
		requireAuth(this.ctx);

		await this.database.delete(content).where(and(eq(content.id, id), eq(content.userId, this.ctx.user.id)));
	}

	async deleteTagEdge(contentNodeId: string) {
		requireAuth(this.ctx);

		await this.database
			.delete(edges)
			.where(
				and(
					eq(edges.fromNode, contentNodeId),
					eq(edges.relationType, "content_tag"),
					eq(edges.userId, this.ctx.user.id)
				)
			);
	}

	async deleteContentTag(contentId: string) {
		requireAuth(this.ctx);

		await this.database
			.delete(contentTags)
			.where(and(eq(contentTags.contentId, contentId), eq(contentTags.userId, this.ctx.user.id)));
	}
}
