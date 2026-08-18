import { describe, expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { DesktopSyncService } from "./desktop-sync.service";
import { LocalLibraryRepository } from "./local-library.repository";

describe("DesktopSyncService", () => {
	test("uses the authenticated main-process bridge for AI usage and draft tag suggestions", async () => {
		const originalFetch = globalThis.fetch;
		const requests: Array<{ body?: unknown; path: string }> = [];
		globalThis.fetch = (async (input, init) => {
			const url = new URL(String(input));
			requests.push({ body: init?.body ? JSON.parse(String(init.body)) : undefined, path: url.pathname });
			if (url.pathname === "/api/auth/login")
				return Response.json({ token: "desktop-token", user: { email: "mike@example.com" } });
			if (url.pathname === "/api/user/sync/entitlement")
				return Response.json({ eligible: true, plan: "pro" });
			if (url.pathname === "/api/sync/pull")
				return Response.json({ changes: [], cursor: "j:0", hasMore: false, kind: "changes" });
			if (url.pathname === "/api/ai/usage") return Response.json(usage());
			return Response.json({
				existing: [{ id: "tag-work", name: "work" }],
				newTags: ["plan"],
				success: true,
			});
		}) as typeof fetch;
		try {
			const root = await mkdtemp(join(tmpdir(), "synapse-sync-"));
			const service = new DesktopSyncService(new LocalLibraryRepository(root));
			await service.login("https://synapse.example", "mike@example.com", "secret");

			await expect(service.getAiUsage()).resolves.toMatchObject({ plan: "pro" });
			await expect(
				service.suggestTags({ content: "Ship the project", mode: "draft", type: "note" })
			).resolves.toEqual({
				existing: [{ id: "tag-work", name: "work" }],
				newTags: ["plan"],
				success: true,
			});
			expect(requests).toContainEqual({ path: "/api/ai/usage" });
			expect(requests).toContainEqual({
				body: { content: "Ship the project", mode: "draft", type: "note" },
				path: "/api/ai/tags",
			});
		} finally {
			globalThis.fetch = originalFetch;
		}
	});
});

function usage() {
	return {
		latest: undefined,
		limits: { aiRequestsPerMonth: 100, aiTokensPerMonth: 10_000 },
		models: [],
		period: { end: "2026-08-31", start: "2026-08-01" },
		plan: "pro",
		planLabel: "Pro",
		usage: {
			averageLatencyMs: null,
			failedRequests: 0,
			inputTokens: 0,
			outputTokens: 0,
			requests: 0,
			successfulRequests: 0,
			totalCostUsd: 0,
			totalTokens: 0,
		},
	};
}
