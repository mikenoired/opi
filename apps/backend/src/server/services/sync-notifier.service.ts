import { backendSyncProvider } from "../adapters/backend-sync.provider";
import type { Context } from "../context";
import SyncHintRepository from "../repositories/sync-hint.repository";

export interface SyncHintTransport {
	publish(hint: { cursor: string; userId: string }): Promise<void>;
	subscribe(handler: (hint: { cursor: string; userId: string }) => void): Promise<() => Promise<void>>;
}

/** PostgreSQL transport is shared by all backend instances; hints never carry domain payload. */
export class PostgresSyncHintTransport implements SyncHintTransport {
	async publish(hint: { cursor: string; userId: string }): Promise<void> {
		await this.repository.publish(hint);
	}

	async subscribe(handler: (hint: { cursor: string; userId: string }) => void): Promise<() => Promise<void>> {
		return this.repository.subscribe(handler);
	}

	private readonly repository: SyncHintRepository;

	constructor(ctx: Context) {
		this.repository = new SyncHintRepository(ctx.db);
	}
}

/** One owner per backend process; reconnect turns listener failures into a later cursor hint. */
export class SyncNotifierLifecycle {
	private closed = false;
	private unsubscribe?: () => Promise<void>;
	private reconnect?: ReturnType<typeof setTimeout>;

	constructor(private readonly transport: SyncHintTransport) {}

	async start(): Promise<void> {
		this.closed = false;
		await this.connect();
	}

	async stop(): Promise<void> {
		this.closed = true;
		if (this.reconnect) clearTimeout(this.reconnect);
		await this.unsubscribe?.();
		this.unsubscribe = undefined;
	}

	private async connect(): Promise<void> {
		try {
			this.unsubscribe = await this.transport.subscribe((hint) => {
				void backendSyncProvider.publishCursor(hint.userId, hint.cursor);
			});
		} catch {
			if (!this.closed) this.reconnect = setTimeout(() => void this.connect(), 1000);
		}
	}
}

/** Publish happens after the coordinator transaction commits. Delivery is never part of commit success. */
export default class SyncNotifierService {
	constructor(private readonly ctx: Context) {}

	async notify(userId: string, cursor: string): Promise<void> {
		try {
			await new PostgresSyncHintTransport(this.ctx).publish({ cursor, userId });
		} catch {
			// Pull is authoritative. A later reconnect catches this up.
		}
		try {
			await backendSyncProvider.publishCursor(userId, cursor);
		} catch {
			// SSE cannot make a committed mutation fail.
		}
	}
}

/** In-memory bus is a deterministic test adapter, not a production source of truth. */
export class InMemorySyncHintTransport implements SyncHintTransport {
	private readonly handlers = new Set<(hint: { cursor: string; userId: string }) => void>();

	async publish(hint: { cursor: string; userId: string }): Promise<void> {
		for (const handler of this.handlers) handler(hint);
	}

	async subscribe(handler: (hint: { cursor: string; userId: string }) => void): Promise<() => Promise<void>> {
		this.handlers.add(handler);
		return async () => {
			this.handlers.delete(handler);
		};
	}
}
