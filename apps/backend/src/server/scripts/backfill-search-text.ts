import { buildContentSearchText } from "@monolyth/shared/content-search";
import { eq, sql } from "drizzle-orm";

import { db } from "../db";
import { content, contentTags, tags } from "../db/schema";

const rows = await db
	.select({
		content: content.content,
		id: content.id,
		tags: sql<string[]>`coalesce(array_agg(${tags.title}) filter (where ${tags.title} is not null), '{}')`,
		title: content.title,
	})
	.from(content)
	.leftJoin(contentTags, eq(contentTags.contentId, content.id))
	.leftJoin(tags, eq(tags.id, contentTags.tagId))
	.groupBy(content.id);

for (const row of rows) {
	const searchText = buildContentSearchText(row);
	await db
		.update(content)
		.set({ searchText, searchVector: sql`to_tsvector('russian', ${searchText})` })
		.where(eq(content.id, row.id));
}

process.stdout.write(`Backfilled search_text for ${rows.length} documents\n`);
process.exit(0);
