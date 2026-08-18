import postgres from "postgres";

if (process.env.NODE_ENV !== "test") throw new Error("The E2E plan helper is test-only");
const email = process.env.E2E_USER_EMAIL;
if (!email) throw new Error("E2E_USER_EMAIL is required");

const connection = postgres({
	database: process.env.POSTGRES_DB ?? "synapse",
	host: process.env.POSTGRES_HOST ?? "localhost",
	password: process.env.POSTGRES_PASSWORD ?? "postgres",
	port: Number(process.env.POSTGRES_PORT ?? 5432),
	username: process.env.POSTGRES_USER ?? "postgres",
});

try {
	const updated = await connection`UPDATE users SET plan = 'god-mode' WHERE email = ${email}`;
	if (updated.count !== 1) throw new Error(`Expected one E2E user, updated ${updated.count}`);
} finally {
	await connection.end();
}
