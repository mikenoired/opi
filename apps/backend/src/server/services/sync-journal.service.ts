import type { Content } from "@synapse/shared/schemas";
import { and, asc, eq, gt } from "drizzle-orm";

import type { Context } from "../context";
import { syncChanges, syncEntities, syncMutationReceipts } from "../db/schema";

export interface DurableSyncChange {
	content?: Content;
	entityId: string;
	operation: "delete" | "upsert";
	revision: number;
}

/**
 * Persists a monotonic per-user content journal. SSE remains a fast hint, but
 * clients recover exclusively from this database-backed sequence after being
 * offline or after a process restart.
 */
export default class SyncJournalService {
	constructor(private readonly ctx: Context) {}

	async recordContent(content: Content): Promise<number> {
		return this.record(content.user_id, content.id, "upsert", content);
	}

	async recordDeletion(userId: string, contentId: string): Promise<number> {
		return this.record(userId, contentId, "delete");
	}

	async ensureSnapshot(content: Content): Promise<number> {
		const [withSource] = await this.ctx.db
			.select({
				deleted: syncEntities.deleted,
				revision: syncEntities.revision,
				sourceUpdatedAt: syncEntities.sourceUpdatedAt,
			})
			.from(syncEntities)
			.where(and(eq(syncEntities.userId, content.user_id), eq(syncEntities.contentId, content.id)))
			.limit(1);
		if (
			withSource &&
			!withSource.deleted &&
			withSource.sourceUpdatedAt?.toISOString() === new Date(content.updated_at).toISOString()
		)
			return withSource.revision;
		return this.record(content.user_id, content.id, "upsert", content);
	}

	/** Reconciles ordinary Web writes into the durable journal without trusting SSE delivery. */
	async reconcileSnapshot(contents: Content[]): Promise<void> {
		const userId = this.ctx.user!.id;
		const known = await this.ctx.db
			.select({ contentId: syncEntities.contentId, deleted: syncEntities.deleted })
			.from(syncEntities)
			.where(eq(syncEntities.userId, userId));
		const contentIds = new Set(contents.map((content) => content.id));
		for (const content of contents) await this.ensureSnapshot(content);
		for (const entity of known) {
			if (!entity.deleted && !contentIds.has(entity.contentId))
				await this.recordDeletion(userId, entity.contentId);
		}
	}

	async getRevision(
		userId: string,
		contentId: string
	): Promise<{ deleted: boolean; revision: number } | undefined> {
		const [entity] = await this.ctx.db
			.select({ deleted: syncEntities.deleted, revision: syncEntities.revision })
			.from(syncEntities)
			.where(and(eq(syncEntities.userId, userId), eq(syncEntities.contentId, contentId)))
			.limit(1);
		return entity;
	}

	async pull(
		userId: string,
		cursor: string | undefined
	): Promise<{ changes: DurableSyncChange[]; cursor: string }> {
		const after = parseCursor(cursor);
		const rows = await this.ctx.db
			.select({
				contentId: syncChanges.contentId,
				id: syncChanges.id,
				operation: syncChanges.operation,
				payload: syncChanges.payload,
				revision: syncChanges.revision,
			})
			.from(syncChanges)
			.where(and(eq(syncChanges.userId, userId), gt(syncChanges.id, after)))
			.orderBy(asc(syncChanges.id));
		const latestCursor = rows.at(-1)?.id ?? after;
		return {
			changes: rows.map((row) => ({
				...(row.operation === "upsert" && row.payload ? { content: row.payload as Content } : {}),
				entityId: row.contentId,
				operation: row.operation === "delete" ? "delete" : "upsert",
				revision: row.revision,
			})),
			cursor: String(latestCursor),
		};
	}

	async getLatestCursor(userId: string): Promise<string> {
		const rows = await this.ctx.db
			.select({ id: syncChanges.id })
			.from(syncChanges)
			.where(eq(syncChanges.userId, userId))
			.orderBy(asc(syncChanges.id));
		return String(rows.at(-1)?.id ?? 0);
	}

	async getReceipt<T>(userId: string, clientMutationId: string): Promise<T | undefined> {
		const [receipt] = await this.ctx.db
			.select({ result: syncMutationReceipts.result })
			.from(syncMutationReceipts)
			.where(
				and(
					eq(syncMutationReceipts.userId, userId),
					eq(syncMutationReceipts.clientMutationId, clientMutationId)
				)
			)
			.limit(1);
		return receipt?.result as T | undefined;
	}

	async saveReceipt(userId: string, clientMutationId: string, result: unknown): Promise<void> {
		await this.ctx.db
			.insert(syncMutationReceipts)
			.values({ clientMutationId, result, userId })
			.onConflictDoNothing();
	}

	private async record(userId: string, contentId: string, operation: "delete" | "upsert", content?: Content) {
		return this.ctx.db.transaction(async (tx) => {
			const [existing] = await tx
				.select({ revision: syncEntities.revision })
				.from(syncEntities)
				.where(and(eq(syncEntities.userId, userId), eq(syncEntities.contentId, contentId)))
				.limit(1);
			const revision = (existing?.revision ?? 0) + 1;
			await tx
				.insert(syncEntities)
				.values({
					contentId,
					deleted: operation === "delete",
					revision,
					sourceUpdatedAt: content ? new Date(content.updated_at) : null,
					updatedAt: new Date(),
					userId,
				})
				.onConflictDoUpdate({
					target: [syncEntities.userId, syncEntities.contentId],
					set: {
						deleted: operation === "delete",
						revision,
						sourceUpdatedAt: content ? new Date(content.updated_at) : null,
						updatedAt: new Date(),
					},
				});
			await tx.insert(syncChanges).values({
				contentId,
				operation,
				payload: content ?? null,
				revision,
				userId,
			});
			return revision;
		});
	}
}

function parseCursor(value: string | undefined): number {
	if (!value) return 0;
	const parsed = Number(value);
	return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}
