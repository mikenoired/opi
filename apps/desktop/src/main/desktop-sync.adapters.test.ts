import { describe, expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { DesktopReplicaStore, DesktopSseTransport } from "./desktop-sync.adapters";
import { LocalLibraryRepository } from "./local-library.repository";

describe("DesktopSseTransport", () => {
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
		expect(requests[0]?.headers.get("x-synapse-access-token")).toBe("desktop-secret");
		expect(requests[0]?.url).not.toContain("desktop-secret");
		disconnect();
	});
});

describe("DesktopReplicaStore", () => {
	test("notifies the main process immediately after committing a remote V2 change", async () => {
		const root = await mkdtemp(join(tmpdir(), "synapse-replica-"));
		const library = new LocalLibraryRepository(root);
		let committed = 0;
		const replica = new DesktopReplicaStore(
			library,
			async (content) => ({ content }),
			() => committed++
		);

		await replica.transact(async (transaction) => {
			await transaction.applyCanonical({
				cursor: "j:101",
				entityId: "remote-note",
				entityType: "content",
				entityVersion: 1,
				mutationId: "remote-mutation",
				operation: "upsert",
				payload: {
					content: "From web",
					created_at: "2026-01-01T00:00:00.000Z",
					id: "remote-note",
					tags: [],
					title: "Remote note",
					type: "note",
					updated_at: "2026-01-01T00:00:00.000Z",
					user_id: "user-1",
				},
			});
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
