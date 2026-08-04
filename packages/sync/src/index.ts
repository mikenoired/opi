import type { SyncChange } from "@synapse/core";

/** A durable-domain change with metadata needed by a delivery transport. */
export interface SyncEvent extends SyncChange {
	id: string;
	occurredAt: string;
}

export type SyncEventHandler = (event: SyncEvent) => void | Promise<void>;

/**
 * Delivery side of synchronization. Transports may be SSE, a desktop bridge,
 * or a future persistent queue; neither Core nor a consumer depends on one.
 */
export interface SyncSubscriber {
	subscribe: (userId: string, handler: SyncEventHandler) => () => void;
}
