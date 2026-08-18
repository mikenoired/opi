import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import type { SyncMutation } from "@monolyth/api";
import { parseAudioJson, parseMediaJson } from "@monolyth/core";
import {
	DEFAULT_USER_PREFERENCES,
	normalizeUserPreferences,
	type UserPreferences,
	type UserPreferencesInput,
} from "@monolyth/shared/preferences";
import type { Content, CreateContent } from "@monolyth/shared/schemas";

export type LocalContentType = Content["type"];
export type SyncPolicy = "manual" | "automatic";
export type ColorScheme = "dark" | "light" | "system";
export type SyncState = "local-only" | "queued" | "synced" | "failed" | "remote-deleted";

/**
 * A local content projection deliberately keeps its device ID separate from the
 * server ID. That makes a retried create idempotent and lets a conflict retain
 * a local copy even when the server record wins.
 */
export interface LocalItem extends Content {
	assets?: LocalAsset[];
	conflictOf?: string;
	deleted?: boolean;
	remoteId?: string;
	serverRevision?: number;
	syncState: SyncState;
	syncVersion?: number;
	lastSyncedAt?: string;
}

export interface LocalAsset {
	assetId: string;
	checksum: string;
	localObjectName: string;
	mimeType: string;
	size: number;
	storageKey: string;
}

export interface LocalSettings {
	colorScheme: ColorScheme;
	preferences: UserPreferences;
	syncPolicy: SyncPolicy;
}

export interface LocalStatistics {
	conflictCount: number;
	itemCount: number;
	lastUpdatedAt: string | null;
	localBytes: number;
	pendingSyncCount: number;
	tagCount: number;
}

export interface LocalOutboxEntry {
	attempts: number;
	createdAt: string;
	id: string;
	itemId: string;
	/** Binary media remains on the dedicated upload pipeline, never in SyncEngine payloads. */
	localBinary?: boolean;
	mutation: SyncMutation;
}

export interface LocalTag {
	color: number;
	id: string;
	pendingColor?: boolean;
	remoteId?: string;
	title: string;
}

interface LocalLibraryDataV2 {
	items: LocalItem[];
	outbox: LocalOutboxEntry[];
	settings: LocalSettings;
	sync: {
		bulkDeleteRequested?: boolean;
		cursor?: string;
		lastSyncedAt?: string;
	};
	tags: LocalTag[];
	version: 2;
}

export interface RemoteReplicaChange {
	assets?: LocalAsset[];
	content?: Content;
	entityId: string;
	operation: "delete" | "upsert";
	revision: number;
}

const mutationQueues = new Map<string, Promise<void>>();

interface LegacyLocalItem {
	content: string;
	createdAt: string;
	id: string;
	remoteId?: string;
	syncState: SyncState;
	tags: string[];
	title: string;
	type: "link" | "note" | "todo";
	updatedAt: string;
	url?: string;
}

interface LegacyLocalLibraryData {
	items?: LegacyLocalItem[];
	settings?: Partial<LocalSettings>;
	version?: number;
}

/** Compatibility input retained for import and all platform UI bindings. */
export type LocalItemInput = Pick<CreateContent, "content" | "tags" | "title" | "type" | "url"> &
	Partial<
		Pick<CreateContent, "document_images" | "media_type" | "media_url" | "thumbnail_base64" | "thumbnail_url">
	>;

/**
 * Durable local content/graph repository. UI and IPC only deal in its public
 * operations; journal writes and conflict preservation cannot be skipped by a
 * renderer crash or an interrupted synchronization.
 */
export class LocalLibraryRepository {
	private readonly dataPath: string;

	constructor(rootDirectory: string) {
		this.dataPath = join(rootDirectory, "library.json");
	}

	async list(search?: string): Promise<LocalItem[]> {
		const data = await this.read();
		const query = search?.trim().toLocaleLowerCase();
		const items = data.items.filter((item) => {
			if (item.deleted) return false;
			if (!query) return true;
			return [item.title, item.content, item.tags.join(" ")].join(" ").toLocaleLowerCase().includes(query);
		});
		return [...items].sort((left, right) => right.updated_at.localeCompare(left.updated_at));
	}

	async get(id: string): Promise<LocalItem> {
		const item = (await this.read()).items.find((candidate) => candidate.id === id && !candidate.deleted);
		if (!item) throw new Error("Local item not found");
		return item;
	}

