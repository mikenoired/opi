import { sql } from "drizzle-orm";

import type { Context } from "../context";
import { createListenClient } from "../db";

const CHANNEL = "monolyth_sync_cursor";

/** PostgreSQL persistence and LISTEN/NOTIFY lifecycle for cursor hints. */
export default class SyncHintRepository {
	constructor(private readonly database: Context["db"]) {}

	async publish(hint: { cursor: string; userId: string }): Promise<void> {
		await this.database.execute(sql`SELECT pg_notify(${CHANNEL}, ${JSON.stringify(hint)})`);
	}

	async subscribe(handler: (hint: { cursor: string; userId: string }) => void): Promise<() => Promise<void>> {
		const client = createListenClient();
		await client.listen(CHANNEL, (payload) => {
			try {
				const hint = JSON.parse(payload) as { cursor?: string; userId?: string };
				if (typeof hint.cursor === "string" && typeof hint.userId === "string") {
					handler({ cursor: hint.cursor, userId: hint.userId });
				}
			} catch {
				// Ignore malformed foreign notification payloads.
			}
		});
		return async () => {
			await client.end({ timeout: 1 });
		};
	}
}
