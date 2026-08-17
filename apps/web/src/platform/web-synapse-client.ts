import { createParsedLinkFallback } from "@synapse/api";
import type {
	AiTagsResult,
	AiUsage,
	AuthCredentials,
	AuthResult,
	ContentClient,
	ContentList,
	ContentListInput,
	ContentSuggestions,
	ContentTag,
	CurrentUser,
	Graph,
	ImportFileInput,
	ImportFileResult,
	ParseLinkInput,
	StorageUsage,
	SyncEntitlement,
	SyncRunResult,
	SynapseClient,
	TagsPage,
	TagsWithContent,
	UpdateTagColorInput,
	UploadInput,
	UploadResult,
} from "@synapse/api";
import type { UserPreferences } from "@synapse/shared/preferences";
import type { Content, CreateContent, UpdateContent } from "@synapse/shared/schemas";

import { apiUrl } from "@/shared/config/api";

import { webSyncRuntime, type WebSyncRuntime } from "./web-sync";

type WebMutationRuntime = Pick<WebSyncRuntime, "mutate" | "readEntity" | "readEntityVersion">;

/** Browser implementation of the shared UI client contract. */
export function createWebSynapseClient(syncRuntime: WebMutationRuntime = webSyncRuntime): SynapseClient {
	return {
		account: {
			getCurrentUser: () => request<CurrentUser | null>("/user", { allowUnauthorized: true }),
			getPreferences: () => request<UserPreferences>("/user/preferences"),
			getStorageUsage: () => request<StorageUsage>("/user/storage"),
			signIn: (input) => authenticate("/auth/login", input),
			signOut: async () => {
				await request("/session", { method: "DELETE", allowUnauthorized: true });
			},
			signUp: (input) => authenticate("/auth/register", input),
			updatePreferences: (input) =>
				request<UserPreferences>("/user/preferences", { body: input, method: "PATCH" }),
		},
		ai: {
			getUsageOverview: () => request<AiUsage>("/ai/usage"),
			suggestTags: (input) => request<AiTagsResult>("/ai/tags", { body: input }),
		},
		content: createContentClient(syncRuntime),
		graph: { get: () => request<Graph>("/graph") },
		sync: {
			getEntitlement: () => request<SyncEntitlement>("/user/sync/entitlement"),
			getStatus: async () => ({ conflicts: 0, failed: 0, lastSyncedAt: null, pending: 0 }),
			syncNow: async () => unsupportedSync(),
		},
	};
}

function createContentClient(syncRuntime: WebMutationRuntime): ContentClient {
	return {
		create: async (input) => {
			const entityId = crypto.randomUUID();
			try {
				await syncRuntime.mutate({
					entityId,
					entityType: "content",
					mutationId: crypto.randomUUID(),
					operation: "upsert",
					payload: input,
				});
				const canonical = await syncRuntime.readEntity("content", entityId);
				if (!canonical?.payload || typeof canonical.payload !== "object")
					throw new Error("Synapse Sync did not return the created content");
				return canonical.payload as Content;
			} catch (error) {
				if (error instanceof Error && error.message === "Web sync is not running")
					return request<Content>("/content", { body: input });
				throw error;
			}
		},
		delete: (id) =>
			mutateContent(syncRuntime, { entityId: id, operation: "delete" }, () =>
				request<{ success: true }>("/content/" + encodeURIComponent(id), { method: "DELETE" })
			).then((result) => result ?? { success: true }),
		get: (id) => request<Content>("/content/" + encodeURIComponent(id)),
		getAvailableTypes: () => request<Content["type"][]>("/content/types"),
		getSuggestions: (input) =>
			request<ContentSuggestions>(
				`/content/${encodeURIComponent(input.contentId)}/suggestions${queryString(input)}`
			),
		getTag: async (id) => request<ContentTag | undefined>("/content/tags/" + encodeURIComponent(id)),
		getTags: () => request<ContentTag[]>("/content/tags"),
		getTagsWithContent: () => request<TagsWithContent>("/content/tags/with-content"),
		getTagsWithContentPage: (input) => request<TagsPage>("/content/tags/page" + queryString(input)),
		importFile: async ({ file, tags, title }: ImportFileInput) =>
			request<ImportFileResult>("/content/import", {
				body: { file: { ...file, buffer: Array.from(file.bytes) }, tags, title },
			}),
		list: (input: ContentListInput) => request<ContentList>("/content" + queryString(input)),
		parseLink: ({ url }: ParseLinkInput) => Promise.resolve(createParsedLinkFallback(url)),
		update: async (input: UpdateContent) => {
			const current = await request<Content>("/content/" + encodeURIComponent(input.id));
			const updated = { ...current, ...input };
			await mutateContent(
				syncRuntime,
				{ entityId: input.id, operation: "upsert", payload: toCreateContent(updated) },
				() => request<Content>("/content/" + encodeURIComponent(input.id), { body: input, method: "PATCH" })
			);
			return updated;
		},
		updateTagColor: async (input: UpdateTagColorInput) => {
			const current = await request<ContentTag>("/content/tags/" + encodeURIComponent(input.id));
			try {
				await syncRuntime.mutate({
					baseEntityVersion: await syncRuntime.readEntityVersion("tag", input.id),
					entityId: input.id,
					entityType: "tag",
					mutationId: crypto.randomUUID(),
					operation: "upsert",
					payload: { color: input.color, id: input.id, title: current.title },
				});
				return { ...current, color: input.color };
			} catch (error) {
				if (error instanceof Error && error.message === "Web sync is not running")
					return request<ContentTag>("/content/tags/" + encodeURIComponent(input.id) + "/color", {
						body: { color: input.color },
						method: "PATCH",
					});
				throw error;
			}
		},
		upload: async ({ files, makeTrack, tags, title }: UploadInput) =>
			uploadMultipart(files, { makeTrack, tags, title }),
	};
}

