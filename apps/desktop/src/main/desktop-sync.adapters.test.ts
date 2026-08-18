import { describe, expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { DesktopReplicaStore, DesktopSseTransport } from "./desktop-sync.adapters";
import { LocalLibraryRepository } from "./local-library.repository";

describe("DesktopSseTransport", () => {
	test("connects only after the authenticated event stream is ready", async () => {
		let openStream: ((response: Response) => void) | undefined;
		const transport = new DesktopSseTransport(
			() => "https://api.example/api",
			() => "desktop-secret",
			(_input, init) => {
				expect(new Headers(init?.headers).get("x-monolyth-access-token")).toBe("desktop-secret");
				return new Promise((resolve) => {
					openStream = resolve;
				});
			}
		);
		let connected = false;
		const connection = transport
			.connect(() => undefined)
			.then((disconnect) => {
				connected = true;
				return disconnect;
			});

		await Promise.resolve();
		expect(connected).toBe(false);
		openStream?.(
			new Response(new ReadableStream({ start: () => undefined }), {
				headers: { "content-type": "text/event-stream" },
			})
		);
		const disconnect = await connection;
		expect(connected).toBe(true);
		disconnect();
	});

	test("uses the main-process authorization header, not a token in the stream URL", async () => {
		const requests: Request[] = [];
		const transport = new DesktopSseTransport(
			() => "https://api.example/api",
			() => "desktop-secret",
			async (input, init) => {
				requests.push(new Request(input, init));
				return new Response(new ReadableStream({ start: () => undefined }), {
					headers: { "content-type": "text/event-stream" },
				});
			}
		);
		const disconnect = await transport.connect(() => undefined);
		await Promise.resolve();
		expect(requests[0]?.url).toBe("https://api.example/api/sync/events");
		expect(requests[0]?.headers.get("x-monolyth-access-token")).toBe("desktop-secret");
		expect(requests[0]?.url).not.toContain("desktop-secret");
		disconnect();
	});
});

describe("DesktopReplicaStore", () => {
	test("serializes a canonical batch and cursor with concurrent local mutations", async () => {
		const root = await mkdtemp(join(tmpdir(), "monolyth-replica-"));
		const library = new LocalLibraryRepository(root);
		const replica = new DesktopReplicaStore(library);

		await Promise.all([
			replica.transact(async (transaction) => {
				await transaction.applyCanonical(remoteNoteChange());
				await transaction.applyCanonical(remoteNoteChange("remote-note-2", "Second remote note"));
				await transaction.setCursor("j:102");
			}),
			library.save({
				content: "Local",
				tags: [],
				title: "Local note",
				type: "note",
			}),
		]);

		expect((await library.list()).map((item) => item.title).sort()).toEqual([
			"Local note",
			"Remote note",
			"Second remote note",
		]);
		expect(await library.getSyncCursor()).toBe("j:102");
	});

	test("atomically replaces the remote replica and cursor on reset without deleting local-only items", async () => {
		const root = await mkdtemp(join(tmpdir(), "monolyth-replica-"));
		const library = new LocalLibraryRepository(root);
		const replica = new DesktopReplicaStore(library);
		await replica.transact(async (transaction) => {
			await transaction.applyCanonical(remoteNoteChange("stale-remote", "Stale remote"));
			await transaction.setCursor("j:1");
		});
		await library.save({ content: "Local", tags: [], title: "Local only", type: "note" });

		await replica.transact(async (transaction) => {
			await transaction.replaceFromSnapshot([remoteNoteChange("current-remote", "Current remote")]);
			await transaction.setCursor("j:200");
		});

		expect((await library.list()).map((item) => item.title).sort()).toEqual(["Current remote", "Local only"]);
		expect(await library.getSyncCursor()).toBe("j:200");
	});

	test("commits remote metadata and cursor when binary hydration is interrupted", async () => {
		const root = await mkdtemp(join(tmpdir(), "monolyth-replica-"));
		const library = new LocalLibraryRepository(root);
		const replica = new DesktopReplicaStore(library, async () => {
			throw new Error("download interrupted");
		});

		await replica.transact(async (transaction) => {
			await transaction.applyCanonical(remoteNoteChange());
			await transaction.setCursor("j:101");
		});

		expect((await library.list())[0]).toMatchObject({
			id: "remote-note",
			title: "Remote note",
		});
		expect(await library.getSyncCursor()).toBe("j:101");
	});

	test("notifies the main process immediately after committing a remote V2 change", async () => {
		const root = await mkdtemp(join(tmpdir(), "monolyth-replica-"));
		const library = new LocalLibraryRepository(root);
		let committed = 0;
		const replica = new DesktopReplicaStore(
			library,
			async (content) => ({ content }),
			() => committed++
		);

		await replica.transact(async (transaction) => {
			await transaction.applyCanonical(remoteNoteChange());
			await transaction.setCursor("j:101");
		});

		expect(committed).toBe(1);
		expect((await library.list())[0]).toMatchObject({
			id: "remote-note",
			title: "Remote note",
		});
		expect(await library.getSyncCursor()).toBe("j:101");
	});
});

function remoteNoteChange(id = "remote-note", title = "Remote note") {
	return {
		cursor: "j:101",
		entityId: id,
		entityType: "content" as const,
		entityVersion: 1,
		mutationId: "remote-mutation",
		operation: "upsert" as const,
		payload: {
			content: "From web",
			created_at: "2026-01-01T00:00:00.000Z",
			id,
			tags: [],
			title,
			type: "note" as const,
			updated_at: "2026-01-01T00:00:00.000Z",
			user_id: "user-1",
		},
	};
}
