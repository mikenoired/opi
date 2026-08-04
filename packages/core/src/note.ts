/**
 * Finds object-storage paths for inline images owned by a user in a serialized note document.
 * Storage access itself remains the responsibility of the calling platform adapter.
 */
export function extractOwnedNoteImages(content: string, userId: string): string[] {
	const document = parseDocument(content);
	if (!document) return [];

	const prefix = `note-images/${userId}/`;
	const result = new Set<string>();

	const visit = (value: unknown) => {
		if (Array.isArray(value)) {
			for (const item of value) visit(item);
			return;
		}
		if (!value || typeof value !== "object") return;

		const node = value as Record<string, unknown>;
		const attrs = node.attrs;
		if (node.type === "image" && attrs && typeof attrs === "object") {
			const src = (attrs as Record<string, unknown>).src;
			if (typeof src === "string") {
				const objectName = src.startsWith("/api/files/") ? src.slice("/api/files/".length) : src;
				if (objectName.startsWith(prefix)) result.add(objectName);
			}
		}

		for (const child of Object.values(node)) visit(child);
	};

	visit(document);
	return [...result];
}

function parseDocument(content: string): unknown | null {
	try {
		return JSON.parse(content) as unknown;
	} catch {
		return null;
	}
}