async function mutateContent<T>(
	syncRuntime: WebMutationRuntime,
	intent: { entityId: string; operation: "delete" | "upsert"; payload?: CreateContent },
	compatibilityMutation: () => Promise<T>
): Promise<T | void> {
	try {
		await syncRuntime.mutate({
			baseEntityVersion: await syncRuntime.readEntityVersion("content", intent.entityId),
			entityId: intent.entityId,
			entityType: "content",
			mutationId: crypto.randomUUID(),
			operation: intent.operation,
			payload: intent.payload,
		});
	} catch (error) {
		if (error instanceof Error && error.message === "Web sync is not running") return compatibilityMutation();
		throw error;
	}
}

function toCreateContent(content: Content): CreateContent {
	return {
		content: content.content,
		document_images: content.document_images,
		media_height: content.media_height,
		media_type: content.media_type ?? "image",
		media_url: content.media_url,
		media_width: content.media_width,
		tag_ids: content.tag_ids,
		tags: content.tags,
		thumbnail_base64: content.thumbnail_base64,
		thumbnail_url: content.thumbnail_url,
		title: content.title,
		type: content.type,
		url: content.url,
	};
}

async function authenticate(path: string, input: AuthCredentials): Promise<AuthResult> {
	try {
		const payload = await request<{
			refreshToken?: string;
			token?: string;
			user?: { email: string; id: string };
		}>(path, {
			body: input,
		});
		if (!payload.token)
			return { error: { message: "Authentication response has no access token" }, user: null };
		await request("/session", { body: { refreshToken: payload.refreshToken, token: payload.token } });
		return { error: null, user: await request<CurrentUser>("/user") };
	} catch (cause) {
		return { error: toAuthError(cause), user: null };
	}
}

function queryString(input: object) {
	const params = new URLSearchParams();
	for (const [key, value] of Object.entries(input)) {
		if (value === undefined) continue;
		if (Array.isArray(value)) value.forEach((item) => params.append(key, String(item)));
		else params.set(key, String(value));
	}
	const result = params.toString();
	return result ? `?${result}` : "";
}

async function request<T>(
	path: string,
	options: { allowUnauthorized?: boolean; body?: unknown; method?: "DELETE" | "PATCH" | "POST" } = {}
): Promise<T> {
	const response = await fetch(apiUrl(path), {
		body: options.body === undefined ? undefined : JSON.stringify(options.body),
		credentials: "include",
		headers: options.body === undefined ? undefined : { "Content-Type": "application/json" },
		method: options.method ?? (options.body === undefined ? "GET" : "POST"),
	});
	if (options.allowUnauthorized && response.status === 401) return null as T;
	if (!response.ok) throw await toApiError(response);
	return (await response.json()) as T;
}

async function toApiError(response: Response) {
	const body = (await response.json().catch(() => null)) as {
		error?: string;
		fieldErrors?: Record<string, string[] | undefined>;
	} | null;
	const error = new Error(body?.error || `Request failed with ${response.status}`) as Error & {
		fieldErrors?: Record<string, string[] | undefined>;
	};
	error.fieldErrors = body?.fieldErrors;
	return error;
}

function toAuthError(cause: unknown) {
	const error = cause as Error & { fieldErrors?: Record<string, string[] | undefined> };
	return {
		fieldErrors: error.fieldErrors
			? { email: error.fieldErrors.email?.[0], password: error.fieldErrors.password?.[0] }
			: undefined,
		message: error instanceof Error ? error.message : "Authentication failed",
	};
}

async function uploadMultipart(
	files: UploadInput["files"],
	metadata: Pick<UploadInput, "makeTrack" | "tags" | "title">
): Promise<UploadResult> {
	const form = new FormData();
	for (const file of files) {
		const bytes = new Uint8Array(file.bytes.byteLength);
		bytes.set(file.bytes);
		form.append("files", new Blob([bytes.buffer], { type: file.type }), file.name);
	}
	if (metadata.title) form.append("title", metadata.title);
	if (metadata.makeTrack !== undefined) form.append("makeTrack", String(metadata.makeTrack));
	for (const tag of metadata.tags ?? []) form.append("tags", tag);

	const response = await fetch(apiUrl("/upload"), { body: form, credentials: "include", method: "POST" });
	if (!response.ok) throw await toApiError(response);
	return (await response.json()) as UploadResult;
}

function unsupportedSync(): Promise<SyncRunResult> {
	return Promise.reject(new Error("Synapse Sync is only available from a local-first client"));
}
