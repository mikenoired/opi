import type { SyncMutation, SyncMutationOutcome } from "@synapse/api";
import type { Content, CreateContent } from "@synapse/shared/schemas";
import type { MutationReceipt, SyncChange, SyncIntent } from "@synapse/sync";
import { sql } from "drizzle-orm";

import type { Context } from "../context";
import { ApiError } from "../lib/api-error";
import ContentRepository from "../repositories/content.repository";
import SyncJournalRepository, {
	type JournalAppendCommand,
	type SyncJournalTransaction,
} from "../repositories/sync-journal.repository";
import ContentService from "./content.service";
import GenericSyncJournalService from "./generic-sync-journal.service";
import SyncNotifierService from "./sync-notifier.service";

/**
 * The one write seam for legacy content sync mutations. The old HTTP shape is
 * intentionally adapted here while clients migrate to the generic protocol.
 */
export default class SyncMutationCoordinator {
	private readonly journal: SyncJournalRepository;

	constructor(private readonly ctx: Context) {
		this.journal = new SyncJournalRepository(ctx.db);
	}

	async apply(mutation: SyncMutation): Promise<SyncMutationOutcome> {
		const userId = this.ctx.user!.id;
		const requestHash = JSON.stringify(mutation);
		const outcome = await this.ctx.db.transaction(async (tx) => {
			const claimed = await this.journal.claimReceipt(tx, userId, mutation.clientMutationId, requestHash);
			if (!claimed.length) {
				const receipt = await this.journal.getReceipt(tx, userId, mutation.clientMutationId);
				if (!receipt || receipt.requestHash !== requestHash || !receipt.outcome)
					throw new ApiError({
						code: "CONFLICT",
						message: "Sync mutation id belongs to a different immutable intent",
					});
				return receipt.outcome as SyncMutationOutcome;
			}

			const entityId = mutation.remoteId;
			if (entityId) await this.lockEntity(tx, userId, entityId);
			const entity = entityId
				? await this.journal.findEntityVersion(tx, userId, "content", entityId)
				: undefined;
			if (
				entityId &&
				(!entity ||
					entity.deleted ||
					(mutation.baseRevision !== undefined && mutation.baseRevision !== entity.entityVersion))
			) {
				const outcome = await this.conflict(mutation, entity?.entityVersion, entity?.deleted);
				await this.journal.finalizeReceipt(tx, userId, mutation.clientMutationId, outcome);
				return outcome;
			}

			const context = { ...this.ctx, db: tx } as unknown as Context;
			const content = new ContentService(context);
			let outcome: SyncMutationOutcome;
			if (!entityId) {
				if (mutation.kind === "delete") outcome = appliedDeleted(mutation.clientMutationId, 0);
				else {
					const created = await content.create(requireContent(mutation));
					await this.appendTagSnapshots(tx, context, created);
					const { entityVersion: revision } = await this.append(tx, {
						entityId: created.id,
						entityType: "content",
						mutationId: mutation.clientMutationId,
						operation: "upsert",
						payload: created,
						previousVersion: 0,
						userId,
					});
					outcome = {
						clientMutationId: mutation.clientMutationId,
						content: created,
						revision,
						status: "applied",
					};
				}
			} else if (mutation.kind === "delete") {
				await content.delete(entityId);
				const { entityVersion: revision } = await this.append(tx, {
					entityId,
					entityType: "content",
					mutationId: mutation.clientMutationId,
					operation: "delete",
					previousVersion: entity!.entityVersion,
					userId,
				});
				outcome = appliedDeleted(mutation.clientMutationId, revision);
			} else {
				const updated = await content.update({ ...requireContent(mutation), id: entityId });
				await this.appendTagSnapshots(tx, context, updated);
				const { entityVersion: revision } = await this.append(tx, {
					entityId: updated.id,
					entityType: "content",
					mutationId: mutation.clientMutationId,
					operation: "upsert",
					payload: updated,
					previousVersion: entity!.entityVersion,
					userId,
				});
				outcome = {
					clientMutationId: mutation.clientMutationId,
					content: updated,
					revision,
					status: "applied",
				};
			}
			await this.journal.finalizeReceipt(tx, userId, mutation.clientMutationId, outcome);
			return outcome;
		});
		const cursor = await this.journal.findMutationCursor(userId, mutation.clientMutationId);
		if (cursor) await new SyncNotifierService(this.ctx).notify(userId, `j:${cursor}`);
		// Retention is deliberately post-commit: pruning can never roll back a
		// canonical mutation and the watermark makes a concurrent pull reset safely.
		await new GenericSyncJournalService(this.ctx).pruneRetained();
		return outcome;
	}

	async updateTagColor(id: string, color: number): Promise<{ color: number; id: string; title: string }> {
		const userId = this.ctx.user!.id;
		const result = await this.ctx.db.transaction(async (tx) => {
			const context = { ...this.ctx, db: tx } as unknown as Context;
			const tag = await new ContentRepository(context).updateTagColor(id, color);
			const current = await this.journal.findEntityVersion(tx, userId, "tag", id);
			const appended = await this.append(tx, {
				entityId: tag.id,
				entityType: "tag",
				operation: "upsert",
				payload: tag,
				previousVersion: current?.entityVersion ?? 0,
				userId,
			});
			return { cursor: appended.cursor, tag };
		});
		await new SyncNotifierService(this.ctx).notify(userId, `j:${result.cursor}`);
		await new GenericSyncJournalService(this.ctx).pruneRetained();
		return result.tag;
	}

