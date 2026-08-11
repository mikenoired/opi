import { beforeAll, describe, expect, test } from "bun:test";

import { extractOwnedNoteImages, sanitizeNoteContent } from "@synapse/core";

let deleteStoredNoteImages: typeof import("./note-images").deleteStoredNoteImages;
let prepareNoteImages: typeof import("./note-images").prepareNoteImages;

const png = "data:image/png;base64,iVBORw0KGgo=";

const documentWithImages = (...sources: string[]) =>
	JSON.stringify({
		type: "doc",
		content: sources.map((src, index) => ({
			type: "image",
			attrs: { alt: `image-${index}.png`, src },
		})),
	});

function createStorage(failAt = Number.POSITIVE_INFINITY) {
	const deleted: string[] = [];
	let uploads = 0;
	return {
		deleted,
		storage: {
			delete: async (objectName: string) => {
				deleted.push(objectName);
			},
			getMetadata: async () => ({ size: 12 }),
			getUrl: (objectName: string) => `/api/files/${objectName}`,
			upload: async (buffer: Buffer, _name: string, _type: string, userId: string) => {
				uploads += 1;
				return uploads === failAt
					? {
							success: false,
							validation: { errors: ["rejected"], fileHash: "", isValid: false, warnings: [] },
						}
					: {
							fileSize: buffer.length,
							objectName: `note-images/${userId}/${uploads}.png`,
							success: true,
							validation: { errors: [], fileHash: "", isValid: true, warnings: [] },
						};
			},
		},
	};
}

beforeAll(async () => {
	process.env.MINIO_ENDPOINT ||= "localhost";
	process.env.MINIO_ACCESS_KEY ||= "test";
	process.env.MINIO_SECRET_KEY ||= "test";
	({ deleteStoredNoteImages, prepareNoteImages } = await import("./note-images"));
});

describe("note images", () => {
	test("removes executable note attributes while retaining safe rich text", () => {
		const content = JSON.stringify({
			type: "doc",
			content: [
				{
					type: "paragraph",
					attrs: { onclick: "alert(1)" },
					content: [
						{
							type: "text",
							text: "<script>alert(1)</script>",
							marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }, { type: "bold" }],
						},
					],
				},
				{ type: "image", attrs: { src: "javascript:alert(1)", onerror: "alert(1)" } },
				{ type: "script", content: [{ type: "text", text: "alert(1)" }] },
			],
		});

		expect(JSON.parse(sanitizeNoteContent(content))).toEqual({
			type: "doc",
			content: [
				{
					type: "paragraph",
					content: [
						{
							type: "text",
							text: "<script>alert(1)</script>",
							marks: [{ type: "bold" }],
						},
					],
				},
			],
		});
		expect(sanitizeNoteContent("<img src=x onerror=alert(1)>")).toBe("<img src=x onerror=alert(1)>");
	});

	test("uploads data images and keeps external images unchanged", async () => {
		const { storage } = createStorage();
		const prepared = await prepareNoteImages(
			documentWithImages(png, "https://example.com/image.png"),
			"user-1",
			storage
		);
		const parsed = JSON.parse(prepared.content);

		expect(parsed.content[0].attrs.src).toBe("/api/files/note-images/user-1/1.png");
		expect(parsed.content[1].attrs.src).toBe("https://example.com/image.png");
		expect(prepared.uploaded).toEqual([{ objectName: "note-images/user-1/1.png", size: 8 }]);
	});

	test("rolls back earlier uploads when a later image fails", async () => {
		const { deleted, storage } = createStorage(2);

		await expect(prepareNoteImages(documentWithImages(png, png), "user-1", storage)).rejects.toThrow(
			"rejected"
		);
		expect(deleted).toEqual(["note-images/user-1/1.png"]);
	});

	test("rejects unsupported data image types", async () => {
		const { storage } = createStorage();
		await expect(
			prepareNoteImages(documentWithImages("data:image/svg+xml;base64,PHN2Zz4="), "user-1", storage)
		).rejects.toThrow("Unsupported inline image");
	});

	test("extracts and deletes only owned note images", async () => {
		const content = documentWithImages(
			"/api/files/note-images/user-1/one.png",
			"note-images/user-1/two.png",
			"/api/files/note-images/user-2/private.png",
			"/api/files/images/user-1/media.png"
		);
		const { deleted, storage } = createStorage();
		const owned = extractOwnedNoteImages(content, "user-1");

		expect(owned).toEqual(["note-images/user-1/one.png", "note-images/user-1/two.png"]);
		expect(await deleteStoredNoteImages(owned, storage)).toEqual([12, 12]);
		expect(deleted).toEqual(owned);
	});
});
