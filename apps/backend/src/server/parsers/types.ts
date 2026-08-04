export interface ParsedDocument {
	type: string;
	title?: string;
	content: string;
	thumbnailBase64?: string;
	images?: Array<{ id: string; url: string; base64?: string }>;
}

export interface ParserOptions {
	extractThumbnail?: boolean;
	maxContentLength?: number;
}
