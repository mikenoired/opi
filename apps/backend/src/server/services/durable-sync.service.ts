import type { SyncMutation, SyncPushResult } from "@monolyth/api";

import type { Context } from "../context";
import ContentService from "./content.service";
import SyncMutationCoordinator from "./sync-mutation-coordinator";

/** Server side of the local-first protocol. It owns conflict detection, not a renderer. */
export default class DurableSyncService {
	constructor(private readonly ctx: Context) {}

	async push(mutations: SyncMutation[]): Promise<SyncPushResult> {
		return {
			outcomes: await Promise.all(
				mutations.map((mutation) => new SyncMutationCoordinator(this.ctx).apply(mutation))
			),
		};
	}

	async deleteAll(): Promise<void> {
		const contents = await new ContentService(this.ctx).getAllForSync();
		for (const content of contents) {
			await new SyncMutationCoordinator(this.ctx).apply({
				clientMutationId: crypto.randomUUID(),
				kind: "delete",
				remoteId: content.id,
			});
		}
	}
}
