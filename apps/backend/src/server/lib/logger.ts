/* eslint-disable no-console -- Bun server logger writes to stdout/stderr. */

type LogLevel = "debug" | "info" | "warn" | "error";
type LogFormat = "pretty" | "json";

const levels: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const configuredLevel = (process.env.LOG_LEVEL || "info").toLowerCase() as LogLevel;
const minimumLevel = levels[configuredLevel] ?? levels.info;
const configuredFormat = (process.env.LOG_FORMAT || "").toLowerCase() as LogFormat;
const format: LogFormat = configuredFormat || (process.env.NODE_ENV === "production" ? "json" : "pretty");
const useColors = format === "pretty" && process.env.NO_COLOR === undefined && process.stdout.isTTY;

const ansi = {
	reset: "\u001b[0m",
	muted: "\u001b[90m",
	blue: "\u001b[36m",
	green: "\u001b[32m",
	yellow: "\u001b[33m",
	red: "\u001b[31m",
	white: "\u001b[37m",
} as const;

function color(value: string, tone: keyof typeof ansi) {
	return useColors ? `${ansi[tone]}${value}${ansi.reset}` : value;
}

function formatTime(timestamp: string) {
	return timestamp.slice(11, 23).replace("T", " ");
}

function formatValue(value: unknown) {
	if (value === undefined || value === null || value === "") return undefined;
	if (typeof value === "object") return JSON.stringify(value);
	return String(value);
}

function statusText(status: number) {
	const labels: Record<number, string> = {
		200: "OK",
		201: "Created",
		204: "No Content",
		301: "Moved Permanently",
		302: "Found",
		304: "Not Modified",
		400: "Bad Request",
		401: "Unauthorized",
		403: "Forbidden",
		404: "Not Found",
		409: "Conflict",
		422: "Unprocessable Entity",
		429: "Too Many Requests",
		500: "Internal Server Error",
		502: "Bad Gateway",
		503: "Service Unavailable",
	};
	return labels[status] ?? (status >= 500 ? "Server Error" : status >= 400 ? "Client Error" : "Response");
}

function prettyMessage(level: LogLevel, event: string, fields: Record<string, unknown>, timestamp: string) {
	const method = typeof fields.method === "string" ? fields.method : undefined;
	const path = typeof fields.path === "string" ? fields.path : undefined;
	const status = typeof fields.status === "number" ? fields.status : undefined;
	const durationMs = typeof fields.durationMs === "number" ? fields.durationMs : undefined;
	const requestId = typeof fields.requestId === "string" ? fields.requestId : undefined;

	let message = event.replaceAll(".", " ");
	if (event === "http.request" && method && path && status !== undefined) {
		message = `${method} ${path}`;
	}

	const levelTone =
		level === "error" ? "red" : level === "warn" ? "yellow" : level === "debug" ? "muted" : "green";
	const statusTone =
		status === undefined ? "white" : status >= 500 ? "red" : status >= 400 ? "yellow" : "green";
	const details = Object.entries(fields)
		.filter(([key]) => !["method", "path", "status", "durationMs", "requestId"].includes(key))
		.map(([key, value]) => {
			const formatted = formatValue(value);
			return formatted ? `${key}=${formatted}` : undefined;
		})
		.filter((value): value is string => value !== undefined);

	return [
		color(formatTime(timestamp), "muted"),
		color(level.toUpperCase().padEnd(5), levelTone),
		status === undefined ? undefined : color(`${status} ${statusText(status)}`, statusTone),
		color(message, level === "error" ? "red" : "white"),
		durationMs === undefined || event === "http.request" ? undefined : color(`${durationMs}ms`, "muted"),
		requestId ? color(`rid=${requestId.slice(0, 8)}`, "muted") : undefined,
		...details.map((detail) => color(detail, "muted")),
	]
		.filter((value): value is string => value !== undefined)
		.join(" ");
}

export function log(level: LogLevel, event: string, fields: Record<string, unknown> = {}) {
	if (levels[level] < minimumLevel) return;

	const timestamp = new Date().toISOString();
	const line =
		format === "json"
			? JSON.stringify({ timestamp, level, event, ...fields })
			: prettyMessage(level, event, fields, timestamp);
	if (level === "error") console.error(line);
	else if (level === "warn") console.warn(line);
	else console.log(line);
}

export function logError(event: string, error: unknown, fields: Record<string, unknown> = {}) {
	const details =
		error instanceof Error
			? { error: error.message, stack: process.env.NODE_ENV === "production" ? undefined : error.stack }
			: { error: String(error) };
	log("error", event, { ...fields, ...details });
}
