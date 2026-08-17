import { and, asc, eq, gt, gte, inArray, sql } from "drizzle-orm";

import type { Context } from "../context";
import {
	syncEntityVersions,
	syncJournalClock,
	syncJournalEntries,
	syncMutationReceiptsV2,
	syncRetentionWatermarks,
} from "../db/schema";

type Database = Context["db"];
export type SyncJournalTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

export type JournalOperation = "delete" | "upsert";

export interface JournalAppendCommand {
	entityId: string;
	entityType: string;
	mutationId?: string;
	operation: JournalOperation;
	payload?: unknown;
	previousVersion: number;
	userId: string;
}

/** Authorization-scoped persistence for the generic journal and its receipts. */
export default class SyncJournalRepository {
	constructor(private readonly database: Database) {}

	async getWatermark(userId: string) {
		const [row] = await this.database
			.select({ cursor: syncRetentionWatermarks.oldestRetainedCursor })
			.from(syncRetentionWatermarks)
			.where(eq(syncRetentionWatermarks.userId, userId))
			.limit(1);
		return row?.cursor ?? 0;
	}

	async getChangesAfter(userId: string, cursor: number, limit: number) {
		return this.database
			.select()
			.from(syncJournalEntries)
			.where(and(eq(syncJournalEntries.userId, userId), gt(syncJournalEntries.cursor, cursor)))
			.orderBy(asc(syncJournalEntries.cursor))
			.limit(limit);
	}

	async readReset<T>(
		userId: string,
		readSnapshot: (tx: SyncJournalTransaction) => Promise<T>
	): Promise<{
		snapshot: T;
		cursor: number;
	}> {
		return this.database.transaction(async (tx) => {
			// Must be the first statement: the snapshot and high-water cursor belong
			// to one repeatable-read view, even while writers are committing.
			await tx.execute(sql`SET TRANSACTION ISOLATION LEVEL REPEATABLE READ`);
			const [snapshot, latest, watermark, clock] = await Promise.all([
				readSnapshot(tx),
				tx
					.select({ cursor: sql<number>`coalesce(max(${syncJournalEntries.cursor}), 0)` })
					.from(syncJournalEntries),
				tx
					.select({ cursor: syncRetentionWatermarks.oldestRetainedCursor })
					.from(syncRetentionWatermarks)
					.where(eq(syncRetentionWatermarks.userId, userId))
					.limit(1),
				tx
					.select({ cursor: syncJournalClock.nextCursor })
					.from(syncJournalClock)
					.where(eq(syncJournalClock.id, true))
					.limit(1),
			]);
			return {
				cursor: Math.max(latest[0]?.cursor ?? 0, watermark[0]?.cursor ?? 0, clock[0]?.cursor ?? 0),
				snapshot,
			};
		});
	}

	async getEntityVersions(tx: SyncJournalTransaction, userId: string) {
		return tx.select().from(syncEntityVersions).where(eq(syncEntityVersions.userId, userId));
	}

	async getEntityVersionsByIds(userId: string, entityType: string, entityIds: string[]) {
		if (!entityIds.length) return [];
		return this.database
			.select({ entityId: syncEntityVersions.entityId, entityVersion: syncEntityVersions.entityVersion })
			.from(syncEntityVersions)
			.where(
				and(
					eq(syncEntityVersions.userId, userId),
					eq(syncEntityVersions.entityType, entityType),
					inArray(syncEntityVersions.entityId, entityIds)
				)
			);
	}

	async findEntityVersion(tx: SyncJournalTransaction, userId: string, entityType: string, entityId: string) {
		const [entity] = await tx
			.select()
			.from(syncEntityVersions)
			.where(
				and(
					eq(syncEntityVersions.userId, userId),
					eq(syncEntityVersions.entityType, entityType),
					eq(syncEntityVersions.entityId, entityId)
				)
			)
			.limit(1);
		return entity;
	}

	async append(
		tx: SyncJournalTransaction,
		command: JournalAppendCommand
	): Promise<{ cursor: number; entityVersion: number }> {
		const entityVersion = command.previousVersion + 1;
		await tx.insert(syncJournalClock).values({ id: true, nextCursor: 0 }).onConflictDoNothing();
		const [clock] = await tx
			.update(syncJournalClock)
			.set({ nextCursor: sql`${syncJournalClock.nextCursor} + 1` })
			.where(eq(syncJournalClock.id, true))
			.returning({ cursor: syncJournalClock.nextCursor });
		if (!clock) throw new Error("Sync journal clock is not initialized");
		await tx
			.insert(syncEntityVersions)
			.values({
				deleted: command.operation === "delete",
				entityId: command.entityId,
				entityType: command.entityType,
				entityVersion,
				userId: command.userId,
			})
			.onConflictDoUpdate({
				target: [syncEntityVersions.userId, syncEntityVersions.entityType, syncEntityVersions.entityId],
				set: { deleted: command.operation === "delete", entityVersion, updatedAt: new Date() },
			});
		await tx.insert(syncJournalEntries).values({
			cursor: clock.cursor,
			entityId: command.entityId,
			entityType: command.entityType,
			entityVersion,
			mutationId: command.mutationId,
			operation: command.operation,
			payload: command.payload ?? null,
			userId: command.userId,
		});
		return { cursor: clock.cursor, entityVersion };
	}

