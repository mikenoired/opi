import type { MiddlewareHandler } from "hono";

import { ApiError } from "../lib/api-error";
import { log } from "../lib/logger";
import { RedisRateLimiter } from "../lib/redis-rate-limiter";
import { createContext, type ApiContext } from "./context";

declare module "hono" {
	interface ContextVariableMap {
		apiContext: ApiContext;
	}
}

const windowMs = Number(process.env.API_RATE_WINDOW_MS ?? 60_000);
const queryLimiter = new RedisRateLimiter({
	windowMs,
	limit: Number(process.env.API_RATE_LIMIT_QUERY ?? 60),
});
const mutationLimiter = new RedisRateLimiter({
	windowMs,
	limit: Number(process.env.API_RATE_LIMIT_MUTATION ?? 20),
});
// A single Desktop sync legitimately fetches a manifest and binary object for many files.
// Keep it isolated from interactive reads instead of exhausting the normal query budget.
const syncLimiter = new RedisRateLimiter({
	windowMs,
	limit: Number(process.env.API_RATE_LIMIT_SYNC ?? 300),
});

export const withContext: MiddlewareHandler = async (c, next) => {
	c.set("apiContext", await createContext(c));
	await next();
};

export const requestLogger: MiddlewareHandler = async (c, next) => {
	const startedAt = performance.now();
	await next();

	const context = c.get("apiContext");
	const durationMs = Math.round((performance.now() - startedAt) * 100) / 100;
	const status = c.res.status;
	log(status >= 500 ? "error" : status >= 400 ? "warn" : "info", "http.request", {
		requestId: context.requestId,
		method: c.req.method,
		path: new URL(c.req.url).pathname,
		status,
		durationMs,
		ip: context.ip?.split(",")[0]?.trim(),
		userId: context.user?.id,
	});
};

export const requireAuth: MiddlewareHandler = async (c, next) => {
	if (!c.get("apiContext").user) throw new ApiError("UNAUTHORIZED", "Authentication required");
	await next();
};

export const protectMutation: MiddlewareHandler = async (c, next) => {
	if (process.env.NODE_ENV === "production") {
		const origin = c.req.header("origin");
		const host = c.req.header("host");
		if (origin && host && new URL(origin).host !== host) throw new ApiError("FORBIDDEN", "Invalid origin");
	}
	await next();
};

export function rateLimit(kind: "query" | "mutation" | "sync"): MiddlewareHandler {
	return async (c, next) => {
		const ctx = c.get("apiContext");
		const identity = ctx.user?.id || ctx.ip || "anonymous";
		const limiter = kind === "query" ? queryLimiter : kind === "mutation" ? mutationLimiter : syncLimiter;
		const allowed = await limiter.checkLimit(`${identity}:${kind}`);
		if (!allowed) {
			// Desktop can resume the durable sync once the current rate window ends.
			c.header("Retry-After", String(Math.ceil(windowMs / 1000)));
			throw new ApiError("TOO_MANY_REQUESTS", "Rate limit exceeded");
		}
		await next();
	};
}
