import { describe, expect, test } from "bun:test";

import {
	ContentEntityAdapter,
	InMemoryJournalApi,
	InMemoryOutbox,
	InMemoryReplicaStore,
	InMemoryRealtimeTransport,
	SyncEngine,
	createEntityRegistry,
	type EntityAdapter,
	type JournalApi,
	type MutationReceipt,
	type PullResult,
	type RealtimeTransport,
	type ReplicaTransaction,
	type SyncChange,
	type SyncIntent,
} from "../../../packages/sync/src";

/**
 * Cross-client protocol harness. It is deliberately transport-only: a hint
 * contains a cursor, while every state transition is observed through pull.
 * The public seams under test are SyncEngine, JournalApi and RealtimeTransport.
 */
describe("sync protocol cross-client harness", () => {
	test("propagates a Desktop content write to Web without a reload", async () => {
		const harness = new ProtocolHarness();
		const desktop = harness.client("desktop");
		const web = harness.client("web");
		await Promise.all([desktop.engine.start(), web.engine.start()]);

		await desktop.engine.mutate(contentIntent("desktop-create", "desktop-note"));
		await settle(web.engine);

		expect(web.replica.changes.get("content:desktop-note")).toMatchObject({
			cursor: "j:1",
			payload: { title: "Desktop note" },
		});
		expect(await web.replica.readCursor()).toBe("j:1");
	});

	test("propagates a Web content write to Desktop and catches up after reconnect", async () => {
		const harness = new ProtocolHarness();
		const desktop = harness.client("desktop");
		const web = harness.client("web");
		await Promise.all([desktop.engine.start(), web.engine.start()]);
		await desktop.engine.mutate(contentIntent("first", "first"));
		await settle(web.engine);

		await desktop.engine.stop();
		await web.engine.mutate(contentIntent("second", "second"));
		await web.engine.mutate(contentIntent("third", "third"));

		await desktop.engine.start();

		expect(desktop.replica.appliedCursors).toEqual(["j:1", "j:2", "j:3"]);
		expect([...desktop.replica.changes.keys()]).toEqual(["content:first", "content:second", "content:third"]);
	});

	test("extends the same transport harness with a Tag adapter", async () => {
		const harness = new ProtocolHarness();
		const desktop = harness.client("desktop", new TagEntityAdapter());
		const web = harness.client("web", new TagEntityAdapter());
		await Promise.all([desktop.engine.start(), web.engine.start()]);

		await desktop.engine.mutate({
			entityId: "tag-work",
			entityType: "tag",
			mutationId: "tag-color",
			operation: "upsert",
			payload: { color: 7, title: "work" },
		});
		await settle(web.engine);

		expect(web.replica.changes.get("tag:tag-work")).toMatchObject({
			entityType: "tag",
			payload: { color: 7, title: "work" },
		});
	});

	test("keeps interrupted binary media transfer outside canonical metadata sync", async () => {
		const harness = new ProtocolHarness();
		const desktop = harness.client("desktop");
		const web = harness.client("web");
		const media = new InterruptedMediaPipeline();
		await Promise.all([desktop.engine.start(), web.engine.start()]);

		await desktop.engine.mutate({
			entityId: "media-1",
			entityType: "content",
			mutationId: "media-metadata",
			operation: "upsert",
			payload: { mediaUrl: "object://media-1", title: "Video" },
		});
		await settle(web.engine);
		await expect(media.download("object://media-1")).rejects.toThrow("interrupted");

		const change = web.replica.changes.get("content:media-1");
		expect(change?.payload).toEqual({ mediaUrl: "object://media-1", title: "Video" });
		expect(JSON.stringify(change?.payload)).not.toContain("binary");
		expect(await web.replica.readCursor()).toBe("j:1");
	});

	test("rejects a non-monotonic pull response before it corrupts the replica", async () => {
		const replica = new InMemoryReplicaStore();
		const engine = new SyncEngine({
			journal: new InMemoryJournalApi([
				{
					cursor: "j:2",
					entityId: "same-content",
					entityType: "content",
					entityVersion: 2,
					operation: "upsert",
					payload: { title: "new canonical title" },
				},
				{
					cursor: "j:1",
					entityId: "same-content",
					entityType: "content",
					entityVersion: 1,
					operation: "upsert",
					payload: { title: "stale title" },
				},
			]),
			outbox: new InMemoryOutbox(),
			realtime: new InMemoryRealtimeTransport(),
			registry: createEntityRegistry(new ContentEntityAdapter()),
			replica,
		});

		await expect(engine.syncNow()).rejects.toThrow("non-monotonic");
		expect(await replica.readCursor()).toBeUndefined();
		expect(replica.changes).toEqual(new Map());
	});

	test("does not expose an optimistic edit when durable outbox persistence fails", async () => {
		const replica = new OptimisticReplicaStore();
		const engine = new SyncEngine({
			journal: new InMemoryJournalApi(),
			outbox: new FailingOutbox(),
			realtime: new InMemoryRealtimeTransport(),
			registry: createEntityRegistry(new ContentEntityAdapter()),
			replica,
		});

		await expect(engine.mutate(contentIntent("cannot-persist", "local-only"))).rejects.toThrow(
			"outbox persistence failed"
		);
		expect(replica.changes).toEqual(new Map());
	});

	test("catches up a remote write made while realtime is connecting", async () => {
		const journal = new InMemoryJournalApi();
		const replica = new InMemoryReplicaStore();
		const engine = new SyncEngine({
			journal,
			outbox: new InMemoryOutbox(),
			realtime: new ChangeDuringConnectTransport(() =>
				journal.append({
					cursor: "j:1",
					entityId: "connect-race",
					entityType: "content",
					entityVersion: 1,
					operation: "upsert",
					payload: { title: "created during realtime connect" },
				})
			),
			registry: createEntityRegistry(new ContentEntityAdapter()),
			replica,
		});

		await engine.start();
		expect(replica.changes.get("content:connect-race")).toMatchObject({
			payload: { title: "created during realtime connect" },
		});
	});

	test("retries startup after an initial pull failure", async () => {
		const journal = new FailOnceJournal();
		const replica = new InMemoryReplicaStore();
		const engine = new SyncEngine({
			journal,
			outbox: new InMemoryOutbox(),
			realtime: new InMemoryRealtimeTransport(),
			registry: createEntityRegistry(new ContentEntityAdapter()),
			replica,
		});

		await expect(engine.start()).rejects.toThrow("temporary pull failure");
		await engine.start();
		expect(journal.pullAttempts).toBe(5);
	});
});

