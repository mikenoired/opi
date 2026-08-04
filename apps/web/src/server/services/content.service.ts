import {
	attachContentTags,
	createContentSuggestionCursor,
	createTagContentPageCursor,
	extractOwnedNoteImages,
	getContentList,
	groupContentSuggestions,
	groupTagContentPreviews,
	mapContentRecord,
	normalizeTagTitle,
	parseContentSuggestionCursor,
	parseTagContentPageCursor,
	type SuggestedContentTag,
	uniqueTagTitles,
} from "@synapse/core";
import { buildContentSearchText } from "@synapse/shared/content-search";
import { isSupportedFileType } from "@synapse/shared/file-types";
import type {
	Content,
	CreateContent,
	createContentSchema,
	updateContentSchema,
} from "@synapse/shared/schemas";
import {
	contentDetailSchema,
	contentListItemSchema,
	contentTypeSchema,
	parseAudioJson,
	parseMediaJson,
} from "@synapse/shared/schemas";
import type z from "zod";

import { deleteFile, getFileMetadata } from "@/shared/api/minio";

import type { Context } from "../context";
import type { content as contentTable } from "../db/schema";
import { ApiError } from "../lib/api-error";
import { deleteStoredNoteImages, deleteUploadedNoteImages, prepareNoteImages } from "../lib/note-images";
import { parseFile } from "../parsers";
import ContentRepository from "../repositories/content.repository";

type ContentSelect = typeof contentTable.$inferSelect;
type ContentRow = Omit<ContentSelect, "searchText" | "searchVector"> &
	Partial<Pick<ContentSelect, "searchText" | "searchVector">>;
type ContentType = Content["type"];

const TAGS_CACHE_TTL_SECONDS = Math.floor(Number(process.env.TAGS_CACHE_TTL_MS ?? 30000) / 1000);
const CONTENT_TYPES_CACHE_TTL_SECONDS = Math.floor(
	Number(process.env.CONTENT_TYPES_CACHE_TTL_MS ?? 30000) / 1000
);
const MAX_IMPORT_FILE_SIZE = 50 * 1024 * 1024;
export default class ContentService {
	private repo: ContentRepository;
	private ctx: Context;

	constructor(ctx: Context) {
		this.repo = new ContentRepository(ctx);
		this.ctx = ctx;
	}

	async getAll(
		search: string | undefined,
		types: ContentType[] | undefined,
		tagIds: string[] | undefined,
		cursor: string | undefined,
		limit: number,
		includeTags: boolean
	) {
		const result = await getContentList(
			{
				findAll: async (...args) => (await this.repo.getAll(...args)) as ContentRow[],
				findByTagFilter: async (...args) => (await this.repo.getWithTagFilter(...args)) as ContentRow[],
				findTagRelations: async (contentIds) => await this.repo.contentTagsWithTitles(contentIds),
				search: async (...args) => (await this.repo.searchFtsFiltered(...args)) as ContentRow[],
			},
			{ cursor, includeTags, limit, search, tagIds, types, userId: this.ctx.user!.id }
		);
		return { ...result, items: result.items.map((item) => contentListItemSchema.parse(item)) };
	}

	async getById(id: string) {
		const data = await this.repo.getById(id);
		const [withTags] = await this.attachTagsToContent([data as ContentRow]);
		return contentDetailSchema.parse(withTags);
	}

	async getSuggestions(
		contentId: string,
		cursor: string | undefined,
		limit: number
	): Promise<{
		groups: Array<{ tag: SuggestedContentTag; items: Content[] }>;
		nextCursor: string | undefined;
	}> {
		const source = await this.getById(contentId);
		if (source.tag_ids.length === 0) {
			return { groups: [], nextCursor: undefined };
		}

		const priorities = await this.repo.getSuggestionTagPriorities(source.tag_ids);
		if (priorities.length === 0) {
			return { groups: [], nextCursor: undefined };
		}

		const parsedCursor = parseContentSuggestionCursor(cursor);
		let tagIndex = parsedCursor.tagIndex;
		let itemCursor = parsedCursor.itemCursor;
		const matches: Array<{
			row: ContentRow;
			tag: { color: number; id: string; title: string; itemCount: number };
		}> = [];
		let nextCursor: string | undefined;

		while (matches.length < limit && tagIndex < priorities.length) {
			const priority = priorities[tagIndex]!;
			const remaining = limit - matches.length;
			const rows = (await this.repo.getSuggestionsForTag(
				priority.id,
				priorities.slice(0, tagIndex).map((tag) => tag.id),
				contentId,
				itemCursor,
				remaining + 1
			)) as ContentRow[];
			const pageRows = rows.slice(0, remaining);

			matches.push(
				...pageRows.map((row) => ({
					row,
					tag: priority,
				}))
			);

			if (rows.length > remaining) {
				const last = pageRows[pageRows.length - 1]!;
				nextCursor = createContentSuggestionCursor(tagIndex, last.createdAt, last.id);
				break;
			}

			tagIndex++;
			itemCursor = undefined;
			if (matches.length === limit && tagIndex < priorities.length) {
				nextCursor = `${tagIndex}`;
			}
		}

		const contentItems = await this.attachTagsToContent(
			matches.map((match) => match.row),
			{ previewContent: true }
		);
		return {
			groups: groupContentSuggestions(
				matches.map((match) => match.tag),
				contentItems.map((item) => contentListItemSchema.parse(item))
			),
			nextCursor,
		};
	}

