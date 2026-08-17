import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";

import { eq, like } from "drizzle-orm";

import { content, syncJournalEntries, syncRetentionWatermarks, users } from "../db/schema";
import { GenericSyncJournalService } from "../services/generic-sync-journal.service";

const testPrefix = "bun-api-integration-";
const password = "SecureTest123";
let api: typeof import("./app").api;
let db: typeof import("../db").db;

type Json = Record<string, unknown>;

function email(name: string) {
	return `${testPrefix}${name}-${crypto.randomUUID()}@synapse.local`;
}

async function request(
	method: string,
	path: string,
	options: { body?: Json; token?: string; headers?: HeadersInit } = {}
) {
	const headers = new Headers({ "content-type": "application/json", "x-forwarded-for": crypto.randomUUID() });
	for (const [name, value] of new Headers(options.headers)) headers.set(name, value);
	if (options.token) headers.set("x-synapse-access-token", options.token);
	const response = await api.fetch(
		new Request(`http://api.integration${path}`, {
			method,
			headers,
			body: options.body ? JSON.stringify(options.body) : undefined,
		})
	);
	return { body: (await response.json()) as Json, response };
}

async function register(name: string) {
	const { body, response } = await request("POST", "/auth/register", {
		body: { email: email(name), password },
	});
	expect(response.status).toBe(200);
	return body as Json & { refreshToken: string; token: string; user: { id: string; email: string } };
}

const note = (title: string, tags: string[] = []) => ({
	type: "note",
	title,
	tags,
	content: JSON.stringify({
		type: "doc",
		content: [{ type: "paragraph", content: [{ type: "text", text: title }] }],
	}),
});

beforeAll(async () => {
	process.env.MINIO_ENDPOINT ||= "localhost";
	process.env.MINIO_ACCESS_KEY ||= "test";
	process.env.MINIO_SECRET_KEY ||= "test";
	({ api } = await import("./app"));
	({ db } = await import("../db"));
});

afterAll(async () => {
	if (db) await db.delete(users).where(like(users.email, `${testPrefix}%`));
});

