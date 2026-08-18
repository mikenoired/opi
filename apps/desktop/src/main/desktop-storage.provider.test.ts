import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { DesktopStorageProvider } from "./desktop-storage.provider";

describe("DesktopStorageProvider", () => {
	test("persists objects locally through the Core storage contract", async () => {
		const provider = new DesktopStorageProvider(await mkdtemp(join(tmpdir(), "monolyth-desktop-")));
		const data = new TextEncoder().encode("desktop content");
		const result = await provider.putObject(data, {
			contentType: "text/plain",
			fileName: "note.txt",
			folder: "content",
			userId: "user-1",
		});

		expect(result.size).toBe(data.byteLength);
		expect(result.objectName).toMatch(/^user-1\/content\/.+\.txt$/);
		expect(await readFile(provider.getObjectPath(result.objectName), "utf8")).toBe("desktop content");
		expect(await provider.getObjectMetadata(result.objectName)).toEqual({ size: data.byteLength });
		expect(provider.getObjectUrl(result.objectName)).toBe(
			`monolyth-object://local/${encodeURIComponent(result.objectName)}`
		);

		await provider.deleteObject(result.objectName);
		expect(await provider.getObjectMetadata(result.objectName)).toBeNull();
	});

	test("rejects object names that escape the local storage root", () => {
		const provider = new DesktopStorageProvider("/tmp/monolyth-desktop");
		expect(() => provider.getObjectPath("../outside")).toThrow("Invalid desktop object name");
	});
});
