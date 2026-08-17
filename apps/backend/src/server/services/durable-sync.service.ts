import type { SyncMutation, SyncMutationOutcome, SyncPullResult, SyncPushResult } from "@synapse/api";
import type { CreateContent } from "@synapse/shared/schemas";

import type { Context } from "../context";
import ContentService from "./content.service";
import { SyncJournalService } from "./sync-journal.service";
import { SyncMutationCoordinator } from "./sync-mutation-coordinator";

/** Server side of the local-first protocol. It owns conflict detection, not a renderer. */
export class DurableSyncService {
	private readonly content: ContentService;
	private readonly journal: SyncJournalService;

	constructor(private readonly ctx: Context) {
		this.content = new ContentService(ctx);
		this.journal = new SyncJournalService(ctx);
	}

	async pull(cursor: string | undefined): Promise<SyncPullResult> {
		const userId = this.ctx.user!.id;
		const contents = await this.content.getAllForSync();
		await this.journal.reconcileSnapshot(contents);
		if (cursor !== undefined) return this.journal.pull(userId, cursor);

		// First connection gets a canonical snapshot; later pulls consume only
		// ordered journal entries after the stored watermark.
		const watermark = await this.journal.getLatestCursor(userId);
		return {
			changes: await Promise.all(
				contents.map(async (content) => ({
					content,
					entityId: content.id,
					operation: "upsert" as const,
					revision: await this.journal.ensureSnapshot(content),
				}))
			),
			cursor: watermark,
		};
	}

	async push(mutations: SyncMutation[]): Promise<SyncPushResult> {
		return {
			outcomes: await Promise.all(
				mutations.map((mutation) => new SyncMutationCoordinator(this.ctx).apply(mutation))
			),
		};
	}

	async deleteAll(): Promise<void> {
		const contents = await this.content.getAllForSync();
		for (const content of contents) {
			await new SyncMutationCoordinator(this.ctx).apply({
				clientMutationId: crypto.randomUUID(),
				kind: "delete",
				remoteId: content.id,
			});
		}
	}

	private async applyMutation(mutation: SyncMutation): Promise<SyncMutationOutcome> {
		if (!mutation.remoteId) {
			if (mutation.kind === "delete") {
				return { clientMutationId: mutation.clientMutationId, deleted: true, revision: 0, status: "applied" };
			}
			const content = await this.content.create(requireContent(mutation));
			const revision = await this.journal.recordContent(content);
			return { clientMutationId: mutation.clientMutationId, content, revision, status: "applied" };
		}

		const entity = await this.journal.getRevision(this.ctx.user!.id, mutation.remoteId);
		if (!entity || entity.deleted || mutation.baseRevision !== entity.revision) {
			if (entity?.deleted) {
				return {
					clientMutationId: mutation.clientMutationId,
					deleted: true,
					revision: entity.revision,
					status: "applied",
				};
			}
			const remote = await this.content.getById(mutation.remoteId);
			const revision = await this.journal.ensureSnapshot(remote);
			return { clientMutationId: mutation.clientMutationId, content: remote, revision, status: "conflict" };
		}

		if (mutation.kind === "delete") {
			await this.content.delete(mutation.remoteId);
			const revision = await this.journal.recordDeletion(this.ctx.user!.id, mutation.remoteId);
			return { clientMutationId: mutation.clientMutationId, deleted: true, revision, status: "applied" };
		}
		const content = await this.content.update({ ...requireContent(mutation), id: mutation.remoteId });
		const revision = await this.journal.recordContent(content);
		return { clientMutationId: mutation.clientMutationId, content, revision, status: "applied" };
	}
}

function requireContent(mutation: SyncMutation): CreateContent {
	if (!mutation.content) throw new Error("An upsert sync mutation requires content");
	return mutation.content;
}
