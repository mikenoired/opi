import { normalizeUserPreferences } from "@monolyth/shared/preferences";
import { eq } from "drizzle-orm";

import type { Context } from "../context";
import { users } from "../db/schema";

// The server only assigns palette indexes. Their visual meaning lives on the client.
export const AVAILABLE_TAG_COLOR_COUNT = 12;

export function randomTagColor(enabled: boolean) {
	if (!enabled) return 0;
	return Math.floor(Math.random() * AVAILABLE_TAG_COLOR_COUNT) + 1;
}

export async function isAutomaticTagColorEnabled(database: Context["db"], userId: string) {
	const user = await database.query.users.findFirst({
		columns: { preferences: true },
		where: eq(users.id, userId),
	});

	return normalizeUserPreferences(user?.preferences).autoTagColorEnabled;
}
