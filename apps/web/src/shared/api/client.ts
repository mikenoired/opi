import type { Api } from "@monolyth/backend/api";
import { hc } from "hono/client";

import { apiBaseUrl } from "@/shared/config/api";

export const apiClient = hc<Api>(apiBaseUrl, {
	init: { credentials: "include" },
});

export class ApiClientError extends Error {
	constructor(
		readonly status: number,
		message: string
	) {
		super(message);
	}
}

/** Unwrap a typed Hono RPC response and turn non-2xx responses into React Query errors. */
export async function unwrap<T>(
	response: Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>
): Promise<T> {
	const resolved = await response;
	if (resolved.ok) return resolved.json() as Promise<T>;
	const payload = (await resolved.json().catch(() => null)) as { error?: string } | null;
	throw new ApiClientError(resolved.status, payload?.error || "Request failed");
}
