import { defineConfig } from "drizzle-kit";

export default defineConfig({
	schema: "./src/server/db/schema.ts",
	out: "./drizzle",
	dialect: "postgresql",
	dbCredentials: {
		host: process.env.POSTGRES_HOST || "localhost",
		port: Number(process.env.POSTGRES_PORT) || 5432,
		user: process.env.POSTGRES_USER || "postgres",
		password: process.env.POSTGRES_PASSWORD || "postgres",
		database: process.env.POSTGRES_DB || "synapse",
	},
});
