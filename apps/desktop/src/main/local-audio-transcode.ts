import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Converts codecs Chromium cannot play (currently ALAC) into a broadly
 * supported AAC-in-M4A stream. FFmpeg is already a desktop development
 * prerequisite and is bundled in the server image for the web path.
 */
export async function transcodeLocalAudioToAac(bytes: Uint8Array, extension: string): Promise<Uint8Array> {
	const directory = await mkdtemp(join(tmpdir(), "monolyth-audio-"));
	const sourcePath = join(directory, `source.${extension || "m4a"}`);
	const targetPath = join(directory, "playable.m4a");
	try {
		await writeFile(sourcePath, bytes);
		await runFfmpeg([
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
		]);
		return new Uint8Array(await readFile(targetPath));
	} finally {
		await rm(directory, { force: true, recursive: true });
	}
}

function runFfmpeg(args: string[]): Promise<void> {
	return new Promise((resolve, reject) => {
		const process = spawn("ffmpeg", args);
		let stderr = "";
		process.stderr.on("data", (chunk) => {
			stderr += String(chunk);
		});
		process.on("error", () => reject(new Error("Не удалось запустить FFmpeg для подготовки аудио")));
		process.on("close", (code) => {
			if (code === 0) resolve();
			else reject(new Error(`Не удалось подготовить аудио для воспроизведения: ${stderr.slice(-500)}`));
		});
	});
}
