import { describe, expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { LocalLibraryRepository } from "./local-library.repository";

describe("LocalLibraryRepository", () => {
	test("deletes several items through one durable batch operation", async () => {
		const root = await mkdtemp(join(tmpdir(), "monolyth-library-"));
		const library = new LocalLibraryRepository(root);
		await library.updateSettings({ syncPolicy: "automatic" });
		const first = await library.save({ content: "first", tags: [], title: "First", type: "note" });
		const second = await library.save({ content: "second", tags: [], title: "Second", type: "note" });
		await library.acknowledgeMutation((await library.getPendingOperations())[0]!.mutation.clientMutationId);
		await library.acknowledgeMutation((await library.getPendingOperations())[0]!.mutation.clientMutationId);
		await library.updateSync(first.id, { remoteId: "remote-first", syncState: "synced" });
		await library.updateSync(second.id, { remoteId: "remote-second", syncState: "synced" });

		await library.deleteMany([first.id, second.id]);

		expect(await library.list()).toEqual([]);
		expect((await library.getPendingOperations()).map((entry) => entry.mutation.kind)).toEqual([
			"delete",
			"delete",
		]);
	});

	test("updates tags for several items while preserving their individual tags", async () => {
		const root = await mkdtemp(join(tmpdir(), "monolyth-library-"));
		const library = new LocalLibraryRepository(root);
		const first = await library.save({
			content: "first",
			tags: ["common", "first-only", "remove"],
			title: "First",
			type: "note",
		});
		const second = await library.save({
			content: "second",
			tags: ["common", "second-only"],
			title: "Second",
			type: "note",
		});

		const updated = await library.updateTags({
			add: ["shared"],
			ids: [first.id, second.id],
			remove: ["remove"],
		});

		expect(updated.map((item) => ({ id: item.id, tags: item.tags }))).toEqual([
			{ id: first.id, tags: ["common", "first-only", "shared"] },
			{ id: second.id, tags: ["common", "second-only", "shared"] },
		]);
	});

	test("serializes outbox, cursor, and replica mutations across repository instances", async () => {
		const root = await mkdtemp(join(tmpdir(), "monolyth-library-"));
		const library = new LocalLibraryRepository(root);
		await library.updateSettings({ syncPolicy: "automatic" });
		await library.save({
			content: "first",
			tags: ["sync"],
			title: "First",
			type: "note",
		});
		const [entry] = await library.getPendingOperations();
		if (!entry) throw new Error("Expected a durable operation");
		const [tag] = await library.getTags();
		if (!tag) throw new Error("Expected a local tag");

		await Promise.all([
			new LocalLibraryRepository(root).retainMutation(entry.mutation.clientMutationId),
			new LocalLibraryRepository(root).setSyncCursor("j:7"),
			new LocalLibraryRepository(root).updateSettings({ colorScheme: "dark" }),
			new LocalLibraryRepository(root).updateTagColor(tag.id, 7),
			new LocalLibraryRepository(root).save({
				content: "second",
				tags: [],
				title: "Second",
				type: "note",
			}),
		]);

		const reopened = new LocalLibraryRepository(root);
		expect((await reopened.getPendingOperations()).find((item) => item.id === entry.id)?.attempts).toBe(1);
		expect(await reopened.getSyncCursor()).toBe("j:7");
		expect((await reopened.list()).map((item) => item.title).sort()).toEqual(["First", "Second"]);
		expect(await reopened.getSettings()).toMatchObject({ colorScheme: "dark" });
		expect(await reopened.getTags()).toContainEqual(expect.objectContaining({ color: 7, id: tag.id }));
	});

	test("creates a new mutation id when a queued local edit replaces its intent", async () => {
		const root = await mkdtemp(join(tmpdir(), "monolyth-library-"));
		const library = new LocalLibraryRepository(root);
		await library.updateSettings({ syncPolicy: "automatic" });
		const item = await library.save({
			content: "first",
			tags: [],
			title: "first",
			type: "note",
		});
		const [first] = await library.getPendingOperations();
		await library.save({
			content: "second",
			id: item.id,
			tags: [],
			title: "second",
			type: "note",
		});
		const [second] = await library.getPendingOperations();

		expect(second.mutation.clientMutationId).not.toBe(first.mutation.clientMutationId);
	});
	test("persists items, settings, search, and statistics across repository instances", async () => {
		const root = await mkdtemp(join(tmpdir(), "monolyth-library-"));
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
		expect(await library.getStatistics()).toMatchObject({
			itemCount: 2,
			pendingSyncCount: 1,
			tagCount: 1,
		});

		await library.delete(item.id);
		await library.delete(queued.id);
		expect(await library.list()).toEqual([]);
	});

	test("queues a manually selected item without changing the default policy", async () => {
		const root = await mkdtemp(join(tmpdir(), "monolyth-library-"));
		const library = new LocalLibraryRepository(root);
		const item = await library.save({
			content: "",
			tags: [],
			title: "Черновик",
			type: "note",
		});

		await library.queueSync(item.id);

		expect((await library.list())[0]).toMatchObject({
			id: item.id,
			syncState: "queued",
		});
		expect(await library.getSettings()).toMatchObject({
			colorScheme: "system",
			syncPolicy: "manual",
		});
	});

	test("keeps the SyncEngine outbox durable across a repository restart", async () => {
		const root = await mkdtemp(join(tmpdir(), "monolyth-library-"));
		const library = new LocalLibraryRepository(root);
		const item = await library.save({
			content: "outbox",
			tags: [],
			title: "Outbox",
			type: "note",
		});
		await library.queueSync(item.id);
		const [entry] = await library.getPendingOperations();
		if (!entry) throw new Error("Expected a durable operation");

		await new LocalLibraryRepository(root).retainMutation(entry.mutation.clientMutationId);
		expect((await new LocalLibraryRepository(root).getPendingOperations())[0]?.attempts).toBe(1);
		await new LocalLibraryRepository(root).acknowledgeMutation(entry.mutation.clientMutationId);
		expect(await new LocalLibraryRepository(root).getPendingOperations()).toEqual([]);
	});

	test("persists the shared user-preferences contract locally", async () => {
		const root = await mkdtemp(join(tmpdir(), "monolyth-library-"));
		const library = new LocalLibraryRepository(root);

		await library.updatePreferences({
			colorPalette: "forest",
			mediaAutoplayEnabled: false,
		});

		expect(await new LocalLibraryRepository(root).getPreferences()).toMatchObject({
			colorPalette: "forest",
			mediaAutoplayEnabled: false,
		});
	});

	test("merges remote tag metadata into the local tag without creating a duplicate", async () => {
		const root = await mkdtemp(join(tmpdir(), "monolyth-library-"));
		const library = new LocalLibraryRepository(root);
		await library.save({
			content: "",
			tags: ["Работа"],
			title: "План",
			type: "note",
		});
		const [localTag] = await library.getTags();
		if (!localTag) throw new Error("Expected local tag");
		await library.updateTagColor(localTag.id, 7);

		await library.mergeRemoteTags([{ color: 2, id: "remote-work", title: "работа" }]);

		expect(await library.getTags()).toEqual([
			expect.objectContaining({
				color: 7,
				id: localTag.id,
				pendingColor: true,
				remoteId: "remote-work",
				title: "работа",
			}),
		]);
		expect((await library.list())[0]?.tag_ids).toEqual([localTag.id]);
	});

	test("links one exact server match before replaying the local outbox", async () => {
		const root = await mkdtemp(join(tmpdir(), "monolyth-library-"));
		const library = new LocalLibraryRepository(root);
		await library.updateSettings({ syncPolicy: "automatic" });
		const local = await library.save({
			content: "Same note",
			tags: ["work"],
			title: "Plan",
			type: "note",
		});
		const remote = {
			...local,
			id: "remote-note",
			tag_ids: ["remote-tag"],
			updated_at: new Date().toISOString(),
			user_id: "remote-user",
		};

		await library.applyRemoteBatch(
			[
				{
					content: remote,
					entityId: remote.id,
					operation: "upsert",
					revision: 1,
				},
			],
			"j:1"
		);

		expect(await library.getPendingOperations()).toEqual([]);
		expect(await library.list()).toEqual([
			expect.objectContaining({
				id: local.id,
				remoteId: remote.id,
				syncState: "synced",
			}),
		]);
	});

	test("queues device objects when a sync run starts", async () => {
		const root = await mkdtemp(join(tmpdir(), "monolyth-library-"));
		const library = new LocalLibraryRepository(root);
		await library.updateSettings({ syncPolicy: "automatic" });
		const item = await library.save({
			content: JSON.stringify({
				media: {
					type: "image",
					url: "monolyth-object://local/local/imports/a.png",
				},
			}),
			media_type: "image",
			media_url: "monolyth-object://local/local/imports/a.png",
			tags: [],
			title: "Локальное изображение",
			type: "media",
		});

		expect(item.syncState).toBe("local-only");
		expect(await library.getPendingOperations()).toEqual([]);
		await library.queueLocalAttachmentsForSync();
		expect(await library.getPendingOperations()).toHaveLength(1);
	});

	test("links a local media item to its canonical server upload without duplicating it", async () => {
		const root = await mkdtemp(join(tmpdir(), "monolyth-library-"));
		const library = new LocalLibraryRepository(root);
		await library.updateSettings({ syncPolicy: "automatic" });
		const local = await library.save({
			content: JSON.stringify({
				media: {
					object: "local/imports/photo.png",
					thumbnailBase64: "",
					type: "image",
					url: "monolyth-object://local/local%2Fimports%2Fphoto.png",
				},
			}),
			media_type: "image",
			media_url: "monolyth-object://local/local%2Fimports%2Fphoto.png",
			tags: ["inbox"],
			thumbnail_url: "monolyth-object://local/local%2Fimports%2Fphoto.png",
			title: "photo.png",
			type: "media",
		});
		const remote = {
			content: JSON.stringify({
				media: {
					object: "media/user-1/1787000000000-photo.png",
					thumbnailBase64: "",
					type: "image",
					url: "/api/files/media/user-1/1787000000000-photo.png",
				},
			}),
			created_at: local.created_at,
			id: "remote-media",
			media_type: "image" as const,
			media_url: "/api/files/media/user-1/1787000000000-photo.png",
			tag_ids: ["remote-tag"],
			tags: ["inbox"],
			thumbnail_url: "/api/files/media/user-1/1787000000000-photo.png",
			title: "photo.png",
			type: "media" as const,
			updated_at: new Date().toISOString(),
			user_id: "user-1",
		};

		await library.applyRemoteChange({
			content: remote,
			entityId: remote.id,
			operation: "upsert",
			revision: 1,
		});

		expect(await library.list()).toEqual([
			expect.objectContaining({
				id: local.id,
				remoteId: remote.id,
				syncState: "synced",
			}),
		]);
		expect(await library.getPendingOperations()).toEqual([]);
	});

	test("turns a remotely deleted item into a new local-only item after an edit", async () => {
		const root = await mkdtemp(join(tmpdir(), "monolyth-library-"));
		const library = new LocalLibraryRepository(root);
		const item = await library.save({
			content: "Первая версия",
			tags: [],
			title: "Черновик",
			type: "note",
		});
		await library.updateSync(item.id, {
			remoteId: "remote-1",
			syncState: "remote-deleted",
		});

		const edited = await library.save({ ...item, content: "Новая версия" });

		expect(edited).toMatchObject({
			id: item.id,
			content: "Новая версия",
			syncState: "local-only",
		});
		expect(edited.remoteId).toBeUndefined();
	});

	test("keeps a local conflict copy while applying the server winner", async () => {
		const root = await mkdtemp(join(tmpdir(), "monolyth-library-"));
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