	async save(input: LocalItemInput & { id?: string }): Promise<LocalItem> {
		return this.mutate((data) => {
			const now = new Date().toISOString();
			const existing = input.id
				? data.items.find((item) => item.id === input.id && !item.deleted)
				: undefined;
			const remoteWasDeleted = existing?.syncState === "remote-deleted";
			const containsLocalObject = hasLocalObjectReference({
				...existing,
				...input,
			});
			const tags = normalizeTags(input.tags ?? []);
			const tagIds = tags.map((title) => ensureTag(data.tags, title));
			const item: LocalItem = {
				content: input.content.trim(),
				created_at: existing?.created_at ?? now,
				id: existing?.id ?? randomUUID(),
				media_type: input.media_type ?? existing?.media_type,
				media_url: input.media_url ?? existing?.media_url,
				remoteId: remoteWasDeleted ? undefined : existing?.remoteId,
				serverRevision: remoteWasDeleted ? undefined : existing?.serverRevision,
				syncState: containsLocalObject
					? "local-only"
					: remoteWasDeleted
						? "local-only"
						: existing?.remoteId
							? "queued"
							: data.settings.syncPolicy === "automatic"
								? "queued"
								: "local-only",
				tag_ids: tagIds,
				tags,
				thumbnail_base64: input.thumbnail_base64 ?? existing?.thumbnail_base64,
				thumbnail_url: input.thumbnail_url ?? existing?.thumbnail_url,
				title: input.title?.trim() || "Без названия",
				type: input.type,
				updated_at: now,
				url: input.url?.trim() || undefined,
				user_id: existing?.user_id ?? "local",
				...(input.document_images === undefined ? {} : { document_images: input.document_images }),
			};
			data.items = existing
				? data.items.map((candidate) => (candidate.id === item.id ? item : candidate))
				: [...data.items, item];

			if (
				!containsLocalObject &&
				!remoteWasDeleted &&
				(existing?.remoteId || data.settings.syncPolicy === "automatic")
			)
				this.replaceOutboxEntry(data, item);
			return item;
		});
	}

	/** A deletion is journaled until the remote acknowledgement is durable. */
	async delete(id: string): Promise<void> {
		return this.mutate((data) => this.deleteFromData(data, id));
	}

	/** Queues durable tombstones for every synced item; local-only records are removed immediately. */
	async deleteAll(): Promise<void> {
		return this.mutate((data) => {
			const ids = data.items.filter((item) => !item.deleted).map((item) => item.id);
			for (const id of ids) this.deleteFromData(data, id);
			data.sync.bulkDeleteRequested = true;
		});
	}

	async hasBulkDeleteRequest(): Promise<boolean> {
		return Boolean((await this.read()).sync.bulkDeleteRequested);
	}

	async acknowledgeBulkDelete(): Promise<void> {
		return this.mutate((data) => {
			data.sync.bulkDeleteRequested = false;
			data.items = [];
			data.outbox = [];
		});
	}

	async queueSync(id: string): Promise<LocalItem> {
		return this.mutate((data) => {
			const item = data.items.find((candidate) => candidate.id === id && !candidate.deleted);
			if (!item) throw new Error("Local item not found");
			if (hasLocalObjectReference(item)) {
				throw new Error("Синхронизация локальных вложений появится вместе с передачей бинарных объектов");
			}
			const queued = { ...item, syncState: "queued" as const };
			data.items = data.items.map((candidate) => (candidate.id === id ? queued : candidate));
			this.replaceOutboxEntry(data, queued);
			return queued;
		});
	}

	async updateSync(id: string, input: Pick<LocalItem, "remoteId" | "syncState">): Promise<LocalItem> {
		return this.mutate((data) => {
			const existing = data.items.find((item) => item.id === id);
			if (!existing) throw new Error("Local item not found");
			const item = {
				...existing,
				...input,
				updated_at: new Date().toISOString(),
			};
			data.items = data.items.map((candidate) => (candidate.id === id ? item : candidate));
			return item;
		});
	}

	async getPendingOperations(): Promise<LocalOutboxEntry[]> {
		const data = await this.read();
		return data.outbox.map((entry) => ({
			...entry,
			localBinary: hasLocalObjectReference(data.items.find((item) => item.id === entry.itemId) ?? {}),
		}));
	}

