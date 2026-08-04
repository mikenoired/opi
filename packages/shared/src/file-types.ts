export type SupportedFileType = "pdf" | "docx" | "epub" | "xlsx" | "csv";

export function getFileType(filename: string, mimeType?: string): SupportedFileType | null {
	const extension = filename.toLowerCase().split(".").pop();

	if (mimeType) {
		const mimeTypeMap: Record<string, SupportedFileType> = {
			"application/pdf": "pdf",
			"application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
			"application/epub+zip": "epub",
			"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
			"application/vnd.ms-excel": "xlsx",
			"text/csv": "csv",
		};

		if (mimeTypeMap[mimeType]) return mimeTypeMap[mimeType];
	}

	const extensionMap: Record<string, SupportedFileType> = {
		pdf: "pdf",
		docx: "docx",
		epub: "epub",
		xlsx: "xlsx",
		xls: "xlsx",
		csv: "csv",
	};

	return extension ? extensionMap[extension] || null : null;
}

export function isSupportedFileType(filename: string, mimeType?: string): boolean {
	return getFileType(filename, mimeType) !== null;
}

export function getSupportedExtensions(): string[] {
	return ["pdf", "docx", "epub", "xlsx", "xls", "csv"];
}

export function getSupportedMimeTypes(): string[] {
	return [
		"application/pdf",
		"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
		"application/epub+zip",
		"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
		"application/vnd.ms-excel",
		"text/csv",
	];
}
