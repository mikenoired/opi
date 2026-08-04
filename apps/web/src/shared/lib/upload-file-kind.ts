import type { Content } from "@synapse/shared/schemas";

const documentExtensions = new Set(["pdf", "doc", "docx", "epub", "xlsx", "xls", "csv"]);

type UploadFamily = "audio" | "doc" | "media";

function getFileExtension(fileName: string): string {
	const extension = fileName.toLowerCase().split(".").pop();
	return extension ?? "";
}

function getUploadFamily(file: File): UploadFamily | null {
	if (file.type.startsWith("audio/")) {
		return "audio";
	}

	if (file.type.startsWith("image/") || file.type.startsWith("video/")) {
		return "media";
	}

	if (documentExtensions.has(getFileExtension(file.name))) {
		return "doc";
	}

	return null;
}

export function inferContentTypeFromFiles(files: File[]): Content["type"] | null {
	if (files.length === 0) {
		return null;
	}

	const families = files.map(getUploadFamily).filter((value): value is UploadFamily => value !== null);

	if (families.length === 0) {
		return null;
	}

	const [firstFamily] = families;

	if (families.some((family) => family !== firstFamily)) {
		return null;
	}

	return firstFamily;
}

export function normalizeDroppedFiles(files: File[]): { files: File[]; type: Content["type"] | null } {
	const supportedFiles = files.filter((file) => getUploadFamily(file) !== null);

	if (supportedFiles.length === 0) {
		return { files: [], type: null };
	}

	const inferredType = inferContentTypeFromFiles(supportedFiles);

	if (inferredType) {
		return { files: supportedFiles, type: inferredType };
	}

	const firstFamily = getUploadFamily(supportedFiles[0]);
	if (!firstFamily) {
		return { files: [], type: null };
	}

	return {
		files: supportedFiles.filter((file) => getUploadFamily(file) === firstFamily),
		type: firstFamily,
	};
}
