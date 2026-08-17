import { normalizeTagTitle, resolveTagTitlesToIds } from "@synapse/core";
import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";

import type { Context } from "../../context";
import { contentTags, edges, nodes, tags } from "../../db/schema";
import { isAutomaticTagColorEnabled, randomTagColor } from "../../lib/tag-colors";
import type { UploadContentType } from "./upload-types";

type DatabaseExecutor = Context["db"];

export default class UploadTagService {
	constructor(
		private readonly ctx: Context,
		private readonly database: DatabaseExecutor = ctx.db
	) {}

	withDb(database: DatabaseExecutor) {
		return new UploadTagService(this.ctx, database);
	}

	async attachTags(contentId: string, titles: string[], type: UploadContentType, title?: string) {
		if (!titles.length) return;

		const tagIds = await this.resolveTagTitlesToIds(titles);
		if (!tagIds.length) return;

		const contentNodeId = await this.getOrCreateContentNode({ contentId, title, type });
		const tagNodeIdByTagId = await this.getOrCreateTagNodeIds(tagIds);
		await this.upsertContentTags(contentId, tagIds, contentNodeId, tagNodeIdByTagId);
	}

	private async resolveTagTitlesToIds(titles: string[]): Promise<string[]> {
		const { ids } = await resolveTagTitlesToIds(
			{
				createTags: async (missingTitles) => {
					const userId = this.requireUserId();
					const automaticColorEnabled = await isAutomaticTagColorEnabled(this.database, userId);
					await this.database
						.insert(tags)
						.values(
							missingTitles.map((title) => ({
								color: randomTagColor(automaticColorEnabled),
								title,
								userId,
							}))
						)
						.onConflictDoNothing();
					return await this.findTagsByTitle(missingTitles, false);
				},
				findTagsByTitle: async (tagTitles) => await this.findTagsByTitle(tagTitles),
			},
			titles
		);
		return ids;
	}

	private async findTagsByTitle(titles: string[], includeShared = true) {
		const normalizedTitles = titles.map(normalizeTagTitle).filter(Boolean);
		if (!normalizedTitles.length) return [];
		return await this.database.query.tags.findMany({
			columns: { id: true, title: true },
			where: and(
				inArray(sql`lower(btrim(${tags.title}))`, normalizedTitles),
				includeShared
					? or(eq(tags.userId, this.requireUserId()), isNull(tags.userId))!
					: eq(tags.userId, this.requireUserId())
			),
		});
	}

	private async getOrCreateContentNode(params: {
		contentId: string;
		title?: string;
		type: UploadContentType;
	}) {
		const existingNode = await this.database.query.nodes.findFirst({
			columns: { id: true },
			where: and(
				eq(nodes.userId, this.requireUserId()),
				sql`${nodes.metadata}->>'content_id' = ${params.contentId}`
			),
		});

		if (existingNode?.id) return existingNode.id;

		const [createdNode] = await this.database
			.insert(nodes)
			.values({
				content: params.title ?? "",
				metadata: { content_id: params.contentId },
				type: params.type,
				userId: this.requireUserId(),
			})
			.returning({ id: nodes.id });

		return createdNode.id;
	}

	private async getOrCreateTagNodeIds(tagIds: string[]): Promise<Record<string, string>> {
		const tagNodeIdByTagId: Record<string, string> = {};
		const uniqueTagIds = Array.from(new Set(tagIds));
		if (!uniqueTagIds.length) return tagNodeIdByTagId;

		const existingNodes = await this.database.query.nodes.findMany({
			where: and(
				eq(nodes.userId, this.requireUserId()),
				eq(nodes.type, "tag"),
				inArray(sql`${nodes.metadata}->>'tag_id'`, uniqueTagIds)
			),
		});

		for (const node of existingNodes) {
			const metadata = node.metadata as { tag_id?: string } | null;
			if (metadata?.tag_id) tagNodeIdByTagId[metadata.tag_id] = node.id;
		}

		const missingTagIds = uniqueTagIds.filter((tagId) => !tagNodeIdByTagId[tagId]);
		if (!missingTagIds.length) return tagNodeIdByTagId;

		const tagRows = await this.database.query.tags.findMany({
			where: inArray(tags.id, missingTagIds),
		});

		if (!tagRows.length) return tagNodeIdByTagId;

		const createdNodes = await this.database
			.insert(nodes)
			.values(
				tagRows.map((tag) => ({
					content: tag.title ?? "",
					metadata: { tag_id: tag.id },
					type: "tag",
					userId: this.requireUserId(),
				}))
			)
			.returning();

		for (const node of createdNodes) {
			const metadata = node.metadata as { tag_id?: string } | null;
			if (metadata?.tag_id) tagNodeIdByTagId[metadata.tag_id] = node.id;
		}

		return tagNodeIdByTagId;
	}

	private async upsertContentTags(
		contentId: string,
		tagIds: string[],
		contentNodeId: string,
		tagNodeIdByTagId: Record<string, string>
	) {
		if (!tagIds.length) return;

		const uniqueTagIds = Array.from(new Set(tagIds));

		await this.database
			.insert(contentTags)
			.values(uniqueTagIds.map((tagId) => ({ contentId, tagId, userId: this.requireUserId() })))
			.onConflictDoNothing();

		const edgeRows = uniqueTagIds
			.map((tagId) => ({
				fromNode: contentNodeId,
				relationType: "content_tag",
				toNode: tagNodeIdByTagId[tagId],
				userId: this.requireUserId(),
			}))
			.filter((edge) => Boolean(edge.toNode));

		if (edgeRows.length) await this.database.insert(edges).values(edgeRows);
	}

	private requireUserId(): string {
		if (!this.ctx.user?.id) throw new Error("Unauthorized");

		return this.ctx.user.id;
	}
}
