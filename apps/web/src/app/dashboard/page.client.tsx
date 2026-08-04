import type { Content } from "@synapse/shared/schemas";
import type { DragEvent } from "react";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { api } from "@/shared/api/hooks";
import type { ContentListQueryInput } from "@/shared/lib/content-query-sync";
import {
	contentTypeOptions,
	getQueryTypesForFilter,
	isContentTypeFilterAvailable,
} from "@/shared/lib/content-type-options";
import { useDashboard } from "@/shared/lib/dashboard-context";
import { useI18n } from "@/shared/lib/i18n";
import { normalizeDroppedFiles } from "@/shared/lib/upload-file-kind";
import { usePathname, useRouter, useSearchParams } from "@/shared/router/navigation";
import { useModal } from "@/widgets/modals/context/modal-context";

const ContentFilter = lazy(() =>
	import("@/features/content-filter/content-filter").then((mod) => ({ default: mod.ContentFilter }))
);
const ContentGrid = lazy(() =>
	import("@/features/content-grid/content-grid").then((mod) => ({ default: mod.ContentGrid }))
);

const FILTER_TYPE_KEYS = contentTypeOptions.map((option) => option.key);

function parseTypesParam(value: string | null): Content["type"][] {
	if (!value) return [];
	return value
		.split(",")
		.filter((type): type is Content["type"] => (FILTER_TYPE_KEYS as string[]).includes(type));
}

function sameStringSet(left: string[], right: string[]): boolean {
	if (left.length !== right.length) return false;
	return left.every((value) => right.includes(value));
}

