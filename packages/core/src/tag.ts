export function normalizeTagTitle(title: string): string {
	return title.trim().toLowerCase();
}

export function uniqueTagTitles(titles: string[]): string[] {
	return Array.from(new Map(titles.map((title) => [normalizeTagTitle(title), title.trim()])).values()).filter(
		Boolean
	);
}
