import { randomUUID } from "node:crypto";
import { readFile, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { buildVideoMediaContent } from "@synapse/core";

import { getPublicUrl, uploadFile } from "../../../storage/minio";
import { generateThumbnail, getImageDimensions } from "../../lib/generate-thumbnail";
import type { UploadHandlerDeps } from "./upload-handler-types";
import {
	compressVideo,
	extractVideoThumbnail,
	getImageDimensionsSafe,
	jpegMimeType,
	videoOutputMimeType,
} from "./upload-media";
import type { FilePayload, ProcessOutcome, UploadBaseParams } from "./upload-types";

export async function processVideoUpload(
	deps: UploadHandlerDeps,
	file: FilePayload,
	params: UploadBaseParams
): Promise<ProcessOutcome> {
	const tempVideoPath = join(tmpdir(), `${randomUUID()}-${file.name}`);
	const tempThumbPath = join(tmpdir(), `${randomUUID()}.jpg`);
	const compressedPath = join(tmpdir(), `${randomUUID()}-compressed.mp4`);
	const errors: string[] = [];

	try {
		await writeFile(tempVideoPath, file.buffer);
		await compressVideo(tempVideoPath, compressedPath);
		await extractVideoThumbnail(tempVideoPath, tempThumbPath);

		const compressedBuffer = await readFile(compressedPath);
		const thumbBuffer = await readFile(tempThumbPath);

		const videoUpload = await uploadFile(
			compressedBuffer,
			file.name.replace(/\.[^.]+$/, ".mp4"),
			videoOutputMimeType,
			params.userId,
			"media"
		);
		const thumbUpload = await uploadFile(
			thumbBuffer,
			file.name.replace(/\.[^.]+$/, ".jpg"),
			jpegMimeType,
			params.userId,
			"media-thumbs"
		);

		if (!videoUpload.validation.isValid)
			errors.push(`File "${file.name}" is not valid: ${videoUpload.validation.errors.join(", ")}`);
		if (!thumbUpload.validation.isValid)
			errors.push(`Thumbnail for "${file.name}" is not valid: ${thumbUpload.validation.errors.join(", ")}`);

		if (!videoUpload.success || !videoUpload.objectName || !thumbUpload.success || !thumbUpload.objectName) {
			errors.push(`Failed to upload video or thumbnail for "${file.name}"`);
			return { errors };
		}

		const [videoDimensions, thumbnailBase64] = await Promise.all([
			getImageDimensionsSafe(getImageDimensions, thumbBuffer),
			generateThumbnail(thumbBuffer),
		]);

		const videoUrl = getPublicUrl(videoUpload.objectName);
		const thumbnailUrl = getPublicUrl(thumbUpload.objectName);
		const serializedContent = JSON.stringify(
			buildVideoMediaContent({
				objectName: videoUpload.objectName,
				publicUrl: videoUrl,
				thumbnailBase64,
				thumbnailUrl,
				videoDimensions,
			})
		);
		const createdContent = await deps.persistContent({
			content: serializedContent,
			mediaType: "video",
			tags: params.tags,
			title: params.title || undefined,
			type: "media",
			userId: params.userId,
		});

		await deps.trackStorage(params.userId, [
			{ size: videoUpload.fileSize || 0 },
			{ size: thumbUpload.fileSize || 0, updateFileCount: false },
		]);

		return {
			errors,
			result: {
				content: createdContent,
				fileName: file.name,
				objectName: videoUpload.objectName,
				size: file.size,
				thumbnail: thumbnailUrl,
				thumbnailBase64,
				type: file.type,
				url: videoUrl,
			},
		};
	} finally {
		await Promise.allSettled([unlink(tempVideoPath), unlink(compressedPath), unlink(tempThumbPath)]);
	}
}
