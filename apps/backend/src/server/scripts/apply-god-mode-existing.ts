import postgres from "postgres";

// Однократная миграция: переводит уже существующие аккаунты на план god-mode.
// Новые регистрации всегда получают starter (default колонки + registerUser),
// поэтому этот скрипт нужен только для аккаунтов, созданных до появления планов.

const connectionString = `postgres://${process.env.POSTGRES_USER || "postgres"}:${process.env.POSTGRES_PASSWORD || "postgres"}@${process.env.POSTGRES_HOST || "localhost"}:${process.env.POSTGRES_PORT || 5432}/${process.env.POSTGRES_DB || "synapse"}`;
const sql = postgres(connectionString, { max: 1 });

try {
	const result = await sql`UPDATE users SET plan = 'god-mode' WHERE plan <> 'god-mode'`;
	process.stdout.write(`Existing accounts set to god-mode: ${result.count}.\n`);
} finally {
	await sql.end();
}
