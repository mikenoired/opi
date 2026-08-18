/**
 * Finds object-storage paths for inline images owned by a user in a serialized note document.
 * Storage access itself remains the responsibility of the calling platform adapter.
 */
const imageDataUrlPattern = /^data:image\/[a-z0-9.+-]+;base64,[a-zA-Z0-9+/=\s]+$/i;
const safeImageUrlPattern = /^(?:https?:\/\/|\/api\/files\/note-images\/|note-images\/)/i;
const safeLinkUrlPattern = /^(?:https?:|mailto:|tel:)/i;

/**
 * Normalizes a serialized Tiptap document before it is persisted.
 *
 * Notes are rendered by both Web and Desktop, so this deliberately keeps only
 * the shared editor schema. It prevents untrusted node attributes (including
 * event handlers and javascript: URLs) from reaching either renderer.
 * Non-JSON notes are plain text and are returned intact.
 */
export function sanitizeNoteContent(content: string): string {
	const document = parseDocument(content);
	if (!isRecord(document) || document.type !== "doc") return content;

	const sanitized = sanitizeNode(document);
	return JSON.stringify(sanitized ?? { type: "doc", content: [] });
}

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

type NoteNode = {
	attrs?: Record<string, boolean | number | string>;
	content?: NoteNode[];
	marks?: Array<{ attrs?: Record<string, string>; type: string }>;
	text?: string;
	type: string;
};

function sanitizeNode(value: unknown): NoteNode | null {
	if (!isRecord(value) || typeof value.type !== "string") return null;
	const type = value.type;
	if (!allowedNodeTypes.has(type)) return null;

	const node: NoteNode = { type };
	if (type === "text") {
		if (typeof value.text !== "string") return null;
		node.text = value.text;
	} else if (Array.isArray(value.content)) {
		const children = value.content.map(sanitizeNode).filter((child): child is NoteNode => child !== null);
		if (children.length) node.content = children;
	}

	const attrs = sanitizeAttrs(type, value.attrs);
	if (type === "image" && !attrs) return null;
	if (attrs) node.attrs = attrs;
	const marks = type === "text" ? sanitizeMarks(value.marks) : undefined;
	if (marks?.length) node.marks = marks;
	return node;
}

const allowedNodeTypes = new Set([
	"blockquote",
	"bulletList",
	"codeBlock",
	"doc",
	"hardBreak",
	"heading",
	"horizontalRule",
	"image",
	"listItem",
	"orderedList",
	"paragraph",
	"taskItem",
	"taskList",
	"text",
]);

function sanitizeAttrs(type: string, value: unknown): Record<string, boolean | number | string> | undefined {
	if (!isRecord(value)) return undefined;
	if (type === "heading" && isHeadingLevel(value.level)) return { level: value.level };
	if (type === "orderedList" && isPositiveInteger(value.start)) return { start: value.start };
	if (type === "codeBlock" && typeof value.language === "string" && /^[\w+-]{0,64}$/.test(value.language))
		return { language: value.language };
	if (type === "taskItem" && typeof value.checked === "boolean") return { checked: value.checked };
	if (type === "image" && typeof value.src === "string" && isSafeImageUrl(value.src)) {
		const attrs: Record<string, string> = { src: value.src };
		if (typeof value.alt === "string") attrs.alt = value.alt;
		if (typeof value.title === "string") attrs.title = value.title;
		return attrs;
	}
	return undefined;
}

function sanitizeMarks(value: unknown): Array<{ attrs?: Record<string, string>; type: string }> | undefined {
	if (!Array.isArray(value)) return undefined;
	const marks: Array<{ attrs?: Record<string, string>; type: string }> = [];
	for (const mark of value) {
		if (!isRecord(mark) || typeof mark.type !== "string") continue;
		if (["bold", "code", "italic", "strike", "underline"].includes(mark.type))
			marks.push({ type: mark.type });
		if (
			mark.type === "link" &&
			isRecord(mark.attrs) &&
			typeof mark.attrs.href === "string" &&
			isSafeLinkUrl(mark.attrs.href)
		)
			marks.push({ attrs: { href: mark.attrs.href }, type: "link" });
	}
	return marks;
}

function isHeadingLevel(value: unknown): value is number {
	return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 6;
}

function isPositiveInteger(value: unknown): value is number {
	return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function isSafeImageUrl(value: string) {
	return imageDataUrlPattern.test(value) || safeImageUrlPattern.test(value);
}

function isSafeLinkUrl(value: string) {
	return safeLinkUrlPattern.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseDocument(content: string): unknown | null {
	try {
		return JSON.parse(content) as unknown;
	} catch {
		return null;
	}
}
