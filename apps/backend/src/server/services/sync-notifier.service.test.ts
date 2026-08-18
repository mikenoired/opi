import { expect, test } from "bun:test";

import { InMemorySyncHintTransport, SyncNotifierLifecycle } from "./sync-notifier.service";

test("delivers a cursor hint between independent notifier lifecycle instances", async () => {
	const transport = new InMemorySyncHintTransport();
	const received: Array<{ cursor: string; userId: string }> = [];
	const receiver = new SyncNotifierLifecycle({
		publish: transport.publish.bind(transport),
		subscribe: async (handler) =>
			await transport.subscribe((hint) => {
				received.push(hint);
				handler(hint);
			}),
	});
	await receiver.start();

	await transport.publish({ cursor: "j:42", userId: "user-1" });

	expect(received).toEqual([{ cursor: "j:42", userId: "user-1" }]);
	await receiver.stop();
});
