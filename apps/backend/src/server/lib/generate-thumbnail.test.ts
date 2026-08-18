import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { extractVideoThumbnail } from "../services/upload/upload-media";
import { generateThumbnail, getImageDimensions } from "./generate-thumbnail";

const asset = (name: string) => Bun.file(join(import.meta.dir, "../../../../../test/assets", name)).bytes();
let tempDir: string;

beforeAll(async () => {
	tempDir = await mkdtemp(join(tmpdir(), "monolyth-thumbnail-"));
});

afterAll(async () => {
	await rm(tempDir, { recursive: true, force: true });
});

describe("backend thumbnails", () => {
	test.each(["test-image.jpeg", "test-image.png", "test-image.gif"])("processes %s", async (name) => {
		const image = Buffer.from(await asset(name));
		const dimensions = await getImageDimensions(image);
		const thumbnail = Buffer.from(await generateThumbnail(image), "base64");

		expect(dimensions.width).toBeGreaterThan(0);
		expect(dimensions.height).toBeGreaterThan(0);
		expect(thumbnail.subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));
	});

	test("extracts and processes a video frame", async () => {
		const source = join(tempDir, "video.mp4");
		const frame = join(tempDir, "frame.jpg");
		await Bun.write(source, await asset("test-video.mp4"));

		await extractVideoThumbnail(source, frame);
		expect(await generateThumbnail(await readFile(frame))).not.toBeEmpty();
	}, 15_000);
});