	/** Durable acknowledgement used by the generic SyncEngine adapter. Canonical
	 * pull immediately follows it and links the local device id to server id. */
	acknowledgeMutation(mutationId: string): Promise<void> {
		return this.mutate((data) => {
			data.outbox = data.outbox.filter((entry) => entry.mutation.clientMutationId !== mutationId);
		});
	}

	retainMutation(mutationId: string): Promise<void> {
		return this.mutate((data) => {
			const entry = data.outbox.find((candidate) => candidate.mutation.clientMutationId === mutationId);
			if (entry) entry.attempts += 1;
		});
	}

	async getTags(): Promise<LocalTag[]> {
		return (await this.read()).tags;
	}

	async updateTagColor(id: string, color: number): Promise<LocalTag> {
		return this.mutate((data) => {
			const tag = data.tags.find((candidate) => candidate.id === id || candidate.remoteId === id);
			if (!tag) throw new Error("Local tag not found");
			tag.color = color;
			tag.pendingColor = true;
			return tag;
		});
	}

	/** Merge server tags by normalized title so a local provisional ID never creates a duplicate. */
	async mergeRemoteTags(
		remoteTags: Array<{ color: number; id: string; title: string }>
	): Promise<LocalTag[]> {
		return this.mutate((data) => {
			const byTitle = new Map<string, LocalTag>();
			for (const tag of data.tags) {
				const key = normalizeTagTitle(tag.title);
				const existing = byTitle.get(key);
				if (!existing) byTitle.set(key, tag);
				else if (!existing.pendingColor && tag.pendingColor) byTitle.set(key, tag);
			}
			for (const remote of remoteTags) {
				const key = normalizeTagTitle(remote.title);
				const local = byTitle.get(key);
				if (local) {
					local.remoteId = remote.id;
					local.title = remote.title;
					if (!local.pendingColor) local.color = remote.color;
				} else {
					byTitle.set(key, {
						color: remote.color,
						id: remote.id,
						remoteId: remote.id,
						title: remote.title,
					});
				}
			}
			data.tags = [...byTitle.values()];
			for (const item of data.items) {
				item.tag_ids = item.tags.map(
					(title) => byTitle.get(normalizeTagTitle(title))?.id ?? stableLocalTagId(title)
				);
			}
			return data.tags;
		});
	}

	async getPendingTagColors(): Promise<LocalTag[]> {
		return (await this.read()).tags.filter((tag) => tag.pendingColor && tag.remoteId);
	}

	async acknowledgeTagColor(id: string, color: number): Promise<void> {
		return this.mutate((data) => {
			const tag = data.tags.find((candidate) => candidate.id === id || candidate.remoteId === id);
			if (!tag) return;
			tag.color = color;
			tag.pendingColor = false;
		});
	}

	/** Imported media stays local until Sync is requested; queue it just before the run. */
	async queueLocalAttachmentsForSync(): Promise<void> {
		return this.mutate((data) => {
			for (const item of data.items) {
				if (
					!item.deleted &&
					(item.type === "media" || item.type === "audio") &&
					hasLocalObjectReference(item) &&
					!data.outbox.some((entry) => entry.itemId === item.id)
				)
					this.replaceOutboxEntry(data, item);
			}
		});
	}

	async markOperationFailed(id: string): Promise<void> {
		return this.mutate((data) => {
			const entry = data.outbox.find((candidate) => candidate.id === id);
			if (!entry) return;
			entry.attempts += 1;
			const item = data.items.find((candidate) => candidate.id === entry.itemId);
			if (item) item.syncState = "failed";
		});
	}

	async acknowledgeOperation(
		entryId: string,
		remote: Content | undefined,
		revision: number,
		deleted = false
	): Promise<void> {
		return this.mutate((data) => {
			const entry = data.outbox.find((candidate) => candidate.id === entryId);
			if (!entry) return;
			const current = data.items.find((item) => item.id === entry.itemId);
			if (deleted) {
				data.items = data.items.filter((item) => item.id !== entry.itemId);
			} else if (remote && current) {
				data.items = data.items.map((item) =>
					item.id === entry.itemId
						? {
								...remote,
								id: entry.itemId,
								remoteId: remote.id,
								serverRevision: revision,
								syncState: "synced",
							}
						: item
				);
			}
			data.outbox = data.outbox.filter((candidate) => candidate.id !== entryId);
		});
	}

	getAssets(remoteId: string): Promise<LocalAsset[]> {
		return this.read().then((data) => data.items.find((item) => item.remoteId === remoteId)?.assets ?? []);
	}

