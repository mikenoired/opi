/* eslint-disable no-console -- dev-only AI processing logs, metrics only (no PII) */
export function devLog(message: string, ...args: unknown[]): void {
	if (process.env.NODE_ENV === "production") return;
	console.log(`[ai:tagging] ${message}`, ...args);
}