class FailingOutbox extends InMemoryOutbox {
	override async enqueue(_intent: SyncIntent): Promise<void> {
		throw new Error("outbox persistence failed");
	}
}

class OptimisticReplicaStore extends InMemoryReplicaStore {
	override async applyOptimistic(intent: SyncIntent): Promise<void> {
		if (!intent.entityId) return;
		await this.applyCanonical({
			cursor: `local:${intent.mutationId}`,
			entityId: intent.entityId,
			entityType: intent.entityType,
			entityVersion: intent.baseEntityVersion ?? 0,
			mutationId: intent.mutationId,
			operation: intent.operation,
			payload: intent.payload,
		});
	}
}

class ChangeDuringConnectTransport implements RealtimeTransport {
	constructor(private readonly publishBeforeSubscribe: () => void) {}

	async connect(_onHint: (hint: { cursor?: string }) => void): Promise<() => void> {
		this.publishBeforeSubscribe();
		return () => undefined;
	}
}

class FailOnceJournal extends InMemoryJournalApi {
	pullAttempts = 0;

	override async pull(afterCursor?: string): Promise<PullResult> {
		this.pullAttempts++;
		if (this.pullAttempts === 1) throw new Error("temporary pull failure");
		return super.pull(afterCursor);
	}
}

class TagEntityAdapter implements EntityAdapter {
	readonly entityType = "tag";

