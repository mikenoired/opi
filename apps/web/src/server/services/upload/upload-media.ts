import { spawn } from "node:child_process";

import * as mm from "music-metadata";

export const audioUploadMaxFileSizeBytes = 50 * 1024 * 1024;
export const imageUploadMaxFileSizeBytes = 10 * 1024 * 1024;
export const jpegMimeType = "image/jpeg";
export const videoOutputMimeType = "video/mp4";
export const videoThumbnailTimestamp = "00:00:01.000";

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
