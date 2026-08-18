import { expect, test } from "bun:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createDesktopObjectResponse } from "./desktop-object-response";

test("serves media ranges required for audio seeking", async () => {
	const root = await mkdtemp(join(tmpdir(), "monolyth-media-"));
	const filePath = join(root, "track.mp3");
	await writeFile(filePath, Uint8Array.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]));

	const response = await createDesktopObjectResponse(filePath, "audio/mpeg", "bytes=4-7");
	expect(response.status).toBe(206);
	expect(response.headers.get("Content-Range")).toBe("bytes 4-7/10");
	expect(response.headers.get("Accept-Ranges")).toBe("bytes");
	expect(Array.from(new Uint8Array(await response.arrayBuffer()))).toEqual([4, 5, 6, 7]);
});

test("rejects an invalid range instead of returning the wrong bytes", async () => {
	const root = await mkdtemp(join(tmpdir(), "monolyth-media-"));
	const filePath = join(root, "track.mp3");
	await writeFile(filePath, Uint8Array.from([0, 1, 2]));

	const response = await createDesktopObjectResponse(filePath, "audio/mpeg", "bytes=8-9");
	expect(response.status).toBe(416);
	expect(response.headers.get("Content-Range")).toBe("bytes */3");
});
