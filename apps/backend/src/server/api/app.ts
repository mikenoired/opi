import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { Scalar } from "@scalar/hono-api-reference";
import { canUseSynapseSync } from "@synapse/shared/plans";
import {
	authSchema,
	contentTypeSchema,
	createContentSchema,
	MAX_TAGS_PER_CONTENT,
	updateContentSchema,
} from "@synapse/shared/schemas";
import { Hono } from "hono";
import { setCookie } from "hono/cookie";
import { cors } from "hono/cors";
import { streamSSE } from "hono/streaming";
import { z } from "zod";

import { deleteUserFiles, getFileBuffer, getFileMetadata, getPresignedUrl } from "../../storage/minio";
import { backendSyncProvider } from "../adapters/backend-sync.provider";
import type { Context } from "../context";
import { ApiError, STATUS_CODES } from "../lib/api-error";
import { getUserFromTokens } from "../lib/auth-session";
import { signRefreshToken, signToken, verifyRefreshToken, verifyToken } from "../lib/jwt";
import { log, logError } from "../lib/logger";
import AiUsageRepository from "../repositories/ai-usage.repository";
import AiTaggingService from "../services/ai-tagging.service";
import AuthService from "../services/auth.service";
import ContentService from "../services/content.service";
import { DurableSyncService } from "../services/durable-sync.service";
import GraphService from "../services/graph.service";
import { SyncJournalService } from "../services/sync-journal.service";
import UploadService from "../services/upload.service";
import UserService from "../services/user.service";
import { protectMutation, rateLimit, requestLogger, requireAuth, withContext } from "./middleware";
import { openApiDocument } from "./openapi";

const contentListInput = z.object({
	search: z.string().optional(),
	tagIds: z.array(z.string()).optional(),
	types: z.array(contentTypeSchema).optional(),
	cursor: z.string().optional(),
	limit: z.number().min(1).max(50).optional().default(12),
	includeTags: z.boolean().optional().default(true),
});
const uploadInput = z
	.object({
		files: z
			.array(
				z.object({
					name: z.string().min(1),
					type: z.string().min(1),
					size: z.number().int().nonnegative(),
					content: z.string().min(1),
				})
			)
			.min(1),
		title: z
			.string()
			.trim()
			.transform((value) => value || undefined)
			.optional()
			.nullable(),
		tags: z.array(z.string().trim()).max(MAX_TAGS_PER_CONTENT).optional(),
		makeTrack: z.boolean().optional(),
	})
	.transform(({ files, title, tags, makeTrack }) => ({
		files,
		title: title ?? undefined,
		tags: tags?.filter(Boolean),
		makeTrack,
	}));
const preferencesInput = z
	.object({
		autoTagColorEnabled: z.boolean().optional(),
		colorPalette: z
			.enum(["desert", "twilight", "arctic", "noir", "forest", "ember", "slate", "sakura"])
			.optional(),
		interfaceLanguage: z.enum(["ru", "en"]).optional(),
		mediaAutoplayEnabled: z.boolean().optional(),
		noteSparklesEnabled: z.boolean().optional(),
	})
	.refine((value) => Object.keys(value).length > 0, { message: "At least one preference must be provided" });
const aiInput = z.discriminatedUnion("mode", [
	z
		.object({
			mode: z.literal("draft"),
			type: contentTypeSchema,
			title: z.string().optional(),
			content: z.string().optional(),
			image: z.string().optional(),
		})
		.refine((value) => Boolean(value.image) || Boolean(value.content), {
			message: "Either content or image is required",
		}),
	z.object({ mode: z.literal("existing"), contentId: z.string().min(1) }),
]);
const sessionInput = z.object({ token: z.string().min(1), refreshToken: z.string().optional() });
const desktopAuthCompleteInput = z.object({
	codeChallenge: z.string().regex(/^[A-Za-z0-9_-]{43,128}$/),
	state: z.string().regex(/^[A-Za-z0-9_-]{16,128}$/),
});
const desktopAuthExchangeInput = z.object({
	code: z.string().uuid(),
	codeVerifier: z.string().regex(/^[A-Za-z0-9_-]{43,128}$/),
	state: z.string().regex(/^[A-Za-z0-9_-]{16,128}$/),
});
const syncMutationInput = z
	.object({
		baseRevision: z.number().int().positive().optional(),
		clientMutationId: z.string().uuid(),
		content: createContentSchema.optional(),
		kind: z.enum(["delete", "upsert"]),
		remoteId: z.string().uuid().optional(),
	})
	.superRefine((value, context) => {
		if (value.kind === "upsert" && !value.content) {
			context.addIssue({ code: "custom", message: "Content is required for an upsert" });
		}
		if (value.kind === "delete" && !value.remoteId) {
			context.addIssue({ code: "custom", message: "A remote ID is required for a delete" });
		}
	});
