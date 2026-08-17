import type { Content } from "@synapse/shared/schemas";
import type {
	EntityAdapter,
	JournalApi,
	MutationReceipt,
	Outbox,
	PullResult,
	RealtimeTransport,
	ReplicaStore,
	ReplicaTransaction,
	SyncChange,
	SyncCursor,
	SyncIntent,
} from "@synapse/sync";

import type { LocalLibraryRepository } from "./local-library.repository";

type RequestFn = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

/** HTTP boundary for the generic engine. The server's legacy push is only a
 * temporary mutation envelope; pull is always the canonical V2 journal. */
export class DesktopJournalApi implements JournalApi {
	constructor(
		private readonly apiUrl: () => string | undefined,
		private readonly token: () => string | undefined,
		private readonly request: RequestFn = fetch
	) {}

	compareCursors(left: SyncCursor, right: SyncCursor): number {
		return compareServerCursors(left, right);
	}

	async pull(afterCursor?: SyncCursor): Promise<PullResult> {
		const url = new URL(`${this.requireApiUrl()}/sync/pull`);
		if (afterCursor) url.searchParams.set("afterCursor", afterCursor);
		return this.json<PullResult>(url, { method: "GET" });
	}

	async push(intents: SyncIntent[]): Promise<MutationReceipt[]> {
		const mutations = intents.map((intent) => ({
			baseRevision: intent.baseEntityVersion,
			clientMutationId: intent.mutationId,
			content: intent.payload,
			kind: intent.operation,
			remoteId: intent.entityId,
		}));
		const result = await this.json<{ outcomes: Array<any> }>(`${this.requireApiUrl()}/sync/push`, {
			body: JSON.stringify({ mutations }),
			method: "POST",
		});
		return result.outcomes.map((outcome) => {
			if (outcome.status === "conflict")
				return {
					current: outcome.content
						? contentChange(outcome.content, outcome.revision, outcome.clientMutationId)
						: undefined,
					kind: "conflict" as const,
					mutationId: outcome.clientMutationId,
				};
			return {
				change: outcome.content
					? contentChange(outcome.content, outcome.revision, outcome.clientMutationId)
					: undefined,
				kind: "applied" as const,
				mutationId: outcome.clientMutationId,
			};
		});
	}

	private async json<T>(input: RequestInfo | URL, init: RequestInit): Promise<T> {
		const response = await this.request(input, {
			...init,
			headers: {
				"content-type": "application/json",
				...(this.token() ? { "x-synapse-access-token": this.token()! } : {}),
			},
		});
		if (!response.ok) throw new Error(`Synapse API returned ${response.status}`);
		return response.json() as Promise<T>;
	}

	private requireApiUrl(): string {
		const value = this.apiUrl();
		if (!value) throw new Error("Сначала подключите аккаунт Synapse");
		return value;
	}
}

function compareServerCursors(left: SyncCursor, right: SyncCursor): number {
	const leftValue = Number(/^j:(\d+)$/.exec(left)?.[1]);
	const rightValue = Number(/^j:(\d+)$/.exec(right)?.[1]);
	if (!Number.isSafeInteger(leftValue) || !Number.isSafeInteger(rightValue))
		throw new Error("Synapse API returned an invalid sync cursor");
	return leftValue - rightValue;
}

/** Main-process SSE transport: bearer credentials are headers, never URL data. */
export class DesktopSseTransport implements RealtimeTransport {
	constructor(
		private readonly apiUrl: () => string | undefined,
		private readonly token: () => string | undefined,
		private readonly request: RequestFn = fetch,
		private readonly delay: (milliseconds: number) => Promise<void> = (milliseconds) =>
			new Promise((resolve) => setTimeout(resolve, milliseconds))
	) {}

	async connect(onHint: (hint: { cursor?: SyncCursor }) => void): Promise<() => void> {
		const controller = new AbortController();
		let markReady!: () => void;
		const ready = new Promise<void>((resolve) => {
			markReady = resolve;
		});
		void this.listen(controller.signal, onHint, markReady);
		await ready;
		return () => controller.abort();
	}

	private async listen(
		signal: AbortSignal,
		onHint: (hint: { cursor?: SyncCursor }) => void,
		onReady: () => void
	): Promise<void> {
		let connected = false;
		while (!signal.aborted) {
			try {
				const apiUrl = this.apiUrl();
				if (!apiUrl) return;
				const response = await this.request(`${apiUrl}/sync/events`, {
					headers: this.token() ? { "x-synapse-access-token": this.token()! } : {},
					signal,
				});
				if (!response.ok || !response.body) throw new Error("Sync event stream unavailable");
				if (!connected) {
					connected = true;
					onReady();
				}
				const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
				let buffered = "";
				while (!signal.aborted) {
					const { done, value } = await reader.read();
					if (done) break;
					buffered += value;
					const records = buffered.split("\n\n");
					buffered = records.pop() ?? "";
					for (const record of records) {
						const line = record.split("\n").find((entry) => entry.startsWith("data:"));
						if (!line) continue;
						const payload = JSON.parse(line.slice(5).trim()) as {
							cursor?: string;
						};
						onHint({ cursor: payload.cursor });
					}
				}
			} catch {
				// Hints are lossy by design. Retry; SyncEngine always pulls the journal.
			}
			if (!signal.aborted) await this.delay(1_000);
		}
	}
}

