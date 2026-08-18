import { verifyRefreshToken, verifyToken } from "./jwt";

export type User = { id: string; email: string };

export function getUserFromTokens(accessToken?: string | null, refreshToken?: string | null): User | null {
	const accessPayload = accessToken ? verifyToken(accessToken) : null;
	const payload = accessPayload || (refreshToken ? verifyRefreshToken(refreshToken) : null);

	if (!payload) return null;

	return {
		id: payload.userId,
		email: payload.email,
	};
}
