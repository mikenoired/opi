import { describe, expect, test } from "bun:test";

import {
	ContentEntityAdapter,
	InMemoryJournalApi,
	InMemoryOutbox,
	InMemoryRealtimeTransport,
	InMemoryReplicaStore,
	SyncEngine,
	TagEntityAdapter,
	TestEntityAdapter,
	createEntityRegistry,
} from "./index";

describe("SyncEngine", () => {
	test("applies canonical changes in strict cursor order", async () => {
		const journal = new InMemoryJournalApi([
			change("j:101", "one"),
			change("j:102", "two"),
			change("j:103", "three"),
		]);
		const replica = new InMemoryReplicaStore("j:100");
		const engine = new SyncEngine({
			journal,
			outbox: new InMemoryOutbox(),
			realtime: new InMemoryRealtimeTransport(),
			registry: createEntityRegistry(new TestEntityAdapter()),
			replica,
		});

		await engine.syncNow();

		expect(replica.appliedCursors).toEqual(["j:101", "j:102", "j:103"]);
		expect(await replica.readCursor()).toBe("j:103");
	});

	test("does not apply a duplicate canonical change twice", async () => {
		const journal = new InMemoryJournalApi([change("j:101", "one"), change("j:101", "one")]);
		const replica = new InMemoryReplicaStore("j:100");
		const engine = engineFor(journal, replica);

		await engine.syncNow();

		expect(replica.appliedCursors).toEqual(["j:101"]);
	});

	test("flushes a durable mutation once and acknowledges it by mutation id", async () => {
		const journal = new InMemoryJournalApi();
		const outbox = new InMemoryOutbox([
			{
				entityId: "one",
				entityType: "test",
				mutationId: "mutation-1",
				operation: "upsert",
				payload: { value: "one" },
			},
		]);
		const engine = new SyncEngine({
			journal,
			outbox,
			realtime: new InMemoryRealtimeTransport(),
			registry: createEntityRegistry(new TestEntityAdapter()),
			replica: new InMemoryReplicaStore(),
		});

		await engine.syncNow();
		await engine.syncNow();

		expect(journal.pushed.map((entry) => entry.mutationId)).toEqual(["mutation-1"]);
		expect(await outbox.list()).toEqual([]);
	});

	test("catches up 101 through 103 after reconnect from cursor 100", async () => {
		const journal = new InMemoryJournalApi();
		const replica = new InMemoryReplicaStore("j:100");
		const realtime = new InMemoryRealtimeTransport();
		const engine = new SyncEngine({
			journal,
			outbox: new InMemoryOutbox(),
			realtime,
			registry: createEntityRegistry(new TestEntityAdapter()),
			replica,
		});
		await engine.start();
		journal.append(change("j:101", "one"));
		journal.append(change("j:102", "two"));
		journal.append(change("j:103", "three"));

		realtime.emitHint("j:103");
		await engine.syncNow();

		expect(replica.appliedCursors).toEqual(["j:101", "j:102", "j:103"]);
		expect(await replica.readCursor()).toBe("j:103");
		await engine.stop();
	});

	test("drains every available journal page in one sync run", async () => {
		const changes = Array.from({ length: 501 }, (_, index) => change(`j:${index + 1}`, `${index + 1}`));
		const journal = new PagedJournal(changes, 250);
		const replica = new InMemoryReplicaStore("j:0");

		await engineFor(journal, replica).syncNow();

		expect(replica.appliedCursors).toHaveLength(501);
		expect(await replica.readCursor()).toBe("j:501");
		// The engine performs its post-outbox pull too; the first three calls are
		// the complete paginated catch-up rather than two capped pages.
		expect(journal.pullCount).toBe(4);
	});

	test("registers Content, Tag, and TestEntity without SyncEngine entity branches", async () => {
		const registry = createEntityRegistry(
			new TestEntityAdapter(),
			new ContentEntityAdapter(),
			new TagEntityAdapter()
		);
		const replica = new InMemoryReplicaStore();
		const engine = new SyncEngine({
			journal: new InMemoryJournalApi(),
			outbox: new InMemoryOutbox(),
			realtime: new InMemoryRealtimeTransport(),
			registry,
			replica,
		});

		await engine.mutate({
			entityId: "content-1",
			entityType: "content",
			mutationId: "content-mutation",
			operation: "upsert",
			payload: { title: "metadata only" },
		});
		await engine.mutate({
			entityId: "tag-1",
			entityType: "tag",
			mutationId: "tag-mutation",
			operation: "upsert",
			payload: { color: 1, title: "inbox" },
		});

		expect(replica.changes.size).toBe(0);
	});
});

function engineFor(journal: InMemoryJournalApi, replica: InMemoryReplicaStore) {
	return new SyncEngine({
		journal,
		outbox: new InMemoryOutbox(),
		realtime: new InMemoryRealtimeTransport(),
		registry: createEntityRegistry(new TestEntityAdapter()),
		replica,
	});
}

function change(cursor: string, value: string) {
	return {
		cursor,
		entityId: value,
		entityType: "test",
		entityVersion: 1,
		operation: "upsert" as const,
		payload: { value },
	};
}

class PagedJournal extends InMemoryJournalApi {
	pullCount = 0;

	constructor(
		private readonly pagedChanges: ReturnType<typeof change>[],
		private readonly pageSize: number
	) {
		super();
	}

	async pull(afterCursor?: string) {
		this.pullCount += 1;
		const available = this.pagedChanges.filter(
			(change) => !afterCursor || Number(change.cursor.slice(2)) > Number(afterCursor.slice(2))
		);
		const changes = available.slice(0, this.pageSize);
		return {
			changes,
			cursor: changes.at(-1)?.cursor ?? afterCursor ?? "j:0",
			hasMore: available.length > changes.length,
			kind: "changes" as const,
		};
	}
}
