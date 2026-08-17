import {
	ContentEntityAdapter,
	TagEntityAdapter,
	SyncEngine,
	createEntityRegistry,
	type JournalApi,
	type MutationReceipt,
	type Outbox,
	type PullResult,
	type RealtimeTransport,
	type ReplicaStore,
	type ReplicaTransaction,
	type SyncChange,
	type SyncCursor,
	type SyncIntent,
} from "@synapse/sync";

import { apiUrl } from "@/shared/config/api";

type ChangeListener = () => void;
type RuntimeEngine = Pick<SyncEngine, "mutate" | "start" | "stop" | "syncNow">;
type ProjectionReplica = Pick<IndexedDbReplicaStore, "get" | "list">;
type RuntimeFactory = (
	userId: string,
	onProjection: ChangeListener
) => { engine: RuntimeEngine; replica: ProjectionReplica };

/**
 * Browser sync module. Its public interface is intentionally limited to lifecycle
 * and a projection notification: SyncEngine remains the owner of cursors/outbox.
 */
export class WebSyncRuntime {
	private engine?: RuntimeEngine;
	private generation = 0;
	private replica?: ProjectionReplica;
	private readonly listeners = new Set<ChangeListener>();

	constructor(private readonly createRuntime: RuntimeFactory = createBrowserRuntime) {}

	async start(userId: string): Promise<void> {
		await this.stop();
		const generation = ++this.generation;
		const entitlement = await jsonRequest<{ eligible: boolean }>("/user/sync/entitlement");
		if (!entitlement.eligible || generation !== this.generation) return;
		const { engine, replica } = this.createRuntime(userId, () => this.notifyProjection());
		await engine.start();
		if (generation !== this.generation) {
			await engine.stop();
			return;
		}
		this.engine = engine;
		this.replica = replica;
	}

	async stop(): Promise<void> {
		this.generation++;
		await this.engine?.stop();
		this.engine = undefined;
		this.replica = undefined;
	}

	syncNow(): Promise<void> {
		return this.engine?.syncNow() ?? Promise.resolve();
	}

	isRunning(): boolean {
		return this.engine !== undefined;
	}

	/** Enqueue a user mutation through the durable outbox and apply it optimistically. */
	mutate(intent: SyncIntent): Promise<void> {
		if (!this.engine) return Promise.reject(new Error("Web sync is not running"));
		return this.engine.mutate(intent);
	}

	subscribeProjection(listener: ChangeListener): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	async readProjection(entityType: string): Promise<SyncChange[]> {
		return this.replica?.list(entityType) ?? [];
	}

	async readEntityVersion(entityType: string, entityId: string): Promise<number | undefined> {
		return (await this.replica?.get(entityType, entityId))?.entityVersion;
	}

	async readEntity(entityType: string, entityId: string): Promise<SyncChange | undefined> {
		return this.replica?.get(entityType, entityId);
	}

	private notifyProjection(): void {
		for (const listener of this.listeners) listener();
	}
}

function createBrowserRuntime(
	userId: string,
	onProjection: ChangeListener
): { engine: RuntimeEngine; replica: ProjectionReplica } {
	const name = `synapse-sync-${userId}`;
	const replica = new IndexedDbReplicaStore(name, onProjection);
	return {
		engine: new SyncEngine({
			journal: new BrowserJournalApi(),
			outbox: new IndexedDbOutbox(name),
			realtime: new CookieSseTransport(),
			registry: createEntityRegistry(new ContentEntityAdapter(), new TagEntityAdapter()),
			replica,
		}),
		replica,
	};
}

export const webSyncRuntime = new WebSyncRuntime();

export class BrowserJournalApi implements JournalApi {
	compareCursors(left: SyncCursor, right: SyncCursor): number {
		return compareServerCursors(left, right);
	}

	async pull(afterCursor?: SyncCursor): Promise<PullResult> {
		const query = afterCursor ? `?afterCursor=${encodeURIComponent(afterCursor)}` : "";
		return jsonRequest<PullResult>(`/sync/pull${query}`);
	}

