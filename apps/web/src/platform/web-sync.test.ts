import { expect, test } from "bun:test";

import { CookieSseTransport } from "./web-sync";

test("cookie SSE transport forwards only cursor hints and closes its EventSource", async () => {
	const original = globalThis.EventSource;
	globalThis.EventSource = FakeEventSource as unknown as typeof EventSource;

	try {
		const hints: Array<{ cursor?: string }> = [];
		const disconnect = await new CookieSseTransport().connect((hint) => hints.push(hint));
		expect(FakeEventSource.latest?.url).toBe("/api/sync/events");
		expect(FakeEventSource.latest?.withCredentials).toBe(true);
		FakeEventSource.latest?.emit("hint", JSON.stringify({ cursor: "j:103" }));
		expect(hints).toEqual([{ cursor: "j:103" }]);
		disconnect();
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

	emit(type: string, data: string): void {
		this.listeners.get(type)?.({ data } as MessageEvent<string>);
	}
}
