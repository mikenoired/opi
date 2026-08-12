import {
	useInfiniteQuery,
	useMutation,
	useQuery,
	useQueryClient,
	type InfiniteData,
	type UseInfiniteQueryOptions,
	type UseInfiniteQueryResult,
	type UseMutationOptions,
	type UseMutationResult,
	type UseQueryOptions,
	type UseQueryResult,
} from "@tanstack/react-query";
import { useMemo } from "react";

import type {
	AiTagsInput,
	AiUsage,
	AvailableTypes,
	AiTagsResult,
	ContentDetail,
	ContentList,
	ContentListInput,
	ContentSuggestionsInput,
	ContentTags,
	CreateContentResult,
	DeleteContentResult,
	CreateContentInput,
	Graph,
	ImportFileInput,
	ImportFileResult,
	Preferences,
	PreferencesInput,
	StorageUsage,
	Suggestions,
	TagsPage,
	TagsPageInput,
	TagsWithContent,
	UpdateContentInput,
	UpdateContentResult,
	UpdateTagColorInput,
	UploadInput,
	UploadResult,
	User,
} from "@/shared/api/contracts";
import { apiUrl } from "@/shared/config/api";

type Input = Record<string, unknown> | undefined;
type QueryOptions<T> = Omit<UseQueryOptions<T, Error, T>, "queryKey" | "queryFn">;
type InfiniteOptions<T> = Omit<
	UseInfiniteQueryOptions<T, Error, InfiniteData<T>, readonly unknown[], unknown>,
	"queryKey" | "queryFn" | "initialPageParam"
>;
type MutationOptions<TData, TVariables> = Omit<UseMutationOptions<TData, Error, TVariables>, "mutationFn">;
type Query<T> = (input?: undefined, options?: QueryOptions<T>) => UseQueryResult<T, Error>;
type Infinite<TInput, TOutput> = (
	input: TInput,
	options?: InfiniteOptions<TOutput>
) => UseInfiniteQueryResult<InfiniteData<TOutput>, Error>;
type Mutation<TInput, TOutput> = (
	options?: MutationOptions<TOutput, TInput>
) => UseMutationResult<TOutput, Error, TInput>;
type UtilsEndpoint<TInput, TOutput> = {
	invalidate: (input?: TInput) => Promise<unknown>;
	setData: (
		input: TInput,
		updater: TOutput | ((current: TOutput | undefined) => TOutput | undefined)
	) => void;
	fetch: (input: TInput) => Promise<TOutput>;
};
type ClientUtils = {
	content: {
		getAll: UtilsEndpoint<ContentListInput, ContentList>;
		getById: UtilsEndpoint<{ id: string }, ContentDetail>;
		getTagById: UtilsEndpoint<{ id: string }, ContentTags[number]>;
		getTags: UtilsEndpoint<undefined, ContentTags>;
		getTagsWithContent: UtilsEndpoint<undefined, TagsWithContent>;
		getTagsWithContentPage: UtilsEndpoint<TagsPageInput, TagsPage>;
		getSuggestions: UtilsEndpoint<ContentSuggestionsInput, Suggestions>;
		getAvailableTypes: UtilsEndpoint<undefined, AvailableTypes>;
	};
	graph: { getGraph: UtilsEndpoint<undefined, Graph> };
	user: {
		getUser: UtilsEndpoint<undefined, User>;
		getStorageUsage: UtilsEndpoint<undefined, StorageUsage>;
		getPreferences: UtilsEndpoint<undefined, Preferences>;
	};
};

function queryString(input?: Input) {
	const params = new URLSearchParams();
	for (const [key, value] of Object.entries(input ?? {})) {
		if (value === undefined) continue;
		if (Array.isArray(value)) value.forEach((entry) => params.append(key, String(entry)));
		else params.set(key, String(value));
	}
	const result = params.toString();
	return result ? `?${result}` : "";
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
	const response = await fetch(apiUrl(path), {
		...init,
		credentials: "include",
		headers: { "Content-Type": "application/json", ...init?.headers },
	});
	if (!response.ok) {
		const error = (await response.json().catch(() => null)) as { error?: string } | null;
		throw new Error(error?.error || "Request failed");
	}
	return response.json() as Promise<T>;
}