	/** Server wins. The complete local revision is retained as an unsynced, local-only conflict copy. */
	async resolveConflict(entryId: string, remote: Content, revision: number): Promise<string> {
		return this.mutate((data) => resolveConflictInData(data, entryId, remote, revision));
	}

	applyRemoteChange(change: RemoteReplicaChange): Promise<string | undefined> {
		return this.mutate((data) => applyRemoteChangeToData(data, change));
	}

	/** Applies one canonical transaction and advances its cursor in the same durable file replacement. */
	applyRemoteBatch(
		changes: RemoteReplicaChange[],
		cursor: string | undefined,
		replaceFromSnapshot = false
	): Promise<void> {
		return this.mutate((data) => {
			if (replaceFromSnapshot) {
				const retainedIds = new Set(data.outbox.map((entry) => entry.itemId));
				data.items = data.items.filter((item) => !item.remoteId || retainedIds.has(item.id));
			}
			for (const change of changes) applyRemoteChangeToData(data, change);
			if (cursor) data.sync = { cursor, lastSyncedAt: new Date().toISOString() };
		});
	}

	/** Stores device-local asset references only when this is still the remote revision
	 * that requested them. Binary download completion must not overwrite newer metadata. */
	async applyHydratedAssets(
		remoteId: string,
		revision: number,
		assets: LocalAsset[],
		content: Content
	): Promise<void> {
		return this.mutate((data) => {
			const local = data.items.find(
				(item) => item.remoteId === remoteId && item.serverRevision === revision && !item.deleted
			);
			if (!local) return;
			data.items = data.items.map((item) =>
				item.id === local.id
					? {
							...item,
							...content,
							assets,
							id: item.id,
							remoteId,
							syncState: "synced",
							syncVersion: revision,
						}
					: item
			);
		});
	}

	async getSyncCursor(): Promise<string | undefined> {
		return (await this.read()).sync.cursor;
	}

	setSyncCursor(cursor: string): Promise<void> {
		return this.mutate((data) => {
			data.sync = { cursor, lastSyncedAt: new Date().toISOString() };
		});
	}

	async getSettings(): Promise<LocalSettings> {
		return (await this.read()).settings;
	}

	async updateSettings(settings: Partial<LocalSettings>): Promise<LocalSettings> {
		return this.mutate((data) => {
			if (settings.syncPolicy) data.settings.syncPolicy = settings.syncPolicy;
			if (settings.colorScheme) data.settings.colorScheme = settings.colorScheme;
			if (settings.preferences)
				data.settings.preferences = normalizeUserPreferences({
					...data.settings.preferences,
					...settings.preferences,
				});
			return data.settings;
		});
	}

	async getPreferences(): Promise<UserPreferences> {
		return (await this.read()).settings.preferences;
	}

	async updatePreferences(preferences: UserPreferencesInput): Promise<UserPreferences> {
		return this.mutate((data) => {
			data.settings.preferences = normalizeUserPreferences({
				...data.settings.preferences,
				...preferences,
			});
			return data.settings.preferences;
		});
	}

	async getStatistics(): Promise<LocalStatistics> {
		const data = await this.read();
		const active = data.items.filter((item) => !item.deleted);
		return {
			conflictCount: active.filter((item) => Boolean(item.conflictOf)).length,
			itemCount: active.length,
			lastUpdatedAt: active.reduce<string | null>(
				(latest, item) => (!latest || item.updated_at > latest ? item.updated_at : latest),
				null
			),
			localBytes: await this.getLocalBytes(),
			pendingSyncCount: data.outbox.length,
			tagCount: new Set(active.flatMap((item) => item.tags.map((tag) => tag.toLocaleLowerCase()))).size,
		};
	}

	private replaceOutboxEntry(
		data: LocalLibraryDataV2,
		item: LocalItem,
		kind: "delete" | "upsert" = "upsert"
	) {
		const previous = data.outbox.find((entry) => entry.itemId === item.id);
		const mutation: SyncMutation =
			kind === "delete"
				? {
						baseRevision: item.serverRevision,
						// An idempotency key identifies one immutable intent. Replacing a
						// queued edit or turning it into a tombstone must get a new key.
						clientMutationId: randomUUID(),
						kind,
						remoteId: item.remoteId,
					}
				: {
						baseRevision: item.serverRevision,
						clientMutationId: randomUUID(),
						content: toCreateContent(item),
						kind,
						remoteId: item.remoteId,
					};
		const entry: LocalOutboxEntry = {
			attempts: previous?.attempts ?? 0,
			createdAt: previous?.createdAt ?? new Date().toISOString(),
			id: previous?.id ?? randomUUID(),
			itemId: item.id,
			mutation,
		};
		data.outbox = [...data.outbox.filter((candidate) => candidate.itemId !== item.id), entry];
	}

