import { createHash, randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename, extname } from "node:path";

import type {
	AiTagsInput,
	AiTagsResult,
	AiUsage,
	SyncPullResult,
	SyncPushResult,
	SyncRunResult,
} from "@synapse/api";
import { parseAudioJson, parseMediaJson } from "@synapse/core";
import type { Content } from "@synapse/shared/schemas";
import { createEntityRegistry, SyncEngine, TagEntityAdapter } from "@synapse/sync";

import type { DesktopStorageProvider } from "./desktop-storage.provider";
import {
	DesktopContentAdapter,
	DesktopJournalApi,
	DesktopOutbox,
	DesktopReplicaStore,
	DesktopSseTransport,
} from "./desktop-sync.adapters";
import type { LocalAsset, LocalLibraryRepository } from "./local-library.repository";

export interface SyncProgress {
	completed: number;
	phase: "download" | "upload" | "finalizing";
	total: number;
}

export interface DesktopSyncSession {
	email: string;
	eligible: boolean;
	plan: string;
}

interface LoginResponse {
	refreshToken?: string;
	token: string;
	user: { email: string };
}

export interface StoredDesktopSession {
	apiUrl: string;
	refreshToken: string;
	session: DesktopSyncSession;
	token: string;
}

interface PendingDesktopAuthorization {
	codeVerifier: string;
	reject: (error: Error) => void;
	resolve: (session: DesktopSyncSession) => void;
	state: string;
}

/**
 * Desktop-owned HTTP transport. The renderer neither sees a bearer token nor
 * decides how a conflict is resolved; it only observes the durable result
 * through the platform client.
 */
export class DesktopSyncService {
	private token?: string;
	private refreshToken?: string;
	private apiUrl?: string;
	private pendingAuthorization?: PendingDesktopAuthorization;
	private session?: DesktopSyncSession;
	private engine?: SyncEngine;
	private onLibraryChanged?: () => void;

	constructor(
		private readonly library: LocalLibraryRepository,
		private readonly storage?: DesktopStorageProvider,
		private onProgress?: (progress: SyncProgress) => void,
		private readonly openExternal?: (url: string) => Promise<void>
	) {}

	setProgressListener(listener: ((progress: SyncProgress) => void) | undefined): void {
		this.onProgress = listener;
	}

	/** Called after the durable replica commits a remote journal batch. */
	setLibraryChangedListener(listener: (() => void) | undefined): void {
		this.onLibraryChanged = listener;
	}

	/** Kept for main-process service tests and non-UI integrations. Desktop UI uses connectAccount(). */
	async login(apiUrl: string, email: string, password: string): Promise<DesktopSyncSession> {
		this.apiUrl = normalizeApiUrl(apiUrl);
		const result = await this.request<LoginResponse>("/auth/login", {
			email,
			password,
		});
		this.token = result.token;
		this.refreshToken = result.refreshToken;
		const entitlement = await this.request<{ eligible: boolean; plan: string }>(
			"/user/sync/entitlement",
			undefined,
			"GET"
		);
		this.session = { email: result.user.email, ...entitlement };
		await this.startSyncLifecycle();
		return this.session;
	}

	async connectAccount(): Promise<DesktopSyncSession> {
		if (this.pendingAuthorization) throw new Error("Подключение аккаунта уже ожидает завершения");
		this.apiUrl = normalizeApiUrl(process.env.SYNAPSE_API_URL || "http://localhost:3000/api");
		const state = randomUrlValue(24);
		const codeVerifier = randomUrlValue(48);
		const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");
		const webUrl = (process.env.SYNAPSE_WEB_URL || "http://localhost:5173").replace(/\/$/, "");
		const url = new URL(`${webUrl}/desktop-auth`);
		url.searchParams.set("code_challenge", codeChallenge);
		url.searchParams.set("state", state);

		const session = new Promise<DesktopSyncSession>((resolve, reject) => {
			this.pendingAuthorization = { codeVerifier, reject, resolve, state };
		});
		try {
			if (!this.openExternal) throw new Error("Desktop external browser is unavailable");
			await this.openExternal(url.toString());
		} catch (cause) {
			this.pendingAuthorization = undefined;
			throw cause;
		}
		return session;
	}

