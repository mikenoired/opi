import type { Content } from "@synapse/shared/schemas";
import { Skeleton } from "@synapse/ui/components";
import type { DragEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { TagStack } from "@/entities/item/ui/tag-stack";
import { api } from "@/shared/api/hooks";
import { useInfiniteScroll } from "@/shared/hooks/use-infinite-scroll";
import { useDashboard } from "@/shared/lib/dashboard-context";
import { getTagColor, getTagColorStyle } from "@/shared/lib/tag-colors";
import { normalizeDroppedFiles } from "@/shared/lib/upload-file-kind";
import Link from "@/shared/router/link";

export default function TagsClient({
	initial,
}: {
	initial?: {
		items: { color: number; id: string; title: string; items: Content[] }[];
		nextCursor: string | undefined;
	};
}) {
	const { openAddDialog, setAddDialogDefaults, setPreloadedFiles } = useDashboard();
	const [dragActive, setDragActive] = useState(false);
	const dragCounter = useRef(0);
	const utils = api.useUtils();
	const { data: currentTags = [] } = api.content.getTags.useQuery(undefined, {
		refetchOnMount: true,
	});
	const currentColorByTagId = useMemo(
		() => new Map(currentTags.map((tag) => [tag.id, tag.color])),
		[currentTags]
	);

	const {
		data: tagsWithContentData,
		fetchNextPage,
		hasNextPage,
		isFetchingNextPage,
		isLoading: tagsLoading,
	} = api.content.getTagsWithContentPage.useInfiniteQuery(
		{ limit: 24 },
		{
			getNextPageParam: (lastPage) => lastPage.nextCursor,
			initialData: initial ? { pages: [initial], pageParams: [undefined] } : undefined,
			refetchOnMount: false,
		}
	);

	const tagsWithContent = tagsWithContentData?.pages.flatMap((page) => page.items) ?? [];
	const isLoading = tagsLoading && tagsWithContent.length === 0;

	const loadNextPage = useCallback(() => {
		if (!hasNextPage || isFetchingNextPage) return;
		void fetchNextPage();
	}, [fetchNextPage, hasNextPage, isFetchingNextPage]);
	const sentinelRef = useInfiniteScroll({
		enabled: Boolean(hasNextPage && !isFetchingNextPage),
		onLoadMore: loadNextPage,
	});

	const handleContentAdded = useCallback(
		(_content?: Content | Content[]) => {
			void Promise.all([
				utils.content.getTags.invalidate(),
				utils.content.getTagsWithContent.invalidate(),
				utils.content.getTagsWithContentPage.invalidate(),
				utils.graph.getGraph.invalidate(),
				utils.user.getStorageUsage.invalidate(),
			]);
		},
		[utils]
	);

	useEffect(() => {
		setAddDialogDefaults({ initialTags: [], onContentAdded: handleContentAdded });
		return () => setAddDialogDefaults({ initialTags: [], onContentAdded: null });
	}, [setAddDialogDefaults, handleContentAdded]);

	const handleDragEnter = (e: DragEvent) => {
		e.preventDefault();
		e.stopPropagation();
		dragCounter.current++;
		setDragActive(true);
	};

	const handleDragLeave = (e: DragEvent) => {
		e.preventDefault();
		e.stopPropagation();
		dragCounter.current--;
		if (!dragCounter.current) setDragActive(false);
	};

	const handleDragOver = (e: DragEvent) => {
		e.preventDefault();
		e.stopPropagation();
	};

	const handleDrop = (e: DragEvent) => {
		e.preventDefault();
		e.stopPropagation();
		setDragActive(false);
		dragCounter.current = 0;
		const { files } = normalizeDroppedFiles(Array.from(e.dataTransfer.files));
		if (files.length > 0) {
			setPreloadedFiles(files);
			openAddDialog({ initialTags: [], onContentAdded: handleContentAdded });
		}
	};

	if (isLoading) {
		return (
			<div className="p-6">
				<h1 className="mb-6 text-2xl font-semibold">Tags</h1>
				<div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
					{Array.from({ length: 6 }).map((_, i) => (
						<div key={i} className="space-y-4">
							<Skeleton className="h-6 w-1/3 rounded-md" />
							<Skeleton className="h-40 w-full rounded-xl" />
						</div>
					))}
				</div>
			</div>
		);
	}

	if (tagsWithContent.length === 0) {
		return (
			<div
				className="h-full p-6 text-center"
				onDragEnter={handleDragEnter}
				onDragOver={handleDragOver}
				onDragLeave={handleDragLeave}
				onDrop={handleDrop}>
				{dragActive && (
					<div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-black/40 select-none">
						<div className="animate-in fade-in-0 rounded-xl border-2 border-primary bg-white/90 px-8 py-6 text-2xl font-semibold shadow-xl">
							Drop files to add content
						</div>
					</div>
				)}
				<h1 className="mb-4 text-2xl font-semibold">Tags</h1>
				<p className="text-muted-foreground">You don't have any tags. Create new one.</p>
			</div>
		);
	}

	return (
		<div
			className="h-full p-6"
			onDragEnter={handleDragEnter}
			onDragOver={handleDragOver}
			onDragLeave={handleDragLeave}
			onDrop={handleDrop}>
			{dragActive && (
				<div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-black/40 select-none">
					<div className="animate-in fade-in-0 rounded-xl border-2 border-primary bg-white/90 px-8 py-6 text-2xl font-semibold shadow-xl">
						Drop files to add content
					</div>
				</div>
			)}
			<h1 className="mb-8 text-2xl font-semibold">Tags</h1>
			<div className="grid grid-cols-1 gap-x-6 gap-y-12 pb-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6">
				{tagsWithContent.map(({ color, id, title, items }) => {
					const currentColor = currentColorByTagId.get(id) ?? color;
					return (
						<Link key={id} href={`/tags/${id}`} className="group">
							<h2 className="mb-3 flex items-center text-lg font-medium capitalize">
								<span
									className="inline-flex items-center gap-2 rounded-full border border-transparent px-2.5 py-1 transition-transform group-hover:translate-x-0.5"
									style={getTagColorStyle(currentColor)}>
									{getTagColor(currentColor) && (
										<span className="size-2 rounded-full bg-(--tag-color)" aria-hidden="true" />
									)}
									{title}
								</span>
							</h2>
							<TagStack items={items} />
						</Link>
					);
				})}
			</div>
			{hasNextPage && (
				<div ref={sentinelRef} aria-hidden className="flex h-20 items-center justify-center">
					{isFetchingNextPage && <span className="text-xs text-muted-foreground">Загружаем теги…</span>}
				</div>
			)}
		</div>
	);
}