const keys = {
	content: {
		getAll: (input?: Input) => ["content", "getAll", input] as const,
		getById: (input?: Input) => ["content", "getById", input] as const,
		getTags: () => ["content", "getTags"] as const,
		getTagsWithContent: () => ["content", "getTagsWithContent"] as const,
		getTagsWithContentPage: (input?: Input) => ["content", "getTagsWithContentPage", input] as const,
		getSuggestions: (input?: Input) => ["content", "getSuggestions", input] as const,
		getAvailableTypes: () => ["content", "getAvailableTypes"] as const,
	},
	graph: { getGraph: () => ["graph", "getGraph"] as const },
	user: {
		getUser: () => ["user", "getUser"] as const,
		getStorageUsage: () => ["user", "getStorageUsage"] as const,
		getPreferences: () => ["user", "getPreferences"] as const,
	},
	ai: { getUsageOverview: () => ["ai", "getUsageOverview"] as const },
};

function json(body: unknown): RequestInit {
	return { method: "POST", body: JSON.stringify(body) };
}

// Query-hook facade: keeps feature components small while every request goes to Hono.
// It deliberately contains no generated client/runtime dependency and can be removed as features
// are converted to explicit queryOptions factories.
const runtimeApi = {
	content: {
		getAll: {
			useInfiniteQuery: (input: Input, options: any = {}) =>
				useInfiniteQuery({
					queryKey: keys.content.getAll(input),
					queryFn: ({ pageParam }) => request(`/content${queryString({ ...input, cursor: pageParam })}`),
					initialPageParam: undefined,
					getNextPageParam: (page: any) => page.nextCursor,
					...options,
				}),
		},
		getById: {
			useQuery: (input: any, options?: any) =>
				useQuery({
					queryKey: keys.content.getById(input),
					queryFn: () => request(`/content/${input.id}`),
					...options,
				}),
		},
		getTags: {
			useQuery: (_input?: Input, options?: any) =>
				useQuery({ queryKey: keys.content.getTags(), queryFn: () => request("/content/tags"), ...options }),
		},
		getTagsWithContent: {
			useQuery: (_input?: Input, options?: any) =>
				useQuery({
					queryKey: keys.content.getTagsWithContent(),
					queryFn: () => request("/content/tags/with-content"),
					...options,
				}),
		},
		getTagsWithContentPage: {
			useInfiniteQuery: (input: Input, options: any = {}) =>
				useInfiniteQuery({
					queryKey: keys.content.getTagsWithContentPage(input),
					queryFn: ({ pageParam }) =>
						request(`/content/tags/page${queryString({ ...input, cursor: pageParam })}`),
					initialPageParam: undefined,
					getNextPageParam: (page: any) => page.nextCursor,
					...options,
				}),
		},
		getSuggestions: {
			useInfiniteQuery: (input: any, options: any = {}) =>
				useInfiniteQuery({
					queryKey: keys.content.getSuggestions(input),
					queryFn: ({ pageParam }) =>
						request(`/content/${input.contentId}/suggestions${queryString({ ...input, cursor: pageParam })}`),
					initialPageParam: undefined,
					getNextPageParam: (page: any) => page.nextCursor,
					...options,
				}),
		},
		getAvailableTypes: {
			useQuery: (_input?: Input, options?: any) =>
				useQuery({
					queryKey: keys.content.getAvailableTypes(),
					queryFn: () => request("/content/types"),
					...options,
				}),
		},
		create: {
			useMutation: (options: any = {}) =>
				useMutation({ mutationFn: (input: unknown) => request("/content", json(input)), ...options }),
		},
		update: {
			useMutation: (options: any = {}) =>
				useMutation({
					mutationFn: (input: any) =>
						request(`/content/${input.id}`, { method: "PATCH", body: JSON.stringify(input) }),
					...options,
				}),
		},
		delete: {
			useMutation: (options: any = {}) =>
				useMutation({
					mutationFn: (input: any) => request(`/content/${input.id}`, { method: "DELETE" }),
					...options,
				}),
		},
		updateTagColor: {
			useMutation: (options: any = {}) =>
				useMutation({
					mutationFn: (input: any) =>
						request(`/content/tags/${input.id}/color`, {
							method: "PATCH",
							body: JSON.stringify({ color: input.color }),
						}),
					...options,
				}),
		},
		importFile: {
			useMutation: (options: any = {}) =>
				useMutation({ mutationFn: (input: unknown) => request("/content/import", json(input)), ...options }),
		},
	},
	upload: {
		formData: {
			useMutation: (options: any = {}) =>
				useMutation({ mutationFn: (input: unknown) => request("/upload", json(input)), ...options }),
		},
	},
	graph: {
		getGraph: {
			useQuery: (_input?: Input, options?: any) =>
				useQuery({ queryKey: keys.graph.getGraph(), queryFn: () => request("/graph"), ...options }),
		},
	},
	user: {
		getUser: {
			useQuery: (_input?: Input, options?: any) =>
				useQuery({ queryKey: keys.user.getUser(), queryFn: () => request("/user"), ...options }),
		},
		getStorageUsage: {
			useQuery: (_input?: Input, options?: any) =>
				useQuery({
					queryKey: keys.user.getStorageUsage(),
					queryFn: () => request("/user/storage"),
					...options,
				}),
		},
		getPreferences: {
			useQuery: (_input?: Input, options?: any) =>
				useQuery({
					queryKey: keys.user.getPreferences(),
					queryFn: () => request("/user/preferences"),
					...options,
				}),
		},
		updatePreferences: {
			useMutation: (options: any = {}) =>
				useMutation({
					mutationFn: (input: unknown) =>
						request("/user/preferences", { method: "PATCH", body: JSON.stringify(input) }),
					...options,
				}),
		},
		deleteAccount: {
			useMutation: (options: any = {}) =>
				useMutation({ mutationFn: () => request("/user", { method: "DELETE" }), ...options }),
		},
	},
	ai: {
		getUsageOverview: {
			useQuery: (_input?: Input, options?: any) =>
				useQuery({ queryKey: keys.ai.getUsageOverview(), queryFn: () => request("/ai/usage"), ...options }),
		},
		suggestTags: {
			useMutation: (options: any = {}) =>
				useMutation({ mutationFn: (input: unknown) => request("/ai/tags", json(input)), ...options }),
		},
	},
	useUtils: () => {
		const queryClient = useQueryClient();
		return useMemo(() => {
			const operation = (
				key: readonly unknown[],
				fetcher: (input: any) => Promise<any> = () => Promise.resolve(undefined)
			) => ({
				invalidate: (input?: Input) =>
					queryClient.invalidateQueries({ queryKey: input ? [...key, input] : key }),
				setData: (input: Input, value: unknown) => queryClient.setQueryData([...key, input], value),
				fetch: fetcher,
			});

			return {
				content: {
					...Object.fromEntries(
						Object.entries(keys.content).map(([name, makeKey]) => [name, operation((makeKey as any)())])
					),
					getById: operation(keys.content.getById(), (input) => request(`/content/${input.id}`)),
					getTagById: operation(["content", "getTagById"]),
				},
				graph: { getGraph: operation(keys.graph.getGraph()) },
				user: Object.fromEntries(
					Object.entries(keys.user).map(([name, makeKey]) => [name, operation((makeKey as any)())])
				),
				ai: { getUsageOverview: operation(keys.ai.getUsageOverview()) },
			};
		}, [queryClient]);
	},
};