	async claimReceipt(tx: SyncJournalTransaction, userId: string, mutationId: string, requestHash: string) {
		return tx
			.insert(syncMutationReceiptsV2)
			.values({ mutationId, requestHash, userId })
			.onConflictDoNothing()
			.returning({ mutationId: syncMutationReceiptsV2.mutationId });
	}

	async getReceipt(tx: SyncJournalTransaction, userId: string, mutationId: string) {
		const [receipt] = await tx
			.select({ outcome: syncMutationReceiptsV2.outcome, requestHash: syncMutationReceiptsV2.requestHash })
			.from(syncMutationReceiptsV2)
			.where(
				and(eq(syncMutationReceiptsV2.userId, userId), eq(syncMutationReceiptsV2.mutationId, mutationId))
			)
			.limit(1);
		return receipt;
	}

	async finalizeReceipt(
		tx: SyncJournalTransaction,
		userId: string,
		mutationId: string,
		outcome: unknown
	): Promise<void> {
		await tx
			.update(syncMutationReceiptsV2)
			.set({ completedAt: new Date(), outcome, status: "finalized" })
			.where(
				and(eq(syncMutationReceiptsV2.userId, userId), eq(syncMutationReceiptsV2.mutationId, mutationId))
			);
	}

	async findMutationCursor(userId: string, mutationId: string) {
		const [entry] = await this.database
			.select({ cursor: syncJournalEntries.cursor })
			.from(syncJournalEntries)
			.where(and(eq(syncJournalEntries.userId, userId), eq(syncJournalEntries.mutationId, mutationId)))
			.limit(1);
		return entry?.cursor;
	}

	async pruneRetained(userId: string, cutoff: Date, minimumEntries: number): Promise<void> {
		const [timeBoundary] = await this.database
			.select({ cursor: syncJournalEntries.cursor })
			.from(syncJournalEntries)
			.where(and(eq(syncJournalEntries.userId, userId), gte(syncJournalEntries.createdAt, cutoff)))
			.orderBy(asc(syncJournalEntries.cursor))
			.limit(1);
		const recent = await this.database
			.select({ cursor: syncJournalEntries.cursor })
			.from(syncJournalEntries)
			.where(eq(syncJournalEntries.userId, userId))
			.orderBy(sql`${syncJournalEntries.cursor} desc`)
			.limit(minimumEntries);
		const countBoundary = recent.at(-1)?.cursor;
		const beforeCursor = Math.min(timeBoundary?.cursor ?? Infinity, countBoundary ?? Infinity);
		if (!Number.isFinite(beforeCursor)) return;
		const [prunable] = await this.database
			.select({ cursor: syncJournalEntries.cursor })
			.from(syncJournalEntries)
			.where(and(eq(syncJournalEntries.userId, userId), sql`${syncJournalEntries.cursor} < ${beforeCursor}`))
			.limit(1);
		if (!prunable) return;
		await this.pruneBefore(userId, beforeCursor);
	}

	async pruneBefore(userId: string, beforeCursor: number): Promise<void> {
		await this.database.transaction(async (tx) => {
			await tx.insert(syncJournalClock).values({ id: true, nextCursor: 0 }).onConflictDoNothing();
			await tx
				.update(syncJournalClock)
				.set({ nextCursor: sql`greatest(${syncJournalClock.nextCursor}, ${beforeCursor})` })
				.where(eq(syncJournalClock.id, true));
			await tx
				.insert(syncRetentionWatermarks)
				.values({ oldestRetainedCursor: beforeCursor, userId })
				.onConflictDoUpdate({
					target: syncRetentionWatermarks.userId,
					set: { oldestRetainedCursor: beforeCursor, updatedAt: new Date() },
				});
			await tx
				.delete(syncJournalEntries)
				.where(
					and(eq(syncJournalEntries.userId, userId), sql`${syncJournalEntries.cursor} < ${beforeCursor}`)
				);
		});
	}
}
