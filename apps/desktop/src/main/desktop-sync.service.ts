import type { LocalItem, LocalLibraryRepository } from "./local-library.repository";

export interface DesktopSyncSession {
	email: string;
	eligible: boolean;
	plan: string;
}

interface LoginResponse {
	token: string;
	user: { email: string };
}

/** Desktop-owned HTTP adapter. Tokens stay in the main process and are never exposed to the renderer. */
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

	async syncAll(): Promise<{ failed: number; synced: number }> {
		if (!this.session?.eligible) throw new Error("Synapse Sync доступен на платных планах");
		let failed = 0;
		let synced = 0;
		for (const item of await this.library.list()) {
			if (item.syncState === "synced" || item.syncState === "remote-deleted") continue;
			try {
				await this.syncItem(item);
				synced++;
			} catch {
				await this.library.updateSync(item.id, { remoteId: item.remoteId, syncState: "failed" });
				failed++;
			}
		}
		return { failed, synced };
	}

	async deleteRemote(id: string): Promise<void> {
		const item = (await this.library.list()).find((candidate) => candidate.id === id);
		if (!item?.remoteId) throw new Error("Материал ещё не загружен в Synapse Sync");
		await this.request(`/content/${item.remoteId}`, undefined, "DELETE");
		await this.library.updateSync(item.id, { remoteId: item.remoteId, syncState: "remote-deleted" });
	}

	private async syncItem(item: LocalItem): Promise<void> {
		const body = {
			content: item.content,
			tags: item.tags,
			title: item.title,
			type: item.type,
			url: item.url,
		};
		const remote = item.remoteId
			? await this.request<{ id: string }>(
					`/content/${item.remoteId}`,
					{ ...body, id: item.remoteId },
					"PATCH"
				)
			: await this.request<{ id: string }>("/content", body);
		await this.library.updateSync(item.id, { remoteId: remote.id, syncState: "synced" });
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
