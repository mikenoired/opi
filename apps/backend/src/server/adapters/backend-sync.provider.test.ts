import { expect, test } from "bun:test";

import { BackendSyncProvider } from "./backend-sync.provider";

test("delivers sync changes only to subscribers for the owning user", async () => {
	const provider = new BackendSyncProvider();
	const received: string[] = [];
	provider.subscribe("user-1", (event) => {
		received.push(event.entityId);
	});
	provider.subscribe("user-2", (event) => {
		received.push(`other:${event.entityId}`);
	});

	await provider.publish({
		entityId: "content-1",
		entityType: "content",
		operation: "create",
		userId: "user-1",
	});

	expect(received).toEqual(["content-1"]);
});