	async completeAccountConnection(callbackUrl: string): Promise<void> {
		const pending = this.pendingAuthorization;
		if (!pending) return;
		try {
			const url = new URL(callbackUrl);
			const code = url.searchParams.get("code");
			const state = url.searchParams.get("state");
			if (
				url.protocol !== "synapse:" ||
				url.hostname !== "auth" ||
				url.pathname !== "/callback" ||
				!code ||
				state !== pending.state
			)
				throw new Error("Некорректный ответ авторизации Synapse");
			const result = await this.request<LoginResponse>("/auth/desktop/exchange", {
				code,
				codeVerifier: pending.codeVerifier,
				state,
			});
			this.token = result.token;
			this.refreshToken = result.refreshToken;
			const entitlement = await this.request<{
				eligible: boolean;
				plan: string;
			}>("/user/sync/entitlement", undefined, "GET");
			this.session = { email: result.user.email, ...entitlement };
			await this.startSyncLifecycle();
			pending.resolve(this.session);
		} catch (cause) {
			pending.reject(cause instanceof Error ? cause : new Error("Не удалось подключить аккаунт"));
		} finally {
			this.pendingAuthorization = undefined;
		}
	}

	getSession(): DesktopSyncSession | undefined {
		return this.session;
	}

	getStoredSession(): StoredDesktopSession | undefined {
		return this.apiUrl && this.token && this.refreshToken && this.session
			? {
					apiUrl: this.apiUrl,
					refreshToken: this.refreshToken,
					session: this.session,
					token: this.token,
				}
			: undefined;
	}

	async restoreSession(stored: StoredDesktopSession): Promise<DesktopSyncSession | undefined> {
		this.apiUrl = normalizeApiUrl(stored.apiUrl);
		this.token = stored.token;
		this.refreshToken = stored.refreshToken;
		this.session = stored.session;
		try {
			const refreshed = await this.request<{
				refreshToken: string;
				token: string;
			}>("/auth/refresh", undefined, "POST", {
				"x-synapse-refresh-token": stored.refreshToken,
			});
			this.token = refreshed.token;
			this.refreshToken = refreshed.refreshToken;
			const entitlement = await this.request<{
				eligible: boolean;
				plan: string;
			}>("/user/sync/entitlement", undefined, "GET");
			this.session = { ...stored.session, ...entitlement };
			await this.startSyncLifecycle();
			return this.session;
		} catch {
			this.logout();
			return undefined;
		}
	}

	logout(): void {
		void this.engine?.stop();
		this.engine = undefined;
		this.apiUrl = undefined;
		this.session = undefined;
		this.token = undefined;
		this.refreshToken = undefined;
	}

	async stop(): Promise<void> {
		await this.engine?.stop();
		this.engine = undefined;
	}

	/** Wakes the durable engine after a local IPC mutation; it never drops the outbox on network failure. */
	wake(): void {
		void this.engine?.syncNow();
	}

	async syncAll(): Promise<SyncRunResult> {
		if (!this.session) throw new Error("Сначала подключите аккаунт Synapse");
		// The plan may change after the Desktop session was created; do not keep a
		// stale entitlement in memory and incorrectly block a newly upgraded user.
		const entitlement = await this.request<{ eligible: boolean; plan: string }>(
			"/user/sync/entitlement",
			undefined,
			"GET"
		);
		this.session = { ...this.session, ...entitlement };
		if (!this.session.eligible) throw new Error("Synapse Sync доступен на платных планах");
		await this.startSyncLifecycle();
		if (await this.library.hasBulkDeleteRequest()) {
			await this.request<{ success: true }>("/sync/delete-all");
			await this.library.acknowledgeBulkDelete();
			return { conflicts: [], failed: 0, synced: 0 };
		}
		let failed = 0;
		let synced = 0;
		const conflicts: SyncRunResult["conflicts"] = [];

		// Pull first: this enforces server-wins before an offline mutation can
		// overwrite a newer remote version.
		await this.library.queueLocalAttachmentsForSync();
		const pending = await this.library.getPendingOperations();
		let completed = 0;
		this.reportProgress({
			completed,
			phase: "download",
			total: pending.length + 2,
		});
		conflicts.push(...(await this.pullRemoteChanges()));
		completed += 1;
		this.reportProgress({
			completed,
			phase: "upload",
			total: pending.length + 2,
		});

		for (const batch of chunk(pending, 100)) {
			let entries = [] as typeof batch;
			try {
				for (const entry of batch) {
					try {
						// A tombstone has no local payload to upload. Trying to load it via
						// library.get() fails by design because deleted records are hidden.
						const uploaded =
							entry.mutation.kind === "delete" ? undefined : await this.uploadLocalAsset(entry.itemId);
						if (uploaded) {
							await this.library.acknowledgeOperation(entry.id, uploaded.content, uploaded.revision);
							synced += 1;
						} else entries.push(entry);
					} catch {
						// A missing/corrupt local attachment must not block unrelated notes,
						// edits or deletes in the same durable sync run.
						await this.library.markOperationFailed(entry.id);
						failed += 1;
					}
				}
				if (entries.length) {
					const result = await this.request<SyncPushResult>("/sync/push", {
						mutations: entries.map((entry) => entry.mutation),
					});
					for (const [index, outcome] of result.outcomes.entries()) {
						const entry = entries[index];
						if (!entry || !outcome) throw new Error("Sync server returned no mutation outcome");
						if (outcome.status === "conflict") {
							if (!outcome.content) throw new Error("Sync conflict has no server content");
							const conflictCopyId = await this.library.resolveConflict(
								entry.id,
								outcome.content,
								outcome.revision
							);
							conflicts.push({
								conflictCopyId,
								entityId: outcome.content.id,
								localUpdatedAt: new Date().toISOString(),
								remote: outcome.content,
								remoteUpdatedAt: outcome.content.updated_at,
								resolution: "server-wins-local-copy",
							});
						} else {
							await this.library.acknowledgeOperation(
								entry.id,
								outcome.content,
								outcome.revision,
								outcome.deleted
							);
							synced += 1;
						}
					}
				}
			} catch {
				for (const entry of entries) await this.library.markOperationFailed(entry.id);
				failed += entries.length;
			} finally {
				completed += batch.length;
				this.reportProgress({
					completed,
					phase: "upload",
					total: pending.length + 2,
				});
			}
		}

		this.reportProgress({
			completed,
			phase: "finalizing",
			total: pending.length + 2,
		});
		conflicts.push(...(await this.pullRemoteChanges()));
		await this.repairMissingAssets();
		this.reportProgress({
			completed: pending.length + 2,
			phase: "finalizing",
			total: pending.length + 2,
		});
		await this.syncTagMetadata();
		return { conflicts, failed, synced };
	}

