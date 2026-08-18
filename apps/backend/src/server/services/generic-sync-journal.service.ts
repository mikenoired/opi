import type { PullResult, SyncChange, SyncCursor } from "@monolyth/sync";

import type { Context } from "../context";
import { syncJournalEntries } from "../db/schema";
import SyncJournalRepository from "../repositories/sync-journal.repository";
import ContentService from "./content.service";

const DEFAULT_PAGE_SIZE = 250;

/** Read-only V2 journal runtime. Cursor decoding lives on the server only. */
export default class GenericSyncJournalService {
	private readonly journal: SyncJournalRepository;

	constructor(private readonly ctx: Context) {
		this.journal = new SyncJournalRepository(ctx.db);
	}

	async pull(afterCursor?: SyncCursor, limit = DEFAULT_PAGE_SIZE): Promise<PullResult> {
		const userId = this.ctx.user!.id;
		const after = parseCursor(afterCursor);
		const watermark = await this.journal.getWatermark(userId);
		if (!afterCursor || after < watermark)
			return this.reset(userId, afterCursor ? "cursor-expired" : "initial");
		const pageSize = Math.min(Math.max(limit, 1), DEFAULT_PAGE_SIZE);
		const rows = await this.journal.getChangesAfter(userId, after, pageSize + 1);
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
		await this.journal.pruneBefore(this.ctx.user!.id, beforeCursor);
	}

	async pruneRetained(): Promise<void> {
		await this.journal.pruneRetained(
			this.ctx.user!.id,
			new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
			100_000
		);
	}

	async getContentVersions(contentIds: string[]) {
		return this.journal.getEntityVersionsByIds(this.ctx.user!.id, "content", contentIds);
	}

	private async reset(userId: string, resetReason: "cursor-expired" | "initial"): Promise<PullResult> {
		const { cursor: resetCursor, snapshot } = await this.journal.readReset(userId, async (tx) => {
			const context = { ...this.ctx, db: tx } as unknown as Context;
			const content = new ContentService(context);
			return {
				contents: await content.getAllForSync(),
				tags: await content.getAllTagsForSync(),
				versions: await this.journal.getEntityVersions(tx, userId),
			};
		});
		const byKey = new Map(
			snapshot.versions
				.filter((entry) => !entry.deleted)
				.map((entry) => [`${entry.entityType}:${entry.entityId}`, entry])
		);
		return {
			changes: [...snapshot.contents, ...snapshot.tags].flatMap((entity) => {
				const entityType = "tag_ids" in entity ? "content" : "tag";
				const version = byKey.get(`${entityType}:${entity.id}`);
				return version
					? [
							{
								cursor: encodeCursor(resetCursor),
								entityId: entity.id,
								entityType,
								entityVersion: version.entityVersion,
								operation: "upsert" as const,
								payload: entity,
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