	private deleteFromData(data: LocalLibraryDataV2, id: string): void {
		const existing = data.items.find((item) => item.id === id && !item.deleted);
		if (!existing) return;
		if (!existing.remoteId) {
			data.items = data.items.filter((item) => item.id !== id);
			data.outbox = data.outbox.filter((entry) => entry.itemId !== id);
			return;
		}
		const tombstone: LocalItem = {
			...existing,
			deleted: true,
			syncState: "queued",
			updated_at: new Date().toISOString(),
		};
		data.items = data.items.map((item) => (item.id === id ? tombstone : item));
		this.replaceOutboxEntry(data, tombstone, "delete");
	}

	private async read(): Promise<LocalLibraryDataV2> {
		try {
			const parsed = JSON.parse(await readFile(this.dataPath, "utf8")) as
				| LocalLibraryDataV2
				| LegacyLocalLibraryData;
			return isV2(parsed) ? normalizeV2(parsed) : migrateV1(parsed);
		} catch (error) {
			if (isMissingFileError(error)) return emptyLibrary();
			throw error;
		}
	}

	private async write(data: LocalLibraryDataV2): Promise<void> {
		await mkdir(dirname(this.dataPath), { recursive: true });
		const temporaryPath = `${this.dataPath}.next`;
		await writeFile(temporaryPath, JSON.stringify(data), "utf8");
		await rename(temporaryPath, this.dataPath);
	}

	private mutate<T>(action: (data: LocalLibraryDataV2) => T | Promise<T>): Promise<T> {
		const previous = mutationQueues.get(this.dataPath) ?? Promise.resolve();
		const operation = previous.then(async () => {
			const data = await this.read();
			const result = await action(data);
			await this.write(data);
			return result;
		});
		mutationQueues.set(
			this.dataPath,
			operation.then(
				() => undefined,
				() => undefined
			)
		);
		return operation;
	}

	private async getLocalBytes(): Promise<number> {
		try {
			return (await stat(this.dataPath)).size;
		} catch (error) {
			if (isMissingFileError(error)) return 0;
			throw error;
		}
	}
}

function applyRemoteChangeToData(data: LocalLibraryDataV2, change: RemoteReplicaChange): string | undefined {
	const directlyMatched = data.items.find(
		(item) => item.remoteId === change.entityId || item.id === change.entityId
	);
	// On the first connection, a local item and an existing server item have
	// different IDs. Link a single exact semantic match before replaying the
	// local outbox; otherwise the replay would create a second server record.
	const semanticMatches = change.content
		? data.items.filter(
				(item) =>
					!item.deleted && !item.remoteId && contentIdentity(item) === contentIdentity(change.content!)
			)
		: [];
	const local = directlyMatched ?? (semanticMatches.length === 1 ? semanticMatches[0] : undefined);
	const linkedByIdentity = !directlyMatched && Boolean(local);
	const pending = local && data.outbox.find((entry) => entry.itemId === local.id);
	if (linkedByIdentity && local && change.content) {
		const replacement: LocalItem = {
			...change.content,
			assets: change.assets,
			id: local.id,
			lastSyncedAt: new Date().toISOString(),
			remoteId: change.content.id,
			serverRevision: change.revision,
			syncState: "synced",
			syncVersion: change.revision,
		};
		data.items = data.items.map((item) => (item.id === local.id ? replacement : item));
		data.outbox = data.outbox.filter((entry) => entry.itemId !== local.id);
		return undefined;
	}
	if (pending && local && change.content) {
		// Equal IDs describe the same entity, not necessarily the same revision.
		// Timestamp decides the winner; a newer local mutation is rebased and pushed.
		if (new Date(local.updated_at).getTime() > new Date(change.content.updated_at).getTime()) {
			pending.mutation.baseRevision = change.revision;
			local.serverRevision = change.revision;
			local.syncState = "queued";
			return undefined;
		}
		return resolveConflictInData(data, pending.id, change.content, change.revision);
	}
	if (change.operation === "delete") {
		if (local) data.items = data.items.filter((item) => item.id !== local.id);
		return undefined;
	}
	if (!change.content) throw new Error("Sync upsert has no content payload");
	const replacement: LocalItem = {
		...change.content,
		assets: change.assets,
		id: local?.id ?? change.content.id,
		lastSyncedAt: new Date().toISOString(),
		remoteId: change.content.id,
		serverRevision: change.revision,
		syncState:
			change.assets?.every((asset) => Boolean(asset.localObjectName)) === false ? "failed" : "synced",
		syncVersion: change.revision,
	};
	data.items = local
		? data.items.map((item) => (item.id === local.id ? replacement : item))
		: [...data.items, replacement];
	return undefined;
}