	/** Generic protocol seam for independently syncable Tag metadata. */
	async applyIntent(intent: SyncIntent): Promise<MutationReceipt> {
		if (intent.entityType !== "tag" || intent.operation !== "upsert" || !intent.entityId)
			throw new ApiError({ code: "BAD_REQUEST", message: "Unsupported generic sync intent" });
		const color = tagColor(intent.payload);
		const userId = this.ctx.user!.id;
		const requestHash = JSON.stringify(intent);
		const receipt = await this.ctx.db.transaction(async (tx) => {
			const claimed = await this.journal.claimReceipt(tx, userId, intent.mutationId, requestHash);
			if (!claimed.length) {
				const stored = await this.journal.getReceipt(tx, userId, intent.mutationId);
				if (!stored || stored.requestHash !== requestHash || !stored.outcome)
					throw new ApiError({
						code: "CONFLICT",
						message: "Sync mutation id belongs to a different immutable intent",
					});
				return stored.outcome as MutationReceipt;
			}
			await this.lockEntity(tx, userId, intent.entityId!, "tag");
			const current = await this.journal.findEntityVersion(tx, userId, "tag", intent.entityId!);
			if (
				!current ||
				current.deleted ||
				(intent.baseEntityVersion !== undefined && intent.baseEntityVersion !== current.entityVersion)
			) {
				const conflict: MutationReceipt = { kind: "conflict", mutationId: intent.mutationId };
				await this.journal.finalizeReceipt(tx, userId, intent.mutationId, conflict);
				return conflict;
			}
			const context = { ...this.ctx, db: tx } as unknown as Context;
			const tag = await new ContentRepository(context).updateTagColor(intent.entityId!, color);
			const appended = await this.append(tx, {
				entityId: tag.id,
				entityType: "tag",
				mutationId: intent.mutationId,
				operation: "upsert",
				payload: tag,
				previousVersion: current.entityVersion,
				userId,
			});
			const change: SyncChange = {
				cursor: `j:${appended.cursor}`,
				entityId: tag.id,
				entityType: "tag",
				entityVersion: appended.entityVersion,
				mutationId: intent.mutationId,
				operation: "upsert",
				payload: tag,
			};
			const applied: MutationReceipt = { change, kind: "applied", mutationId: intent.mutationId };
			await this.journal.finalizeReceipt(tx, userId, intent.mutationId, applied);
			return applied;
		});
		const cursor = await this.journal.findMutationCursor(userId, intent.mutationId);
		if (cursor) await new SyncNotifierService(this.ctx).notify(userId, `j:${cursor}`);
		await new GenericSyncJournalService(this.ctx).pruneRetained();
		return receipt;
	}

	private async append(tx: SyncJournalTransaction, command: JournalAppendCommand) {
		return this.journal.append(tx, command);
	}

	private async appendTagSnapshots(
		tx: SyncJournalTransaction,
		context: Context,
		content: Content
	): Promise<void> {
		if (!content.tag_ids.length) return;
		const tags = await new ContentRepository(context).getTags(content.tag_ids);
		for (const tag of tags) {
			if (tag.userId !== content.user_id) continue;
			const existing = await this.journal.findEntityVersion(tx, content.user_id, "tag", tag.id);
			if (!existing) {
				await this.append(tx, {
					entityId: tag.id,
					entityType: "tag",
					operation: "upsert",
					payload: tag,
					previousVersion: 0,
					userId: content.user_id,
				});
			}
		}
	}

	private async conflict(
		mutation: SyncMutation,
		revision?: number,
		deleted?: boolean
	): Promise<SyncMutationOutcome> {
		if (deleted) return appliedDeleted(mutation.clientMutationId, revision ?? 0);
		const remote = mutation.remoteId
			? await new ContentService(this.ctx).getById(mutation.remoteId)
			: undefined;
		return {
			clientMutationId: mutation.clientMutationId,
			content: remote,
			revision: revision ?? 0,
			status: "conflict",
		};
	}

	private async lockEntity(
		tx: SyncJournalTransaction,
		userId: string,
		entityId: string,
		entityType = "content"
	): Promise<void> {
		await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`${userId}:${entityType}:${entityId}`}))`);
	}
}

function tagColor(payload: unknown): number {
	if (!payload || typeof payload !== "object" || !Number.isInteger((payload as { color?: unknown }).color))
		throw new ApiError({ code: "BAD_REQUEST", message: "Tag upsert requires an integer color" });
	const color = (payload as { color: number }).color;
	if (color < 0 || color > 255)
		throw new ApiError({ code: "BAD_REQUEST", message: "Tag color must be between 0 and 255" });
	return color;
}

function appliedDeleted(clientMutationId: string, revision: number): SyncMutationOutcome {
	return { clientMutationId, deleted: true, revision, status: "applied" };
}

function requireContent(mutation: SyncMutation): CreateContent {
	if (!mutation.content) throw new Error("An upsert sync mutation requires content");
	return mutation.content;
}