const syncPushInput = z.object({ mutations: z.array(syncMutationInput).min(1).max(100) });
const corsOrigins = (process.env.CORS_ORIGIN || "http://localhost:5173")
	.split(",")
	.map((origin) => origin.trim())
	.filter(Boolean);
const performanceStatsPaths = [
	join(process.cwd(), "docs", "performance", "server-smoke.json"),
	join(process.cwd(), "..", "docs", "performance", "server-smoke.json"),
	join(process.cwd(), "..", "..", "docs", "performance", "server-smoke.json"),
];

async function getPerformanceStats() {
	for (const path of performanceStatsPaths) {
		try {
			return JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
		} catch (error) {
			if (isFileNotFoundError(error)) continue;
			throw error;
		}
	}
	return {};
}

function isFileNotFoundError(error: unknown): error is NodeJS.ErrnoException {
	return error instanceof Error && "code" in error && error.code === "ENOENT";
}

async function body<T extends z.ZodType>(request: Request, schema: T): Promise<z.output<T>> {
	const result = schema.safeParse(await request.json());
	if (!result.success) throw new ApiError("BAD_REQUEST", "Invalid request", z.treeifyError(result.error));
	return result.data;
}

async function uploadBody(request: Request): Promise<z.output<typeof uploadInput>> {
	if (!request.headers.get("content-type")?.startsWith("multipart/form-data")) {
		return body(request, uploadInput);
	}

	const form = await request.formData();
	const files = await Promise.all(
		form
			.getAll("files")
			.filter((value): value is File => value instanceof File)
			.map(async (file) => ({
				content: Buffer.from(await file.arrayBuffer()).toString("base64"),
				name: file.name,
				size: file.size,
				type: file.type || "application/octet-stream",
			}))
	);
	const parsed = uploadInput.safeParse({
		files,
		makeTrack: form.get("makeTrack") === "true",
		tags: form.getAll("tags").filter((value): value is string => typeof value === "string"),
		title: typeof form.get("title") === "string" ? form.get("title") : undefined,
	});
	if (!parsed.success) throw new ApiError("BAD_REQUEST", "Invalid request", z.treeifyError(parsed.error));
	return parsed.data;
}

function query<T extends z.ZodType>(schema: T, value: unknown): z.output<T> {
	const result = schema.safeParse(value);
	if (!result.success)
		throw new ApiError("BAD_REQUEST", "Invalid query parameters", z.treeifyError(result.error));
	return result.data;
}

// Services have not yet been moved to the transport-neutral context. The cast is safe:
// they only consume the request headers exposed by the standard Fetch Request.
function serviceContext(context: import("./context").ApiContext): Context {
	return context as unknown as Context;
}

/** Entitlement is enforced server-side; a Desktop client hint is never authorization. */
async function requireSyncSubscription(context: Context): Promise<void> {
	const user = await new UserService(context).getUser();
	if (!canUseSynapseSync(user.plan)) throw new ApiError("FORBIDDEN", "Synapse Sync requires a paid plan");
}

