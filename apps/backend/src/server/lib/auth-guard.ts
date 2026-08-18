import type { Context } from "../context";
import { ApiError } from "./api-error";
import type { User } from "./auth-session";

export type AuthedContext = Context & { user: User };

export function requireAuth(ctx: Context): asserts ctx is AuthedContext {
	if (!ctx.user) {
		throw new ApiError({ code: "UNAUTHORIZED", message: "Unauthorized" });
	}
}
