import type { SyncChange as CoreSyncChange } from "@synapse/core";

export type SyncOperation = "delete" | "upsert";
export type SyncCursor = string;

/** Canonical metadata change. Binary media must never be placed in payload. */
export interface SyncChange {
	cursor: SyncCursor;
	entityId: string;
	entityType: string;
	entityVersion: number;
	mutationId?: string;
	operation: SyncOperation;
	payload?: unknown;
}

export interface SyncIntent {
	baseEntityVersion?: number;
	entityId?: string;
	entityType: string;
	mutationId: string;
	operation: SyncOperation;
	payload?: unknown;
}

export type MutationReceipt =
	| { change?: SyncChange; kind: "applied"; mutationId: string }
	| { current?: SyncChange; kind: "conflict"; mutationId: string }
	| { kind: "retry"; mutationId: string; retryAfterMs?: number };

export type PullResult =
	| { changes: SyncChange[]; cursor: SyncCursor; hasMore: boolean; kind: "changes" }
	| {
			changes: SyncChange[];
			cursor: SyncCursor;
			kind: "reset";
			resetReason: "cursor-expired" | "initial";
	  };

export interface JournalApi {
	/**
	 * Validates ordering at the transport boundary. SyncEngine and replica stores
	 * keep cursors opaque; only the journal implementation knows its encoding.
	 */
	compareCursors(left: SyncCursor, right: SyncCursor): number;
	pull(afterCursor?: SyncCursor): Promise<PullResult>;
	push(mutations: SyncIntent[]): Promise<MutationReceipt[]>;
}

export interface RealtimeTransport {
	connect(onHint: (hint: { cursor?: SyncCursor }) => void): Promise<() => void>;
}

export interface Outbox {
	acknowledge(mutationId: string): Promise<void>;
	enqueue(intent: SyncIntent): Promise<void>;
	list(): Promise<SyncIntent[]>;
	retainForRetry(mutationId: string): Promise<void>;
}

export interface ReplicaTransaction {
	applyCanonical(change: SyncChange): Promise<void>;
	applyOptimistic(intent: SyncIntent): Promise<void>;
	recordConflict(intent: SyncIntent, current?: SyncChange): Promise<void>;
	replaceFromSnapshot(changes: SyncChange[]): Promise<void>;
	setCursor(cursor: SyncCursor): Promise<void>;
}

export interface ReplicaStore {
	readCursor(): Promise<SyncCursor | undefined>;
	transact(action: (transaction: ReplicaTransaction) => Promise<void>): Promise<void>;
}

export interface EntityAdapter {
	readonly entityType: string;
	applyCanonical(transaction: ReplicaTransaction, change: SyncChange): Promise<void>;
	applyOptimistic(transaction: ReplicaTransaction, intent: SyncIntent): Promise<void>;
	preserveConflict(transaction: ReplicaTransaction, intent: SyncIntent, current?: SyncChange): Promise<void>;
	validateIntent(intent: SyncIntent): void;
}

export interface EntityRegistry {
	get(entityType: string): EntityAdapter;
}

export function createEntityRegistry(...adapters: EntityAdapter[]): EntityRegistry {
	const entries = new Map<string, EntityAdapter>();
	for (const adapter of adapters) {
		if (entries.has(adapter.entityType))
			throw new Error(`Duplicate sync entity adapter: ${adapter.entityType}`);
		entries.set(adapter.entityType, adapter);
	}
	return {
		get(entityType) {
			const adapter = entries.get(entityType);
			if (!adapter) throw new Error(`Unsupported sync entity type: ${entityType}`);
			return adapter;
		},
	};
}

export interface SyncEngineDependencies {
	journal: JournalApi;
	outbox: Outbox;
	realtime: RealtimeTransport;
	registry: EntityRegistry;
	replica: ReplicaStore;
}

/** A deep module: callers need only lifecycle, intent and a manual sync request. */
export class SyncEngine {
	private disconnect?: () => void;
	private running?: Promise<void>;
	private started = false;

	constructor(private readonly dependencies: SyncEngineDependencies) {}

	async start(): Promise<void> {
		if (this.started) return;
		this.started = true;
		try {
			await this.syncNow();
			this.disconnect = await this.dependencies.realtime.connect(() => void this.syncNow());
			// Close the pull-to-subscribe race: hints are intentionally lossy.
			await this.syncNow();
		} catch (error) {
			this.disconnect?.();
			this.disconnect = undefined;
			this.started = false;
			throw error;
		}
	}