/** Bridges the JSON library's existing durable outbox without duplicating it. */
export class DesktopOutbox implements Outbox {
	constructor(private readonly library: LocalLibraryRepository) {}

	async enqueue(_intent: SyncIntent): Promise<void> {
		// Renderer mutations are already durably written by LocalLibraryRepository.
	}

	async list(): Promise<SyncIntent[]> {
		return (await this.library.getPendingOperations())
			.filter((entry) => !entry.localBinary)
			.map((entry) => ({
				baseEntityVersion: entry.mutation.baseRevision,
				entityId: entry.mutation.remoteId,
				entityType: "content",
				mutationId: entry.mutation.clientMutationId,
				operation: entry.mutation.kind,
				payload: entry.mutation.content,
			}));
	}

	acknowledge(mutationId: string): Promise<void> {
		return this.library.acknowledgeMutation(mutationId);
	}

	retainForRetry(mutationId: string): Promise<void> {
		return this.library.retainMutation(mutationId);
	}
}

export class DesktopReplicaStore implements ReplicaStore {
	constructor(
		private readonly library: LocalLibraryRepository,
		private readonly hydrate: (content: any) => Promise<{ assets?: any[]; content: any }> = async (
			content
		) => ({
			content,
		}),
		private readonly onCommitted: () => void = () => undefined
	) {}

	readCursor(): Promise<SyncCursor | undefined> {
		return this.library.getSyncCursor();
	}

	async transact(action: (transaction: ReplicaTransaction) => Promise<void>): Promise<void> {
		const transaction = new DesktopReplicaTransaction(this.library, this.hydrate);
		await action(transaction);
		const hydrate = await transaction.commit();
		this.onCommitted();
		// Asset transfer is deliberately not part of the replica transaction. A
		// network interruption must never roll back metadata or its journal cursor.
		void hydrate();
	}
}

class DesktopReplicaTransaction implements ReplicaTransaction {
	private readonly canonical: SyncChange[] = [];
	private snapshot?: SyncChange[];
	private cursor?: string;

	constructor(
		private readonly library: LocalLibraryRepository,
		private readonly hydrate: (content: any) => Promise<{ assets?: any[]; content: any }>
	) {}

	applyCanonical(change: SyncChange): Promise<void> {
		this.canonical.push(change);
		return Promise.resolve();
	}
	applyOptimistic(_intent: SyncIntent): Promise<void> {
		return Promise.resolve();
	}
	recordConflict(_intent: SyncIntent, _current?: SyncChange): Promise<void> {
		return Promise.resolve();
	}
	replaceFromSnapshot(changes: SyncChange[]): Promise<void> {
		this.snapshot = changes;
		return Promise.resolve();
	}
	setCursor(cursor: SyncCursor): Promise<void> {
		this.cursor = cursor;
		return Promise.resolve();
	}

	async commit(): Promise<() => Promise<void>> {
		const changes = this.snapshot ?? this.canonical;
		await this.library.applyRemoteBatch(
			changes
				.filter((change) => change.entityType === "content")
				.map((change) => ({
					content: change.payload as Content | undefined,
					entityId: change.entityId,
					operation: change.operation,
					revision: change.entityVersion,
				})),
			this.cursor,
			this.snapshot !== undefined
		);

		return async () => {
			for (const change of changes) {
				if (change.entityType !== "content" || !change.payload) continue;
				try {
					const hydrated = await this.hydrate(change.payload);
					if (hydrated.assets && hydrated.content)
						await this.library.applyHydratedAssets(
							change.entityId,
							change.entityVersion,
							hydrated.assets,
							hydrated.content
						);
				} catch {
					// The next media repair pass retries binary hydration. Metadata is already durable.
				}
			}
		};
	}
}

export class DesktopContentAdapter implements EntityAdapter {
	readonly entityType = "content";
	validateIntent(intent: SyncIntent): void {
		if (intent.operation === "upsert" && !intent.payload) throw new Error("Content metadata is required");
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

function contentChange(content: any, entityVersion: number, mutationId: string): SyncChange {
	return {
		cursor: "j:0",
		entityId: content.id,
		entityType: "content",
		entityVersion,
		mutationId,
		operation: "upsert",
		payload: content,
	};
}
