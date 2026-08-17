import type { PullResult, SyncChange, SyncCursor } from "@synapse/sync";
import { and, asc, eq, gt, sql } from "drizzle-orm";

import type { Context } from "../context";
import {
	syncEntityVersions,
	syncJournalClock,
	syncJournalEntries,
	syncRetentionWatermarks,
} from "../db/schema";
import ContentService from "./content.service";

const DEFAULT_PAGE_SIZE = 250;

/** Read-only V2 journal runtime. Cursor decoding lives on the server only. */
export class GenericSyncJournalService {
	constructor(private readonly ctx: Context) {}

	async pull(afterCursor?: SyncCursor, limit = DEFAULT_PAGE_SIZE): Promise<PullResult> {
		const userId = this.ctx.user!.id;
		const after = parseCursor(afterCursor);
		const [watermark] = await this.ctx.db
			.select({ cursor: syncRetentionWatermarks.oldestRetainedCursor })
			.from(syncRetentionWatermarks)
			.where(eq(syncRetentionWatermarks.userId, userId))
			.limit(1);
		if (!afterCursor || after < (watermark?.cursor ?? 0))
			return this.reset(userId, afterCursor ? "cursor-expired" : "initial");
		const pageSize = Math.min(Math.max(limit, 1), DEFAULT_PAGE_SIZE);
		const rows = await this.ctx.db
			.select()
			.from(syncJournalEntries)
			.where(and(eq(syncJournalEntries.userId, userId), gt(syncJournalEntries.cursor, after)))
			.orderBy(asc(syncJournalEntries.cursor))
			.limit(pageSize + 1);
		const changes = rows.slice(0, pageSize);
		return {
			changes: changes.map(toChange),
			cursor: encodeCursor(changes.at(-1)?.cursor ?? after),
			hasMore: rows.length > changes.length,
			kind: "changes",
		};
	}

	/** Pruning moves the explicit floor before deleting entries so a client never gets a partial stream. */
	async prune(beforeCursor: number): Promise<void> {
		const userId = this.ctx.user!.id;
		await this.ctx.db.transaction(async (tx) => {
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

	private async reset(userId: string, resetReason: "cursor-expired" | "initial"): Promise<PullResult> {
		const [[latest], [watermark], [clock]] = await Promise.all([
			this.ctx.db
				.select({ cursor: sql<number>`coalesce(max(${syncJournalEntries.cursor}), 0)` })
				.from(syncJournalEntries)
				.where(eq(syncJournalEntries.userId, userId)),
			this.ctx.db
				.select({ cursor: syncRetentionWatermarks.oldestRetainedCursor })
				.from(syncRetentionWatermarks)
				.where(eq(syncRetentionWatermarks.userId, userId))
				.limit(1),
			this.ctx.db
				.select({ cursor: syncJournalClock.nextCursor })
				.from(syncJournalClock)
				.where(eq(syncJournalClock.id, true))
				.limit(1),
		]);
		// A reset snapshot represents state at this clock instant. With all of a
		// user's old entries pruned, max(user entries) is zero; using the global
		// clock prevents the next pull from repeatedly falling below retention.
		const resetCursor = Math.max(latest?.cursor ?? 0, watermark?.cursor ?? 0, clock?.cursor ?? 0);
		const contents = await new ContentService(this.ctx).getAllForSync();
		const versions = await this.ctx.db
			.select()
			.from(syncEntityVersions)
			.where(and(eq(syncEntityVersions.userId, userId), eq(syncEntityVersions.entityType, "content")));
		const byId = new Map(versions.filter((entry) => !entry.deleted).map((entry) => [entry.entityId, entry]));
		return {
			changes: contents.flatMap((content) => {
				const version = byId.get(content.id);
				return version
					? [
							{
								cursor: encodeCursor(resetCursor),
								entityId: content.id,
								entityType: "content",
								entityVersion: version.entityVersion,
								operation: "upsert" as const,
								payload: content,
							},
						]
					: [];
			}),
			cursor: encodeCursor(resetCursor),
			kind: "reset",
			resetReason,
		};
	}
}

function toChange(row: typeof syncJournalEntries.$inferSelect): SyncChange {
	return {
		cursor: encodeCursor(row.cursor),
		entityId: row.entityId,
		entityType: row.entityType,
		entityVersion: row.entityVersion,
		mutationId: row.mutationId ?? undefined,
		operation: row.operation === "delete" ? "delete" : "upsert",
		payload: row.payload,
	};
}

function parseCursor(cursor: SyncCursor | undefined): number {
	if (!cursor) return 0;
	// Desktop v2.0 persisted the old numeric journal id. Accept it once at
	// this compatibility seam; every response writes the opaque j:<id> form.
	const match = /^(?:j:)?(\d+)$/.exec(cursor);
	if (!match) throw new Error("Invalid sync cursor");
	const value = Number(match[1]);
	if (!Number.isSafeInteger(value) || value < 0) throw new Error("Invalid sync cursor");
	return value;
}

function encodeCursor(cursor: number): SyncCursor {
	return `j:${cursor}`;
}