	/** Tags are independent metadata: reconcile them after content creates, then replay offline color edits. */
	private async syncTagMetadata(): Promise<void> {
		const remoteTags = await this.request<Array<{ color: number; id: string; title: string }>>(
			"/content/tags",
			undefined,
			"GET"
		);
		await this.library.mergeRemoteTags(remoteTags);
		for (const tag of await this.library.getPendingTagColors()) {
			const remote = await this.request<{
				color: number;
				id: string;
				title: string;
			}>(`/content/tags/${encodeURIComponent(tag.remoteId!)}/color`, { color: tag.color }, "PATCH");
			await this.library.acknowledgeTagColor(tag.id, remote.color);
		}
	}

	private async uploadLocalAsset(
		itemId: string
	): Promise<{ content: import("@synapse/shared/schemas").Content; revision: number } | undefined> {
		if (!this.storage) return undefined;
		const item = await this.library.get(itemId);
		const objectName =
			getLocalObjectName(item.content) ??
			getLocalObjectName(item.media_url) ??
			getLocalObjectName(item.thumbnail_url);
		if (!objectName || (item.type !== "media" && item.type !== "audio")) return undefined;
		const bytes = await readFile(this.storage.getObjectPath(objectName));
		const name = basename(objectName);
		const result = await this.request<{
			contents: Array<{
				content: import("@synapse/shared/schemas").Content;
				revision: number;
			}>;
			errors: string[];
		}>("/sync/upload", {
			files: [
				{
					content: bytes.toString("base64"),
					name,
					size: bytes.byteLength,
					type: mimeType(name),
				},
			],
			tags: item.tags,
			title: item.title,
		});
		if (result.errors.length || !result.contents[0])
			throw new Error(result.errors.join("; ") || "Не удалось загрузить изображение");
		return result.contents[0];
	}

	private reportProgress(progress: SyncProgress) {
		this.onProgress?.(progress);
	}

	getAiUsage(): Promise<AiUsage> {
		return this.request<AiUsage>("/ai/usage", undefined, "GET");
	}

	suggestTags(input: AiTagsInput): Promise<AiTagsResult> {
		return this.request<AiTagsResult>("/ai/tags", input);
	}

