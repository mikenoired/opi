import { expect, test } from "bun:test";

import type { SyncIntent } from "@monolyth/sync";

import { createWebMonolythClient } from "./web-monolyth-client";

test("web content create returns the canonical entity written through sync", async () => {
	const originalFetch = globalThis.fetch;
	globalThis.fetch = (() => Promise.reject(new Error("REST must not be used"))) as typeof globalThis.fetch;
	let intent: SyncIntent | undefined;
	const client = createWebMonolythClient({
		isRunning: () => true,
		mutate: async (next: SyncIntent) => {
			intent = next;
		},
		mutateMany: async () => {},
		readEntity: async (_entityType: string, entityId: string) => ({
			cursor: "j:1",
			entityId,
			entityType: "content",
			entityVersion: 1,
			operation: "upsert" as const,
			payload: {
				content: "created offline-first",
				created_at: "2026-01-01T00:00:00.000Z",
				id: entityId,
				tag_ids: [],
				tags: [],
				type: "note",
				updated_at: "2026-01-01T00:00:00.000Z",
				user_id: "user-1",
			},
		}),
		readEntityVersion: async () => undefined,
	});

	try {
		const created = await client.content.create({ content: "created offline-first", type: "note" });
		expect(intent).toMatchObject({
			entityId: created.id,
			entityType: "content",
			operation: "upsert",
			payload: { content: "created offline-first", type: "note" },
		});
		expect(created.id).toBeString();
	} finally {
		globalThis.fetch = originalFetch;
	}
});

test("web content update carries the canonical replica version", async () => {
	const originalFetch = globalThis.fetch;
	const intents: SyncIntent[] = [];
	globalThis.fetch = (async () =>
		Response.json({
			content: "before",
			created_at: "2026-01-01T00:00:00.000Z",
			id: "content-1",
			tag_ids: [],
			tags: [],
			type: "text",
			updated_at: "2026-01-01T00:00:00.000Z",
			user_id: "user-1",
		})) as typeof globalThis.fetch;
	const client = createWebMonolythClient({
		isRunning: () => true,
		mutate: async (intent: SyncIntent) => {
			intents.push(intent);
		},
		mutateMany: async () => {},
		readEntity: async () => undefined,
		readEntityVersion: async () => 7,
	});

	try {
		await client.content.update({ content: "after", id: "content-1" });
		expect(intents).toHaveLength(1);
		expect(intents[0]?.baseEntityVersion).toBe(7);
	} finally {
		globalThis.fetch = originalFetch;
	}
});

test("web content delete carries the canonical replica version", async () => {
	const intents: SyncIntent[] = [];
	const client = createWebMonolythClient({
		isRunning: () => true,
		mutate: async (intent: SyncIntent) => {
			intents.push(intent);
		},
		mutateMany: async () => {},
		readEntity: async () => undefined,
		readEntityVersion: async () => 9,
	});

	await client.content.delete("content-2");
	expect(intents).toHaveLength(1);
	expect(intents[0]?.baseEntityVersion).toBe(9);
});

test("web content mutations fall back to REST when sync is unavailable", async () => {
	const originalFetch = globalThis.fetch;
	const requests: Array<{ method: string; url: string }> = [];
	globalThis.fetch = (async (input, init) => {
		const url = String(input);
		requests.push({ method: init?.method ?? (init?.body ? "POST" : "GET"), url });
		if (url.endsWith("/content/batch/delete")) return Response.json({ deletedIds: ["content-3"] });
		if (url.endsWith("/content/batch/tags")) return Response.json({ items: [] });
		if (init?.method === "DELETE") return Response.json({ success: true });
		return Response.json({
			content: "saved",
			created_at: "2026-01-01T00:00:00.000Z",
			id: "content-3",
			tag_ids: [],
			tags: [],
			type: "text",
			updated_at: "2026-01-01T00:00:00.000Z",
			user_id: "user-1",
		});
	}) as typeof globalThis.fetch;
	const client = createWebMonolythClient({
		isRunning: () => false,
		mutate: () => Promise.reject(new Error("Web sync is not running")),
		mutateMany: () => Promise.reject(new Error("Web sync is not running")),
		readEntity: async () => undefined,
		readEntityVersion: async () => undefined,
	});

	try {
		await client.content.create({ content: "saved", type: "note" });
		await client.content.update({ content: "saved", id: "content-3" });
		await client.content.delete("content-3");
		await client.content.deleteMany({ ids: ["content-3"] });
		await client.content.updateTags({ add: ["shared"], ids: ["content-3"], remove: [] });
		expect(requests).toEqual([
			{ method: "POST", url: "/api/content" },
			{ method: "GET", url: "/api/content/content-3" },
			{ method: "PATCH", url: "/api/content/content-3" },
			{ method: "DELETE", url: "/api/content/content-3" },
			{ method: "POST", url: "/api/content/batch/delete" },
			{ method: "PATCH", url: "/api/content/batch/tags" },
		]);
	} finally {
		globalThis.fetch = originalFetch;
	}
});

test("web content batches use one sync mutation group", async () => {
	const groups: SyncIntent[][] = [];
	const items = new Map([
		["content-1", content("content-1", ["common", "remove"])],
		["content-2", content("content-2", ["common", "second-only"])],
	]);
	const client = createWebMonolythClient({
		isRunning: () => true,
		mutate: async () => {},
		mutateMany: async (intents) => {
			groups.push(intents);
		},
		readEntity: async (_entityType, entityId) => ({
			cursor: "j:1",
			entityId,
			entityType: "content",
			entityVersion: 4,
			operation: "upsert" as const,
			payload: items.get(entityId),
		}),
		readEntityVersion: async () => 4,
	});

	await client.content.updateTags({
		add: ["shared"],
		ids: ["content-1", "content-2"],
		remove: ["remove"],
	});
	await client.content.deleteMany({ ids: ["content-1", "content-2"] });

	expect(groups).toHaveLength(2);
	expect(groups[0]?.map((intent) => (intent.payload as { tags: string[] }).tags)).toEqual([
		["common", "shared"],
		["common", "second-only", "shared"],
	]);
	expect(groups[1]?.map((intent) => intent.operation)).toEqual(["delete", "delete"]);
});

function content(id: string, tags: string[]) {
	return {
		content: id,
		created_at: "2026-01-01T00:00:00.000Z",
		id,
		tag_ids: [],
		tags,
		type: "note" as const,
		updated_at: "2026-01-01T00:00:00.000Z",
		user_id: "user-1",
	};
}