interface Client {
	content: {
		getAll: { useInfiniteQuery: Infinite<ContentListInput, ContentList> };
		getById: {
			useQuery: (
				input: { id: string },
				options?: QueryOptions<ContentDetail>
			) => UseQueryResult<ContentDetail, Error>;
		};
		getTags: { useQuery: Query<ContentTags> };
		getTagsWithContent: { useQuery: Query<TagsWithContent> };
		getTagsWithContentPage: { useInfiniteQuery: Infinite<TagsPageInput, TagsPage> };
		getSuggestions: { useInfiniteQuery: Infinite<ContentSuggestionsInput, Suggestions> };
		getAvailableTypes: { useQuery: Query<AvailableTypes> };
		create: { useMutation: Mutation<CreateContentInput, CreateContentResult> };
		update: { useMutation: Mutation<UpdateContentInput, UpdateContentResult> };
		delete: { useMutation: Mutation<{ id: string }, DeleteContentResult> };
		updateTagColor: { useMutation: Mutation<UpdateTagColorInput, ContentTags[number]> };
		importFile: { useMutation: Mutation<ImportFileInput, ImportFileResult> };
	};
	upload: { formData: { useMutation: Mutation<UploadInput, UploadResult> } };
	graph: { getGraph: { useQuery: Query<Graph> } };
	user: {
		getUser: { useQuery: Query<User> };
		getStorageUsage: { useQuery: Query<StorageUsage> };
		getPreferences: { useQuery: Query<Preferences> };
		updatePreferences: { useMutation: Mutation<PreferencesInput, Preferences> };
		deleteAccount: { useMutation: Mutation<undefined, unknown> };
	};
	ai: {
		getUsageOverview: { useQuery: Query<AiUsage> };
		suggestTags: { useMutation: Mutation<AiTagsInput, AiTagsResult> };
	};
	useUtils: () => ClientUtils;
}

export const api = runtimeApi as unknown as Client;
