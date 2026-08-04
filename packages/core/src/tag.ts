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
