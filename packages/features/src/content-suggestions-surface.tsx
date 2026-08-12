import { useI18n } from "@synapse/i18n";
import type { Content } from "@synapse/shared/schemas";
import { cn } from "@synapse/ui/cn";
import { Skeleton } from "@synapse/ui/components";
import { motion } from "framer-motion";
import { Hash } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";

import { ContentCard } from "./content-card";
import { ContentMasonry } from "./content-masonry";
import { ContentTag } from "./content-tag";

export interface ContentSuggestionGroup {
	items: Content[];
	tag: { color: number; id: string; itemCount: number; title: string };
}

export interface ContentSuggestionsSurfaceProps {
	active: boolean;
	dark?: boolean;
	groups: ContentSuggestionGroup[];
	hasMore?: boolean;
	isLoading?: boolean;
	isLoadingMore?: boolean;
	onActivate(): void;
	onDelete?(item: Content): void;
	onEdit?(item: Content): void;
	onLoadMore(): void;
	onOpen(item: Content): void;
	onTagNavigate?(tagId: string): void;
	renderItems?(group: ContentSuggestionGroup): ReactNode;
}

function useIntersectionAction(enabled: boolean, action: () => void) {
	const ref = useRef<HTMLDivElement>(null);
	useEffect(() => {
		const target = ref.current;
		if (!enabled || !target || typeof IntersectionObserver === "undefined") return;
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries.some((entry) => entry.isIntersecting)) action();
			},
			{ rootMargin: "320px 0px" }
		);
		observer.observe(target);
		return () => observer.disconnect();
	}, [action, enabled]);
	return ref;
}

/** Shared recommendations presentation. Fetching/pagination storage belongs to platform adapters. */
export function ContentSuggestionsSurface({
	active,
	dark = false,
	groups,
	hasMore = false,
	isLoading = false,
	isLoadingMore = false,
	onActivate,
	onDelete,
	onEdit,
	onLoadMore,
	onOpen,
	onTagNavigate,
	renderItems,
}: ContentSuggestionsSurfaceProps) {
	const { t } = useI18n();
	const activationRef = useIntersectionAction(!active, onActivate);
	const paginationRef = useIntersectionAction(hasMore && !isLoadingMore, onLoadMore);
	return (
		<section
			aria-label={t("library.viewer.recommendationsAria")}
			className="relative z-10 min-h-24 w-full bg-background text-foreground">
			<div
				aria-hidden
				className="pointer-events-none absolute -top-28 h-28 w-full bg-linear-to-b from-transparent via-background/60 to-background"
				ref={activationRef}
			/>
			{active && (isLoading || groups.length > 0) && (
				<motion.div
					animate={{ opacity: 1, y: 0 }}
					className="mx-auto w-full max-w-[1800px] px-4 pt-10 pb-20 sm:px-6 lg:px-8"
					initial={{ opacity: 0, y: 36 }}
					transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}>
					<header className="mb-10 border-b border-current/10 pb-5">
						<p className="mb-2 text-xs font-medium tracking-[0.16em] uppercase opacity-45">
							{t("library.viewer.recommendationsEyebrow")}
						</p>
						<h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
							{t("library.viewer.recommendationsTitle")}
						</h2>
					</header>
					{isLoading ? (
						<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
							{Array.from({ length: 4 }).map((_, index) => (
								<Skeleton className="h-44 rounded-xl bg-current/10" key={index} />
							))}
						</div>
					) : (
						<div className="space-y-14">
							{groups.map((group) => (
								<section aria-labelledby={`suggestion-tag-${group.tag.id}`} key={group.tag.id}>
									<div className="mb-4 flex items-center gap-2">
										<h3
											id={`suggestion-tag-${group.tag.id}`}
											className="text-sm font-medium tracking-wide capitalize">
											<ContentTag
												color={group.tag.color}
												onNavigate={onTagNavigate}
												tag={group.tag.title}
												tagId={group.tag.id}>
												<Hash className="size-4 opacity-55" />
												{group.tag.title}
											</ContentTag>
										</h3>
										<span className="text-xs tabular-nums opacity-35">{group.tag.itemCount}</span>
									</div>
									<div className={cn(dark && "dark")}>
										{renderItems?.(group) ?? (
											<DefaultSuggestionItems
												group={group}
												onDelete={onDelete}
												onEdit={onEdit}
												onOpen={onOpen}
											/>
										)}
									</div>
								</section>
							))}
						</div>
					)}
					{hasMore && (
						<div aria-hidden className="flex h-24 items-end justify-center" ref={paginationRef}>
							{isLoadingMore && (
								<span className="text-xs tracking-[0.14em] uppercase opacity-40">
									{t("library.viewer.recommendationsLoadingMore")}
								</span>
							)}
						</div>
					)}
				</motion.div>
			)}
		</section>
	);
}

function DefaultSuggestionItems({
	group,
	onDelete,
	onEdit,
	onOpen,
}: {
	group: ContentSuggestionGroup;
	onDelete?: (item: Content) => void;
	onEdit?: (item: Content) => void;
	onOpen: (item: Content) => void;
}) {
	return (
		<ContentMasonry
			compact
			items={group.items}
			renderItem={(item, index) => (
				<ContentCard
					excludedTag={group.tag.title}
					index={index}
					item={item}
					onDelete={onDelete}
					onEdit={onEdit}
					onOpen={onOpen}
				/>
			)}
		/>
	);
}
