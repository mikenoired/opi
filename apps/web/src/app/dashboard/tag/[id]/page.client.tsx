import type { Content } from "@synapse/shared/schemas";
import { Check, Palette, Slash } from "lucide-react";
import type { DragEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ContentGrid } from "@/features/content-grid/content-grid";
import { api } from "@/shared/api/hooks";
import type { ContentListQueryInput } from "@/shared/lib/content-query-sync";
import { useDashboard } from "@/shared/lib/dashboard-context";
import { useI18n } from "@/shared/lib/i18n";
import { getTagColor, getTagColorStyle, TAG_COLOR_PALETTE } from "@/shared/lib/tag-colors";
import { normalizeDroppedFiles } from "@/shared/lib/upload-file-kind";
import { useRouter } from "@/shared/router/navigation";
import { useModal } from "@/widgets/modals/context/modal-context";

interface Props {
	tagId: string;
	tagTitle: string;
	initialColor: number;
	initial?: { items: Content[]; nextCursor: string | undefined };
}

export default function TagClient({ tagId, tagTitle, initialColor, initial }: Props) {
	const { openAddDialog, setAddDialogDefaults, setPreloadedFiles } = useDashboard();
	const { t } = useI18n();
	const { openModal } = useModal();
	const [dragActive, setDragActive] = useState(false);
	const [tagColor, setTagColor] = useState(initialColor);
	const previousTagColor = useRef(initialColor);
	const [paletteOpen, setPaletteOpen] = useState(false);
	const dragCounter = useRef(0);
	const router = useRouter();
	const utils = api.useUtils();
	const updateCachedTagColor = useCallback(
		(color: number) => {
			utils.content.getTagById.setData({ id: tagId }, (tag) =>
				tag ? { ...tag, color } : { id: tagId, title: tagTitle, color }
			);
			utils.content.getTags.setData(undefined, (tags) => {
				if (!tags) return [{ id: tagId, title: tagTitle, color }];
				const exists = tags.some((tag) => tag.id === tagId);
				if (!exists) return [...tags, { id: tagId, title: tagTitle, color }];
				return tags.map((tag) => (tag.id === tagId ? { ...tag, color } : tag));
			});
		},
		[tagId, tagTitle, utils]
	);
	const queryInput = useMemo<ContentListQueryInput>(
		() => ({
			tagIds: [tagId],
			limit: 20,
		}),
		[tagId]
	);
	const deleteContentMutation = api.content.delete.useMutation();
	const updateTagColorMutation = api.content.updateTagColor.useMutation({
		onError: () => {
			setTagColor(previousTagColor.current);
			updateCachedTagColor(previousTagColor.current);
		},
		onMutate: ({ color }) => {
			previousTagColor.current = tagColor;
			setTagColor(color);
			updateCachedTagColor(color);
		},
		onSuccess: ({ color }) => {
			setTagColor(color);
			updateCachedTagColor(color);
		},
		onSettled: () => {
			void Promise.all([
				utils.content.getTagById.invalidate({ id: tagId }),
				utils.content.getTags.invalidate(),
				utils.content.getTagsWithContent.invalidate(),
				utils.content.getTagsWithContentPage.invalidate(),
				utils.content.getSuggestions.invalidate(),
				utils.graph.getGraph.invalidate(),
			]);
		},
	});

	const {
		data: queryData,
		fetchNextPage,
		hasNextPage,
		isFetchingNextPage,
		isLoading: contentLoading,
	} = api.content.getAll.useInfiniteQuery(queryInput, {
		getNextPageParam: (lastPage) => lastPage.nextCursor,
		retry: false,
		initialData: initial ? { pages: [initial], pageParams: [undefined] } : undefined,
		refetchOnMount: false,
	});

	const content: Content[] = queryData?.pages.flatMap((page) => page.items) ?? [];

	const invalidateRelatedQueries = useCallback(() => {
		void Promise.all([
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

			if (contentList.length === 0) {
				void utils.content.getAll.invalidate(queryInput);
				invalidateRelatedQueries();
				return;
			}

			for (const content of contentList) {
				utils.content.getById.setData({ id: content.id }, content);
			}

			void utils.content.getAll.invalidate(queryInput);
			invalidateRelatedQueries();
		},
		[invalidateRelatedQueries, queryInput, utils]
	);

	const handleContentUpdated = useCallback(
		(nextContent: Content) => {
			utils.content.getById.setData({ id: nextContent.id }, nextContent);
			void utils.content.getAll.invalidate(queryInput);
			invalidateRelatedQueries();
		},
		[invalidateRelatedQueries, queryInput, utils]
	);

	const handleContentDeleted = useCallback(
		(contentId: string) => {
			void utils.content.getAll.invalidate(queryInput);
			void utils.content.getById.invalidate({ id: contentId });
			invalidateRelatedQueries();
		},
		[invalidateRelatedQueries, queryInput, utils]
	);

	useEffect(() => {
		setAddDialogDefaults({ initialTags: [tagTitle], onContentAdded: handleContentAdded });
		return () => setAddDialogDefaults({ initialTags: [], onContentAdded: null });
	}, [setAddDialogDefaults, tagTitle, handleContentAdded]);

	const handleItemClick = (item: Content) => {
		openModal({
			type: "viewer",
			contentType: item.type,
			item: item,
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
		if (dragCounter.current === 0) setDragActive(false);
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
			openAddDialog({ initialTags: [tagTitle], onContentAdded: handleContentAdded });
		}
	};

	return (
		<div
			className="relative flex h-full flex-col"
			onDragEnter={handleDragEnter}
			onDragOver={handleDragOver}
			onDragLeave={handleDragLeave}
			onDrop={handleDrop}>
			{dragActive && (
				<div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-black/40 select-none">
					<div className="animate-in rounded-xl border-2 border-primary bg-white/90 px-8 py-6 text-2xl font-semibold shadow-xl fade-in-0">
						Drop files to add content
					</div>
				</div>
			)}
			<header className="relative flex flex-wrap items-center gap-3 px-6 py-4">
				<h1
					className="rounded-full border border-transparent px-3 py-1 text-2xl font-semibold capitalize"
					style={getTagColorStyle(tagColor)}>
					{tagTitle}
				</h1>
				<div className="relative">
					<button
						type="button"
						aria-expanded={paletteOpen}
						aria-label={t("tagColor.picker")}
						onClick={() => setPaletteOpen((open) => !open)}
						className="flex size-9 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
						<Palette className="size-4" style={{ color: getTagColor(tagColor) }} />
					</button>
					{paletteOpen && (
						<div className="absolute top-11 left-0 z-30 w-56 rounded-3xl border border-border bg-background p-3 shadow-xl">
							<p className="mb-2 px-1 text-xs font-medium text-muted-foreground">{t("tagColor.picker")}</p>
							<div className="grid grid-cols-7 gap-1.5">
								<button
									type="button"
									aria-label={t("tagColor.none")}
									aria-pressed={tagColor === 0}
									onClick={() => updateTagColorMutation.mutate({ id: tagId, color: 0 })}
									className="relative flex size-6 items-center justify-center rounded-full border border-border bg-muted text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
									<Slash className="size-3" />
									{tagColor === 0 && (
										<Check className="absolute -top-1 -right-1 size-3 rounded-full bg-foreground p-0.5 text-background" />
									)}
								</button>
								{TAG_COLOR_PALETTE.map((color, index) => {
									const value = index + 1;
									return (
										<button
											key={color}
											type="button"
											aria-label={t("tagColor.option", { number: value })}
											aria-pressed={tagColor === value}
											disabled={updateTagColorMutation.isPending}
											onClick={() => updateTagColorMutation.mutate({ id: tagId, color: value })}
											className="relative size-6 rounded-full ring-offset-2 ring-offset-background transition-transform hover:scale-110 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
											style={{ backgroundColor: color }}>
											{tagColor === value && (
												<Check className="absolute inset-1 size-4 text-white drop-shadow-sm" />
											)}
										</button>
									);
								})}
							</div>
						</div>
					)}
				</div>
			</header>
			<main className="flex-1 overflow-y-auto p-6">
				<ContentGrid
					items={content}
					isLoading={contentLoading && content.length === 0}
					onContentUpdated={handleContentUpdated}
					onContentDeleted={handleContentDeleted}
					onItemClick={handleItemClick}
					excludedTag={tagTitle}
					fetchNext={fetchNextPage}
					hasNext={hasNextPage}
					isFetchingNext={isFetchingNextPage}
				/>
			</main>
		</div>
	);
}
