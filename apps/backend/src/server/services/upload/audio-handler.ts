import { buildAudioContent, scrapeAudioMetadata } from "@synapse/core";
import sharp from "sharp";

import { deleteFile, getPublicUrl, uploadFile } from "../../../storage/minio";
import { generateThumbnail, getImageDimensions } from "../../lib/generate-thumbnail";
import type { UploadHandlerDeps } from "./upload-handler-types";
import {
	audioUploadMaxFileSizeBytes,
	getAudioFallbackTitle,
	getImageDimensionsSafe,
	jpegMimeType,
	needsPlayableAudioTranscode,
	parseAudioMetadataSafe,
	transcodeAlacToAac,
} from "./upload-media";
import type { AudioUploadParams, FilePayload, ProcessOutcome } from "./upload-types";

export async function processAudioUpload(
	deps: UploadHandlerDeps,
	file: FilePayload,
	params: AudioUploadParams
): Promise<ProcessOutcome> {
	if (file.size > audioUploadMaxFileSizeBytes)
		return { errors: [`File "${file.name}" is too large (max 50MB)`] };

	const sourceMetadata = await parseAudioMetadataSafe(file.buffer, file.type);
	const sourceScraped = sourceMetadata ? scrapeAudioMetadata(sourceMetadata, file.name) : undefined;
	const audioWasTranscoded = needsPlayableAudioTranscode(sourceMetadata?.format.codec);
	const playableBuffer = audioWasTranscoded ? await transcodeAlacToAac(file.buffer, file.name) : file.buffer;
	const playableType = audioWasTranscoded ? "audio/mp4" : file.type;
	const playableName = audioWasTranscoded ? file.name.replace(/\.[^.]+$/, ".m4a") : file.name;
	const metadata = audioWasTranscoded
		? ((await parseAudioMetadataSafe(playableBuffer, playableType)) ?? sourceMetadata)
		: sourceMetadata;
	const scraped = metadata ? scrapeAudioMetadata(metadata, file.name) : undefined;
	const audioUpload = await uploadFile(playableBuffer, playableName, playableType, params.userId, "audio", {
		maxFileSize: audioUploadMaxFileSizeBytes,
	});
	const errors: string[] = [];

	if (!audioUpload.validation.isValid)
		errors.push(`File "${file.name}" is not valid: ${audioUpload.validation.errors.join(", ")}`);

	if (!audioUpload.success || !audioUpload.objectName) {
		errors.push(`Failed to upload file "${file.name}"`);
		return { errors };
	}

	const audioUrl = getPublicUrl(audioUpload.objectName);
	let coverUrl: string | undefined;
	let coverObject: string | undefined;
	let coverThumbnailBase64: string | undefined;
	let coverDims: { height: number; width: number } | undefined;
	let coverFileSize: number | undefined;
	let contentPersisted = false;

	const picture = sourceScraped?.artwork;
	try {
		if (picture?.bytes.length) {
			let uploadedCoverObject: string | undefined;
			try {
				const jpeg = await sharp(picture.bytes).jpeg({ quality: 85 }).toBuffer();
				const coverUpload = await uploadFile(
					jpeg,
					file.name.replace(/\.[^.]+$/, ".jpg"),
					jpegMimeType,
					params.userId,
					"audio-covers"
				);

				if (!coverUpload.success || !coverUpload.objectName) {
					throw new Error(coverUpload.validation.errors.join(", ") || "upload rejected");
				}
				uploadedCoverObject = coverUpload.objectName;

				const [dimensions, thumbnail] = await Promise.all([
					getImageDimensionsSafe(getImageDimensions, jpeg),
					generateThumbnail(jpeg),
				]);
				coverObject = uploadedCoverObject;
				coverUrl = getPublicUrl(uploadedCoverObject);
				coverFileSize = coverUpload.fileSize || 0;
				coverDims = dimensions;
				coverThumbnailBase64 = thumbnail;
			} catch (error) {
				if (uploadedCoverObject) await deleteFile(uploadedCoverObject).catch(() => undefined);
				errors.push(
					`Cover for "${file.name}" was skipped: ${error instanceof Error ? error.message : "processing failed"}`
				);
			}
		}

		const entityTitle = params.title?.trim() || scraped?.title?.trim() || getAudioFallbackTitle(file.name);
		const serializedContent = JSON.stringify(
			buildAudioContent({
				audioObjectName: audioUpload.objectName,
				audioUrl,
				bufferLength: playableBuffer.length,
				coverDims,
				coverObject,
				coverThumbnailBase64,
				coverUrl,
				fileType: playableType,
				makeTrack: params.makeTrack,
				metadata: scraped?.metadata ?? null,
				title: entityTitle,
			})
		);
		const createdContent = await deps.persistContent({
			content: serializedContent,
			tags: params.tags,
			title: entityTitle,
			type: "audio",
			userId: params.userId,
		});
		contentPersisted = true;

		await deps.trackStorage(params.userId, [
			{ size: audioUpload.fileSize || 0 },
			{ size: coverFileSize || 0, updateFileCount: false },
		]);

		return {
			errors,
			result: {
				content: createdContent,
				cover: coverUrl,
				fileName: playableName,
				objectName: audioUpload.objectName,
				size: playableBuffer.length,
				thumbnailBase64: coverThumbnailBase64,
				type: playableType,
				url: audioUrl,
			},
		};
	} catch (error) {
		if (!contentPersisted) {
			await Promise.all([
				deleteFile(audioUpload.objectName),
				...(coverObject ? [deleteFile(coverObject)] : []),
			]);
		}
		throw error;
	}
}
