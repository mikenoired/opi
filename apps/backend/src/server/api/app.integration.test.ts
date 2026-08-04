import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { eq, like } from "drizzle-orm";

import { content, users } from "../db/schema";

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

	test("exposes Synapse Sync only to paid plans", async () => {
		const account = await register("sync-entitlement");
		const starter = await request("GET", "/user/sync/entitlement", { token: account.token });
		expect(starter.response.status).toBe(200);
		expect(starter.body).toEqual({ eligible: false, plan: "starter" });

		await db.update(users).set({ plan: "plus" }).where(eq(users.id, account.user.id));
		const paid = await request("GET", "/user/sync/entitlement", { token: account.token });
		expect(paid.response.status).toBe(200);
		expect(paid.body).toEqual({ eligible: true, plan: "plus" });
	});
});
