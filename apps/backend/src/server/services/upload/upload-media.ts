import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";

import * as mm from "music-metadata";

export const audioUploadMaxFileSizeBytes = 50 * 1024 * 1024;
export const imageUploadMaxFileSizeBytes = 10 * 1024 * 1024;
export const jpegMimeType = "image/jpeg";
export const videoOutputMimeType = "video/mp4";
export const videoThumbnailTimestamp = "00:00:01.000";

export function getAudioFallbackTitle(fileName: string): string {
	return fileName.replace(/\.[^.]+$/, "").trim() || "Audio";
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

/** Chromium does not reliably decode Apple Lossless streams in an M4A container. */
export function needsPlayableAudioTranscode(codec?: string): boolean {
	return codec?.trim().toLocaleLowerCase() === "alac";
}

export async function transcodeAlacToAac(buffer: Buffer, fileName: string): Promise<Buffer> {
	const directory = await mkdtemp(join(tmpdir(), "monolyth-audio-"));
	const sourcePath = join(directory, `source${extname(fileName) || ".m4a"}`);
	const targetPath = join(directory, "playable.m4a");
	try {
		await writeFile(sourcePath, buffer);
		await runFFmpeg(
			[
				"-y",
				"-i",
				sourcePath,
				"-map",
				"0:a:0",
				"-c:a",
				"aac",
				"-b:a",
				"256k",
				"-movflags",
				"+faststart",
				targetPath,
			],
			"audio transcoding error"
		);
		return await readFile(targetPath);
	} finally {
		await rm(directory, { force: true, recursive: true });
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
