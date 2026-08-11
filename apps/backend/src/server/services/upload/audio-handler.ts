import { buildAudioContent } from "@synapse/core";
import sharp from "sharp";

import { deleteFile, getPublicUrl, uploadFile } from "../../../storage/minio";
import { generateThumbnail, getImageDimensions } from "../../lib/generate-thumbnail";
import type { UploadHandlerDeps } from "./upload-handler-types";
import {
	audioUploadMaxFileSizeBytes,
	getImageDimensionsSafe,
	jpegMimeType,
	needsPlayableAudioTranscode,
	parseAudioMetadataSafe,
	transcodeAlacToAac,
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
			lyrics: normalizeLyrics(metadata.common.lyrics),
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

function normalizeLyrics(lyrics: unknown[] | undefined): string[] | undefined {
	const values = lyrics
		?.map((lyric) => {
			if (typeof lyric === "string") return lyric;
			if (typeof lyric === "object" && lyric && "text" in lyric && typeof lyric.text === "string")
				return lyric.text;
			return undefined;
		})
		.filter((lyric): lyric is string => Boolean(lyric?.trim()));
	return values?.length ? values : undefined;
}

export async function processAudioUpload(
	deps: UploadHandlerDeps,
	file: FilePayload,
	params: AudioUploadParams
): Promise<ProcessOutcome> {
	if (file.size > audioUploadMaxFileSizeBytes)
		return { errors: [`File "${file.name}" is too large (max 50MB)`] };

	const sourceMetadata = await parseAudioMetadataSafe(file.buffer, file.type);
	const audioWasTranscoded = needsPlayableAudioTranscode(sourceMetadata?.format.codec);
	const playableBuffer = audioWasTranscoded ? await transcodeAlacToAac(file.buffer, file.name) : file.buffer;
	const playableType = audioWasTranscoded ? "audio/mp4" : file.type;
	const playableName = audioWasTranscoded ? file.name.replace(/\.[^.]+$/, ".m4a") : file.name;
	const metadata = audioWasTranscoded
		? ((await parseAudioMetadataSafe(playableBuffer, playableType)) ?? sourceMetadata)
		: sourceMetadata;
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

	const picture = sourceMetadata?.common.picture?.find((candidate) => candidate.data?.length);
	try {
		if (picture?.data?.length) {
			let uploadedCoverObject: string | undefined;
			try {
				const jpeg = await sharp(picture.data).jpeg({ quality: 85 }).toBuffer();
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

		const entityTitle = params.title || metadata?.common.title || undefined;
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