	/** Compatibility adapter until the server exposes generic POST /sync/mutations. */
	async push(mutations: SyncIntent[]): Promise<MutationReceipt[]> {
		const response = await jsonRequest<{ outcomes: Array<Record<string, unknown>> }>("/sync/push", {
			body: JSON.stringify({
				mutations: mutations.map((mutation) =>
					mutation.entityType === "tag" ||
					(mutation.entityType === "content" &&
						mutation.operation === "upsert" &&
						mutation.baseEntityVersion === undefined)
						? mutation
						: {
								baseRevision: mutation.baseEntityVersion,
								clientMutationId: mutation.mutationId,
								content: mutation.operation === "upsert" ? mutation.payload : undefined,
								kind: mutation.operation,
								remoteId: mutation.entityId,
							}
				),
			}),
			method: "POST",
		});
		return response.outcomes.map((outcome) => {
			const mutationId = String(outcome.mutationId ?? outcome.clientMutationId);
			if (outcome.kind === "conflict" || outcome.status === "conflict") {
				return { kind: "conflict", mutationId };
			}
			return { kind: "applied", mutationId };
		});
	}
}

function compareServerCursors(left: SyncCursor, right: SyncCursor): number {
	const leftValue = Number(/^j:(\d+)$/.exec(left)?.[1]);
	const rightValue = Number(/^j:(\d+)$/.exec(right)?.[1]);
	if (!Number.isSafeInteger(leftValue) || !Number.isSafeInteger(rightValue))
		throw new Error("Synapse API returned an invalid sync cursor");
	return leftValue - rightValue;
}

/** Same-site cookie authentication avoids putting any bearer credential in an URL. */
export class CookieSseTransport implements RealtimeTransport {
	connect(onHint: (hint: { cursor?: SyncCursor }) => void): Promise<() => void> {
		const events = new EventSource(apiUrl("/sync/events"), { withCredentials: true });
		events.addEventListener("hint", (event) => {
			try {
				const hint = JSON.parse((event as MessageEvent<string>).data) as { cursor?: SyncCursor };
				onHint(hint);
			} catch {
				// Malformed hints are disposable: a later reconnect/pull restores state.
			}
		});
		return new Promise((resolve, reject) => {
			let opened = false;
			events.addEventListener("open", () => {
				opened = true;
				resolve(() => events.close());
			});
			events.addEventListener("error", () => {
				if (opened) return;
				events.close();
				reject(new Error("Synapse realtime connection failed before opening"));
			});
		});
	}
}

type StoredChange = SyncChange & { key: string };
type StoredIntent = SyncIntent & { key: string };

class IndexedDbReplicaStore implements ReplicaStore {
	constructor(
		private readonly name: string,
		private readonly onProjection: ChangeListener
	) {}

	async readCursor(): Promise<SyncCursor | undefined> {
		return (await this.getMeta("cursor")) as SyncCursor | undefined;
	}

	async list(entityType: string): Promise<SyncChange[]> {
		const db = await openDatabase(this.name);
		const transaction = db.transaction("replica", "readonly");
		const entries = (await request(transaction.objectStore("replica").getAll())) as StoredChange[];
		await complete(transaction);
		db.close();
		return entries
			.filter((entry) => entry.entityType === entityType)
			.map(({ key: _key, ...change }) => change);
	}

	async get(entityType: string, entityId: string): Promise<SyncChange | undefined> {
		const db = await openDatabase(this.name);
		const transaction = db.transaction("replica", "readonly");
		const entry = (await request(transaction.objectStore("replica").get(`${entityType}:${entityId}`))) as
			| StoredChange
			| undefined;
		await complete(transaction);
		db.close();
		if (!entry) return undefined;
		const { key: _key, ...change } = entry;
		return change;
	}

	async transact(action: (transaction: ReplicaTransaction) => Promise<void>): Promise<void> {
		const db = await openDatabase(this.name);
		const transaction = db.transaction(["replica", "meta", "conflicts"], "readwrite");
		const adapter = new IndexedDbReplicaTransaction(transaction);
		await action(adapter);
		await complete(transaction);
		db.close();
		this.onProjection();
	}

