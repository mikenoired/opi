import type {
	AiTagsInput,
	AiTagsResult,
	AiUsage,
	SyncPullResult,
	SyncPushResult,
	SyncRunResult,
} from "@synapse/api";

import type { LocalLibraryRepository } from "./local-library.repository";

export interface DesktopSyncSession {
	email: string;
	eligible: boolean;
	plan: string;
}

interface LoginResponse {
	token: string;
	user: { email: string };
}

/**
 * Desktop-owned HTTP transport. The renderer neither sees a bearer token nor
 * decides how a conflict is resolved; it only observes the durable result
 * through the platform client.
 */
export class DesktopSyncService {
	private token?: string;
	private apiUrl?: string;
	private session?: DesktopSyncSession;

	constructor(private readonly library: LocalLibraryRepository) {}

	async login(apiUrl: string, email: string, password: string): Promise<DesktopSyncSession> {
		this.apiUrl = normalizeApiUrl(apiUrl);
		const result = await this.request<LoginResponse>("/auth/login", { email, password });
		this.token = result.token;
		const entitlement = await this.request<{ eligible: boolean; plan: string }>(
			"/user/sync/entitlement",
			undefined,
			"GET"
		);
		this.session = { email: result.user.email, ...entitlement };
		return this.session;
	}

	getSession(): DesktopSyncSession | undefined {
		return this.session;
	}

	logout(): void {
		this.apiUrl = undefined;
		this.session = undefined;
		this.token = undefined;
	}

	async syncAll(): Promise<SyncRunResult> {
		if (!this.session?.eligible) throw new Error("Synapse Sync доступен на платных планах");
		let failed = 0;
		let synced = 0;
		const conflicts: SyncRunResult["conflicts"] = [];

		// Pull first: this enforces server-wins before an offline mutation can
		// overwrite a newer remote version.
		conflicts.push(...(await this.pullRemoteChanges()));

		for (const entry of await this.library.getPendingOperations()) {
			try {
				const result = await this.request<SyncPushResult>("/sync/push", { mutations: [entry.mutation] });
				const outcome = result.outcomes[0];
				if (!outcome) throw new Error("Sync server returned no mutation outcome");
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
					continue;
				}
				await this.library.acknowledgeOperation(entry.id, outcome.content, outcome.revision, outcome.deleted);
				synced += 1;
			} catch {
				await this.library.markOperationFailed(entry.id);
				failed += 1;
			}
		}

		conflicts.push(...(await this.pullRemoteChanges()));
		return { conflicts, failed, synced };
	}

	getAiUsage(): Promise<AiUsage> {
		return this.request<AiUsage>("/ai/usage", undefined, "GET");
	}

	suggestTags(input: AiTagsInput): Promise<AiTagsResult> {
		return this.request<AiTagsResult>("/ai/tags", input);
	}

	private async pullRemoteChanges(): Promise<SyncRunResult["conflicts"]> {
		const cursor = await this.library.getSyncCursor();
		const result = await this.request<SyncPullResult>(
			`/sync/pull${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
			undefined,
			"GET"
		);
		const conflicts: SyncRunResult["conflicts"] = [];
		for (const change of result.changes) {
			const conflictCopyId = await this.library.applyRemoteChange(change);
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

	private async request<T>(path: string, body?: unknown, method = "POST"): Promise<T> {
		if (!this.apiUrl) throw new Error("Сначала укажите адрес Synapse API");
		const response = await fetch(`${this.apiUrl}${path}`, {
			...(body === undefined ? {} : { body: JSON.stringify(body) }),
			headers: {
				"Content-Type": "application/json",
				...(this.token ? { "x-synapse-access-token": this.token } : {}),
			},
			method,
		});
		if (!response.ok) {
			const payload = (await response.json().catch(() => null)) as { error?: string } | null;
			throw new Error(payload?.error || `Synapse API returned ${response.status}`);
		}
		return (await response.json()) as T;
	}
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