	validateIntent(intent: SyncIntent): void {
		if (intent.operation !== "upsert") return;
		if (!isTagPayload(intent.payload)) throw new Error("Tag upsert requires title and color metadata");
	}

	applyCanonical(transaction: ReplicaTransaction, change: SyncChange): Promise<void> {
		return transaction.applyCanonical(change);
	}

	applyOptimistic(transaction: ReplicaTransaction, intent: SyncIntent): Promise<void> {
		return transaction.applyOptimistic(intent);
	}

	preserveConflict(transaction: ReplicaTransaction, intent: SyncIntent, current?: SyncChange): Promise<void> {
		return transaction.recordConflict(intent, current);
	}
}

class ProtocolHarness {
	private readonly realtime = new HintHub();
	private readonly journal = new SharedJournal(this.realtime);

	client(name: string, ...extraAdapters: EntityAdapter[]) {
		const replica = new InMemoryReplicaStore();
		const outbox = new InMemoryOutbox();
		return {
			engine: new SyncEngine({
				journal: this.journal,
				outbox,
				realtime: this.realtime.connection(name),
				registry: createEntityRegistry(new ContentEntityAdapter(), ...extraAdapters),
				replica,
			}),
			replica,
		};
	}
}

class SharedJournal implements JournalApi {
	private readonly changes: SyncChange[] = [];

	constructor(private readonly realtime: HintHub) {}

	compareCursors(left: string, right: string): number {
		return Number(left.slice(2)) - Number(right.slice(2));
	}

	async pull(afterCursor?: string): Promise<PullResult> {
		const after = afterCursor ? Number(afterCursor.slice(2)) : 0;
		return {
			changes: this.changes.filter((change) => Number(change.cursor.slice(2)) > after),
			cursor: this.changes.at(-1)?.cursor ?? afterCursor ?? "j:0",
			kind: "changes",
		};
	}

	async push(mutations: SyncIntent[]): Promise<MutationReceipt[]> {
		return mutations.map((mutation) => {
			const change: SyncChange = {
				cursor: `j:${this.changes.length + 1}`,
				entityId: mutation.entityId ?? `generated-${this.changes.length + 1}`,
				entityType: mutation.entityType,
				entityVersion: 1,
				mutationId: mutation.mutationId,
				operation: mutation.operation,
				payload: mutation.payload,
			};
			this.changes.push(change);
			this.realtime.emit(change.cursor);
			return { change, kind: "applied", mutationId: mutation.mutationId };
		});
	}
}

class HintHub {
	private readonly listeners = new Set<(hint: { cursor?: string }) => void>();

	connection(_name: string): RealtimeTransport {
		return {
			connect: async (onHint) => {
				this.listeners.add(onHint);
				return () => this.listeners.delete(onHint);
			},
		};
	}

	emit(cursor: string): void {
		for (const listener of this.listeners) listener({ cursor });
	}
}

class InterruptedMediaPipeline {
	async download(_url: string): Promise<never> {
		throw new Error("interrupted media download");
	}
}

function contentIntent(mutationId: string, entityId: string): SyncIntent {
	return {
		entityId,
		entityType: "content",
		mutationId,
		operation: "upsert",
		payload: { title: entityId === "desktop-note" ? "Desktop note" : entityId },
	};
}

function isTagPayload(payload: unknown): payload is { color: number; title: string } {
	if (!payload || typeof payload !== "object") return false;
	const candidate = payload as { color?: unknown; title?: unknown };
	return (
		typeof candidate.color === "number" && typeof candidate.title === "string" && candidate.title.length > 0
	);
}

async function settle(engine: SyncEngine): Promise<void> {
	await Promise.resolve();
	await engine.syncNow();
}