function resolveConflictInData(
	data: LocalLibraryDataV2,
	entryId: string,
	remote: Content,
	revision: number
): string {
	const entry = data.outbox.find((candidate) => candidate.id === entryId);
	if (!entry) throw new Error("Sync operation not found");
	const local = data.items.find((item) => item.id === entry.itemId);
	if (!local) throw new Error("Local item not found");
	const conflictCopyId = randomUUID();
	const conflictCopy: LocalItem = {
		...local,
		conflictOf: remote.id,
		deleted: false,
		id: conflictCopyId,
		remoteId: undefined,
		serverRevision: undefined,
		syncState: "local-only",
		title: `${local.title || "Без названия"} (локальный конфликт)`,
		updated_at: new Date().toISOString(),
	};
	const serverWinner: LocalItem = {
		...remote,
		id: local.id,
		remoteId: remote.id,
		serverRevision: revision,
		syncState: "synced",
	};
	data.items = data.items.flatMap((item) => (item.id === local.id ? [serverWinner, conflictCopy] : [item]));
	data.outbox = data.outbox.filter((candidate) => candidate.id !== entryId);
	return conflictCopyId;
}

function toCreateContent(item: LocalItem): CreateContent {
	return {
		content: toRemoteAssetUrls(item.content, item.assets),
		document_images: item.document_images,
		media_type: item.media_type ?? "image",
		media_url: toRemoteAssetUrl(item.media_url, item.assets),
		tags: item.tags,
		thumbnail_base64: item.thumbnail_base64,
		thumbnail_url: toRemoteAssetUrl(item.thumbnail_url, item.assets),
		title: item.title,
		type: item.type,
		url: toRemoteAssetUrl(item.url, item.assets),
	};
}

function toRemoteAssetUrls(value: string, assets: LocalAsset[] | undefined): string {
	let remote = value;
	for (const asset of assets ?? []) {
		const localUrl = `monolyth-object://local/${encodeURIComponent(asset.localObjectName)}`;
		remote = remote.replaceAll(localUrl, `/api/files/${asset.storageKey}`);
	}
	return remote;
}

function toRemoteAssetUrl(value: string | undefined, assets: LocalAsset[] | undefined): string | undefined {
	return value === undefined ? undefined : toRemoteAssetUrls(value, assets);
}

function emptyLibrary(): LocalLibraryDataV2 {
	return {
		items: [],
		outbox: [],
		settings: {
			colorScheme: "system",
			preferences: DEFAULT_USER_PREFERENCES,
			syncPolicy: "manual",
		},
		sync: {},
		tags: [],
		version: 2,
	};
}

function isV2(value: LocalLibraryDataV2 | LegacyLocalLibraryData): value is LocalLibraryDataV2 {
	return value.version === 2;
}

function normalizeV2(data: LocalLibraryDataV2): LocalLibraryDataV2 {
	return {
		...emptyLibrary(),
		...data,
		items: Array.isArray(data.items) ? data.items : [],
		outbox: Array.isArray(data.outbox) ? data.outbox : [],
		settings: {
			colorScheme: isColorScheme(data.settings?.colorScheme) ? data.settings.colorScheme : "system",
			preferences: normalizeUserPreferences(data.settings?.preferences),
			syncPolicy: data.settings?.syncPolicy === "automatic" ? "automatic" : "manual",
		},
		tags: normalizeLocalTags(data.tags),
	};
}