	async create(createContentData: z.infer<typeof createContentSchema>) {
		const prepared =
			createContentData.type === "note"
				? await prepareNoteImages(createContentData.content, this.ctx.user!.id)
				: { content: createContentData.content, uploaded: [] };
		const input = { ...createContentData, content: prepared.content };
		const { tag_ids: inputTagIds, tags: legacyTagTitles, ...contentData } = input;

		let result: ContentRow;
		try {
			result = (await this.ctx.db.transaction(async (tx) => {
				const repo = this.repo.withDb(tx as unknown as Context["db"]);
				const data = await repo.create(input);
				const contentId = (data as ContentRow).id;

				const contentNodeId = await repo.createContentNode({
					content_id: contentId,
					title: contentData.title,
					type: contentData.type,
				});

				const tagIds = inputTagIds as string[] | undefined;
				const tagTitles = legacyTagTitles as string[] | undefined;
				let searchTags: string[] = [];
				if (tagIds && tagIds.length) {
					const tagNodeIds = await repo.getOrCreateTagNodeIds(tagIds);
					await this.upsertContentTags(repo, contentId, tagIds, contentNodeId, tagNodeIds);
					searchTags = (await repo.getTags(tagIds)).map((tag) => tag.title);
				} else if (tagTitles && tagTitles.length) {
					const ids = await this.resolveTagTitlesToIds(repo, tagTitles);
					if (ids.length) {
						const tagNodeIds = await repo.getOrCreateTagNodeIds(ids);
						await this.upsertContentTags(repo, contentId, ids, contentNodeId, tagNodeIds);
						searchTags = (await repo.getTags(ids)).map((tag) => tag.title);
					}
				}
				await repo.updateSearchText(
					contentId,
					buildContentSearchText({
						content: (data as ContentRow).content,
						tags: searchTags,
						title: (data as ContentRow).title,
					})
				);

				return data;
			})) as ContentRow;
		} catch (error) {
			await deleteUploadedNoteImages(prepared.uploaded);
			throw error;
		}

		await this.trackAddedNoteImages(prepared.uploaded);
		const [withTags] =
			inputTagIds?.length || legacyTagTitles?.length
				? await this.attachTagsToContent([result])
				: [mapContentRecord(result, this.ctx.user!.id)];
		await this.invalidateUserTags();
		const content = contentDetailSchema.parse(withTags);
		return content;
	}