	private async pullRemoteChanges(): Promise<SyncRunResult["conflicts"]> {
		if (this.engine) {
			await this.engine.syncNow();
			return [];
		}
		const cursor = await this.library.getSyncCursor();
		const result = await this.request<SyncPullResult>(
			`/sync/pull${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
			undefined,
			"GET"
		);
		const conflicts: SyncRunResult["conflicts"] = [];
		for (const change of result.changes) {
			const conflictCopyId = await this.library.applyRemoteChange(change);
			if (change.content) void this.hydrateRemoteAssets(change.entityId, change.revision, change.content);
			if (conflictCopyId && change.content) {
				conflicts.push({
					conflictCopyId,
					entityId: change.entityId,
					localUpdatedAt: new Date().toISOString(),
					remote: change.content,
					remoteUpdatedAt: change.content.updated_at,
					resolution: "server-wins-local-copy",
				});
			}
		}
		await this.library.setSyncCursor(result.cursor);
		return conflicts;
	}

	/** The engine owns ordered V2 pull/outbox/reconnect. Asset bytes deliberately
	 * remain below this layer in uploadLocalAsset()/hydrateAssets(). */
	private async startSyncLifecycle(): Promise<void> {
		if (!this.session || !this.apiUrl || !this.token) return;
		if (!this.engine) {
			this.engine = new SyncEngine({
				journal: new DesktopJournalApi(
					() => this.apiUrl,
					() => this.token
				),
				outbox: new DesktopOutbox(this.library),
				realtime: new DesktopSseTransport(
					() => this.apiUrl,
					() => this.token
				),
				registry: createEntityRegistry(new DesktopContentAdapter(), new TagEntityAdapter()),
				replica: new DesktopReplicaStore(
					this.library,
					(content) => this.hydrateAssets(content),
					() => this.onLibraryChanged?.()
				),
			});
		}
		await this.engine.start();
	}

	private async hydrateAssets(content: Content): Promise<{ assets: LocalAsset[]; content: Content }> {
		if (!this.storage) return { assets: [], content };
		const storageKeys = getAssetStorageKeys(content);
		if (!storageKeys.length) return { assets: [], content };
		const manifest = await this.request<{
			assets: Array<{
				assetId: string;
				mimeType: string;
				sha256: string;
				size: number;
				storageKey: string;
			}>;
		}>(
			`/sync/assets?${storageKeys.map((key) => `key=${encodeURIComponent(key)}`).join("&")}`,
			undefined,
			"GET"
		);
		const existing = await this.library.getAssets(content.id);
		const assets: LocalAsset[] = [];
		for (const remote of manifest.assets) {
			const cached = existing.find(
				(asset) =>
					asset.storageKey === remote.storageKey &&
					asset.checksum === remote.sha256 &&
					asset.size === remote.size
			);
			if (cached && (await this.storage.getObjectMetadata(cached.localObjectName))?.size === remote.size) {
				assets.push(cached);
				continue;
			}
			const bytes = await this.fetchAsset(remote.storageKey);
			const stored = await this.storage.putSyncedAsset(bytes, remote.storageKey);
			if (stored.sha256 !== remote.sha256 || stored.size !== remote.size)
				throw new Error(`Повреждённый файл при синхронизации: ${remote.storageKey}`);
			assets.push({
				...remote,
				checksum: remote.sha256,
				localObjectName: stored.objectName,
			});
		}
		return { assets, content: replaceAssetUrls(content, assets, this.storage) };
	}

	/** Runs outside metadata synchronization so an interrupted file transfer cannot
	 * prevent the journal cursor from advancing. repairMissingAssets() retries it. */
	private async hydrateRemoteAssets(remoteId: string, revision: number, content: Content): Promise<void> {
		try {
			const hydrated = await this.hydrateAssets(content);
			await this.library.applyHydratedAssets(remoteId, revision, hydrated.assets, hydrated.content);
		} catch {
			// Binary hydration is retried independently by the media repair pipeline.
		}
	}

	private async repairMissingAssets(): Promise<void> {
		for (const local of await this.library.list()) {
			if (!local.remoteId || !getAssetStorageKeys(local).length) continue;
			if (await this.hasAllLocalAssets(local.remoteId, getAssetStorageKeys(local))) continue;
			const hydrated = await this.hydrateAssets({
				...local,
				id: local.remoteId,
			});
			await this.library.applyRemoteChange({
				assets: hydrated.assets,
				content: hydrated.content,
				entityId: local.remoteId,
				operation: "upsert",
				revision: local.serverRevision ?? local.syncVersion ?? 1,
			});
		}
	}

	/** Pull already hydrates changed content. Only issue a manifest request when a local object is actually absent. */
	private async hasAllLocalAssets(remoteId: string, storageKeys: string[]): Promise<boolean> {
		if (!this.storage) return true;
		const assets = await this.library.getAssets(remoteId);
		for (const storageKey of storageKeys) {
			const asset = assets.find((candidate) => candidate.storageKey === storageKey);
			if (!asset || !(await this.storage.getObjectMetadata(asset.localObjectName))) return false;
		}
		return true;
	}

	private async fetchAsset(storageKey: string): Promise<Uint8Array> {
		if (!this.apiUrl) throw new Error("Сначала укажите адрес Synapse API");
		const response = await fetch(`${this.apiUrl}/files/${encodeURIComponent(storageKey)}`, {
			headers: this.token ? { "x-synapse-access-token": this.token } : {},
		});
		if (!response.ok) throw new Error(`Не удалось скачать файл (${response.status})`);
		return new Uint8Array(await response.arrayBuffer());
	}

	private async request<T>(
		path: string,
		body?: unknown,
		method = "POST",
		extraHeaders?: Record<string, string>
	): Promise<T> {
		if (!this.apiUrl) throw new Error("Сначала укажите адрес Synapse API");
		let response: Response | undefined;
		for (let attempt = 0; attempt < 2; attempt++) {
			response = await fetch(`${this.apiUrl}${path}`, {
				...(body === undefined ? {} : { body: JSON.stringify(body) }),
				headers: {
					"Content-Type": "application/json",
					...(this.token ? { "x-synapse-access-token": this.token } : {}),
					...extraHeaders,
				},
				method,
			});
			if (response.status !== 429 || attempt === 1) break;
			const retryAfter = Number(response.headers.get("retry-after"));
			await wait(Math.max(1, Number.isFinite(retryAfter) ? retryAfter : 60) * 1_000);
		}
		if (!response) throw new Error("Synapse API returned no response");
		if (!response.ok) {
			const payload = (await response.json().catch(() => null)) as {
				error?: string;
			} | null;
			throw new Error(payload?.error || `Synapse API returned ${response.status}`);
		}
		return (await response.json()) as T;
	}
}

function chunk<T>(values: T[], size: number): T[][] {
	const batches: T[][] = [];
	for (let index = 0; index < values.length; index += size) batches.push(values.slice(index, index + size));
	return batches;
}

function wait(milliseconds: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function getAssetStorageKeys(content: Content): string[] {
	const media = parseMediaJson(content.content);
	const audio = parseAudioJson(content.content);
	return [
		...new Set(
			[
				media?.media.object,
				objectFromUrl(media?.media.thumbnailUrl),
				audio?.audio.object,
				audio?.cover?.object,
			].filter((value): value is string => Boolean(value))
		),
	];
}

function objectFromUrl(url: string | undefined): string | undefined {
	if (!url) return undefined;
	const index = url.indexOf("/api/files/");
	return index >= 0 ? url.slice(index + "/api/files/".length) : undefined;
}

function replaceAssetUrls(content: Content, assets: LocalAsset[], storage: DesktopStorageProvider): Content {
	const replacements = new Map(
		assets.map((asset) => [asset.storageKey, storage.getObjectUrl(asset.localObjectName)])
	);
	const replace = (value: string | undefined) => {
		const key = objectFromUrl(value);
		return key && replacements.has(key) ? replacements.get(key) : value;
	};
	let serialized = content.content;
	for (const [storageKey, localUrl] of replacements) {
		serialized = serialized.replaceAll(`/api/files/${storageKey}`, localUrl);
	}
	return {
		...content,
		content: serialized,
		media_url: replace(content.media_url),
		thumbnail_url: replace(content.thumbnail_url),
		url: replace(content.url),
	};
}

function getLocalObjectName(value: string | undefined): string | undefined {
	if (!value?.startsWith("synapse-object://local/")) return undefined;
	try {
		return decodeURIComponent(value.slice("synapse-object://local/".length));
	} catch {
		return undefined;
	}
}
function mimeType(name: string): string {
	return (
		{
			aac: "audio/aac",
			flac: "audio/flac",
			gif: "image/gif",
			jpg: "image/jpeg",
			jpeg: "image/jpeg",
			m4a: "audio/mp4",
			mov: "video/quicktime",
			mp3: "audio/mpeg",
			mp4: "video/mp4",
			ogg: "audio/ogg",
			opus: "audio/opus",
			png: "image/png",
			webm: "video/webm",
			webp: "image/webp",
		}[extname(name).slice(1).toLowerCase()] ?? "application/octet-stream"
	);
}

function normalizeApiUrl(value: string): string {
	const url = new URL(value.trim());
	return (
		url
			.toString()
			.replace(/\/$/, "")
			.replace(/\/api$/, "") + "/api"
	);
}

function randomUrlValue(bytes: number) {
	return randomBytes(bytes).toString("base64url");
}
