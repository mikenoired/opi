import {
	contentTypeSchema,
	extractTextFromStructuredContent,
	linkContentSchema,
	type Content,
	type LinkContent,
} from "@synapse/shared/schemas";

interface MediaDimensions {
	height: number;
	width: number;
}

interface ImageMediaContentParams {
	objectName: string;
	publicUrl: string;
	imageDimensions?: MediaDimensions;
	thumbnailBase64: string;
}

interface VideoMediaContentParams {
	objectName: string;
	publicUrl: string;
	thumbnailUrl: string;
	thumbnailBase64: string;
	videoDimensions?: MediaDimensions;
}

export interface AudioContentMetadata {
	common?: {
		album?: string;
		artist?: string;
		disk?: { no?: number | null };
		genre?: string[];
		lyrics?: string[];
		title?: string;
		track?: { no?: number | null };
		year?: number;
	};
	format?: {
		bitrate?: number;
		duration?: number;
		numberOfChannels?: number;
		sampleRate?: number;
	};
}

export interface AudioContentParams {
	audioObjectName: string;
	audioUrl: string;
	bufferLength: number;
	coverDims?: MediaDimensions;
	coverObject?: string;
	coverThumbnailBase64?: string;
	coverUrl?: string;
	fileType: string;
	makeTrack: boolean;
	metadata: AudioContentMetadata | null;
	title?: string | null;
}

export interface MediaJson {
	media: {
		height?: number;
		object?: string;
		thumbnailBase64?: string;
		thumbnailUrl?: string;
		type: "image" | "video";
		url?: string;
		width?: number;
	};
}

export interface AudioJson {
	audio: {
		bitrateKbps?: number;
		channels?: number;
		durationSec?: number;
		mimeType?: string;
		object?: string;
		sampleRateHz?: number;
		sizeBytes?: number;
		url?: string;
	};
	cover?: {
		height?: number;
		object?: string;
		thumbnailBase64?: string;
		url?: string;
		width?: number;
	};
	track?: {
		album?: string;
		artist?: string;
		diskNumber?: number;
		genre?: string[];
		isTrack: boolean;
		lyrics?: string;
		title?: string;
		trackNumber?: number;
		year?: number;
	};
}

export function parseMediaJson(content: string): MediaJson | null {
	const parsed = parseJsonRecord(content);
	return parsed && hasMediaType(parsed.media) ? (parsed as unknown as MediaJson) : null;
}

export function parseAudioJson(content: string): AudioJson | null {
	const parsed = parseJsonRecord(content);
	return parsed && isRecord(parsed.audio) ? (parsed as unknown as AudioJson) : null;
}

