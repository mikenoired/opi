import type { Context as HonoContext } from "hono";
import { getCookie } from "hono/cookie";

import { backendSyncProvider } from "../adapters/backend-sync.provider";
import type { Context } from "../context";
import { db } from "../db";
import { getUserFromTokens } from "../lib/auth-session";
import { CacheRepository } from "../repositories/cache.repository";

export async function createContext(c: HonoContext) {
	const authHeader = c.req.header("authorization");
	const middlewareAccessToken = c.req.header("x-synapse-access-token");
	const middlewareRefreshToken = c.req.header("x-synapse-refresh-token");
	const cookieToken = getCookie(c, "synapse_token");
	const refreshToken = middlewareRefreshToken || getCookie(c, "synapse_refresh_token");
	const token = authHeader?.replace("Bearer ", "") || middlewareAccessToken || cookieToken;

	return {
		cache: new CacheRepository(),
		db,
		req: c.req.raw,
		user: getUserFromTokens(token, refreshToken),
		token,
		refreshToken,
		requestId: c.req.header("x-request-id") || crypto.randomUUID(),
		sync: backendSyncProvider,
		ip: c.req.header("x-forwarded-for"),
		userAgent: c.req.header("user-agent"),
	} as unknown as Context;
}

export type ApiContext = Context;
