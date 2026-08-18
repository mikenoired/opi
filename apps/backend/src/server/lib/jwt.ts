import jwt from "jsonwebtoken";

if (!process.env.JWT_SECRET) {
	throw new Error("JWT_SECRET environment variable is required");
}

if (!process.env.JWT_REFRESH_SECRET) {
	throw new Error("JWT_REFRESH_SECRET environment variable is required");
}

const JWT_SECRET: string = process.env.JWT_SECRET;
const JWT_REFRESH_SECRET: string = process.env.JWT_REFRESH_SECRET;

export interface JWTPayload {
	userId: string;
	email: string;
	type?: "access" | "refresh";
}

export function signToken(payload: Omit<JWTPayload, "type">, expiresIn: string | number = "1d"): string {
	return jwt.sign({ ...payload, type: "access" }, JWT_SECRET, { expiresIn } as jwt.SignOptions);
}

export function signRefreshToken(payload: Omit<JWTPayload, "type">): string {
	return jwt.sign({ ...payload, type: "refresh" }, JWT_REFRESH_SECRET, {
		expiresIn: "7d",
	} as jwt.SignOptions);
}

export function verifyToken(token: string): JWTPayload | null {
	try {
		const payload = jwt.verify(token, JWT_SECRET) as JWTPayload;
		if (payload.type !== "access") return null;
		return payload;
	} catch {
		return null;
	}
}

export function verifyRefreshToken(token: string): JWTPayload | null {
	try {
		const payload = jwt.verify(token, JWT_REFRESH_SECRET) as JWTPayload;
		if (payload.type !== "refresh") return null;
		return payload;
	} catch {
		return null;
	}
}
