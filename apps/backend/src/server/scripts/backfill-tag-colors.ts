import postgres from "postgres";

import { AVAILABLE_TAG_COLOR_COUNT } from "../lib/tag-colors";

const connectionString = `postgres://${process.env.POSTGRES_USER || "postgres"}:${process.env.POSTGRES_PASSWORD || "postgres"}@${process.env.POSTGRES_HOST || "localhost"}:${process.env.POSTGRES_PORT || 5432}/${process.env.POSTGRES_DB || "monolyth"}`;
const sql = postgres(connectionString, { max: 1 });

try {
	const result = await sql`
		UPDATE tags
		SET color = floor(random() * (${AVAILABLE_TAG_COLOR_COUNT} + 1))::integer
		WHERE color = 0
	`;
	process.stdout.write(`Random colors assigned to ${result.count} existing tags.\n`);
} finally {
	await sql.end();
}
