import { spawn } from "node:child_process";

import type { IAudioMetadata } from "music-metadata";
import * as mm from "music-metadata";

export const audioUploadMaxFileSizeBytes = 50 * 1024 * 1024;
export const imageUploadMaxFileSizeBytes = 10 * 1024 * 1024;
export const jpegMimeType = "image/jpeg";
export const videoOutputMimeType = "video/mp4";
export const videoThumbnailTimestamp = "00:00:01.000";

interface MediaDimensions {
	height: number;
	width: number;
}

interface AudioContentParams {
	audioObjectName: string;
	audioUrl: string;
	bufferLength: number;
	coverDims?: MediaDimensions;
	coverObject?: string;
	coverThumbnailBase64?: string;
	coverUrl?: string;
	fileType: string;
	makeTrack: boolean;
	metadata: IAudioMetadata | null;
	title?: string | null;
}

export function buildAudioContent({
	audioObjectName,
	audioUrl,
	bufferLength,
	coverDims,
	coverObject,
	coverThumbnailBase64,
	coverUrl,
	fileType,
	makeTrack,
	metadata,
	title,
}: AudioContentParams) {
	return {
		audio: {
			bitrateKbps: metadata?.format.bitrate ? Math.round(metadata.format.bitrate / 1000) : undefined,
			channels: metadata?.format.numberOfChannels || undefined,
			durationSec: metadata?.format.duration ? Math.round(metadata.format.duration) : undefined,
			mimeType: fileType,
			object: audioObjectName,
			sampleRateHz: metadata?.format.sampleRate || undefined,
			sizeBytes: bufferLength,
			url: audioUrl,
		},
		cover: coverUrl
			? {
					height: coverDims?.height,
					object: coverObject,
					thumbnailBase64: coverThumbnailBase64,
					url: coverUrl,
					width: coverDims?.width,
				}
			: undefined,
		track: {
			album: metadata?.common.album || undefined,
			artist: metadata?.common.artist || undefined,
			diskNumber: metadata?.common.disk?.no || undefined,
			genre: metadata?.common.genre || undefined,
			isTrack:
				makeTrack ||
				Boolean(
					metadata?.common.artist ||
					metadata?.common.album ||
					metadata?.common.title ||
					metadata?.common.genre?.length
				),
			lyrics: metadata?.common.lyrics?.join("\n") || undefined,
			title: metadata?.common.title || title || undefined,
			trackNumber: metadata?.common.track?.no || undefined,
			year: metadata?.common.year || undefined,
		},
	};
}

export async function getImageDimensionsSafe(
	getImageDimensions: (buffer: Buffer) => Promise<{ height: number; width: number }>,
	buffer: Buffer
) {
	try {
		return await getImageDimensions(buffer);
	} catch {
		return undefined;
	}
}

export async function parseAudioMetadataSafe(buffer: Buffer, mimeType: string) {
	try {
		return await mm.parseBuffer(buffer, { mimeType, size: buffer.length });
	} catch {
		return null;
	}
}

export async function compressVideo(sourcePath: string, targetPath: string) {
	await runFFmpeg(["-i", sourcePath, "-c:v", "copy", "-c:a", "copy", targetPath], "ffmpeg process error");
}

export async function extractVideoThumbnail(sourcePath: string, targetPath: string) {
	await runFFmpeg(
		["-i", sourcePath, "-ss", videoThumbnailTimestamp, "-vframes", "1", targetPath],
		"ffmpeg thumbnail process error"
	);
}

async function runFFmpeg(args: string[], errorPrefix: string) {
	await new Promise<void>((resolve, reject) => {
		const ffmpeg = spawn("ffmpeg", args);

		let stderr = "";
		ffmpeg.stderr?.on("data", (data) => {
			stderr += data.toString();
		});

		ffmpeg.on("error", (error) => {
			reject(new Error(`${errorPrefix}: ${error.message}`));
		});

		ffmpeg.on("close", (code) => {
			if (code === 0) {
				resolve();
				return;
			}

			reject(new Error(`${errorPrefix} with code ${code}: ${stderr.slice(-500)}`));
		});
	});
}