	async importFile(input: {
		title?: string;
		tags?: string[];
		file: { name: string; type: string; size: number; buffer: number[] };
	}) {
		const { file, tags, title } = input;

		if (!isSupportedFileType(file.name, file.type)) {
			throw new ApiError({ code: "BAD_REQUEST", message: `Неподдерживаемый тип файла: ${file.name}` });
		}
		if (file.size > MAX_IMPORT_FILE_SIZE) {
			throw new ApiError({
				code: "BAD_REQUEST",
				message: "Файл слишком большой. Максимальный размер: 50MB",
			});
		}

		const buffer = Buffer.from(file.buffer);
		const parsed = await parseFile(
			{ name: file.name, type: file.type, size: file.size, buffer },
			{ extractThumbnail: true, maxContentLength: 1_000_000 }
		);

		let documentImages: CreateContent["document_images"];
		if (parsed.images && parsed.images.length > 0) {
			const { processDocumentImages, uploadDocumentImagesToMinio } =
				await import("@/server/lib/document-image-processor");
			const documentId = `doc-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
			const processed = await processDocumentImages(parsed.images);
			documentImages = await uploadDocumentImagesToMinio(processed, this.ctx.user!.id, documentId);
		}

		const content = await this.create({
			type: contentTypeSchema.parse(parsed.type),
			title: title?.trim() || parsed.title || file.name,
			content: parsed.content,
			tags,
			thumbnail_base64: parsed.thumbnailBase64,
			media_type: "image",
			document_images: documentImages,
		});

		return { success: true, content };
	}

	async update(input: z.infer<typeof updateContentSchema>) {
		const { id, tag_ids: inputTagIds, tags: legacyTagTitles, ...updateData } = input;
		const previous = (await this.repo.getById(id)) as ContentRow;
		const nextType = updateData.type ?? previous.type;
		const prepared =
			nextType === "note" && updateData.content !== undefined
				? await prepareNoteImages(updateData.content, this.ctx.user!.id)
				: { content: updateData.content, uploaded: [] };
		const preparedInput = {
			...input,
			...(prepared.content === undefined ? {} : { content: prepared.content }),
		};

		let result: ContentRow;
		try {
			result = (await this.ctx.db.transaction(async (tx) => {
				const repo = this.repo.withDb(tx as unknown as Context["db"]);
				const data = await repo.updateContent(preparedInput);

				const tagIds = inputTagIds as string[] | undefined;
				const tagTitles = legacyTagTitles as string[] | undefined;
				const contentNodeId = await repo.getOrCreateContentNode({
					content_id: id,
					title: updateData.title,
					type: updateData.type || "note",
				});
				await repo.updateContentNode({
					content_id: id,
					title: updateData.title,
					type: updateData.type || (data as ContentRow).type,
				});

				let searchTags: string[] = [];
				if (tagIds) {
					const tagNodeIds = await repo.getOrCreateTagNodeIds(tagIds);
					await this.replaceContentTags(repo, id, tagIds, contentNodeId, tagNodeIds);
					searchTags = tagIds.length ? (await repo.getTags(tagIds)).map((tag) => tag.title) : [];
				} else if (tagTitles) {
					const ids = await this.resolveTagTitlesToIds(repo, tagTitles);
					const tagNodeIds = await repo.getOrCreateTagNodeIds(ids);
					await this.replaceContentTags(repo, id, ids, contentNodeId, tagNodeIds);
					searchTags = ids.length ? (await repo.getTags(ids)).map((tag) => tag.title) : [];
				} else {
					const [existingTags] = await repo.contentTagsWithTitles([id]);
					searchTags = existingTags?.tag_titles || [];
				}
				await repo.updateSearchText(
					id,
					buildContentSearchText({
						content: (data as ContentRow).content,
						tags: searchTags,
						title: (data as ContentRow).title,
					})
				);

				return data;
			})) as ContentRow;
		} catch (error) {
			await deleteUploadedNoteImages(prepared.uploaded);
			throw error;
		}

		const previousImages =
			previous.type === "note" ? extractOwnedNoteImages(previous.content, this.ctx.user!.id) : [];
		const nextImages = nextType === "note" ? extractOwnedNoteImages(result.content, this.ctx.user!.id) : [];
		const nextImageSet = new Set(nextImages);
		const removedSizes = await deleteStoredNoteImages(
			previousImages.filter((image) => !nextImageSet.has(image))
		);
		await Promise.all([
			this.trackAddedNoteImages(prepared.uploaded),
			this.trackRemovedNoteImages(removedSizes),
		]);

		const [withTags] = await this.attachTagsToContent([result]);
		await this.invalidateUserTags();
		const content = contentDetailSchema.parse(withTags);
		return content;
	}

	async delete(id: string) {
		const content = await this.repo.getById(id);

		await this.ctx.db.transaction(async (tx) => {
			const repo = this.repo.withDb(tx as unknown as Context["db"]);
			const node = await repo.getNodeByContentId(id);
			const contentNodeId = (node as { id: string } | null)?.id;

			await repo.deleteContentTag(id);
			if (contentNodeId) {
				await repo.deleteEdge(contentNodeId);
				await repo.deleteNode(contentNodeId);
			}

			await repo.deleteContent(id);
		});

		let totalFileSize = 0;
		const removedFileSizes: number[] = [];

		if (content.type === "note") {
			removedFileSizes.push(
				...(await deleteStoredNoteImages(extractOwnedNoteImages(content.content, this.ctx.user!.id)))
			);
		} else if (content.type === "media") {
			const mediaJson = parseMediaJson(content.content);
			const mainObject = mediaJson?.media?.object || this.extractObjectNameFromApiUrl(mediaJson?.media?.url);
			const thumbObject = this.extractObjectNameFromApiUrl(mediaJson?.media?.thumbnailUrl);

			if (mainObject) {
				const metadata = await getFileMetadata(mainObject);
				if (metadata?.size) totalFileSize += metadata.size;
				await deleteFile(mainObject);
			}

			if (mediaJson?.media?.type === "image") {
				const thumbnailBase64 = mediaJson?.media?.thumbnailBase64;
				if (thumbnailBase64) {
					totalFileSize += thumbnailBase64.length;
				}
			} else {
				if (thumbObject) {
					const metadata = await getFileMetadata(thumbObject);
					if (metadata?.size) totalFileSize += metadata.size;
					await deleteFile(thumbObject);
				}
			}
		} else if (content.type === "audio") {
			const audioJson = parseAudioJson(content.content);
			const audioObj = audioJson?.audio?.object || this.extractObjectNameFromApiUrl(audioJson?.audio?.url);
			const coverObj = audioJson?.cover?.object || this.extractObjectNameFromApiUrl(audioJson?.cover?.url);

			if (audioJson?.audio?.sizeBytes) {
				totalFileSize += audioJson.audio.sizeBytes;
			} else if (audioObj) {
				const metadata = await getFileMetadata(audioObj);
				if (metadata?.size) totalFileSize += metadata.size;
			}

			if (audioObj) await deleteFile(audioObj);

			if (coverObj) {
				const metadata = await getFileMetadata(coverObj);
				if (metadata?.size) totalFileSize += metadata.size;
				await deleteFile(coverObj);
			} else if (audioJson?.cover?.thumbnailBase64) {
				totalFileSize += audioJson.cover.thumbnailBase64.length;
			}
		}

		if (totalFileSize > 0) removedFileSizes.push(totalFileSize);
		await this.trackRemovedNoteImages(removedFileSizes);

		await this.invalidateUserTags();
		return { success: true };
	}

	async getTags() {
		const cacheKey = `user:${this.ctx.user!.id}:tags`;
		const cached =
			await this.ctx.cache.getJSON<Array<{ color: number; id: string; title: string }>>(cacheKey);
		if (cached) return cached;

		const contentTags = await this.repo.getContentTags();
		const tagIds = Array.from(new Set((contentTags || []).map((r: any) => r.tag_id)));
		if (!tagIds.length) return [];

		const tags = await this.repo.getTags(tagIds);
		const result = (tags || []).map((t) => ({ color: t.color, id: t.id, title: t.title }));
		await this.ctx.cache.setJSON(cacheKey, result, TAGS_CACHE_TTL_SECONDS);
		return result;
	}

	async getTagById(id: string) {
		return await this.repo.getTagById(id);
	}

	async updateTagColor(id: string, color: number) {
		const tag = await this.repo.updateTagColor(id, color);
		await this.invalidateUserTags();
		return tag;
	}

	async getAvailableTypes() {
		const cacheKey = `user:${this.ctx.user!.id}:content_types`;
		const cached = await this.ctx.cache.getJSON<ContentType[]>(cacheKey);
		if (cached) return cached;

		const rows = await this.repo.getAvailableTypes();
		const result = rows.map((row) => contentTypeSchema.parse(row.type));
		await this.ctx.cache.setJSON(cacheKey, result, CONTENT_TYPES_CACHE_TTL_SECONDS);
		return result;
	}

	async syncSearchText(content: Content) {
		await this.repo.updateSearchText(content.id, buildContentSearchText(content));
	}

	async getTagsWithContent() {
		const cacheKey = `user:${this.ctx.user!.id}:tags_with_content`;
		const cached =
			await this.ctx.cache.getJSON<Array<{ id: string; title: string; items: Content[] }>>(cacheKey);
		if (cached) return cached;

		const previewRows = await this.repo.getTagsWithContentPreview(3);
		if (!previewRows.length) return [];

		const uniqueRows = Array.from(new Map(previewRows.map((row) => [row.id, row as ContentRow])).values());
		const items = await this.attachTagsToContent(uniqueRows, { previewContent: true });
		const result = groupTagContentPreviews(previewRows, items);
		await this.ctx.cache.setJSON(cacheKey, result, TAGS_CACHE_TTL_SECONDS);
		return result;
	}

	async getTagsWithContentPage(cursor: string | undefined, limit: number) {
		const cursorValue = parseTagContentPageCursor(cursor);
		const tagRows = await this.repo.getContentTagPage(limit + 1, cursorValue);
		const pageTags = tagRows.slice(0, limit);
		if (pageTags.length === 0) return { items: [], nextCursor: undefined };

		const previewRows = await this.repo.getTagsWithContentPreview(
			3,
			pageTags.map((tag) => tag.id)
		);
		const uniqueRows = Array.from(new Map(previewRows.map((row) => [row.id, row as ContentRow])).values());
		const contentItems = await this.attachTagsToContent(uniqueRows, { previewContent: true });
		const previewByTag = new Map(
			groupTagContentPreviews(previewRows, contentItems).map((group) => [group.id, group.items])
		);

		const last = pageTags[pageTags.length - 1];
		return {
			items: pageTags.map((tag) => ({
				color: tag.color,
				id: tag.id,
				title: tag.title,
				items: previewByTag.get(tag.id) ?? [],
			})),
			nextCursor:
				tagRows.length > limit && last ? createTagContentPageCursor(last.title, last.id) : undefined,
		};
	}

	private extractObjectNameFromApiUrl(url?: string | null): string | null {
		if (!url) return null;
		try {
			const prefix = "/api/files/";
			if (url.startsWith(prefix)) return url.slice(prefix.length);
			const idx = url.indexOf("/api/files/");
			if (idx >= 0) return url.slice(idx + "/api/files/".length);
		} catch {
			// ignore
		}
		return null;
	}

	private async replaceContentTags(
		repo: ContentRepository,
		contentId: string,
		tagIds: string[],
		contentNodeId: string,
		tagNodeIdByTagId: Record<string, string>
	) {
		await repo.deleteContentTag(contentId);
		await repo.deleteTagEdge(contentNodeId);
		await this.upsertContentTags(repo, contentId, tagIds, contentNodeId, tagNodeIdByTagId);
	}

	private async invalidateUserTags() {
		const userId = this.ctx.user!.id;
		await Promise.all([
			this.ctx.cache.del(`user:${userId}:tags`),
			this.ctx.cache.del(`user:${userId}:tags_with_content`),
			this.ctx.cache.del(`user:${userId}:content_types`),
		]);
	}

	private async attachTagsToContent(
		rows: ContentRow[],
		options: { previewContent?: boolean } = {}
	): Promise<Content[]> {
		const items = rows.map((r) => mapContentRecord(r, this.ctx.user!.id, options));
		if (!items.length) return items;

		const ids = rows.map((r) => r.id);
		const contentTagsWithTitles = await this.repo.contentTagsWithTitles(ids);
		return attachContentTags(items, contentTagsWithTitles || []);
	}

	private async resolveTagTitlesToIds(repo: ContentRepository, titles: string[]): Promise<string[]> {
		const uniqueTitles = uniqueTagTitles(titles);
		if (uniqueTitles.length === 0) return [];

		const existing = await repo.getTagsByTitle(uniqueTitles);
		const existingMap = new Map((existing || []).map((t) => [normalizeTagTitle(t.title), t.id]));
		const missing = uniqueTitles.filter((title) => !existingMap.has(normalizeTagTitle(title)));
		if (missing.length) {
			const inserted = await repo.createTags(missing.map((title) => ({ title })));
			for (const t of inserted || []) {
				await repo.createNode(t.title);
				existingMap.set(normalizeTagTitle(t.title), t.id);
			}
		}
		const ids = uniqueTitles.map((title) => existingMap.get(normalizeTagTitle(title)));
		return ids.filter((v): v is string => typeof v === "string" && v.length > 0);
	}

	private async upsertContentTags(
		repo: ContentRepository,
		contentId: string,
		tagIds: string[],
		contentNodeId: string,
		tagNodeIdByTagId: Record<string, string>
	) {
		if (!tagIds.length) return;
		await repo.createContentTags(tagIds, contentId);
		const edgeRows = tagIds
			.map((tagId) => ({
				from_node: contentNodeId,
				to_node: tagNodeIdByTagId[tagId],
				relation_type: "content_tag",
				user_id: this.ctx.user!.id,
			}))
			.filter((r) => !!r.to_node);
		if (edgeRows.length) await repo.createEdges(edgeRows);
	}

	private async trackAddedNoteImages(images: { size: number }[]) {
		await Promise.all(images.map((image) => this.ctx.cache.addFile(this.ctx.user!.id, image.size)));
	}

	private async trackRemovedNoteImages(sizes: number[]) {
		await Promise.all(sizes.map((size) => this.ctx.cache.removeFile(this.ctx.user!.id, size)));
	}
}
