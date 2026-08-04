import { afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";

import { buildContentListPreview, mapContentRecord } from "@synapse/core";
import { DEFAULT_USER_PREFERENCES } from "@synapse/shared/preferences";
import { and, eq, inArray, sql } from "drizzle-orm";

import type { Context } from "../context";
import { db } from "../db";
import { content, contentTags, edges, nodes, tags, users } from "../db/schema";
import { AVAILABLE_TAG_COLOR_COUNT } from "../lib/tag-colors";
import type ContentServiceType from "./content.service";

const testEmail = "bun-content-test@synapse.local";
const foreignEmail = "bun-content-foreign@synapse.local";
let userId = "";
let ContentService: typeof ContentServiceType;

const cache = {
	del: async () => 1,
	getJSON: async () => null,
	setJSON: async () => "OK",
};

test("builds platform-neutral content previews", () => {
	expect(
		buildContentListPreview(
			"note",
			JSON.stringify({ content: [{ content: [{ text: "Preview text", type: "text" }], type: "paragraph" }] })
		)
	).toBe("Preview text");
	expect(buildContentListPreview("media", '{"media":{"url":"https://example.com/image.png"}}')).toBe(
		'{"media":{"url":"https://example.com/image.png"}}'
	);
	expect(
		mapContentRecord(
			{
				content: "body",
				createdAt: new Date("2026-01-02T03:04:05.000Z"),
				id: "content-1",
				type: "note",
			},
			"user-1"
		)
	).toMatchObject({
		created_at: "2026-01-02T03:04:05.000Z",
		id: "content-1",
		tags: [],
		user_id: "user-1",
	});
});

const createService = () =>
	new ContentService({
		cache,
		db,
		user: { id: userId, email: testEmail },
	} as unknown as Context);

const deleteTestUser = async () => {
	await db.delete(users).where(inArray(users.email, [testEmail, foreignEmail]));
};

beforeAll(async () => {
	process.env.MINIO_ENDPOINT ||= "localhost";
	process.env.MINIO_ACCESS_KEY ||= "test";
	process.env.MINIO_SECRET_KEY ||= "test";
	ContentService = (await import("./content.service")).default;
});

beforeEach(async () => {
	await deleteTestUser();
	const [user] = await db
		.insert(users)
		.values({ email: testEmail, passwordHash: "not-used-by-content-tests" })
		.returning({ id: users.id });
	userId = user!.id;
});

afterEach(async () => {
	await deleteTestUser();

	const leftovers = await Promise.all([
		db.select().from(content).where(eq(content.userId, userId)),
		db.select().from(tags).where(eq(tags.userId, userId)),
		db.select().from(contentTags).where(eq(contentTags.userId, userId)),
		db.select().from(nodes).where(eq(nodes.userId, userId)),
		db.select().from(edges).where(eq(edges.userId, userId)),
	]);
	expect(leftovers.every((rows) => rows.length === 0)).toBe(true);
});

describe.serial("content service", () => {
	test("creates content quickly and persists its tag and graph relations", async () => {
		const [tag] = await db.insert(tags).values({ title: "integration", userId }).returning();
		const startedAt = performance.now();
		const created = await createService().create({
			type: "note",
			media_type: "image",
			title: "Bun integration note",
			content: "Persisted body",
			tag_ids: [tag!.id],
		});
		const saveDurationMs = performance.now() - startedAt;

		expect(saveDurationMs).toBeLessThan(1_000);
		expect(created).toMatchObject({
			user_id: userId,
			type: "note",
			title: "Bun integration note",
			content: "Persisted body",
			tag_ids: [tag!.id],
			tags: ["integration"],
		});

		const service = createService();
		expect(await service.getById(created.id)).toEqual(created);
		const result = await service.getAll("integration note", ["note"], [tag!.id], undefined, 10, true);
		expect(result.items).toEqual([created]);

		const contentNode = await db.query.nodes.findFirst({
			where: and(eq(nodes.userId, userId), sql`${nodes.metadata}->>'content_id' = ${created.id}`),
		});
		const tagNode = await db.query.nodes.findFirst({
			where: and(eq(nodes.userId, userId), sql`${nodes.metadata}->>'tag_id' = ${tag!.id}`),
		});
		expect(contentNode).toBeDefined();
		expect(tagNode).toBeDefined();
		expect(
			await db.query.edges.findFirst({
				where: and(
					eq(edges.userId, userId),
					eq(edges.fromNode, contentNode!.id),
					eq(edges.toNode, tagNode!.id),
					eq(edges.relationType, "content_tag")
				),
			})
		).toBeDefined();
	});

	test("updates content relations and removes all content-owned data on delete", async () => {
		const [firstTag, secondTag] = await db
			.insert(tags)
			.values([
				{ title: "before", userId },
				{ title: "after", userId },
			])
			.returning();
		const service = createService();
		const created = await service.create({
			type: "todo",
			media_type: "image",
			title: "Before",
			content: "unchecked",
			tag_ids: [firstTag!.id],
		});

		const updated = await service.update({
			id: created.id,
			title: "After",
			content: "checked",
			tag_ids: [secondTag!.id],
		});
		expect(updated).toMatchObject({
			title: "After",
			content: "checked",
			tag_ids: [secondTag!.id],
			tags: ["after"],
		});
		expect((await service.getTagsWithContent()).find((tag) => tag.id === secondTag!.id)?.items).toEqual([
			updated,
		]);

		expect(await service.delete(created.id)).toEqual({ success: true });
		expect(await db.select().from(content).where(eq(content.id, created.id))).toHaveLength(0);
		expect(await db.select().from(contentTags).where(eq(contentTags.contentId, created.id))).toHaveLength(0);
		expect(
			await db
				.select()
				.from(nodes)
				.where(sql`${nodes.metadata}->>'content_id' = ${created.id}`)
		).toHaveLength(0);
		expect(
			await db
				.select()
				.from(edges)
				.where(and(eq(edges.userId, userId), eq(edges.relationType, "content_tag")))
		).toHaveLength(0);
	});

	test("reuses existing tags by normalized title", async () => {
		const [existingTag] = await db.insert(tags).values({ title: "Work", userId }).returning();

		const created = await createService().create({
			type: "note",
			media_type: "image",
			title: "Normalized tags",
			content: "Tagged body",
			tags: [" work ", "WORK"],
		});

		expect(created.tag_ids).toEqual([existingTag!.id]);
		expect(created.tags).toEqual(["Work"]);
		expect(await db.select().from(tags).where(eq(tags.userId, userId))).toHaveLength(1);
		expect(await db.select().from(contentTags).where(eq(contentTags.contentId, created.id))).toHaveLength(1);
	});

	test("assigns tag colors, updates them, and respects the automatic color preference", async () => {
		const service = createService();
		await service.create({
			content: "Colored body",
			media_type: "image",
			tags: ["colored"],
			type: "note",
		});

		const coloredTag = await db.query.tags.findFirst({
			where: and(eq(tags.userId, userId), eq(tags.title, "colored")),
		});
		expect(coloredTag?.color).toBeGreaterThanOrEqual(1);
		expect(coloredTag?.color).toBeLessThanOrEqual(AVAILABLE_TAG_COLOR_COUNT);

		expect(await service.updateTagColor(coloredTag!.id, 0)).toMatchObject({ color: 0 });

		await db
			.update(users)
			.set({ preferences: { ...DEFAULT_USER_PREFERENCES, autoTagColorEnabled: false } })
			.where(eq(users.id, userId));
		await service.create({
			content: "Plain body",
			media_type: "image",
			tags: ["plain"],
			type: "note",
		});

		const plainTag = await db.query.tags.findFirst({
			where: and(eq(tags.userId, userId), eq(tags.title, "plain")),
		});
		expect(plainTag?.color).toBe(0);
	});

	test("paginates suggestions from rare tags first without duplicates", async () => {
		const [rareTag, commonTag] = await db
			.insert(tags)
			.values([
				{ title: "rare", userId },
				{ title: "common", userId },
			])
			.returning();
		const service = createService();
		const source = await service.create({
			type: "note",
			media_type: "image",
			title: "Source",
			content: "source",
			tag_ids: [rareTag!.id, commonTag!.id],
		});
		const rareOnly = await service.create({
			type: "note",
			media_type: "image",
			title: "Rare only",
			content: "rare",
			tag_ids: [rareTag!.id],
		});
		const shared = await service.create({
			type: "note",
			media_type: "image",
			title: "Shared",
			content: "shared",
			tag_ids: [rareTag!.id, commonTag!.id],
		});
		const commonOnly = await service.create({
			type: "note",
			media_type: "image",
			title: "Common only",
			content: "common",
			tag_ids: [commonTag!.id],
		});
		const commonExtra = await service.create({
			type: "note",
			media_type: "image",
			title: "Common extra",
			content: "common extra",
			tag_ids: [commonTag!.id],
		});

		const pages = [];
		let cursor: string | undefined;
		do {
			const page = await service.getSuggestions(source.id, cursor, 1);
			pages.push(page);
			cursor = page.nextCursor;
		} while (cursor);

		const groups = pages.flatMap((page) => page.groups);
		const suggestedIds = groups.flatMap((group) => group.items.map((item) => item.id));

		expect(groups.map((group) => group.tag.id)).toEqual([
			rareTag!.id,
			rareTag!.id,
			commonTag!.id,
			commonTag!.id,
		]);
		expect(new Set(suggestedIds)).toEqual(new Set([rareOnly.id, shared.id, commonOnly.id, commonExtra.id]));
		expect(suggestedIds).not.toContain(source.id);
		expect(new Set(suggestedIds).size).toBe(suggestedIds.length);
	});

	test("rejects relations to another user's tag without leaving partial content", async () => {
		const [foreignUser] = await db
			.insert(users)
			.values({ email: foreignEmail, passwordHash: "not-used-by-content-tests" })
			.returning();
		const [foreignTag] = await db
			.insert(tags)
			.values({ title: "private", userId: foreignUser!.id })
			.returning();

		await expect(
			createService().create({
				type: "note",
				media_type: "image",
				content: "must roll back",
				tag_ids: [foreignTag!.id],
			})
		).rejects.toMatchObject({ code: "NOT_FOUND", message: "Tag not found" });
		expect(await db.select().from(content).where(eq(content.userId, userId))).toHaveLength(0);
	});

	test("imports a parsed file into content via importFile", async () => {
		const csv = Buffer.from("name,age\nAlice,30\nBob,25\n", "utf-8");
		const result = await createService().importFile({
			file: {
				name: "contacts.csv",
				type: "text/csv",
				size: csv.length,
				buffer: Array.from(csv),
			},
		});

		expect(result.success).toBe(true);
		expect(result.content).toMatchObject({
			user_id: userId,
			type: "csv",
			title: "name",
		});
		expect(result.content.content).toContain("Alice");
		expect(await createService().getById(result.content.id)).toEqual(result.content);
	});
});