function migrateV1(data: LegacyLocalLibraryData): LocalLibraryDataV2 {
	const migrated = emptyLibrary();
	migrated.settings = {
		colorScheme: isColorScheme(data.settings?.colorScheme) ? data.settings.colorScheme : "system",
		preferences: normalizeUserPreferences(data.settings?.preferences),
		syncPolicy: data.settings?.syncPolicy === "automatic" ? "automatic" : "manual",
	};
	migrated.items = (data.items ?? []).map((item) => {
		const tags = normalizeTags(item.tags ?? []);
		return {
			content: item.content,
			created_at: item.createdAt,
			id: item.id || randomUUID(),
			remoteId: item.remoteId,
			syncState: item.syncState ?? "local-only",
			tag_ids: tags.map((title) => ensureTag(migrated.tags, title)),
			tags,
			title: item.title || "Без названия",
			type: item.type,
			updated_at: item.updatedAt,
			url: item.url,
			user_id: "local",
		};
	});
	for (const item of migrated.items) {
		if (item.syncState === "queued" || item.syncState === "failed") {
			const dataForEntry = migrated as LocalLibraryDataV2;
			const mutation: SyncMutation = {
				baseRevision: item.serverRevision,
				clientMutationId: randomUUID(),
				content: toCreateContent(item),
				kind: "upsert",
				remoteId: item.remoteId,
			};
			dataForEntry.outbox.push({
				attempts: item.syncState === "failed" ? 1 : 0,
				createdAt: item.updated_at,
				id: randomUUID(),
				itemId: item.id,
				mutation,
			});
		}
	}
	return migrated;
}

function ensureTag(tags: LocalTag[], title: string): string {
	const existing = tags.find((tag) => normalizeTagTitle(tag.title) === normalizeTagTitle(title));
	if (existing) return existing.id;
	const id = stableLocalTagId(title);
	tags.push({ color: 0, id, title });
	return id;
}

function stableLocalTagId(title: string): string {
	const hash = createHash("sha256").update(title).digest("hex");
	return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

function normalizeTags(tags: string[]): string[] {
	return [
		...new Set(
			tags
				.map((tag) => tag.trim())
				.filter(Boolean)
				.map((tag) => tag.toLocaleLowerCase())
		),
	];
}

function normalizeTagTitle(title: string): string {
	return title.trim().toLocaleLowerCase();
}

/** Deliberately excludes IDs, timestamps and device-local object URLs. */
function contentIdentity(item: Content): string {
	return JSON.stringify({
		content: contentPayloadIdentity(item),
		tags: [...item.tags].map(normalizeTagTitle).sort(),
		title: item.title?.trim() ?? "",
		type: item.type,
		url: item.url?.trim() ?? "",
	});
}

function contentPayloadIdentity(item: Content): string {
	const media = item.type === "media" ? parseMediaJson(item.content) : null;
	const audio = item.type === "audio" ? parseAudioJson(item.content) : null;
	const asset = media?.media.object ?? media?.media.url ?? audio?.audio.object ?? audio?.audio.url;
	const assetName = asset ? stableAssetName(asset) : "";
	return assetName ? `asset:${assetName}` : item.content;
}

function stableAssetName(value: string): string {
	let decoded = value;
	try {
		decoded = decodeURIComponent(value);
	} catch {
		// Invalid URL escapes remain comparable as their literal storage value.
	}
	const path = decoded.split(/[?#]/, 1)[0] ?? decoded;
	const name = path.slice(path.lastIndexOf("/") + 1);
	return name.replace(/^\d{10,}-/, "");
}

function normalizeLocalTags(tags: unknown): LocalTag[] {
	if (!Array.isArray(tags)) return [];
	const result = new Map<string, LocalTag>();
	for (const value of tags) {
		if (!value || typeof value !== "object" || !("title" in value) || typeof value.title !== "string")
			continue;
		const tag = value as Partial<LocalTag>;
		const title = value.title;
		const key = normalizeTagTitle(title);
		if (!key) continue;
		const current = result.get(key);
		if (!current || tag.pendingColor) {
			result.set(key, {
				color: Number.isInteger(tag.color) ? tag.color! : 0,
				id: tag.id || stableLocalTagId(title),
				pendingColor: Boolean(tag.pendingColor),
				remoteId: tag.remoteId,
				title,
			});
		}
	}
	return [...result.values()];
}

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
	return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

function isColorScheme(value: unknown): value is ColorScheme {
	return value === "dark" || value === "light" || value === "system";
}

function hasLocalObjectReference(
	item: Partial<Pick<Content, "content" | "media_url" | "thumbnail_url" | "url">>
) {
	return [item.content, item.media_url, item.thumbnail_url, item.url].some((value) =>
		value?.includes("monolyth-object://")
	);
}