	async stop(): Promise<void> {
		this.disconnect?.();
		this.disconnect = undefined;
		this.started = false;
	}

	async mutate(intent: SyncIntent): Promise<void> {
		const adapter = this.dependencies.registry.get(intent.entityType);
		adapter.validateIntent(intent);
		await this.dependencies.outbox.enqueue(intent);
		await this.dependencies.replica.transact(async (transaction) => {
			await adapter.applyOptimistic(transaction, intent);
		});
		await this.syncNow();
	}

	syncNow(): Promise<void> {
		if (!this.running) {
			this.running = this.run().finally(() => {
				this.running = undefined;
			});
		}
		return this.running;
	}

	private async run(): Promise<void> {
		await this.pull();
		const pending = await this.dependencies.outbox.list();
		if (pending.length) await this.flush(pending);
		await this.pull();
	}

	private async pull(): Promise<void> {
		let cursor = await this.dependencies.replica.readCursor();
		let hasMore = true;
		while (hasMore) {
			const result = await this.dependencies.journal.pull(cursor);
			if (result.kind === "reset") {
				await this.dependencies.replica.transact(async (transaction) => {
					await transaction.replaceFromSnapshot(result.changes);
					await transaction.setCursor(result.cursor);
				});
				return;
			}
			this.assertMonotonic(result.changes, cursor);
			let appliedCursor = cursor;
			for (const change of result.changes) {
				await this.apply(change, appliedCursor);
				if (change.cursor !== appliedCursor) appliedCursor = change.cursor;
			}
			cursor = appliedCursor;
			hasMore = result.hasMore;
		}
	}

	private assertMonotonic(changes: SyncChange[], cursor: SyncCursor | undefined): void {
		let previous = cursor;
		for (const change of changes) {
			if (previous && this.dependencies.journal.compareCursors(change.cursor, previous) < 0)
				throw new Error("Sync protocol error: non-monotonic cursor in pull response");
			previous = change.cursor;
		}
	}

	private async apply(change: SyncChange, previousCursor: SyncCursor | undefined): Promise<void> {
		if (previousCursor === change.cursor) return;
		await this.dependencies.replica.transact(async (transaction) => {
			await this.dependencies.registry.get(change.entityType).applyCanonical(transaction, change);
			await transaction.setCursor(change.cursor);
		});
	}

	private async flush(intents: SyncIntent[]): Promise<void> {
		const receipts = await this.dependencies.journal.push(intents);
		const byMutationId = new Map(receipts.map((receipt) => [receipt.mutationId, receipt]));
		for (const intent of intents) {
			const receipt = byMutationId.get(intent.mutationId);
			if (!receipt || receipt.kind === "retry") {
				await this.dependencies.outbox.retainForRetry(intent.mutationId);
				continue;
			}
			if (receipt.kind === "conflict") {
				await this.dependencies.replica.transact((transaction) =>
					this.dependencies.registry
						.get(intent.entityType)
						.preserveConflict(transaction, intent, receipt.current)
				);
			}
			await this.dependencies.outbox.acknowledge(intent.mutationId);
		}
	}
}

function compareTestCursors(left: SyncCursor, right: SyncCursor): number {
	const leftNumber = Number(left.replace(/^j:/, ""));
	const rightNumber = Number(right.replace(/^j:/, ""));
	if (!Number.isSafeInteger(leftNumber) || !Number.isSafeInteger(rightNumber))
		return left.localeCompare(right);
	return leftNumber - rightNumber;
}

export class TestEntityAdapter implements EntityAdapter {
	readonly entityType = "test";

