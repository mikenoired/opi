import { describe, expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { LocalLibraryRepository } from "./local-library.repository";

describe("LocalLibraryRepository", () => {
	test("persists items, settings, search, and statistics across repository instances", async () => {
		const root = await mkdtemp(join(tmpdir(), "synapse-library-"));
		const library = new LocalLibraryRepository(root);
		const item = await library.save({
			content: "Текст заметки",
			tags: ["Работа", "работа"],
			title: "План",
			type: "note",
		});
		await library.updateSettings({ syncPolicy: "automatic" });

		expect((await library.list("текст"))[0]?.id).toBe(item.id);
		expect(await new LocalLibraryRepository(root).getSettings()).toMatchObject({
			colorScheme: "system",
			syncPolicy: "automatic",
		});
		const queued = await library.save({
			content: "Автоматическая очередь",
			tags: [],
			title: "Второй",
			type: "note",
		});
		expect(await library.getStatistics()).toMatchObject({ itemCount: 2, pendingSyncCount: 1, tagCount: 1 });

		await library.delete(item.id);
		await library.delete(queued.id);
		expect(await library.list()).toEqual([]);
	});

	test("queues a manually selected item without changing the default policy", async () => {
		const root = await mkdtemp(join(tmpdir(), "synapse-library-"));
		const library = new LocalLibraryRepository(root);
		const item = await library.save({ content: "", tags: [], title: "Черновик", type: "note" });

		await library.queueSync(item.id);

		expect((await library.list())[0]).toMatchObject({ id: item.id, syncState: "queued" });
		expect(await library.getSettings()).toMatchObject({ colorScheme: "system", syncPolicy: "manual" });
	});

	test("persists the shared user-preferences contract locally", async () => {
		const root = await mkdtemp(join(tmpdir(), "synapse-library-"));
		const library = new LocalLibraryRepository(root);

		await library.updatePreferences({ colorPalette: "forest", mediaAutoplayEnabled: false });

		expect(await new LocalLibraryRepository(root).getPreferences()).toMatchObject({
			colorPalette: "forest",
			mediaAutoplayEnabled: false,
		});
	});

	test("keeps device objects local until the binary sync transport exists", async () => {
		const root = await mkdtemp(join(tmpdir(), "synapse-library-"));
		const library = new LocalLibraryRepository(root);
		await library.updateSettings({ syncPolicy: "automatic" });
		const item = await library.save({
			content: JSON.stringify({
				media: { type: "image", url: "synapse-object://local/local/imports/a.png" },
			}),
			media_type: "image",
			media_url: "synapse-object://local/local/imports/a.png",
			tags: [],
			title: "Локальное изображение",
			type: "media",
		});

		expect(item.syncState).toBe("local-only");
		expect(await library.getPendingOperations()).toEqual([]);
		await expect(library.queueSync(item.id)).rejects.toThrow("бинарных объектов");
	});

	test("turns a remotely deleted item into a new local-only item after an edit", async () => {
		const root = await mkdtemp(join(tmpdir(), "synapse-library-"));
		const library = new LocalLibraryRepository(root);
		const item = await library.save({ content: "Первая версия", tags: [], title: "Черновик", type: "note" });
		await library.updateSync(item.id, { remoteId: "remote-1", syncState: "remote-deleted" });

		const edited = await library.save({ ...item, content: "Новая версия" });

		expect(edited).toMatchObject({ id: item.id, content: "Новая версия", syncState: "local-only" });
		expect(edited.remoteId).toBeUndefined();
	});

	test("keeps a local conflict copy while applying the server winner", async () => {
		const root = await mkdtemp(join(tmpdir(), "synapse-library-"));
		const library = new LocalLibraryRepository(root);
		const item = await library.save({
			content: "Локальная версия",
			tags: ["работа"],
			title: "План",
			type: "note",
		});
		await library.queueSync(item.id);
		const entry = (await library.getPendingOperations())[0];
		if (!entry) throw new Error("Expected a durable outbox entry");
		const remote = {
			content: "Серверная версия",
			created_at: item.created_at,
			id: "4d58d1dc-3ac5-4cb8-974d-0baf8b399a20",
			tag_ids: ["tag-1"],
			tags: ["работа"],
			title: "План",
			type: "note" as const,
			updated_at: new Date().toISOString(),
			user_id: "remote-user",
		};

		const conflictCopyId = await library.resolveConflict(entry.id, remote, 3);
		const items = await library.list();

		expect(items.find((candidate) => candidate.id === item.id)).toMatchObject({
			content: "Серверная версия",
			remoteId: remote.id,
			syncState: "synced",
		});
		const conflictCopy = items.find((candidate) => candidate.id === conflictCopyId);
		expect(conflictCopy).toMatchObject({
			conflictOf: remote.id,
			content: "Локальная версия",
			syncState: "local-only",
		});
		expect(conflictCopy?.remoteId).toBeUndefined();
		expect(await library.getPendingOperations()).toEqual([]);
	});
});
