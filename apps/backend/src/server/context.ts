import { backendSyncProvider } from "./adapters/backend-sync.provider";
import { db } from "./db";
import { getUserFromTokens } from "./lib/auth-session";
import CacheRepository from "./repositories/cache.repository";

export async function createContext({ req }: { req?: Request }) {
	const authHeader = req?.headers.get("authorization");
	const middlewareAccessToken = req?.headers.get("x-monolyth-access-token");
	const middlewareRefreshToken = req?.headers.get("x-monolyth-refresh-token");
	const headerToken = authHeader?.replace("Bearer ", "") || middlewareAccessToken;
	const parsedCookies = Object.fromEntries(
		(req?.headers.get("cookie") || "").split(";").flatMap((part) => {
			const [key, ...value] = part.trim().split("=");
			return key ? [[key, value.join("=")]] : [];
		})
	) as Record<string, string | undefined>;
	const cookieToken = parsedCookies.monolyth_token;
	const refreshToken = middlewareRefreshToken || parsedCookies.monolyth_refresh_token;
	const token = headerToken || cookieToken;

	const user = getUserFromTokens(token, refreshToken);

	return {
		cache: new CacheRepository(),
		db,
		req,
		user,
		token,
		refreshToken,
		requestId: req?.headers.get("x-request-id") || crypto.randomUUID?.() || undefined,
		sync: backendSyncProvider,
		ip: req?.headers.get("x-forwarded-for") || undefined,
		userAgent: req?.headers.get("user-agent") || undefined,
	};
}

export type Context = Awaited<ReturnType<typeof createContext>>;
