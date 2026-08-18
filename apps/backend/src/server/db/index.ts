import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

export const connectionString = `postgres://${process.env.POSTGRES_USER || "postgres"}:${process.env.POSTGRES_PASSWORD || "postgres"}@${process.env.POSTGRES_HOST || "localhost"}:${process.env.POSTGRES_PORT || 5432}/${process.env.POSTGRES_DB || "monolyth"}`;

const client = postgres(connectionString);
export const db = drizzle(client, { schema });

/** Dedicated connection: LISTEN must not share a request transaction client. */
export function createListenClient() {
	return postgres(connectionString, { max: 1 });
}