	validateIntent(intent: SyncIntent): void {
		if (intent.operation === "upsert" && !intent.payload)
			throw new Error("Test entity upsert requires payload");
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

/** Content-specific translation stays outside SyncEngine and never moves media bytes. */
export class ContentEntityAdapter implements EntityAdapter {
	readonly entityType = "content";

	validateIntent(intent: SyncIntent): void {
		if (intent.operation === "upsert" && (!intent.payload || typeof intent.payload !== "object"))
			throw new Error("Content upsert requires metadata payload");
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

/** Tag metadata is a first-class sync entity; associations remain part of content payloads. */
export class TagEntityAdapter implements EntityAdapter {
	readonly entityType = "tag";

	validateIntent(intent: SyncIntent): void {
		if (intent.operation === "upsert" && (!intent.payload || typeof intent.payload !== "object"))
			throw new Error("Tag upsert requires metadata payload");
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

export class InMemoryJournalApi implements JournalApi {
	readonly pushed: SyncIntent[] = [];

	constructor(private readonly changes: SyncChange[] = []) {}

	append(change: SyncChange): void {
		this.changes.push(change);
	}

	compareCursors(left: SyncCursor, right: SyncCursor): number {
		return compareTestCursors(left, right);
	}

	async pull(afterCursor?: SyncCursor): Promise<PullResult> {
		return {
			changes: this.changes.filter(
				(change) => !afterCursor || compareTestCursors(change.cursor, afterCursor) > 0
			),
			cursor: this.changes.at(-1)?.cursor ?? afterCursor ?? "j:0",
			hasMore: false,
			kind: "changes",
		};
	}

	async push(mutations: SyncIntent[]): Promise<MutationReceipt[]> {
		this.pushed.push(...mutations);
		return mutations.map((mutation) => ({ kind: "applied", mutationId: mutation.mutationId }));
	}
}

export class InMemoryOutbox implements Outbox {
	private readonly entries: SyncIntent[];

	constructor(entries: SyncIntent[] = []) {
		this.entries = [...entries];
	}

	async acknowledge(mutationId: string): Promise<void> {
		const index = this.entries.findIndex((entry) => entry.mutationId === mutationId);
		if (index >= 0) this.entries.splice(index, 1);
	}

	async enqueue(intent: SyncIntent): Promise<void> {
		if (!this.entries.some((entry) => entry.mutationId === intent.mutationId)) this.entries.push(intent);
	}

	async list(): Promise<SyncIntent[]> {
		return [...this.entries];
	}

	async retainForRetry(_mutationId: string): Promise<void> {}
}

export class InMemoryRealtimeTransport implements RealtimeTransport {
	private handler?: (hint: { cursor?: SyncCursor }) => void;

	async connect(onHint: (hint: { cursor?: SyncCursor }) => void): Promise<() => void> {
		this.handler = onHint;
		return () => {
			this.handler = undefined;
		};
	}

	emitHint(cursor?: SyncCursor): void {
		this.handler?.({ cursor });
	}
}

export class InMemoryReplicaStore implements ReplicaStore, ReplicaTransaction {
	readonly appliedCursors: SyncCursor[] = [];
	readonly changes = new Map<string, SyncChange>();
	readonly conflicts: SyncIntent[] = [];
	private cursor?: SyncCursor;

	constructor(cursor?: SyncCursor) {
		this.cursor = cursor;
	}

	async readCursor(): Promise<SyncCursor | undefined> {
		return this.cursor;
	}

	async transact(action: (transaction: ReplicaTransaction) => Promise<void>): Promise<void> {
		await action(this);
	}

	async applyCanonical(change: SyncChange): Promise<void> {
		this.appliedCursors.push(change.cursor);
		if (change.operation === "delete") this.changes.delete(`${change.entityType}:${change.entityId}`);
		else this.changes.set(`${change.entityType}:${change.entityId}`, change);
	}

	async applyOptimistic(_intent: SyncIntent): Promise<void> {}

	async recordConflict(intent: SyncIntent): Promise<void> {
		this.conflicts.push(intent);
	}

	async replaceFromSnapshot(changes: SyncChange[]): Promise<void> {
		this.changes.clear();
		for (const change of changes) await this.applyCanonical(change);
	}

	async setCursor(cursor: SyncCursor): Promise<void> {
		this.cursor = cursor;
	}
}

/** @deprecated Legacy process-local delivery compatibility during protocol migration. */
export interface SyncEvent extends CoreSyncChange {
	id: string;
	occurredAt: string;
}

export type SyncEventHandler = (event: SyncEvent) => void | Promise<void>;

/** @deprecated Realtime transports should emit cursor hints and SyncEngine must pull. */
export interface SyncSubscriber {
	subscribe: (userId: string, handler: SyncEventHandler) => () => void;
}
