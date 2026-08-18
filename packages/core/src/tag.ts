import type { ContentRepository, GraphProvider } from "./providers";

export function normalizeTagTitle(title: string): string {
	return title.trim().toLowerCase();
}

export function uniqueTagTitles(titles: string[]): string[] {
	return Array.from(new Map(titles.map((title) => [normalizeTagTitle(title), title.trim()])).values()).filter(
		Boolean
	);
}

export interface TagTitleRecord {
	id: string;
	title: string;
}

export interface TagTitleRepository {
	createTags: (titles: string[]) => Promise<TagTitleRecord[]>;
	findTagsByTitle: (titles: string[]) => Promise<TagTitleRecord[]>;
}

/**
 * The graph is an implementation detail of a platform repository, but keeping
 * its Content-to-tag write sequence here ensures every platform applies the
 * same relation invariant.
 */
export type ContentTagRelationRepository = Pick<
	ContentRepository,
	"createContentTags" | "deleteContentTags"
> &
	Pick<GraphProvider, "createContentTagEdges" | "deleteContentTagEdges" | "getOrCreateTagNodeIds">;

export async function writeContentTagRelations(
	repository: ContentTagRelationRepository,
	{
		contentId,
		contentNodeId,
		mode,
		tagIds,
	}: {
		contentId: string;
		contentNodeId: string;
		mode: "append" | "replace";
		tagIds: string[];
	}
): Promise<void> {
	if (mode === "replace") {
		await repository.deleteContentTags(contentId);
		await repository.deleteContentTagEdges(contentNodeId);
	}
	if (!tagIds.length) return;

	const tagNodeIdByTagId = await repository.getOrCreateTagNodeIds(tagIds);
	await repository.createContentTags(tagIds, contentId);
	await repository.createContentTagEdges(contentNodeId, tagNodeIdByTagId, tagIds);
}

export type ContentDeletionRepository = Pick<ContentRepository, "deleteContent" | "deleteContentTags"> &
	Pick<GraphProvider, "deleteContentNodeGraph" | "findContentNodeId">;

export async function deleteContentWithRelations(
	repository: ContentDeletionRepository,
	contentId: string
): Promise<void> {
	const contentNodeId = await repository.findContentNodeId(contentId);
	await repository.deleteContentTags(contentId);
	if (contentNodeId) await repository.deleteContentNodeGraph(contentNodeId);
	await repository.deleteContent(contentId);
}

export async function resolveTagTitlesToIds(
	repository: TagTitleRepository,
	titles: string[]
): Promise<{ createdTags: TagTitleRecord[]; ids: string[] }> {
	const uniqueTitles = uniqueTagTitles(titles);
	if (uniqueTitles.length === 0) return { createdTags: [], ids: [] };

	const existing = await repository.findTagsByTitle(uniqueTitles);
	const tagIdByTitle = new Map(existing.map((tag) => [normalizeTagTitle(tag.title), tag.id]));
	const missingTitles = uniqueTitles.filter((title) => !tagIdByTitle.has(normalizeTagTitle(title)));
	const createdTags = missingTitles.length ? await repository.createTags(missingTitles) : [];

	for (const tag of createdTags) tagIdByTitle.set(normalizeTagTitle(tag.title), tag.id);
	return {
		createdTags,
		ids: uniqueTitles
			.map((title) => tagIdByTitle.get(normalizeTagTitle(title)))
			.filter((id): id is string => typeof id === "string" && id.length > 0),
	};
}

export type TagTitleGraphRepository = TagTitleRepository & Pick<GraphProvider, "createTagNode">;

export async function resolveTagTitlesAndCreateNodes(
	repository: TagTitleGraphRepository,
	titles: string[]
): Promise<string[]> {
	const { createdTags, ids } = await resolveTagTitlesToIds(repository, titles);
	for (const tag of createdTags) await repository.createTagNode(tag.title);
	return ids;
}