	private async getMeta(key: string): Promise<unknown> {
		const db = await openDatabase(this.name);
		const transaction = db.transaction("meta", "readonly");
		const result = await request(transaction.objectStore("meta").get(key));
		await complete(transaction);
		db.close();
		return (result as { key: string; value: unknown } | undefined)?.value;
	}
}

class IndexedDbReplicaTransaction implements ReplicaTransaction {
	constructor(private readonly transaction: IDBTransaction) {}

	async applyCanonical(change: SyncChange): Promise<void> {
		const store = this.transaction.objectStore("replica");
		const key = `${change.entityType}:${change.entityId}`;
		if (change.operation === "delete") await request(store.delete(key));
		else await request(store.put({ ...change, key } satisfies StoredChange));
	}

	async applyOptimistic(intent: SyncIntent): Promise<void> {
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

	async recordConflict(intent: SyncIntent, current?: SyncChange): Promise<void> {
		await request(this.transaction.objectStore("conflicts").put({ current, intent, key: intent.mutationId }));
	}

	async replaceFromSnapshot(changes: SyncChange[]): Promise<void> {
		const store = this.transaction.objectStore("replica");
		await request(store.clear());
		for (const change of changes) await this.applyCanonical(change);
	}

	async setCursor(cursor: SyncCursor): Promise<void> {
		await request(this.transaction.objectStore("meta").put({ key: "cursor", value: cursor }));
	}
}

class IndexedDbOutbox implements Outbox {
	constructor(private readonly name: string) {}

	async acknowledge(mutationId: string): Promise<void> {
		await this.write((store) => request(store.delete(mutationId)));
	}

	async enqueue(intent: SyncIntent): Promise<void> {
		await this.write((store) =>
			request(store.put({ ...intent, key: intent.mutationId } satisfies StoredIntent))
		);
	}

	async list(): Promise<SyncIntent[]> {
		const db = await openDatabase(this.name);
		const transaction = db.transaction("outbox", "readonly");
		const entries = (await request(transaction.objectStore("outbox").getAll())) as StoredIntent[];
		await complete(transaction);
		db.close();
		return entries.map(({ key: _key, ...intent }) => intent);
	}

	async retainForRetry(_mutationId: string): Promise<void> {}

	private async write(action: (store: IDBObjectStore) => Promise<unknown>): Promise<void> {
		const db = await openDatabase(this.name);
		const transaction = db.transaction("outbox", "readwrite");
		await action(transaction.objectStore("outbox"));
		await complete(transaction);
		db.close();
	}
}

function openDatabase(name: string): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const opening = indexedDB.open(name, 1);
		opening.onupgradeneeded = () => {
			const db = opening.result;
			for (const store of ["replica", "outbox", "meta", "conflicts"])
				if (!db.objectStoreNames.contains(store)) db.createObjectStore(store, { keyPath: "key" });
		};
		opening.onerror = () => reject(opening.error ?? new Error("Unable to open sync storage"));
		opening.onsuccess = () => resolve(opening.result);
	});
}

function request(source: IDBRequest): Promise<unknown> {
	return new Promise((resolve, reject) => {
		source.onerror = () => reject(source.error);
		source.onsuccess = () => resolve(source.result);
	});
}

function complete(transaction: IDBTransaction): Promise<void> {
	return new Promise((resolve, reject) => {
		transaction.onabort = () => reject(transaction.error ?? new Error("Sync storage transaction aborted"));
		transaction.onerror = () => reject(transaction.error ?? new Error("Sync storage transaction failed"));
		transaction.oncomplete = () => resolve();
	});
}

async function jsonRequest<T>(path: string, init?: RequestInit): Promise<T> {
	const response = await fetch(apiUrl(path), {
		...init,
		credentials: "include",
		headers: { "Content-Type": "application/json", ...init?.headers },
	});
	if (!response.ok) throw new Error(`Sync request failed with ${response.status}`);
	return response.json() as Promise<T>;
}
