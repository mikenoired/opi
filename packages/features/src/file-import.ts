import type { Content } from "@monolyth/shared/schemas";

const documentExtensions = new Set(["pdf", "doc", "docx", "epub", "xlsx", "xls", "csv"]);
const audioExtensions = new Set(["aac", "flac", "m4a", "mp3", "ogg", "opus", "wav", "webm"]);
const imageExtensions = new Set(["avif", "gif", "jpeg", "jpg", "png", "webp"]);
const videoExtensions = new Set(["avi", "mkv", "mov", "mp4", "webm"]);

type UploadFamily = "audio" | "doc" | "media";

function getUploadFamily(file: File): UploadFamily | null {
	if (file.type.startsWith("audio/")) return "audio";
	if (file.type.startsWith("image/") || file.type.startsWith("video/")) return "media";
	const extension = file.name.toLowerCase().split(".").pop() ?? "";
	if (audioExtensions.has(extension)) return "audio";
	if (imageExtensions.has(extension) || videoExtensions.has(extension)) return "media";
	return documentExtensions.has(extension) ? "doc" : null;
}

export function inferMimeType(fileName: string, mimeType?: string): string {
	if (mimeType && mimeType !== "application/octet-stream") {
		if (mimeType === "audio/mp3") return "audio/mpeg";
		if (mimeType === "audio/m4a" || mimeType === "audio/x-m4a") return "audio/mp4";
		if (mimeType === "audio/x-wav") return "audio/wav";
		if (mimeType === "audio/x-flac") return "audio/flac";
		return mimeType;
	}
	const extension = fileName.toLowerCase().split(".").pop() ?? "";
	return (
		{
			aac: "audio/aac",
			avi: "video/x-msvideo",
			flac: "audio/flac",
			gif: "image/gif",
			jpeg: "image/jpeg",
			jpg: "image/jpeg",
			m4a: "audio/mp4",
			mkv: "video/x-matroska",
			mov: "video/quicktime",
			mp3: "audio/mpeg",
			mp4: "video/mp4",
			ogg: "audio/ogg",
			opus: "audio/opus",
			png: "image/png",
			wav: "audio/wav",
			webm: "video/webm",
			webp: "image/webp",
		}[extension] ?? "application/octet-stream"
	);
}

export function inferContentTypeFromFiles(files: File[]): Content["type"] | null {
	const families = files.map(getUploadFamily).filter((value): value is UploadFamily => value !== null);
	if (!families.length || families.some((family) => family !== families[0])) return null;
	return families[0];
}

/** Keeps one upload policy for browser paste/drop and Electron renderer drop. */
export function normalizeDroppedFiles(files: File[]): { files: File[]; type: Content["type"] | null } {
	const supportedFiles = files.filter((file) => getUploadFamily(file) !== null);
	const type = inferContentTypeFromFiles(supportedFiles);
	if (type) return { files: supportedFiles, type };
	const firstType = supportedFiles.length ? getUploadFamily(supportedFiles[0]) : null;
	return firstType
		? { files: supportedFiles.filter((file) => getUploadFamily(file) === firstType), type: firstType }
		: { files: [], type: null };
}
