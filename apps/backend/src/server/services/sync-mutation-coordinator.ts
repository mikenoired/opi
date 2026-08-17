import type { SyncMutation, SyncMutationOutcome } from "@synapse/api";
import type { Content, CreateContent } from "@synapse/shared/schemas";
import { and, eq, sql } from "drizzle-orm";

import type { Context } from "../context";
import {
	syncEntityVersions,
	syncJournalClock,
	syncJournalEntries,
	syncMutationReceiptsV2,
} from "../db/schema";
import { ApiError } from "../lib/api-error";
import ContentService from "./content.service";
import { SyncNotifierService } from "./sync-notifier.service";

/**
 * The one write seam for legacy content sync mutations. The old HTTP shape is
 * intentionally adapted here while clients migrate to the generic protocol.
 */
export class SyncMutationCoordinator {
	constructor(private readonly ctx: Context) {}

	async apply(mutation: SyncMutation): Promise<SyncMutationOutcome> {
		const userId = this.ctx.user!.id;
		const requestHash = JSON.stringify(mutation);
		const outcome = await this.ctx.db.transaction(async (tx) => {
			const claimed = await tx
				.insert(syncMutationReceiptsV2)
				.values({ mutationId: mutation.clientMutationId, requestHash, userId })
				.onConflictDoNothing()
				.returning({ mutationId: syncMutationReceiptsV2.mutationId });
			if (!claimed.length) {
				const [receipt] = await tx
					.select({
						outcome: syncMutationReceiptsV2.outcome,
						requestHash: syncMutationReceiptsV2.requestHash,
					})
					.from(syncMutationReceiptsV2)
					.where(
						and(
							eq(syncMutationReceiptsV2.userId, userId),
							eq(syncMutationReceiptsV2.mutationId, mutation.clientMutationId)
						)
					)
					.limit(1);
				if (!receipt || receipt.requestHash !== requestHash || !receipt.outcome)
					throw new ApiError({
						code: "CONFLICT",
						message: "Sync mutation id belongs to a different immutable intent",
					});
				return receipt.outcome as SyncMutationOutcome;
			}

			const entityId = mutation.remoteId;
			if (entityId) await this.lockEntity(tx, userId, entityId);
			const [entity] = entityId
				? await tx
						.select()
						.from(syncEntityVersions)
						.where(
							and(
								eq(syncEntityVersions.userId, userId),
								eq(syncEntityVersions.entityType, "content"),
								eq(syncEntityVersions.entityId, entityId)
							)
						)
						.limit(1)
				: [];
			if (
				entityId &&
				(!entity ||
					entity.deleted ||
					(mutation.baseRevision !== undefined && mutation.baseRevision !== entity.entityVersion))
			) {
				const outcome = await this.conflict(mutation, entity?.entityVersion, entity?.deleted);
				await this.finalize(tx, userId, mutation.clientMutationId, outcome);
				return outcome;
			}

			const context = { ...this.ctx, db: tx } as unknown as Context;
			const content = new ContentService(context);
			let outcome: SyncMutationOutcome;
			if (!entityId) {
				if (mutation.kind === "delete") outcome = appliedDeleted(mutation.clientMutationId, 0);
				else {
					const created = await content.create(requireContent(mutation));
					const revision = await this.append(
						tx,
						userId,
						created.id,
						created,
						"upsert",
						mutation.clientMutationId,
						0
					);
					outcome = {
						clientMutationId: mutation.clientMutationId,
						content: created,
						revision,
						status: "applied",
					};
				}
			} else if (mutation.kind === "delete") {
				await content.delete(entityId);
				const revision = await this.append(
					tx,
					userId,
					entityId,
					undefined,
					"delete",
					mutation.clientMutationId,
					entity!.entityVersion
				);
				outcome = appliedDeleted(mutation.clientMutationId, revision);
			} else {
				const updated = await content.update({ ...requireContent(mutation), id: entityId });
				const revision = await this.append(
					tx,
					userId,
					updated.id,
					updated,
					"upsert",
					mutation.clientMutationId,
					entity!.entityVersion
				);
				outcome = {
					clientMutationId: mutation.clientMutationId,
					content: updated,
					revision,
					status: "applied",
				};
			}
			await this.finalize(tx, userId, mutation.clientMutationId, outcome);
			return outcome;
		});
		const [entry] = await this.ctx.db
			.select({ cursor: syncJournalEntries.cursor })
			.from(syncJournalEntries)
			.where(
				and(
					eq(syncJournalEntries.userId, userId),
					eq(syncJournalEntries.mutationId, mutation.clientMutationId)
				)
			)
			.limit(1);
		if (entry) await new SyncNotifierService(this.ctx).notify(userId, `j:${entry.cursor}`);
		return outcome;
	}

	private async append(
		tx: any,
		userId: string,
		entityId: string,
		content: Content | undefined,
		operation: "delete" | "upsert",
		mutationId: string,
		previousVersion: number
	): Promise<number> {
		const entityVersion = previousVersion + 1;
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
				deleted: operation === "delete",
				entityId,
				entityType: "content",
				entityVersion,
				userId,
			})
			.onConflictDoUpdate({
				target: [syncEntityVersions.userId, syncEntityVersions.entityType, syncEntityVersions.entityId],
				set: { deleted: operation === "delete", entityVersion, updatedAt: new Date() },
			});
		await tx.insert(syncJournalEntries).values({
			cursor: clock.cursor,
			entityId,
			entityType: "content",
			entityVersion,
			mutationId,
			operation,
			payload: content ?? null,
			userId,
		});
		return entityVersion;
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

	private async finalize(
		tx: any,
		userId: string,
		mutationId: string,
		outcome: SyncMutationOutcome
	): Promise<void> {
		await tx
			.update(syncMutationReceiptsV2)
			.set({ completedAt: new Date(), outcome, status: "finalized" })
			.where(
				and(eq(syncMutationReceiptsV2.userId, userId), eq(syncMutationReceiptsV2.mutationId, mutationId))
			);
	}

	private async lockEntity(tx: any, userId: string, entityId: string): Promise<void> {
		await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`${userId}:content:${entityId}`}))`);
	}
}

function appliedDeleted(clientMutationId: string, revision: number): SyncMutationOutcome {
	return { clientMutationId, deleted: true, revision, status: "applied" };
}

function requireContent(mutation: SyncMutation): CreateContent {
	if (!mutation.content) throw new Error("An upsert sync mutation requires content");
	return mutation.content;
}
