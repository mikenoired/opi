export function buildContentSearchText(content: { content: string; tags?: string[]; title?: null | string }) {
	const parts = [content.title, ...(content.tags ?? []), extractContentText(content.content)];
	return parts.filter(Boolean).join("\n").replace(/\s+/g, " ").trim();
}

export function extractContentText(raw: string) {
	try {
		const parsed = JSON.parse(raw) as unknown;
		const parts: string[] = [];
		const walk = (node: unknown) => {
			if (Array.isArray(node)) {
				for (const item of node) walk(item);
				return;
			}
			if (!node || typeof node !== "object") return;
			const value = node as { content?: unknown; rawText?: unknown; text?: unknown };
			if (typeof value.text === "string") parts.push(value.text);
			if (typeof value.rawText === "string") parts.push(value.rawText);
			if (value.content) walk(value.content);
		};
		walk(parsed);
		return parts.join(" ") || raw;
	} catch {
		return raw;
	}
}
