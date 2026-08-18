const configuredApiUrl = import.meta.env.VITE_E2E
	? undefined
	: import.meta.env.VITE_API_URL?.trim().replace(/\/$/, "");

/** Base URL of the Hono API. Leave VITE_API_URL empty when Bun serves the SPA and API from one origin. */
export const apiBaseUrl = configuredApiUrl || "/api";

export function apiUrl(path: string) {
	return `${apiBaseUrl}${path.startsWith("/") ? path : `/${path}`}`;
}