export const api = new Hono()
	.use(
		"*",
		cors({
			origin: (origin) => (corsOrigins.includes(origin) ? origin : ""),
			credentials: true,
			allowMethods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
		})
	)
	.use("*", withContext)
	.use("*", requestLogger)
	.onError((error, c) => {
		if (error instanceof ApiError) {
			log("warn", "http.rejected", {
				requestId: c.get("apiContext")?.requestId,
				method: c.req.method,
				path: new URL(c.req.url).pathname,
				status: error.status,
				code: error.code,
			});
			return new Response(
				JSON.stringify({ error: error.message, code: error.code, fieldErrors: error.treeifyErrors ?? null }),
				{
					status: error.status,
					headers: { "Content-Type": "application/json" },
				}
			);
		}
		logError("http.error", error, {
			requestId: c.get("apiContext")?.requestId,
			method: c.req.method,
			path: new URL(c.req.url).pathname,
		});
		const apiError = error as { code?: string; message?: string };
		const code = apiError.code as ApiError["code"] | undefined;
		const status = code ? (STATUS_CODES[code] ?? 500) : 500;
		return c.json(
			{
				error: apiError.message || "Internal server error",
				code: code || "INTERNAL_SERVER_ERROR",
				fieldErrors: null,
			},
			status
		);
	})
	.get("/openapi.json", (c) => c.json(openApiDocument))
	.get("/performance", async (c) => c.json(await getPerformanceStats()))
	.get(
		"/docs",
		Scalar({
			pageTitle: "Synapse API Reference",
			url: "/api/openapi.json",
			metaData: { title: "Synapse API Reference" },
		})
	)
	.get("/health", (c) => c.json({ ok: true as const }))
	.get("/sync/events", requireAuth, (c) => {
		const userId = c.get("apiContext").user!.id;
		return streamSSE(c, async (stream) => {
			await stream.writeSSE({ event: "ready", data: "{}" });
			await new Promise<void>((resolve) => {
				const unsubscribe = backendSyncProvider.subscribe(userId, async (event) => {
					try {
						await stream.writeSSE({ data: JSON.stringify(event), event: "change", id: event.id });
					} catch {
						unsubscribe();
						resolve();
					}
				});
				c.req.raw.signal.addEventListener(
					"abort",
					() => {
						unsubscribe();
						resolve();
					},
					{ once: true }
				);
			});
		});
	})
	.get("/sync/pull", requireAuth, rateLimit("sync"), async (c) => {
		const context = serviceContext(c.get("apiContext"));
		await requireSyncSubscription(context);
		return c.json(await new DurableSyncService(context).pull(c.req.query("cursor")));
	})
	.post("/sync/push", requireAuth, protectMutation, rateLimit("sync"), async (c) => {
		const context = serviceContext(c.get("apiContext"));
		await requireSyncSubscription(context);
		return c.json(
			await new DurableSyncService(context).push((await body(c.req.raw, syncPushInput)).mutations)
		);
	})
	.post("/sync/delete-all", requireAuth, protectMutation, rateLimit("sync"), async (c) => {
		const context = serviceContext(c.get("apiContext"));
		await requireSyncSubscription(context);
		await new DurableSyncService(context).deleteAll();
		return c.json({ success: true });
	})
	.post("/sync/upload", requireAuth, protectMutation, rateLimit("sync"), async (c) => {
		const context = serviceContext(c.get("apiContext"));
		await requireSyncSubscription(context);
		const uploaded = await new UploadService(context).handleUpload(await uploadBody(c.req.raw));
		const journal = new SyncJournalService(context);
		return c.json({
			...uploaded,
			contents: await Promise.all(
				uploaded.contents.map(async (content) => ({
					content,
					revision: await journal.ensureSnapshot(content),
				}))
			),
		});
	})
	.get("/sync/assets", requireAuth, rateLimit("sync"), async (c) => {
		const context = serviceContext(c.get("apiContext"));
		await requireSyncSubscription(context);
		const keys = (c.req.queries("key") ?? []).slice(0, 100);
		return c.json({
			assets: await Promise.all(
				keys.map(async (storageKey) => {
					const metadata = await getFileMetadata(storageKey);
					const bytes = await getFileBuffer(storageKey);
					const [, ownerId] = storageKey.split("/");
					if (!metadata || !bytes || ownerId !== context.user!.id)
						throw new ApiError("FORBIDDEN", "Asset access denied");
					return {
						assetId: storageKey,
						mimeType: metadata.contentType || "application/octet-stream",
						sha256: createHash("sha256").update(bytes).digest("hex"),
						size: metadata.size,
						storageKey,
					};
				})
			),
		});
	})
	.get("/files/*", rateLimit("sync"), async (c) => {
		const requestPath = new URL(c.req.url).pathname;
		const filesPathIndex = requestPath.indexOf("/files/");
		const encodedObjectName =
			filesPathIndex >= 0 ? requestPath.slice(filesPathIndex + "/files/".length).replace(/^\/+/, "") : "";
		let objectName: string;
		try {
			objectName = decodeURIComponent(encodedObjectName);
		} catch {
			throw new ApiError("BAD_REQUEST", "Invalid file path");
		}
		const user = c.get("apiContext").user ?? getUserFromTokens(c.req.query("token"));
		const [, ownerId] = objectName.split("/");

		if (!user) throw new ApiError("UNAUTHORIZED", "Authentication required");
		if (!objectName || objectName.includes("..") || !ownerId || ownerId !== user.id)
			throw new ApiError("FORBIDDEN", "File access denied");

		return c.redirect(await getPresignedUrl(objectName, 60 * 60), 302);
	})
	.post("/session", protectMutation, rateLimit("mutation"), async (c) => {
		const input = await body(c.req.raw, sessionInput);
		const payload = verifyToken(input.token);
		if (!payload) throw new ApiError("UNAUTHORIZED", "Invalid token");

		setCookie(c, "synapse_token", input.token, {
			httpOnly: true,
			secure: process.env.NODE_ENV === "production",
			sameSite: "Strict",
			maxAge: 60 * 60 * 24,
			path: "/",
		});
		if (input.refreshToken && verifyRefreshToken(input.refreshToken)) {
			setCookie(c, "synapse_refresh_token", input.refreshToken, {
				httpOnly: true,
				secure: process.env.NODE_ENV === "production",
				sameSite: "Strict",
				maxAge: 60 * 60 * 24 * 7,
				path: "/",
			});
		}

		return c.json({ success: true, user: { id: payload.userId, email: payload.email } });
	})
	.delete("/session", protectMutation, rateLimit("mutation"), (c) => {
		setCookie(c, "synapse_token", "", { maxAge: 0, path: "/" });
		setCookie(c, "synapse_refresh_token", "", { maxAge: 0, path: "/" });
		return c.json({ success: true });
	})
	.post("/auth/register", protectMutation, rateLimit("mutation"), async (c) =>
		c.json(
			await new AuthService(serviceContext(c.get("apiContext"))).register(
				...(Object.values(await body(c.req.raw, authSchema)) as [string, string])
			)
		)
	)
	.post("/auth/login", protectMutation, rateLimit("mutation"), async (c) =>
		c.json(
			await new AuthService(serviceContext(c.get("apiContext"))).login(
				...(Object.values(await body(c.req.raw, authSchema)) as [string, string])
			)
		)
	)
	.post("/auth/desktop/complete", requireAuth, protectMutation, rateLimit("mutation"), async (c) => {
		const input = await body(c.req.raw, desktopAuthCompleteInput);
		const code = crypto.randomUUID();
		await c
			.get("apiContext")
			.cache.setJSON(
				`desktop-auth:${code}`,
				{ codeChallenge: input.codeChallenge, state: input.state, user: c.get("apiContext").user },
				120
			);
		return c.json({ code });
	})
	.post("/auth/desktop/exchange", protectMutation, rateLimit("mutation"), async (c) => {
		const input = await body(c.req.raw, desktopAuthExchangeInput);
		const grant = await c
			.get("apiContext")
			.cache.takeJSON<{ codeChallenge: string; state: string; user: { id: string; email: string } }>(
				`desktop-auth:${input.code}`
			);
		const codeChallenge = createHash("sha256").update(input.codeVerifier).digest("base64url");
		if (!grant || grant.state !== input.state || grant.codeChallenge !== codeChallenge)
			throw new ApiError("UNAUTHORIZED", "Invalid or expired desktop authorization");
		return c.json({
			refreshToken: signRefreshToken({ userId: grant.user.id, email: grant.user.email }),
			token: signToken({ userId: grant.user.id, email: grant.user.email }),
			user: grant.user,
		});
	})
	.post("/auth/logout", protectMutation, rateLimit("mutation"), async (c) =>
		c.json(await new AuthService(serviceContext(c.get("apiContext"))).logout())
	)
	.post("/auth/refresh", protectMutation, rateLimit("mutation"), async (c) => {
		const refreshToken = c.get("apiContext").refreshToken;
		const payload = refreshToken && verifyRefreshToken(refreshToken);
		if (!payload) throw new ApiError("UNAUTHORIZED", "Refresh token not found");
		return c.json({
			token: signToken({ userId: payload.userId, email: payload.email }),
			refreshToken: signRefreshToken({ userId: payload.userId, email: payload.email }),
		});
	})
	.get("/content", requireAuth, rateLimit("query"), async (c) => {
		const input = query(contentListInput, {
			search: c.req.query("search"),
			tagIds: c.req.queries("tagIds"),
			types: c.req.queries("types"),
			cursor: c.req.query("cursor"),
			limit: c.req.query("limit") ? Number(c.req.query("limit")) : undefined,
			includeTags: c.req.query("includeTags") !== "false",
		});
		return c.json(
			await new ContentService(c.get("apiContext")).getAll(
				input.search,
				input.types,
				input.tagIds,
				input.cursor,
				input.limit,
				input.includeTags
			)
		);
	})
	.get("/content/types", requireAuth, rateLimit("query"), async (c) =>
		c.json(await new ContentService(c.get("apiContext")).getAvailableTypes())
	)
	.get("/content/tags", requireAuth, rateLimit("query"), async (c) =>
		c.json(await new ContentService(c.get("apiContext")).getTags())
	)
	.get("/content/tags/page", requireAuth, rateLimit("query"), async (c) =>
		c.json(
			await new ContentService(c.get("apiContext")).getTagsWithContentPage(
				c.req.query("cursor"),
				Number(c.req.query("limit") ?? 24)
			)
		)
	)
	.get("/content/tags/with-content", requireAuth, rateLimit("query"), async (c) =>
		c.json(await new ContentService(c.get("apiContext")).getTagsWithContent())
	)
	.get("/content/tags/:id", requireAuth, rateLimit("query"), async (c) =>
		c.json(await new ContentService(c.get("apiContext")).getTagById(c.req.param("id")))
	)
	.get("/content/:id/suggestions", requireAuth, rateLimit("query"), async (c) =>
		c.json(
			await new ContentService(c.get("apiContext")).getSuggestions(
				c.req.param("id"),
				c.req.query("cursor"),
				Number(c.req.query("limit") ?? 12)
			)
		)
	)
	.get("/content/:id", requireAuth, rateLimit("query"), async (c) =>
		c.json(await new ContentService(c.get("apiContext")).getById(c.req.param("id")))
	)
	.post("/content", requireAuth, protectMutation, rateLimit("mutation"), async (c) =>
		c.json(await new ContentService(c.get("apiContext")).create(await body(c.req.raw, createContentSchema)))
	)
	.patch("/content/:id", requireAuth, protectMutation, rateLimit("mutation"), async (c) => {
		const input = await body(c.req.raw, updateContentSchema);
		if (input.id !== c.req.param("id")) {
			throw new ApiError("BAD_REQUEST", "Content ID must match the request path");
		}
		return c.json(await new ContentService(c.get("apiContext")).update(input));
	})
	.delete("/content/:id", requireAuth, protectMutation, rateLimit("mutation"), async (c) =>
		c.json(await new ContentService(c.get("apiContext")).delete(c.req.param("id")))
	)
	.patch("/content/tags/:id/color", requireAuth, protectMutation, rateLimit("sync"), async (c) =>
		c.json(
			await new ContentService(c.get("apiContext")).updateTagColor(
				c.req.param("id"),
				(await body(c.req.raw, z.object({ color: z.number().int().min(0).max(255) }))).color
			)
		)
	)
	.post("/content/import", requireAuth, protectMutation, rateLimit("mutation"), async (c) =>
		c.json(
			await new ContentService(c.get("apiContext")).importFile(
				await body(
					c.req.raw,
					z.object({
						title: z.string().optional(),
						tags: z.array(z.string()).max(MAX_TAGS_PER_CONTENT).optional(),
						file: z.object({
							name: z.string(),
							type: z.string(),
							size: z.number(),
							buffer: z.array(z.number()),
						}),
					})
				)
			)
		)
	)
	.post("/upload", requireAuth, protectMutation, rateLimit("mutation"), async (c) =>
		c.json(await new UploadService(c.get("apiContext")).handleUpload(await uploadBody(c.req.raw)))
	)
	.get("/user", requireAuth, rateLimit("query"), async (c) =>
		c.json(await new UserService(c.get("apiContext")).getUser())
	)
	.get("/user/sync/entitlement", requireAuth, rateLimit("query"), async (c) => {
		const user = await new UserService(c.get("apiContext")).getUser();
		return c.json({ eligible: canUseSynapseSync(user.plan), plan: user.plan });
	})
	.delete("/user", requireAuth, protectMutation, rateLimit("mutation"), async (c) => {
		const userId = c.get("apiContext").user!.id;
		await deleteUserFiles(userId);
		return c.json(await new UserService(c.get("apiContext")).deleteAccount());
	})
	.get("/user/storage", requireAuth, rateLimit("query"), async (c) =>
		c.json(await new UserService(c.get("apiContext")).getStorageUsage())
	)
	.get("/user/preferences", requireAuth, rateLimit("query"), async (c) =>
		c.json(await new UserService(c.get("apiContext")).getPreferences())
	)
	.patch("/user/preferences", requireAuth, protectMutation, rateLimit("mutation"), async (c) =>
		c.json(
			await new UserService(c.get("apiContext")).updatePreferences(await body(c.req.raw, preferencesInput))
		)
	)
	.get("/graph", requireAuth, rateLimit("query"), async (c) =>
		c.json(await new GraphService(c.get("apiContext")).getGraph())
	)
	.get("/ai/usage", requireAuth, rateLimit("query"), async (c) =>
		c.json(await new AiUsageRepository(c.get("apiContext")).getOverview())
	)
	.post("/ai/tags", requireAuth, protectMutation, rateLimit("mutation"), async (c) =>
		c.json(await new AiTaggingService(c.get("apiContext")).suggestTags(await body(c.req.raw, aiInput)))
	);

export type Api = typeof api;
