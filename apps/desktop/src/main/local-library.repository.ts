import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import type { SyncMutation } from "@synapse/api";
import {
	DEFAULT_USER_PREFERENCES,
	normalizeUserPreferences,
	type UserPreferences,
	type UserPreferencesInput,
} from "@synapse/shared/preferences";
import type { Content, CreateContent } from "@synapse/shared/schemas";

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
	conflictOf?: string;
	deleted?: boolean;
	remoteId?: string;
	serverRevision?: number;
	syncState: SyncState;
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
	mutation: SyncMutation;
}

interface LocalTag {
	id: string;
	title: string;
}

interface LocalLibraryDataV2 {
	items: LocalItem[];
	outbox: LocalOutboxEntry[];
	settings: LocalSettings;
	sync: { cursor?: string; lastSyncedAt?: string };
	tags: LocalTag[];
	version: 2;
}

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
		const data = await this.read();
		const now = new Date().toISOString();
		const existing = input.id ? data.items.find((item) => item.id === input.id && !item.deleted) : undefined;
		const remoteWasDeleted = existing?.syncState === "remote-deleted";
		const containsLocalObject = hasLocalObjectReference({ ...existing, ...input });
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
		await this.write(data);
		return item;
	}

	/** A deletion is journaled until the remote acknowledgement is durable. */
	async delete(id: string): Promise<void> {
		const data = await this.read();
		const existing = data.items.find((item) => item.id === id && !item.deleted);
		if (!existing) return;
		if (!existing.remoteId) {
			data.items = data.items.filter((item) => item.id !== id);
			data.outbox = data.outbox.filter((entry) => entry.itemId !== id);
			await this.write(data);
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
		await this.write(data);
	}

	async queueSync(id: string): Promise<LocalItem> {
		const data = await this.read();
		const item = data.items.find((candidate) => candidate.id === id && !candidate.deleted);
		if (!item) throw new Error("Local item not found");
		if (hasLocalObjectReference(item)) {
			throw new Error("Синхронизация локальных вложений появится вместе с передачей бинарных объектов");
		}
		const queued = { ...item, syncState: "queued" as const };
		data.items = data.items.map((candidate) => (candidate.id === id ? queued : candidate));
		this.replaceOutboxEntry(data, queued);
		await this.write(data);
		return queued;
	}

	async updateSync(id: string, input: Pick<LocalItem, "remoteId" | "syncState">): Promise<LocalItem> {
		const data = await this.read();
		const existing = data.items.find((item) => item.id === id);
		if (!existing) throw new Error("Local item not found");
		const item = { ...existing, ...input, updated_at: new Date().toISOString() };
		data.items = data.items.map((candidate) => (candidate.id === id ? item : candidate));
		await this.write(data);
		return item;
	}

	async getPendingOperations(): Promise<LocalOutboxEntry[]> {
		return (await this.read()).outbox;
	}

	async markOperationFailed(id: string): Promise<void> {
		const data = await this.read();
		const entry = data.outbox.find((candidate) => candidate.id === id);
		if (!entry) return;
		entry.attempts += 1;
		const item = data.items.find((candidate) => candidate.id === entry.itemId);
		if (item) item.syncState = "failed";
		await this.write(data);
	}

	async acknowledgeOperation(
		entryId: string,
		remote: Content | undefined,
		revision: number,
		deleted = false
	): Promise<void> {
		const data = await this.read();
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
		await this.write(data);
	}

	/** Server wins. The complete local revision is retained as an unsynced, local-only conflict copy. */
	async resolveConflict(entryId: string, remote: Content, revision: number): Promise<string> {
		const data = await this.read();
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
		await this.write(data);
		return conflictCopyId;
	}

	async applyRemoteChange(change: {
		content?: Content;
		entityId: string;
		operation: "delete" | "upsert";
		revision: number;
	}): Promise<string | undefined> {
		const data = await this.read();
		const local = data.items.find((item) => item.remoteId === change.entityId || item.id === change.entityId);
		const pending = local && data.outbox.find((entry) => entry.itemId === local.id);
		if (pending && change.content) return this.resolveConflict(pending.id, change.content, change.revision);
		if (change.operation === "delete") {
			if (local) data.items = data.items.filter((item) => item.id !== local.id);
			await this.write(data);
			return undefined;
		}
		if (!change.content) throw new Error("Sync upsert has no content payload");
		const replacement: LocalItem = {
			...change.content,
			id: local?.id ?? change.content.id,
			remoteId: change.content.id,
			serverRevision: change.revision,
			syncState: "synced",
		};
		data.items = local
			? data.items.map((item) => (item.id === local.id ? replacement : item))
			: [...data.items, replacement];
		await this.write(data);
		return undefined;
	}

	async getSyncCursor(): Promise<string | undefined> {
		return (await this.read()).sync.cursor;
	}

	async setSyncCursor(cursor: string): Promise<void> {
		const data = await this.read();
		data.sync = { cursor, lastSyncedAt: new Date().toISOString() };
		await this.write(data);
	}

	async getSettings(): Promise<LocalSettings> {
		return (await this.read()).settings;
	}

	async updateSettings(settings: Partial<LocalSettings>): Promise<LocalSettings> {
		const data = await this.read();
		if (settings.syncPolicy) data.settings.syncPolicy = settings.syncPolicy;
		if (settings.colorScheme) data.settings.colorScheme = settings.colorScheme;
		if (settings.preferences)
			data.settings.preferences = normalizeUserPreferences({
				...data.settings.preferences,
				...settings.preferences,
			});
		await this.write(data);
		return data.settings;
	}

	async getPreferences(): Promise<UserPreferences> {
		return (await this.read()).settings.preferences;
	}

	async updatePreferences(preferences: UserPreferencesInput): Promise<UserPreferences> {
		const data = await this.read();
		data.settings.preferences = normalizeUserPreferences({ ...data.settings.preferences, ...preferences });
		await this.write(data);
		return data.settings.preferences;
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
						clientMutationId: previous?.mutation.clientMutationId ?? randomUUID(),
						kind,
						remoteId: item.remoteId,
					}
				: {
						baseRevision: item.serverRevision,
						clientMutationId: previous?.mutation.clientMutationId ?? randomUUID(),
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

	private async getLocalBytes(): Promise<number> {
		try {
			return (await stat(this.dataPath)).size;
		} catch (error) {
			if (isMissingFileError(error)) return 0;
			throw error;
		}
	}
}

function toCreateContent(item: LocalItem): CreateContent {
	return {
		content: item.content,
		document_images: item.document_images,
		media_type: item.media_type ?? "image",
		media_url: item.media_url,
		tags: item.tags,
		thumbnail_base64: item.thumbnail_base64,
		thumbnail_url: item.thumbnail_url,
		title: item.title,
		type: item.type,
		url: item.url,
	};
}

function emptyLibrary(): LocalLibraryDataV2 {
	return {
		items: [],
		outbox: [],
		settings: { colorScheme: "system", preferences: DEFAULT_USER_PREFERENCES, syncPolicy: "manual" },
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
		tags: Array.isArray(data.tags) ? data.tags : [],
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
	const existing = tags.find((tag) => tag.title === title);
	if (existing) return existing.id;
	const id = stableLocalTagId(title);
	tags.push({ id, title });
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
		value?.includes("synapse-object://")
	);
}
