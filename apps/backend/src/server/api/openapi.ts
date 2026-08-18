const json = { content: { "application/json": { schema: { type: "object" } } } };
const error = {
	content: {
		"application/json": {
			schema: {
				type: "object",
				required: ["error", "code"],
				properties: {
					error: { type: "string" },
					code: { type: "string" },
					fieldErrors: {
						type: ["object", "null"],
						additionalProperties: { type: "array", items: { type: "string" } },
					},
				},
			},
		},
	},
};

const protectedResponses = {
	"401": { description: "Authentication required", ...error },
	"429": { description: "Rate limit exceeded", ...error },
};

const operation = (
	summary: string,
	options: { body?: boolean; parameters?: unknown[]; mutation?: boolean } = {}
) => ({
	summary,
	tags: [summary.split(" ")[0]!.toLowerCase()],
	...(options.parameters ? { parameters: options.parameters } : {}),
	...(options.body ? { requestBody: { required: true, ...json } } : {}),
	responses: {
		"200": { description: "Success", ...json },
		...(options.mutation
			? {
					"400": { description: "Invalid request", ...error },
					"403": { description: "Invalid origin", ...error },
				}
			: {}),
		...protectedResponses,
	},
});

const idParameter = [{ name: "id", in: "path", required: true, schema: { type: "string" } }];

export const openApiDocument = {
	openapi: "3.1.0",
	info: {
		title: "Synapse API",
		version: "1.0.0",
		description: "Typed Hono API for the Synapse personal archive.",
	},
	servers: [{ url: "/api", description: "Current server" }],
	tags: [
		{ name: "auth", description: "Authentication" },
		{ name: "content", description: "Archive content and tags" },
		{ name: "upload", description: "Media ingestion" },
		{ name: "user", description: "Profile and preferences" },
		{ name: "graph", description: "Content graph" },
		{ name: "ai", description: "AI tag suggestions" },
	],
	paths: {
		"/health": {
			get: {
				summary: "Health check",
				tags: ["system"],
				responses: { "200": { description: "Service is healthy", ...json } },
			},
		},
		"/performance": {
			get: {
				summary: "Server performance history",
				tags: ["system"],
				responses: { "200": { description: "Saved smoke-test history", ...json } },
			},
		},
		"/files/{path}": {
			get: operation("Files private media", {
				parameters: [{ name: "path", in: "path", required: true, schema: { type: "string" } }],
			}),
		},
		"/session": {
			post: operation("Auth session create", { body: true, mutation: true }),
			delete: operation("Auth session delete", { mutation: true }),
		},
		"/auth/register": { post: operation("Auth register", { body: true, mutation: true }) },
		"/auth/login": { post: operation("Auth login", { body: true, mutation: true }) },
		"/auth/desktop/complete": { post: operation("Auth desktop complete", { body: true, mutation: true }) },
		"/auth/desktop/exchange": { post: operation("Auth desktop exchange", { body: true, mutation: true }) },
		"/auth/logout": { post: operation("Auth logout", { mutation: true }) },
		"/auth/refresh": { post: operation("Auth refresh", { mutation: true }) },
		"/content": {
			get: operation("Content list", {
				parameters: [
					{ name: "search", in: "query", schema: { type: "string" } },
					{ name: "cursor", in: "query", schema: { type: "string" } },
					{ name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 50 } },
				],
			}),
			post: operation("Content create", { body: true, mutation: true }),
		},
		"/content/types": { get: operation("Content types") },
		"/content/tags": { get: operation("Content tags") },
		"/content/tags/page": { get: operation("Content tags page") },
		"/content/tags/with-content": { get: operation("Content tags with content") },
		"/content/tags/{id}": { get: operation("Content tag", { parameters: idParameter }) },
		"/content/tags/{id}/color": {
			patch: operation("Content tag color", { parameters: idParameter, body: true, mutation: true }),
		},
		"/content/{id}": {
			get: operation("Content detail", { parameters: idParameter }),
			patch: operation("Content update", { parameters: idParameter, body: true, mutation: true }),
			delete: operation("Content delete", { parameters: idParameter, mutation: true }),
		},
		"/content/{id}/suggestions": { get: operation("Content suggestions", { parameters: idParameter }) },
		"/content/import": { post: operation("Content import", { body: true, mutation: true }) },
		"/upload": { post: operation("Upload ingest", { body: true, mutation: true }) },
		"/user": {
			get: operation("User profile"),
			delete: operation("User account delete", { mutation: true }),
		},
		"/user/storage": { get: operation("User storage") },
		"/user/preferences": {
			get: operation("User preferences"),
			patch: operation("User preferences update", { body: true, mutation: true }),
		},
		"/graph": { get: operation("Graph get") },
		"/ai/usage": { get: operation("AI usage") },
		"/ai/tags": { post: operation("AI tags", { body: true, mutation: true }) },
	},
	components: {
		securitySchemes: { cookieAuth: { type: "apiKey", in: "cookie", name: "synapse_token" } },
	},
} as const;
