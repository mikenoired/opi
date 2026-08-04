import { buildAudioContent } from "@synapse/core";
import sharp from "sharp";

import { deleteFile, getPublicUrl, uploadFile } from "../../../storage/minio";
import { generateThumbnail, getImageDimensions } from "../../lib/generate-thumbnail";
import type { UploadHandlerDeps } from "./upload-handler-types";
import {
	audioUploadMaxFileSizeBytes,
	getImageDimensionsSafe,
	jpegMimeType,
	parseAudioMetadataSafe,
} from "./upload-media";
import type { AudioUploadParams, FilePayload, ProcessOutcome } from "./upload-types";

function toCoreAudioMetadata(metadata: Awaited<ReturnType<typeof parseAudioMetadataSafe>>) {
	if (!metadata) return null;

	return {
		common: {
			album: metadata.common.album,
			artist: metadata.common.artist,
			disk: metadata.common.disk,
			genre: metadata.common.genre,
			lyrics: metadata.common.lyrics?.map(String),
			title: metadata.common.title,
			track: metadata.common.track,
			year: metadata.common.year,
		},
		format: {
			bitrate: metadata.format.bitrate,
			duration: metadata.format.duration,
			numberOfChannels: metadata.format.numberOfChannels,
			sampleRate: metadata.format.sampleRate,
		},
	};
}

export async function processAudioUpload(
	deps: UploadHandlerDeps,
	file: FilePayload,
	params: AudioUploadParams
): Promise<ProcessOutcome> {
	if (file.size > audioUploadMaxFileSizeBytes)
		return { errors: [`File "${file.name}" is too large (max 50MB)`] };

	const metadata = await parseAudioMetadataSafe(file.buffer, file.type);
	const audioUpload = await uploadFile(file.buffer, file.name, file.type, params.userId, "audio", {
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

	const picture = metadata?.common.picture?.[0];
	try {
		if (picture?.data?.length) {
			const jpeg = await sharp(picture.data).jpeg({ quality: 85 }).toBuffer();
			const coverUpload = await uploadFile(
				jpeg,
				file.name.replace(/\.[^.]+$/, ".jpg"),
				jpegMimeType,
				params.userId,
				"audio-covers"
			);

			if (!coverUpload.success || !coverUpload.objectName) {
				throw new Error(
					`Failed to upload cover for "${file.name}": ${coverUpload.validation.errors.join(", ")}`
				);
			}

			coverObject = coverUpload.objectName;
			coverUrl = getPublicUrl(coverUpload.objectName);
			coverFileSize = coverUpload.fileSize || 0;
			[coverDims, coverThumbnailBase64] = await Promise.all([
				getImageDimensionsSafe(getImageDimensions, jpeg),
				generateThumbnail(jpeg),
			]);
		}

		const entityTitle = params.title || metadata?.common.title || undefined;
		const serializedContent = JSON.stringify(
			buildAudioContent({
				audioObjectName: audioUpload.objectName,
				audioUrl,
				bufferLength: file.buffer.length,
				coverDims,
				coverObject,
				coverThumbnailBase64,
				coverUrl,
				fileType: file.type,
				makeTrack: params.makeTrack,
				metadata: toCoreAudioMetadata(metadata),
				title: params.title,
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
				fileName: file.name,
				objectName: audioUpload.objectName,
				size: file.size,
				thumbnailBase64: coverThumbnailBase64,
				type: file.type,
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
