import type { Content } from "@synapse/shared/schemas";

export interface TodoItem {
	text: string;
	marked: boolean;
}

export interface ParsedLinkData {
	title: string;
	description?: string;
	url: string;
	metadata: {
		favicon?: string;
		image?: string;
		siteName?: string;
		author?: string;
		publishedTime?: string;
		contentBlocks: number;
	};
	rawText?: string;
}

export interface ContentFormState {
	type: Content["type"];
	title: string;
	content: string;
	isFullScreen: boolean;
}

export interface MediaState {
	selectedFiles: File[];
	previewUrls: string[];
	dragActive: boolean;
}

export interface TagState {
	tags: string[];
	currentTag: string;
}

export interface TodoState {
	items: TodoItem[];
}

export interface LinkState {
	parsedData: ParsedLinkData | null;
	isLoading: boolean;
}
