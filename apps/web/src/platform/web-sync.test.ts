import { expect, test } from "bun:test";

import { BrowserJournalApi, CookieSseTransport, WebSyncRuntime } from "./web-sync";

test("browser journal preserves a client-assigned content create intent", async () => {
	const originalFetch = globalThis.fetch;
	let body: { mutations: unknown[] } | undefined;
	globalThis.fetch = (async (_input, init) => {
		body = JSON.parse(String(init?.body)) as { mutations: unknown[] };
		return Response.json({ outcomes: [{ kind: "applied", mutationId: "mutation-1" }] });
	}) as typeof globalThis.fetch;
	const intent = {
		entityId: "00000000-0000-4000-8000-000000000001",
		entityType: "content",
		mutationId: "00000000-0000-4000-8000-000000000002",
		operation: "upsert" as const,
		payload: { content: "offline-first", type: "note" },
	};

	try {
		await new BrowserJournalApi().push([intent]);
		expect(body?.mutations).toEqual([intent]);
	} finally {
		globalThis.fetch = originalFetch;
	}
});

test("web sync stays stopped when the account is not entitled", async () => {
	const originalFetch = globalThis.fetch;
	globalThis.fetch = (async () =>
		Response.json({ eligible: false, plan: "starter" })) as typeof globalThis.fetch;

	try {
		const runtime = new WebSyncRuntime();
		await runtime.start("starter-user");
		expect(runtime.isRunning()).toBe(false);
	} finally {
		globalThis.fetch = originalFetch;
	}
});

test("web sync stays stopped when its engine fails to start", async () => {
	const originalFetch = globalThis.fetch;
	globalThis.fetch = (async () => Response.json({ eligible: true, plan: "pro" })) as typeof globalThis.fetch;
	const runtime = new WebSyncRuntime(() => ({
		engine: {
			mutate: async () => {},
			start: () => Promise.reject(new Error("sync unavailable")),
			stop: async () => {},
			syncNow: async () => {},
		},
		replica: { get: async () => undefined, list: async () => [] },
	}));

	try {
		await expect(runtime.start("paid-user")).rejects.toThrow("sync unavailable");
		expect(runtime.isRunning()).toBe(false);
	} finally {
		globalThis.fetch = originalFetch;
	}
});

test("cookie SSE transport becomes connected only after EventSource opens", async () => {
	const original = globalThis.EventSource;
	globalThis.EventSource = FakeEventSource as unknown as typeof EventSource;

	try {
		const hints: Array<{ cursor?: string }> = [];
		let connected = false;
		const connecting = new CookieSseTransport().connect((hint) => hints.push(hint));
		void connecting.then(() => {
			connected = true;
		});
		await Bun.sleep(0);
		expect(FakeEventSource.latest?.url).toBe("/api/sync/events");
		expect(FakeEventSource.latest?.withCredentials).toBe(true);
		expect(connected).toBe(false);
		FakeEventSource.latest?.emit("open");
		const disconnect = await connecting;
		expect(connected).toBe(true);
		FakeEventSource.latest?.emit("hint", JSON.stringify({ cursor: "j:103" }));
		expect(hints).toEqual([{ cursor: "j:103" }]);
		disconnect();
		expect(FakeEventSource.latest?.closed).toBe(true);
	} finally {
		globalThis.EventSource = original;
	}
});

test("cookie SSE transport rejects and closes when EventSource fails before opening", async () => {
	const original = globalThis.EventSource;
	globalThis.EventSource = FakeEventSource as unknown as typeof EventSource;

	try {
		const connecting = new CookieSseTransport().connect(() => {});
		FakeEventSource.latest?.emit("error");
		await expect(connecting).rejects.toThrow("failed before opening");
		expect(FakeEventSource.latest?.closed).toBe(true);
	} finally {
		globalThis.EventSource = original;
	}
});

class FakeEventSource {
	static latest: FakeEventSource | undefined;
	readonly listeners = new Map<string, (event: Event) => void>();
	closed = false;
	readonly withCredentials: boolean;

	constructor(
		readonly url: string,
		init: EventSourceInit
	) {
		this.withCredentials = Boolean(init.withCredentials);
		FakeEventSource.latest = this;
	}

	addEventListener(type: string, handler: (event: Event) => void): void {
		this.listeners.set(type, handler);
	}

	close(): void {
		this.closed = true;
	}

	emit(type: string, data?: string): void {
		this.listeners.get(type)?.({ data } as MessageEvent<string>);
	}
}
