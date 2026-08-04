import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export type LocalContentType = "note" | "link" | "todo";
export type SyncPolicy = "manual" | "automatic";
export type SyncState = "local-only" | "queued" | "synced" | "failed" | "remote-deleted";

export interface LocalItem {
	content: string;
	createdAt: string;
	id: string;
	remoteId?: string;
	syncState: SyncState;
	tags: string[];
	title: string;
	type: LocalContentType;
	updatedAt: string;
	url?: string;
}

export interface LocalSettings {
	syncPolicy: SyncPolicy;
}

export interface LocalStatistics {
	itemCount: number;
	lastUpdatedAt: string | null;
	localBytes: number;
	pendingSyncCount: number;
	tagCount: number;
}

interface LocalLibraryData {
	items: LocalItem[];
	settings: LocalSettings;
	version: 1;
}

export type LocalItemInput = Pick<LocalItem, "content" | "tags" | "title" | "type" | "url">;

/** Durable, migration-ready local library. It is intentionally independent of Electron APIs. */
export class LocalLibraryRepository {
	private readonly dataPath: string;

	constructor(rootDirectory: string) {
		this.dataPath = join(rootDirectory, "library.json");
	}

	async list(search?: string): Promise<LocalItem[]> {
		const data = await this.read();
		const query = search?.trim().toLocaleLowerCase();
		const items = !query
			? data.items
			: data.items.filter((item) =>
					[item.title, item.content, item.tags.join(" ")].join(" ").toLocaleLowerCase().includes(query)
				);
		return [...items].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
	}

	async save(input: LocalItemInput & { id?: string }): Promise<LocalItem> {
		const data = await this.read();
		const now = new Date().toISOString();
		const existing = input.id ? data.items.find((item) => item.id === input.id) : undefined;
		const item: LocalItem = {
			content: input.content.trim(),
			createdAt: existing?.createdAt ?? now,
			id: existing?.id ?? randomUUID(),
			syncState: data.settings.syncPolicy === "automatic" ? "queued" : (existing?.syncState ?? "local-only"),
			tags: normalizeTags(input.tags),
			title: input.title.trim() || "Без названия",
			type: input.type,
			updatedAt: now,
			url: input.url?.trim() || undefined,
		};

		data.items = existing
			? data.items.map((candidate) => (candidate.id === item.id ? item : candidate))
			: [...data.items, item];
		await this.write(data);
		return item;
	}

	async delete(id: string): Promise<void> {
		const data = await this.read();
		data.items = data.items.filter((item) => item.id !== id);
		await this.write(data);
	}

	async updateSync(id: string, input: Pick<LocalItem, "remoteId" | "syncState">): Promise<LocalItem> {
		const data = await this.read();
		const existing = data.items.find((item) => item.id === id);
		if (!existing) throw new Error("Local item not found");
		const item = { ...existing, ...input, updatedAt: new Date().toISOString() };
		data.items = data.items.map((candidate) => (candidate.id === id ? item : candidate));
		await this.write(data);
		return item;
	}

	async getSettings(): Promise<LocalSettings> {
		return (await this.read()).settings;
	}

	async updateSettings(settings: Partial<LocalSettings>): Promise<LocalSettings> {
		const data = await this.read();
		if (settings.syncPolicy) data.settings.syncPolicy = settings.syncPolicy;
		await this.write(data);
		return data.settings;
	}

	async getStatistics(): Promise<LocalStatistics> {
		const data = await this.read();
		const pendingSyncCount = data.items.filter(
			(item) => item.syncState === "queued" || item.syncState === "failed"
		).length;
		const tagCount = new Set(data.items.flatMap((item) => item.tags.map((tag) => tag.toLocaleLowerCase())))
			.size;
		return {
			itemCount: data.items.length,
			lastUpdatedAt: data.items.reduce<string | null>(
				(latest, item) => (!latest || item.updatedAt > latest ? item.updatedAt : latest),
				null
			),
			localBytes: await this.getLocalBytes(),
			pendingSyncCount,
			tagCount,
		};
	}

	private async read(): Promise<LocalLibraryData> {
		try {
			const parsed = JSON.parse(await readFile(this.dataPath, "utf8")) as Partial<LocalLibraryData>;
			return {
				items: Array.isArray(parsed.items) ? parsed.items : [],
				settings: { syncPolicy: parsed.settings?.syncPolicy === "automatic" ? "automatic" : "manual" },
				version: 1,
			};
		} catch (error) {
			if (isMissingFileError(error)) return { items: [], settings: { syncPolicy: "manual" }, version: 1 };
			throw error;
		}
	}

	private async write(data: LocalLibraryData): Promise<void> {
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
