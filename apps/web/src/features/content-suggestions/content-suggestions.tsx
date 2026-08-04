import type { Content } from "@synapse/shared/schemas";
import { cn } from "@synapse/ui/cn";
import { Skeleton } from "@synapse/ui/components";
import { motion } from "framer-motion";
import { Hash } from "lucide-react";
import { useCallback, useMemo, useState } from "react";

import { ContentMasonry } from "@/features/content-grid/content-masonry";
import { api } from "@/shared/api/hooks";
import { useInfiniteScroll } from "@/shared/hooks/use-infinite-scroll";
import { getTagColorStyle } from "@/shared/lib/tag-colors";
import Link from "@/shared/router/link";

interface ContentSuggestionsProps {
	item: Content;
	onItemClick: (item: Content) => void;
	onContentUpdated?: (content: Content) => void;
	onContentDeleted?: (contentId: string) => void;
	dark?: boolean;
	onTagNavigate?: () => void;
}

export function ContentSuggestions({
	item,
	onItemClick,
	onContentUpdated,
	onContentDeleted,
	dark = false,
	onTagNavigate,
}: ContentSuggestionsProps) {
	const [enabled, setEnabled] = useState(false);
	const { data: currentTags = [] } = api.content.getTags.useQuery(undefined, {
		refetchOnMount: true,
	});
	const currentColorByTagId = useMemo(
		() => new Map(currentTags.map((tag) => [tag.id, tag.color])),
		[currentTags]
	);
	const enable = useCallback(() => setEnabled(true), []);
	const activationRef = useInfiniteScroll({
		enabled: !enabled && item.tag_ids.length > 0,
		onLoadMore: enable,
		rootMargin: "320px 0px",
	});

	const query = api.content.getSuggestions.useInfiniteQuery(
		{ contentId: item.id, limit: 12 },
		{
			enabled,
			getNextPageParam: (lastPage) => lastPage.nextCursor,
			retry: false,
		}
	);

	const groups = useMemo(() => {
		const ordered = new Map<
			string,
			{ tag: { color: number; id: string; title: string; itemCount: number }; items: Content[] }
		>();

		for (const page of query.data?.pages ?? []) {
			for (const group of page.groups) {
				const current = ordered.get(group.tag.id) ?? {
					tag: { ...group.tag, color: currentColorByTagId.get(group.tag.id) ?? group.tag.color },
					items: [],
				};
				const seen = new Set(current.items.map((entry) => entry.id));
				current.items.push(...group.items.filter((entry) => !seen.has(entry.id)));
				ordered.set(group.tag.id, current);
			}
		}

		return Array.from(ordered.values());
	}, [currentColorByTagId, query.data?.pages]);

	const loadMore = useCallback(() => {
		if (!query.hasNextPage || query.isFetchingNextPage) return;
		void query.fetchNextPage();
	}, [query.fetchNextPage, query.hasNextPage, query.isFetchingNextPage]);
	const paginationRef = useInfiniteScroll({
		enabled: Boolean(query.hasNextPage && !query.isFetchingNextPage),
		onLoadMore: loadMore,
	});

	if (item.tag_ids.length === 0) return null;

	return (
		<section
			aria-label="Похожие материалы"
			className={cn(
				"relative z-10 min-h-24 w-full",
				dark ? "bg-background text-foreground" : "bg-background text-foreground"
			)}>
			<div
				ref={activationRef}
				aria-hidden
				className={cn(
					"pointer-events-none absolute -top-28 h-28 w-full",
					dark
						? "bg-linear-to-b from-transparent via-background/55 to-background"
						: "bg-linear-to-b from-transparent via-background/65 to-background"
				)}
			/>

			{enabled && (query.isLoading || groups.length > 0) && (
				<motion.div
					initial={{ opacity: 0, y: 36 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
					className="mx-auto w-full max-w-[1800px] px-4 pt-10 pb-20 sm:px-6 lg:px-8">
					<header className="mb-10 border-b border-current/10 pb-5">
						<div>
							<p className="mb-2 text-xs font-medium tracking-[0.16em] uppercase opacity-45">
								Продолжить исследование
							</p>
							<h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Рядом по смыслу</h2>
						</div>
					</header>

					{query.isLoading ? (
						<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
							{Array.from({ length: 4 }).map((_, index) => (
								<Skeleton key={index} className="h-44 rounded-xl bg-current/10" />
							))}
						</div>
					) : (
						<div className="space-y-14">
							{groups.map((group) => (
								<section key={group.tag.id} aria-labelledby={`suggestion-tag-${group.tag.id}`}>
									<div className="mb-4 flex items-center gap-2">
										<h3
											id={`suggestion-tag-${group.tag.id}`}
											className="text-sm font-medium tracking-wide capitalize">
											<Link
												href={`/tags/${group.tag.id}`}
												onClick={onTagNavigate}
												className="group/tag inline-flex items-center gap-1 rounded-full border border-transparent px-2 py-1 opacity-80 transition-opacity hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-current/40 focus-visible:outline-none"
												style={getTagColorStyle(group.tag.color)}>
												<Hash className="size-4 opacity-55 transition-transform group-hover/tag:-rotate-6" />
												{group.tag.title}
											</Link>
										</h3>
										<span className="text-xs tabular-nums opacity-35">{group.tag.itemCount}</span>
									</div>
									<div className={cn(dark && "dark")}>
										<ContentMasonry
											items={group.items}
											onItemClick={onItemClick}
											onContentUpdated={onContentUpdated}
											onContentDeleted={onContentDeleted}
											excludedTag={group.tag.title}
											compact
										/>
									</div>
								</section>
							))}
						</div>
					)}

					{query.hasNextPage && (
						<div ref={paginationRef} aria-hidden className="flex h-24 items-end justify-center">
							{query.isFetchingNextPage && (
								<span className="text-xs tracking-[0.14em] uppercase opacity-40">Ищем дальше</span>
							)}
						</div>
					)}
				</motion.div>
			)}
		</section>
	);
}
