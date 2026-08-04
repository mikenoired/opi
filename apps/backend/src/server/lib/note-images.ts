import { Buffer } from "node:buffer";

import { deleteFile, getFileMetadata, getPublicUrl, uploadFile } from "../../storage/minio";
import { imageUploadMaxFileSizeBytes } from "../services/upload/upload-media";
import { ApiError } from "./api-error";

const imageDataUrlPattern = /^data:(image\/(?:jpeg|png|gif|webp));base64,([a-zA-Z0-9+/=\s]+)$/;
const imageExtensions: Record<string, string> = {
	"image/gif": "gif",
	"image/jpeg": "jpg",
	"image/png": "png",
	"image/webp": "webp",
};

interface UploadedNoteImage {
	objectName: string;
	size: number;
}

interface NoteImageStorage {
	delete: (objectName: string) => Promise<void>;
	getMetadata: (objectName: string) => Promise<{ size: number } | null>;
	getUrl: (objectName: string) => string;
	upload: typeof uploadFile;
}

const defaultStorage: NoteImageStorage = {
	delete: deleteFile,
	getMetadata: getFileMetadata,
	getUrl: getPublicUrl,
	upload: uploadFile,
};

function parseDocument(content: string): unknown | null {
	try {
		return JSON.parse(content) as unknown;
	} catch {
		return null;
	}
}

function parseImageDataUrl(src: string): { buffer: Buffer; extension: string; mimeType: string } {
	const match = imageDataUrlPattern.exec(src);
	if (!match) {
		throw new ApiError({ code: "BAD_REQUEST", message: "Unsupported inline image" });
	}

	const [, mimeType, encoded] = match;
	if (!mimeType || !encoded) {
		throw new ApiError({ code: "BAD_REQUEST", message: "Invalid inline image" });
	}

	const compact = encoded.replace(/\s/g, "");
	if (compact.length > Math.ceil((imageUploadMaxFileSizeBytes * 4) / 3) + 4) {
		throw new ApiError({ code: "BAD_REQUEST", message: "Inline image is too large (max 10MB)" });
	}

	const buffer = Buffer.from(compact, "base64");
	if (!buffer.length || buffer.length > imageUploadMaxFileSizeBytes) {
		throw new ApiError({ code: "BAD_REQUEST", message: "Inline image is too large (max 10MB)" });
	}

	return { buffer, extension: imageExtensions[mimeType]!, mimeType };
}

async function rollbackUploads(images: UploadedNoteImage[], storage: NoteImageStorage) {
	await Promise.all(images.map((image) => storage.delete(image.objectName)));
}

export async function prepareNoteImages(
	content: string,
	userId: string,
	storage: NoteImageStorage = defaultStorage
): Promise<{ content: string; uploaded: UploadedNoteImage[] }> {
	const document = parseDocument(content);
	if (!document) return { content, uploaded: [] };

	const uploaded: UploadedNoteImage[] = [];

	const visit = async (value: unknown): Promise<unknown> => {
		if (Array.isArray(value)) {
			const result: unknown[] = [];
			for (const item of value) result.push(await visit(item));
			return result;
		}

		if (!value || typeof value !== "object") return value;

		const node = value as Record<string, unknown>;
		const attrs = node.attrs;
		if (node.type === "image" && attrs && typeof attrs === "object") {
			const imageAttrs = attrs as Record<string, unknown>;
			if (typeof imageAttrs.src === "string" && imageAttrs.src.startsWith("data:")) {
				const { buffer, extension, mimeType } = parseImageDataUrl(imageAttrs.src);
				const result = await storage.upload(
					buffer,
					`inline-image.${extension}`,
					mimeType,
					userId,
					"note-images",
					{
						allowedExtensions: [`.${extension}`],
						allowedMimeTypes: [mimeType],
						maxFileSize: imageUploadMaxFileSizeBytes,
					}
				);

				if (!result.success || !result.objectName) {
					throw new ApiError({
						code: "BAD_REQUEST",
						message: result.validation.errors[0] || "Inline image upload failed",
					});
				}

				uploaded.push({ objectName: result.objectName, size: result.fileSize ?? buffer.length });
				return { ...node, attrs: { ...imageAttrs, src: storage.getUrl(result.objectName) } };
			}
		}

		const result: Record<string, unknown> = {};
		for (const [key, child] of Object.entries(node)) result[key] = await visit(child);
		return result;
	};

	try {
		return { content: JSON.stringify(await visit(document)), uploaded };
	} catch (error) {
		await rollbackUploads(uploaded, storage);
		throw error;
	}
}

export async function deleteStoredNoteImages(
	objectNames: string[],
	storage: NoteImageStorage = defaultStorage
): Promise<number[]> {
	const sizes: number[] = [];
	for (const objectName of objectNames) {
		const metadata = await storage.getMetadata(objectName);
		await storage.delete(objectName);
		if (metadata?.size) sizes.push(metadata.size);
	}
	return sizes;
}

export async function deleteUploadedNoteImages(
	images: UploadedNoteImage[],
	storage: NoteImageStorage = defaultStorage
) {
	await rollbackUploads(images, storage);
}