export default function DashboardClient({
	initial,
}: {
	initial?: { items: Content[]; nextCursor: string | undefined };
}) {
	const { openAddDialog, setAddDialogDefaults, setPreloadedFiles } = useDashboard();
	const { openModal } = useModal();
	const { t } = useI18n();
	const router = useRouter();
	const pathname = usePathname();
	const searchParams = useSearchParams();
	const [searchQuery, setSearchQuery] = useState(() => searchParams?.get("search") ?? "");
	const [debouncedSearchQuery, setDebouncedSearchQuery] = useState(() => searchParams?.get("search") ?? "");
	const [selectedTags, setSelectedTags] = useState<string[]>(() => {
		const tags = searchParams?.get("tags");
		return tags ? tags.split(",") : [];
	});
	const [selectedContentTypes, setSelectedContentTypes] = useState<Content["type"][]>(() =>
		parseTypesParam(searchParams?.get("types") ?? null)
	);
	const [dragActive, setDragActive] = useState(false);
	const dragCounter = useRef(0);
	const utils = api.useUtils();
	const { data: availableContentTypes = [] } = api.content.getAvailableTypes.useQuery(undefined, {
		staleTime: 30_000,
		refetchOnWindowFocus: false,
	});

	useEffect(() => {
		if (!searchQuery) {
			setDebouncedSearchQuery("");
			return;
		}
		const timeout = window.setTimeout(() => setDebouncedSearchQuery(searchQuery), 250);
		return () => window.clearTimeout(timeout);
	}, [searchQuery]);

	const selectedQueryTypes = useMemo(() => {
		const types = selectedContentTypes.flatMap(getQueryTypesForFilter);
		return Array.from(new Set(types));
	}, [selectedContentTypes]);

	useEffect(() => {
		if (availableContentTypes.length === 0) return;
		setSelectedContentTypes((current) =>
			current.filter((type) => isContentTypeFilterAvailable(type, availableContentTypes))
		);
	}, [availableContentTypes]);

	const queryInput = useMemo<ContentListQueryInput>(
		() => ({
			search: debouncedSearchQuery || undefined,
			tagIds: selectedTags.length > 0 ? selectedTags : undefined,
			types: selectedQueryTypes.length > 0 ? selectedQueryTypes : undefined,
			limit: 12,
		}),
		[debouncedSearchQuery, selectedTags, selectedQueryTypes]
	);

	const {
		data: contentData,
		fetchNextPage,
		hasNextPage,
		isFetchingNextPage,
		isLoading: contentLoading,
	} = api.content.getAll.useInfiniteQuery(queryInput, {
		getNextPageParam: (lastPage) => lastPage.nextCursor,
		initialData:
			initial && !(queryInput.search || queryInput.tagIds || queryInput.types)
				? { pages: [initial], pageParams: [undefined] }
				: undefined,
		refetchOnMount: false,
		retry: false,
	});

	const content: Content[] = contentData?.pages.flatMap((page) => page.items) ?? [];

	const invalidateRelatedQueries = useCallback(() => {
		void Promise.all([
			utils.content.getAvailableTypes.invalidate(),
			utils.content.getTags.invalidate(),
			utils.content.getTagsWithContent.invalidate(),
			utils.content.getTagsWithContentPage.invalidate(),
			utils.content.getSuggestions.invalidate(),
			utils.graph.getGraph.invalidate(),
			utils.user.getStorageUsage.invalidate(),
		]);
	}, [utils]);

	const handleContentAdded = useCallback(
		(nextContent?: Content | Content[]) => {
			const contentList = Array.isArray(nextContent) ? nextContent : nextContent ? [nextContent] : [];

			for (const content of contentList) {
				utils.content.getById.setData({ id: content.id }, content);
			}

			void utils.content.getAll.invalidate();
			invalidateRelatedQueries();
		},
		[invalidateRelatedQueries, utils]
	);

	const handleContentUpdated = useCallback(
		(nextContent: Content) => {
			utils.content.getById.setData({ id: nextContent.id }, nextContent);
			void utils.content.getAll.invalidate();
			invalidateRelatedQueries();
		},
		[invalidateRelatedQueries, utils]
	);

	const handleContentDeleted = useCallback(
		(contentId: string) => {
			void utils.content.getAll.invalidate();
			void utils.content.getById.invalidate({ id: contentId });
			invalidateRelatedQueries();
		},
		[invalidateRelatedQueries, utils]
	);

	// URL → state: применяем фильтры из адресной строки (перезагрузка, шаринг, назад/вперёд).
	useEffect(() => {
		if (!searchParams) return;

		const searchFromUrl = searchParams.get("search") ?? "";
		setSearchQuery((current) => (current === searchFromUrl ? current : searchFromUrl));
		setDebouncedSearchQuery((current) => (current === searchFromUrl ? current : searchFromUrl));

		const typesFromUrl = parseTypesParam(searchParams.get("types"));
		setSelectedContentTypes((current) => (sameStringSet(current, typesFromUrl) ? current : typesFromUrl));

		const tagsFromUrl = searchParams.get("tags");
		const nextTags = tagsFromUrl ? tagsFromUrl.split(",") : [];
		setSelectedTags((current) => (sameStringSet(current, nextTags) ? current : nextTags));
	}, [searchParams]);

	// state → URL: обновляем адресную строку через нативный History API, чтобы
	// НЕ триггерить ре-рендер серверного page.tsx и лишний серверный content.getAll.
	// Важно: первым аргументом передаём null. Next патчит window.history.replaceState
	// и при data без __NA/_N диспатчит ACTION_RESTORE — тогда useSearchParams тоже
	// обновляется (иначе модалки/сайдбар, строящие URL через useSearchParams, теряли
	// текущие фильтры). ACTION_RESTORE переиспользует кеш (HistoryTraversal), без RSC-fetch.
	useEffect(() => {
		const params = new URLSearchParams(window.location.search);
		if (searchQuery) params.set("search", searchQuery);
		else params.delete("search");
		if (selectedContentTypes.length > 0) params.set("types", selectedContentTypes.join(","));
		else params.delete("types");
		if (selectedTags.length > 0) params.set("tags", selectedTags.join(","));
		else params.delete("tags");

		const queryString = params.toString();
		const url = queryString ? `${pathname}?${queryString}` : pathname;
		window.history.replaceState(null, "", url);
	}, [searchQuery, selectedContentTypes, selectedTags, pathname]);

	useEffect(() => {
		setAddDialogDefaults({ initialTags: [], onContentAdded: handleContentAdded });
		return () => setAddDialogDefaults({ initialTags: [], onContentAdded: null });
	}, [setAddDialogDefaults, handleContentAdded]);

	useEffect(() => {
		const handleWindowDragEnter = (e: Event) => {
			const event = e as unknown as DragEvent;
			event.preventDefault();
			event.stopPropagation();
			dragCounter.current++;
			setDragActive(true);
		};
		const handleWindowDragLeave = (e: Event) => {
			const event = e as unknown as DragEvent;
			event.preventDefault();
			event.stopPropagation();
			dragCounter.current--;
			if (!dragCounter.current) setDragActive(false);
		};
		const handleWindowDragOver = (e: Event) => {
			const event = e as unknown as DragEvent;
			event.preventDefault();
			event.stopPropagation();
		};
		const handleWindowDrop = (e: Event) => {
			const event = e as unknown as DragEvent;
			event.preventDefault();
			event.stopPropagation();
			setDragActive(false);
			dragCounter.current = 0;
			const { files } = normalizeDroppedFiles(Array.from(event.dataTransfer?.files ?? []));
			if (files.length > 0) {
				setPreloadedFiles(files);
				openAddDialog();
			}
		};
		window.addEventListener("dragenter", handleWindowDragEnter);
		window.addEventListener("dragleave", handleWindowDragLeave);
		window.addEventListener("dragover", handleWindowDragOver);
		window.addEventListener("drop", handleWindowDrop);
		return () => {
			window.removeEventListener("dragenter", handleWindowDragEnter);
			window.removeEventListener("dragleave", handleWindowDragLeave);
			window.removeEventListener("dragover", handleWindowDragOver);
			window.removeEventListener("drop", handleWindowDrop);
		};
	}, [openAddDialog, setPreloadedFiles]);

	const deleteContentMutation = api.content.delete.useMutation();

	const handleItemClick = (item: Content) => {
		openModal({
			type: "viewer",
			contentType: item.type,
			item,
			props: {
				items: content,
				onEdit: (id: string) => {
					router.push(`/edit/${id}`);
				},
				onDelete: async (id: string) => {
					await deleteContentMutation.mutateAsync({ id });
					handleContentDeleted(id);
				},
				onContentUpdated: handleContentUpdated,
			},
		});
	};

	const clearFilters = () => {
		setSearchQuery("");
		setSelectedTags([]);
		setSelectedContentTypes([]);
		router.push("/");
	};

	const toggleContentType = (type: Content["type"]) => {
		setSelectedContentTypes((current) =>
			current.includes(type) ? current.filter((item) => item !== type) : [...current, type]
		);
	};

	return (
		<div className="relative flex h-full min-w-0 flex-col">
			{dragActive && (
				<div
					className="pointer-events-auto fixed inset-0 z-100 flex animate-in flex-col items-center justify-center bg-black/60 transition-all fade-in-0 select-none"
					style={{ backdropFilter: "blur(2px)" }}>
					<div className="flex flex-col items-center gap-4">
						<svg
							width="64"
							height="64"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							className="animate-bounce text-primary">
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth={2}
								d="M12 19V6m0 0l-5 5m5-5l5 5"
							/>
						</svg>
						<div className="animate-in rounded-xl border-2 border-primary bg-white/90 px-8 py-6 text-center text-2xl font-semibold shadow-xl fade-in-0">
							{t("dashboard.drop.title")}
							<div className="mt-2 text-base font-normal text-muted-foreground">
								{t("dashboard.drop.subtitle")}
							</div>
						</div>
					</div>
				</div>
			)}
			<main className="relative min-w-0 flex-1 overflow-y-auto">
				<Suspense fallback={null}>
					<ContentFilter
						searchQuery={searchQuery}
						setSearchQuery={setSearchQuery}
						availableContentTypes={availableContentTypes}
						selectedContentTypes={selectedContentTypes}
						onClearContentTypes={() => setSelectedContentTypes([])}
						onToggleContentType={toggleContentType}
					/>
				</Suspense>
				<div className="p-4">
					<Suspense fallback={<div className="h-40" aria-busy="true" />}>
						<ContentGrid
							items={content}
							isLoading={contentLoading && content.length === 0}
							onContentUpdated={handleContentUpdated}
							onContentDeleted={handleContentDeleted}
							onItemClick={handleItemClick}
							searchQuery={debouncedSearchQuery}
							selectedTags={selectedTags}
							selectedContentTypes={selectedContentTypes}
							onClearFilters={clearFilters}
							onAddContent={openAddDialog}
							fetchNext={fetchNextPage}
							hasNext={hasNextPage}
							isFetchingNext={isFetchingNextPage}
						/>
					</Suspense>
				</div>
			</main>
		</div>
	);
}
