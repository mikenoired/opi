import type { SyncChange, SyncProvider } from "@synapse/core";
import type { SyncEvent, SyncEventHandler, SyncSubscriber } from "@synapse/sync";

/**
 * Process-local delivery hub. Domain writes remain authoritative in Postgres;
 * a disconnected client refetches from the API after it reconnects.
 */
export class BackendSyncProvider implements SyncProvider, SyncSubscriber {
	private readonly subscribers = new Map<string, Set<SyncEventHandler>>();
	private readonly cursorSubscribers = new Map<string, Set<(cursor: string) => void | Promise<void>>>();

	async publishCursor(userId: string, cursor: string): Promise<void> {
		const handlers = this.cursorSubscribers.get(userId);
		if (!handlers) return;
		await Promise.all([...handlers].map(async (handler) => await handler(cursor)));
	}

	subscribeCursor(userId: string, handler: (cursor: string) => void | Promise<void>): () => void {
		const handlers =
			this.cursorSubscribers.get(userId) ?? new Set<(cursor: string) => void | Promise<void>>();
		handlers.add(handler);
		this.cursorSubscribers.set(userId, handlers);
		return () => {
			handlers.delete(handler);
			if (!handlers.size) this.cursorSubscribers.delete(userId);
		};
	}

	async publish(change: SyncChange): Promise<void> {
		const event: SyncEvent = {
			...change,
			id: crypto.randomUUID(),
			occurredAt: new Date().toISOString(),
		};
		const handlers = this.subscribers.get(change.userId);
		if (!handlers) return;

		await Promise.all(
			[...handlers].map(async (handler) => {
				try {
					await handler(event);
				} catch {
					// A failed client transport must not make a committed domain write fail.
				}
			})
		);
	}

	subscribe(userId: string, handler: SyncEventHandler): () => void {
		const handlers = this.subscribers.get(userId) ?? new Set<SyncEventHandler>();
		handlers.add(handler);
		this.subscribers.set(userId, handlers);

		return () => {
			handlers.delete(handler);
			if (handlers.size === 0) this.subscribers.delete(userId);
		};
	}
}

export const backendSyncProvider = new BackendSyncProvider();
