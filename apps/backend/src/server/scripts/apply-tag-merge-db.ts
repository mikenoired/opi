import { readFile } from "node:fs/promises";
import { join } from "node:path";

import postgres from "postgres";

const connectionString = `postgres://${process.env.POSTGRES_USER || "postgres"}:${process.env.POSTGRES_PASSWORD || "postgres"}@${process.env.POSTGRES_HOST || "localhost"}:${process.env.POSTGRES_PORT || 5432}/${process.env.POSTGRES_DB || "monolyth"}`;
const sql = postgres(connectionString, { max: 1 });

try {
	const migration = await readFile(
		join(import.meta.dir, "../../../drizzle/0000_merge_duplicate_tags.sql"),
		"utf8"
	);
	await sql.unsafe(migration);
	process.stdout.write("Tag merge DB function installed.\n");
} finally {
	await sql.end();
}
