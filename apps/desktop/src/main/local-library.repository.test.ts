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
		expect(await new LocalLibraryRepository(root).getSettings()).toEqual({ syncPolicy: "automatic" });
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
});