describe.serial("API integration", () => {
	test("exposes health and OpenAPI without authentication", async () => {
		const health = await request("GET", "/health");
		expect(health.response.status).toBe(200);
		expect(health.body).toEqual({ ok: true });

		const openapi = await request("GET", "/openapi.json");
		expect(openapi.response.status).toBe(200);
		expect(openapi.body.openapi).toBe("3.1.0");
	});

	test("rejects unauthenticated and invalid requests with the public error contract", async () => {
		const protectedRoute = await request("GET", "/content");
		expect(protectedRoute.response.status).toBe(401);
		expect(protectedRoute.body).toMatchObject({
			code: "UNAUTHORIZED",
			error: "Authentication required",
			fieldErrors: null,
		});

		const invalidRegistration = await request("POST", "/auth/register", {
			body: { email: "not-an-email", password: "short" },
		});
		expect(invalidRegistration.response.status).toBe(400);
		expect(invalidRegistration.body).toMatchObject({ code: "BAD_REQUEST", error: "Invalid request" });
		expect(invalidRegistration.body.fieldErrors).not.toBeNull();
	});

	test("creates browser sessions and protects production mutations from a foreign origin", async () => {
		const account = await register("session");
		const session = await request("POST", "/session", {
			body: { refreshToken: account.refreshToken, token: account.token },
		});
		expect(session.response.status).toBe(200);
		expect(session.response.headers.get("set-cookie")).toContain("synapse_token=");
		expect(session.response.headers.get("set-cookie")).toContain("HttpOnly");

		const previousNodeEnv = process.env.NODE_ENV;
		process.env.NODE_ENV = "production";
		try {
			const forbidden = await request("POST", "/auth/register", {
				body: { email: email("foreign-origin"), password },
				headers: { host: "api.integration", origin: "https://attacker.example" },
			});
			expect(forbidden.response.status).toBe(403);
			expect(forbidden.body.code).toBe("FORBIDDEN");
		} finally {
			process.env.NODE_ENV = previousNodeEnv;
		}
	});

	test("exchanges a desktop authorization code once and verifies its PKCE challenge", async () => {
		const account = await register("desktop-auth");
		const codeVerifier = "v".repeat(43);
		const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");
		const state = "s".repeat(24);
		const complete = await request("POST", "/auth/desktop/complete", {
			body: { codeChallenge, state },
			token: account.token,
		});
		expect(complete.response.status).toBe(200);
		expect(typeof complete.body.code).toBe("string");

		const exchange = await request("POST", "/auth/desktop/exchange", {
			body: { code: complete.body.code as string, codeVerifier, state },
		});
		expect(exchange.response.status).toBe(200);
		expect(exchange.body.user).toMatchObject({ email: account.user.email, id: account.user.id });
		expect(typeof exchange.body.token).toBe("string");

		const repeated = await request("POST", "/auth/desktop/exchange", {
			body: { code: complete.body.code as string, codeVerifier, state },
		});
		expect(repeated.response.status).toBe(401);
	});

	test("keeps content private, validates path/body IDs, and preserves the core user flow", async () => {
		const owner = await register("owner");
		const other = await register("other");

		const created = await request("POST", "/content", {
			body: note("Production-ready searchable note", ["release"]),
			token: owner.token,
		});
		expect(created.response.status).toBe(200);
		const item = created.body as Json & { id: string; tag_ids: string[] };
		expect(item.tag_ids).toHaveLength(1);

		const search = await request("GET", "/content?search=searchable&tagIds=" + item.tag_ids[0], {
			token: owner.token,
		});
		expect(search.response.status).toBe(200);
		expect((search.body.items as Json[]).map((entry) => entry.id)).toContain(item.id);

		const graph = await request("GET", "/graph", { token: owner.token });
		expect(graph.response.status).toBe(200);
		expect(graph.body.nodes).toEqual(
			expect.arrayContaining([expect.objectContaining({ metadata: { content_id: item.id }, type: "note" })])
		);

		const foreignRead = await request("GET", `/content/${item.id}`, { token: other.token });
		expect(foreignRead.response.status).toBe(404);
		expect(foreignRead.body.code).toBe("NOT_FOUND");

		const foreignUpdate = await request("PATCH", `/content/${item.id}`, {
			body: { id: item.id, title: "attempted takeover" },
			token: other.token,
		});
		expect(foreignUpdate.response.status).toBe(404);

		const mismatchedId = await request("PATCH", `/content/${item.id}`, {
			body: { id: crypto.randomUUID(), title: "wrong route" },
			token: owner.token,
		});
		expect(mismatchedId.response.status).toBe(400);
		expect(mismatchedId.body.code).toBe("BAD_REQUEST");

		const preferences = await request("PATCH", "/user/preferences", {
			body: { colorPalette: "forest", interfaceLanguage: "en", mediaAutoplayEnabled: false },
			token: owner.token,
		});
		expect(preferences.response.status).toBe(200);
		expect(preferences.body).toMatchObject({
			colorPalette: "forest",
			interfaceLanguage: "en",
			mediaAutoplayEnabled: false,
		});

		const deleted = await request("DELETE", `/content/${item.id}`, { token: owner.token });
		expect(deleted.response.status).toBe(200);
		expect(deleted.body).toEqual({ success: true });
		expect(await db.select().from(content).where(eq(content.id, item.id))).toHaveLength(0);
	});

	test("rejects more than ten tags for every content mutation route", async () => {
		const account = await register("tag-limit");
		const tags = Array.from({ length: 11 }, (_, index) => `tag-${index}`);
		const created = await request("POST", "/content", {
			body: note("Too many tags", tags),
			token: account.token,
		});

		expect(created.response.status).toBe(400);
		expect(created.body.fieldErrors).not.toBeNull();
	});

	test("returns complete note content from the detail endpoint", async () => {
		const account = await register("note-detail");
		const content = JSON.stringify({
			content: [{ content: [{ text: "x".repeat(7_000), type: "text" }], type: "paragraph" }],
			type: "doc",
		});
		const created = await request("POST", "/content", {
			body: { content, title: "Long formatted note", type: "note" },
			token: account.token,
		});
		expect(created.response.status).toBe(200);
		const item = created.body as Json & { id: string };

		const listed = await request("GET", "/content", { token: account.token });
		const listedContent = (listed.body.items as Json[])[0]?.content;
		expect(typeof listedContent).toBe("string");
		if (typeof listedContent !== "string") throw new Error("Expected a listed content preview");
		expect(listedContent.length).toBeLessThan(content.length);

		const detailed = await request("GET", `/content/${item.id}`, { token: account.token });
		expect(detailed.response.status).toBe(200);
		expect(JSON.parse(detailed.body.content as string)).toEqual(JSON.parse(content));
	});

	test("exposes Synapse Sync only to paid plans", async () => {
		const account = await register("sync-entitlement");
		const starter = await request("GET", "/user/sync/entitlement", { token: account.token });
		expect(starter.response.status).toBe(200);
		expect(starter.body).toEqual({ eligible: false, plan: "starter" });
		const blockedPull = await request("GET", "/sync/pull", { token: account.token });
		expect(blockedPull.response.status).toBe(403);
		expect(blockedPull.body.code).toBe("FORBIDDEN");
		const blockedPush = await request("POST", "/sync/push", {
			body: {
				mutations: [{ clientMutationId: crypto.randomUUID(), content: note("blocked"), kind: "upsert" }],
			},
			token: account.token,
		});
		expect(blockedPush.response.status).toBe(403);
		expect(blockedPush.body.code).toBe("FORBIDDEN");

		await db.update(users).set({ plan: "plus" }).where(eq(users.id, account.user.id));
		const paid = await request("GET", "/user/sync/entitlement", { token: account.token });
		expect(paid.response.status).toBe(200);
		expect(paid.body).toEqual({ eligible: true, plan: "plus" });
	});

	test("writes direct Content mutations to the canonical V2 journal", async () => {
		const account = await register("v2-journal");
		await db.update(users).set({ plan: "plus" }).where(eq(users.id, account.user.id));
		const created = await request("POST", "/content", { body: note("V2 journal"), token: account.token });
		expect(created.response.status).toBe(200);
		const item = created.body as Json & { id: string };

		const pulled = await request("GET", "/sync/v2/pull", { token: account.token });
		expect(pulled.response.status).toBe(200);
		expect(pulled.body).toMatchObject({
			cursor: expect.stringMatching(/^j:\d+$/),
			kind: "reset",
			resetReason: "initial",
		});
		expect(pulled.body.changes).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ entityId: item.id, entityType: "content", operation: "upsert" }),
			])
		);
		expect(
			await db.select().from(syncJournalEntries).where(eq(syncJournalEntries.userId, account.user.id))
		).toHaveLength(1);
	});

	test("keeps the legacy pull URL as a V2 journal compatibility alias", async () => {
		const account = await register("v2-pull-alias");
		await db.update(users).set({ plan: "plus" }).where(eq(users.id, account.user.id));
		await request("POST", "/content", { body: note("alias"), token: account.token });

		const pulled = await request("GET", "/sync/pull", { token: account.token });
		expect(pulled.response.status).toBe(200);
		expect(pulled.body).toMatchObject({ kind: "reset", resetReason: "initial" });
		expect(pulled.body.changes).toEqual(
			expect.arrayContaining([expect.objectContaining({ entityType: "content", operation: "upsert" })])
		);
	});

	test("accepts a persisted legacy numeric cursor on the V2 compatibility pull URL", async () => {
		const account = await register("v2-numeric-cursor");
		await db.update(users).set({ plan: "plus" }).where(eq(users.id, account.user.id));
		await request("POST", "/content", { body: note("numeric cursor"), token: account.token });

		const pulled = await request("GET", "/sync/pull?cursor=0", { token: account.token });
		expect(pulled.response.status).toBe(200);
		expect(pulled.body).toMatchObject({ kind: "changes" });
		expect(pulled.body.cursor).toMatch(/^j:\d+$/);
	});

	test("returns a controlled reset when a V2 cursor is below the retention floor", async () => {
		const account = await register("v2-retention");
		await db.update(users).set({ plan: "plus" }).where(eq(users.id, account.user.id));
		await request("POST", "/content", { body: note("retained"), token: account.token });
		const [entry] = await db
			.select({ cursor: syncJournalEntries.cursor })
			.from(syncJournalEntries)
			.where(eq(syncJournalEntries.userId, account.user.id));
		await db
			.insert(syncRetentionWatermarks)
			.values({ oldestRetainedCursor: entry.cursor + 1, userId: account.user.id });

		const pulled = await request("GET", "/sync/v2/pull?afterCursor=j:0", { token: account.token });
		expect(pulled.response.status).toBe(200);
		expect(pulled.body).toMatchObject({ kind: "reset", resetReason: "cursor-expired" });
	});

	test("returns a usable reset cursor after retention prunes every prior journal entry", async () => {
		const account = await register("v2-retention-reset-cursor");
		await db.update(users).set({ plan: "plus" }).where(eq(users.id, account.user.id));
		await request("POST", "/content", { body: note("snapshot item"), token: account.token });
		const [entry] = await db
			.select({ cursor: syncJournalEntries.cursor })
			.from(syncJournalEntries)
			.where(eq(syncJournalEntries.userId, account.user.id));
		if (!entry) throw new Error("Expected initial journal entry");
		await new GenericSyncJournalService({ db, user: account.user } as any).prune(entry.cursor + 1);

		const reset = await request("GET", "/sync/v2/pull?afterCursor=j:0", { token: account.token });
		expect(reset.response.status).toBe(200);
		expect(reset.body).toMatchObject({
			kind: "reset",
			resetReason: "cursor-expired",
		});
		expect(Number(String(reset.body.cursor).slice(2))).toBeGreaterThanOrEqual(entry.cursor + 1);

		const created = await request("POST", "/content", { body: note("after reset"), token: account.token });
		const [createdEntry] = await db
			.select({ cursor: syncJournalEntries.cursor })
			.from(syncJournalEntries)
			.where(eq(syncJournalEntries.userId, account.user.id));
		if (!createdEntry) throw new Error("Expected post-reset journal entry");
		expect(createdEntry.cursor).toBeGreaterThan(Number(String(reset.body.cursor).slice(2)));
		const catchUp = await request("GET", `/sync/v2/pull?afterCursor=${reset.body.cursor}`, {
			token: account.token,
		});
		expect(catchUp.response.status).toBe(200);
		expect(catchUp.body).toMatchObject({ hasMore: false, kind: "changes" });
		expect(catchUp.body.changes).toEqual(
			expect.arrayContaining([expect.objectContaining({ entityId: created.body.id })])
		);
	});

	test("applies a concurrent duplicate desktop mutation exactly once", async () => {
		const account = await register("v2-duplicate");
		await db.update(users).set({ plan: "plus" }).where(eq(users.id, account.user.id));
		const mutationId = crypto.randomUUID();
		const body = {
			mutations: [{ clientMutationId: mutationId, content: note("one write"), kind: "upsert" }],
		};
		const [left, right] = await Promise.all([
			request("POST", "/sync/push", { body, token: account.token }),
			request("POST", "/sync/push", { body, token: account.token }),
		]);
		expect(left.response.status).toBe(200);
		expect(right.response.status).toBe(200);
		expect(left.body).toEqual(right.body);
		expect(await db.select().from(content).where(eq(content.userId, account.user.id))).toHaveLength(1);
		expect(
			await db.select().from(syncJournalEntries).where(eq(syncJournalEntries.userId, account.user.id))
		).toHaveLength(1);
	});

	test("rejects mutation-id reuse with a different intent as conflict instead of 500", async () => {
		const account = await register("v2-mutation-reuse");
		await db.update(users).set({ plan: "plus" }).where(eq(users.id, account.user.id));
		const mutationId = crypto.randomUUID();
		await request("POST", "/sync/push", {
			body: { mutations: [{ clientMutationId: mutationId, content: note("first"), kind: "upsert" }] },
			token: account.token,
		});
		const reused = await request("POST", "/sync/push", {
			body: { mutations: [{ clientMutationId: mutationId, content: note("second"), kind: "upsert" }] },
			token: account.token,
		});
		expect(reused.response.status).toBe(409);
		expect(reused.body).toMatchObject({ code: "CONFLICT" });
	});

	test("serializes concurrent updates with the same entity version into applied and conflict outcomes", async () => {
		const account = await register("v2-conflict");
		await db.update(users).set({ plan: "plus" }).where(eq(users.id, account.user.id));
		const created = await request("POST", "/sync/push", {
			body: { mutations: [{ clientMutationId: crypto.randomUUID(), content: note("base"), kind: "upsert" }] },
			token: account.token,
		});
		const first = (created.body.outcomes as Json[])[0] as Json & { content: Json; revision: number };
		const id = first.content.id as string;
		const revision = first.revision;
		const [left, right] = await Promise.all(
			["left", "right"].map((title) =>
				request("POST", "/sync/push", {
					body: {
						mutations: [
							{
								baseRevision: revision,
								clientMutationId: crypto.randomUUID(),
								content: note(title),
								kind: "upsert",
								remoteId: id,
							},
						],
					},
					token: account.token,
				})
			)
		);
		const statuses = [left, right]
			.map((result) => ((result.body.outcomes as Json[])[0] as Json).status)
			.sort();
		expect(statuses).toEqual(["applied", "conflict"]);
	});

	test("catches up journal entries after a stored cursor in strict order", async () => {
		const account = await register("v2-catchup");
		await db.update(users).set({ plan: "plus" }).where(eq(users.id, account.user.id));
		const initial = await request("GET", "/sync/v2/pull", { token: account.token });
		const cursor = initial.body.cursor as string;
		for (const title of ["101", "102", "103"])
			await request("POST", "/content", { body: note(title), token: account.token });

		const catchup = await request(`GET`, `/sync/v2/pull?afterCursor=${cursor}`, { token: account.token });
		expect(catchup.response.status).toBe(200);
		expect(catchup.body).toMatchObject({ kind: "changes" });
		const changes = catchup.body.changes as Array<Json & { cursor: string; payload: Json }>;
		expect(changes.map((change) => change.payload.title)).toEqual(["101", "102", "103"]);
		expect(changes.map((change) => change.cursor)).toEqual(changes.map((change) => change.cursor).sort());
	});
});