/** Returns a human-readable audio title for both new and legacy uploads. */
export function getAudioDisplayTitle(
	audio: AudioJson | null,
	itemTitle?: string | null,
	fallback = "Audio"
): string {
	const title = audio?.track?.title?.trim() || itemTitle?.trim();
	if (title) return title;

	const source = audio?.audio.object || audio?.audio.url;
	if (!source) return fallback;

	const path = source.split(/[?#]/, 1)[0] ?? "";
	const encodedName = path.slice(path.lastIndexOf("/") + 1);
	if (!encodedName) return fallback;

	let fileName = encodedName;
	try {
		fileName = decodeURIComponent(encodedName);
	} catch {
		// An invalid URL escape sequence should not prevent rendering the card.
	}

	const withoutStoragePrefix = fileName.replace(/^\d{10,}-/, "");
	const withoutExtension = withoutStoragePrefix.replace(/\.[^.]+$/, "").trim();
	return withoutExtension || fallback;
}

export function parseLinkContent(content: string): LinkContent | null {
	try {
		return linkContentSchema.parse(JSON.parse(content));
	} catch {
		return null;
	}
}

export function buildImageMediaContent({
	objectName,
	publicUrl,
	imageDimensions,
	thumbnailBase64,
}: ImageMediaContentParams) {
	return {
		media: {
			height: imageDimensions?.height,
			object: objectName,
			thumbnailBase64,
			type: "image" as const,
			url: publicUrl,
			width: imageDimensions?.width,
		},
	};
}

export function buildVideoMediaContent({
	objectName,
	publicUrl,
	thumbnailBase64,
	thumbnailUrl,
	videoDimensions,
}: VideoMediaContentParams) {
	return {
		media: {
			height: videoDimensions?.height,
			object: objectName,
			thumbnailBase64,
			thumbnailUrl,
			type: "video" as const,
			url: publicUrl,
			width: videoDimensions?.width,
		},
	};
}

export function buildAudioContent({
	audioObjectName,
	audioUrl,
	bufferLength,
	coverDims,
	coverObject,
	coverThumbnailBase64,
	coverUrl,
	fileType,
	makeTrack,
	metadata,
	title,
}: AudioContentParams) {
	return {
		audio: {
			bitrateKbps: metadata?.format?.bitrate ? Math.round(metadata.format.bitrate / 1000) : undefined,
			channels: metadata?.format?.numberOfChannels || undefined,
			durationSec: metadata?.format?.duration ? Math.round(metadata.format.duration) : undefined,
			mimeType: fileType,
			object: audioObjectName,
			sampleRateHz: metadata?.format?.sampleRate || undefined,
			sizeBytes: bufferLength,
			url: audioUrl,
		},
		cover: coverUrl
			? {
					height: coverDims?.height,
					object: coverObject,
					thumbnailBase64: coverThumbnailBase64,
					url: coverUrl,
					width: coverDims?.width,
				}
			: undefined,
		track: {
			album: metadata?.common?.album || undefined,
			artist: metadata?.common?.artist || undefined,
			diskNumber: metadata?.common?.disk?.no || undefined,
			genre: metadata?.common?.genre || undefined,
			isTrack:
				makeTrack ||
				Boolean(
					metadata?.common?.artist ||
					metadata?.common?.album ||
					metadata?.common?.title ||
					metadata?.common?.genre?.length
				),
			lyrics: metadata?.common?.lyrics?.join("\n") || undefined,
			title: metadata?.common?.title || title || undefined,
			trackNumber: metadata?.common?.track?.no || undefined,
			year: metadata?.common?.year || undefined,
		},
	};
}

const contentListPreviewChars = 1_200;

export interface ContentRecord {
	content: string;
	createdAt?: Date | null;
	documentImages?: unknown;
	id: string;
	thumbnailBase64?: string | null;
	title?: string | null;
	type: string;
	updatedAt?: Date | null;
	userId?: string | null;
}

export interface ContentTagRelation {
	content_id: string;
	tag_ids?: string[] | null;
	tag_titles?: string[] | null;
}

export interface SuggestedContentTag {
	color: number;
	id: string;
	itemCount: number;
	title: string;
}

export function groupContentSuggestions(tags: SuggestedContentTag[], items: Content[]) {
	const groups = new Map<string, { tag: SuggestedContentTag; items: Content[] }>();

	for (const [index, tag] of tags.entries()) {
		const item = items[index];
		if (!item) continue;
		const group = groups.get(tag.id) ?? { tag, items: [] };
		group.items.push(item);
		groups.set(tag.id, group);
	}

	return Array.from(groups.values());
}

export function groupTagContentPreviews(
	rows: Array<{ id: string; tagColor: number; tagId: string; tagTitle: string }>,
	items: Content[],
	limit = 3
) {
	const itemById = new Map(items.map((item) => [item.id, item]));
	const groups = new Map<string, { color: number; id: string; title: string; items: Content[] }>();
	for (const row of rows) {
		const item = itemById.get(row.id);
		if (!item) continue;
		const group = groups.get(row.tagId) ?? {
			color: row.tagColor,
			id: row.tagId,
			title: row.tagTitle,
			items: [],
		};
		if (group.items.length < limit) group.items.push(item);
		groups.set(row.tagId, group);
	}
	return Array.from(groups.values());
}

export function parseContentSuggestionCursor(cursor?: string) {
	const [rawTagIndex, timestamp, id] = cursor?.split("|") ?? [];
	return {
		tagIndex: Math.max(0, Number.parseInt(rawTagIndex || "0", 10) || 0),
		itemCursor: timestamp && id ? `${timestamp}|${id}` : undefined,
	};
}

export function createContentSuggestionCursor(
	tagIndex: number,
	createdAt: Date | null | undefined,
	id: string
) {
	return `${tagIndex}|${(createdAt ?? new Date(0)).toISOString()}|${id}`;
}

export function parseTagContentPageCursor(cursor?: string): { id: string; title: string } | undefined {
	const [encodedTitle, id] = cursor?.split("|") ?? [];
	return encodedTitle && id ? { title: decodeURIComponent(encodedTitle), id } : undefined;
}

export function createTagContentPageCursor(title: string, id: string): string {
	return `${encodeURIComponent(title)}|${id}`;
}

export function attachContentTags(items: Content[], relations: ContentTagRelation[]): Content[] {
	const byContent = new Map<string, { ids: string[]; titles: string[] }>();

	for (const relation of relations) {
		byContent.set(relation.content_id, {
			ids: relation.tag_ids || [],
			titles: relation.tag_titles || [],
		});
	}

	return items.map((item) => {
		const tags = byContent.get(item.id);
		return {
			...item,
			tag_ids: tags?.ids || [],
			tags: tags?.titles || [],
		};
	});
}

export function mapContentRecord(
	record: ContentRecord,
	fallbackUserId: string,
	options: { previewContent?: boolean } = {}
): Content {
	const type = record.type as Content["type"];
	return {
		id: record.id,
		user_id: record.userId ?? fallbackUserId,
		type,
		title: record.title ?? undefined,
		content: options.previewContent
			? buildContentListPreview(type, record.content, record.title)
			: record.content,
		tags: [],
		tag_ids: [],
		created_at: record.createdAt?.toISOString() ?? new Date().toISOString(),
		updated_at:
			record.updatedAt?.toISOString() ?? record.createdAt?.toISOString() ?? new Date().toISOString(),
		thumbnail_base64: record.thumbnailBase64 ?? undefined,
		document_images: Array.isArray(record.documentImages) ? record.documentImages : undefined,
	};
}

export interface ContentListRepository {
	findAll: (
		search: string | undefined,
		types: Content["type"][] | undefined,
		cursor: string | undefined,
		limit: number
	) => Promise<ContentRecord[]>;
	findByTagFilter: (
		tagIds: string[],
		limit: number,
		search: string | undefined,
		types: Content["type"][] | undefined,
		cursor: string | undefined
	) => Promise<ContentRecord[]>;
	findTagRelations: (contentIds: string[]) => Promise<ContentTagRelation[]>;
	search: (
		search: string,
		types: Content["type"][] | undefined,
		tagIds: string[] | undefined,
		limit: number
	) => Promise<ContentRecord[]>;
}

export interface ContentListParams {
	cursor?: string;
	includeTags: boolean;
	limit: number;
	search?: string;
	tagIds?: string[];
	types?: Content["type"][];
	userId: string;
}

export async function getContentList(
	repository: ContentListRepository,
	{ cursor, includeTags, limit, search, tagIds, types, userId }: ContentListParams
): Promise<{ items: Content[]; nextCursor: string | undefined }> {
	if (search?.trim()) {
		const rows = await repository.search(search.trim(), types, tagIds, limit);
		return { items: await mapContentListRows(repository, rows, userId, includeTags), nextCursor: undefined };
	}

	const rows = tagIds?.length
		? await repository.findByTagFilter(tagIds, limit, search, types, cursor)
		: await repository.findAll(search, types, cursor, limit);
	const last = rows[rows.length - 1];
	return {
		items: await mapContentListRows(repository, rows, userId, includeTags),
		nextCursor: last ? `${last.createdAt}|${last.id}` : undefined,
	};
}

export interface ContentSuggestionRepository {
	findSuggestionsForTag: (
		tagId: string,
		higherPriorityTagIds: string[],
		excludedContentId: string,
		cursor: string | undefined,
		limit: number
	) => Promise<ContentRecord[]>;
	findSuggestionTagPriorities: (tagIds: string[]) => Promise<SuggestedContentTag[]>;
	findTagRelations: (contentIds: string[]) => Promise<ContentTagRelation[]>;
}

export async function getContentSuggestions(
	repository: ContentSuggestionRepository,
	{
		contentId,
		cursor,
		limit,
		sourceTagIds,
		userId,
	}: {
		contentId: string;
		cursor?: string;
		limit: number;
		sourceTagIds: string[];
		userId: string;
	}
): Promise<{
	groups: Array<{ tag: SuggestedContentTag; items: Content[] }>;
	nextCursor: string | undefined;
}> {
	if (sourceTagIds.length === 0) return { groups: [], nextCursor: undefined };

	const priorities = await repository.findSuggestionTagPriorities(sourceTagIds);
	if (priorities.length === 0) return { groups: [], nextCursor: undefined };

	const parsedCursor = parseContentSuggestionCursor(cursor);
	let tagIndex = parsedCursor.tagIndex;
	let itemCursor = parsedCursor.itemCursor;
	const matches: Array<{ row: ContentRecord; tag: SuggestedContentTag }> = [];
	let nextCursor: string | undefined;

	while (matches.length < limit && tagIndex < priorities.length) {
		const priority = priorities[tagIndex]!;
		const remaining = limit - matches.length;
		const rows = await repository.findSuggestionsForTag(
			priority.id,
			priorities.slice(0, tagIndex).map((tag) => tag.id),
			contentId,
			itemCursor,
			remaining + 1
		);
		const pageRows = rows.slice(0, remaining);
		matches.push(...pageRows.map((row) => ({ row, tag: priority })));

		if (rows.length > remaining) {
			const last = pageRows[pageRows.length - 1]!;
			nextCursor = createContentSuggestionCursor(tagIndex, last.createdAt, last.id);
			break;
		}

		tagIndex++;
		itemCursor = undefined;
		if (matches.length === limit && tagIndex < priorities.length) nextCursor = `${tagIndex}`;
	}

	const contentItems = await mapContentListRows(
		repository,
		matches.map((match) => match.row),
		userId,
		true
	);
	return {
		groups: groupContentSuggestions(
			matches.map((match) => match.tag),
			contentItems
		),
		nextCursor,
	};
}

export interface TagContentPreviewRepository {
	findTagContentPreviews: (
		limitPerTag: number,
		tagIds?: string[]
	) => Promise<Array<ContentRecord & { tagColor: number; tagId: string; tagTitle: string }>>;
	findTagRelations: (contentIds: string[]) => Promise<ContentTagRelation[]>;
}

export async function getTagsWithContentPreviews(
	repository: TagContentPreviewRepository,
	userId: string,
	limitPerTag = 3,
	tagIds?: string[]
) {
	const previewRows = await repository.findTagContentPreviews(limitPerTag, tagIds);
	if (previewRows.length === 0) return [];

	const uniqueRows = Array.from(new Map(previewRows.map((row) => [row.id, row])).values());
	const items = await mapContentListRows(repository, uniqueRows, userId, true);
	return groupTagContentPreviews(previewRows, items, limitPerTag);
}

export interface TagContentPageRepository extends TagContentPreviewRepository {
	findTagPage: (
		limit: number,
		cursor?: { id: string; title: string }
	) => Promise<Array<{ color: number; id: string; title: string }>>;
}

export async function getTagsWithContentPage(
	repository: TagContentPageRepository,
	userId: string,
	cursor: string | undefined,
	limit: number
) {
	const cursorValue = parseTagContentPageCursor(cursor);
	const tagRows = await repository.findTagPage(limit + 1, cursorValue);
	const pageTags = tagRows.slice(0, limit);
	if (pageTags.length === 0) return { items: [], nextCursor: undefined };

	const previews = await getTagsWithContentPreviews(
		repository,
		userId,
		3,
		pageTags.map((tag) => tag.id)
	);
	const previewByTag = new Map(previews.map((group) => [group.id, group.items]));
	const last = pageTags[pageTags.length - 1];
	return {
		items: pageTags.map((tag) => ({ ...tag, items: previewByTag.get(tag.id) ?? [] })),
		nextCursor: tagRows.length > limit && last ? createTagContentPageCursor(last.title, last.id) : undefined,
	};
}

export interface AvailableContentTypesRepository {
	findAvailableContentTypes: () => Promise<unknown[]>;
}

export async function getAvailableContentTypes(repository: AvailableContentTypesRepository) {
	return (await repository.findAvailableContentTypes()).map((type) => contentTypeSchema.parse(type));
}

async function mapContentListRows(
	repository: Pick<ContentListRepository, "findTagRelations">,
	rows: ContentRecord[],
	userId: string,
	includeTags: boolean
): Promise<Content[]> {
	const items = rows.map((row) => mapContentRecord(row, userId, { previewContent: true }));
	if (!includeTags || items.length === 0) return items;
	return attachContentTags(items, await repository.findTagRelations(rows.map((row) => row.id)));
}

export function buildContentListPreview(
	type: Content["type"],
	content: string,
	title?: string | null
): string {
	if (type === "media" || type === "audio" || type === "todo") return content;
	if (type === "link") return buildLinkPreviewContent(content, title);
	if (type === "note") return extractTextPreview(content);
	return truncateText(content.replace(/<[^>]*>/g, " "));
}

function buildLinkPreviewContent(content: string, title?: string | null): string {
	const parsed = safeParseJson<Record<string, unknown>>(content);
	const url = typeof parsed?.url === "string" ? parsed.url : extractJsonStringField(content, "url");
	if (!url) return truncateText(title || content);

	const linkTitle =
		typeof parsed?.title === "string"
			? parsed.title
			: extractJsonStringField(content, "title") || title || url;
	const description =
		typeof parsed?.description === "string"
			? parsed.description
			: extractJsonStringField(content, "description") || "";
	const rawText = truncateText(
		typeof parsed?.rawText === "string" ? parsed.rawText : extractTextPreview(content)
	);
	const metadata = parsed?.metadata && typeof parsed.metadata === "object" ? parsed.metadata : {};
	const image =
		"image" in metadata && typeof metadata.image === "string"
			? metadata.image
			: extractJsonStringField(content, "image");

	return JSON.stringify({
		url,
		title: linkTitle,
		description,
		content: {
			type: "doc",
			content: rawText ? [{ type: "paragraph", content: rawText }] : [],
		},
		rawText,
		metadata: {
			image: image || undefined,
			extractedAt:
				"extractedAt" in metadata && typeof metadata.extractedAt === "string" ? metadata.extractedAt : "",
			contentBlocks: 1,
		},
		parsing: {
			method: "preview",
			userAgent: "",
			success: true,
		},
	});
}

function extractTextPreview(content: string): string {
	const parsed = safeParseJson<unknown>(content);
	if (parsed) {
		const text = extractTextFromStructuredContent(parsed);
		if (text) return truncateText(text);
	}

	const textMatches = [...content.matchAll(/"(?:text|content)"\s*:\s*"((?:\\.|[^"\\])*)"/g)]
		.map((match) => parseJsonStringLiteral(match[1] || ""))
		.filter(Boolean);

	return truncateText(textMatches.length ? textMatches.join(" ") : content);
}

function truncateText(content: string): string {
	const normalized = content.replace(/\s+/g, " ").trim();
	if (normalized.length <= contentListPreviewChars) return normalized;
	return `${normalized.slice(0, contentListPreviewChars).trimEnd()}...`;
}

function safeParseJson<T>(content: string): T | null {
	try {
		return JSON.parse(content) as T;
	} catch {
		return null;
	}
}

function extractJsonStringField(content: string, field: string): string | undefined {
	const match = content.match(new RegExp(`"${field}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`));
	return match ? parseJsonStringLiteral(match[1] || "") : undefined;
}

function parseJsonStringLiteral(value: string): string {
	try {
		return JSON.parse(`"${value}"`) as string;
	} catch {
		return value;
	}
}

function parseJsonRecord(content: string): Record<string, unknown> | null {
	try {
		const parsed = JSON.parse(content);
		return isRecord(parsed) ? parsed : null;
	} catch {
		return null;
	}
}

function hasMediaType(value: unknown): boolean {
	return isRecord(value) && typeof value.type === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
