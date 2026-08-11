import type { Content } from "@synapse/shared/schemas";
import { Button } from "@synapse/ui/components";
import { FileText, Search } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";

import { ContentCard, type ContentCardStrings } from "./content-card";
import { ContentMasonry } from "./content-masonry";

export interface ContentGridSurfaceStrings extends ContentCardStrings {
	addContent: string;
	clearFilters: string;
	emptyDescription: string;
	emptyTitle: string;
	notFoundDescription: string;
	notFoundTitle: string;
}

export interface ContentGridSurfaceProps {
	excludedTag?: string;
	fetchNext?(): void;
	hasNext?: boolean;
	isFetchingNext?: boolean;
	isLoading: boolean;
	items: Content[];
	onAddContent?(): void;
	onClearFilters?(): void;
	onDelete?(item: Content): void;
	onEdit?(item: Content): void;
	onItemHover?(): void;
	onOpen?(item: Content): void;
	renderItems?(items: Content[]): ReactNode;
	searchQuery?: string;
	selectedContentTypes?: Content["type"][];
	selectedTags?: string[];
	strings: ContentGridSurfaceStrings;
	resolveMediaUrl?: (url: string) => string;
}

/**
 * Canonical library list visual. Platforms provide data and mutations, while this
 * component owns every loading, empty, and pagination state.
 */
export function ContentGridSurface({
	excludedTag,
	fetchNext,
	hasNext = false,
	isFetchingNext = false,
	isLoading,
	items,
	onAddContent,
	onClearFilters,
	onDelete,
	onEdit,
	onItemHover,
	onOpen,
	renderItems,
	searchQuery,
	selectedContentTypes,
	selectedTags,
	strings,
	resolveMediaUrl,
}: ContentGridSurfaceProps) {
	const sentinelRef = useLoadMore(hasNext && !isFetchingNext, fetchNext);
	const hasContent = items.length > 0;
	const hasSelectedTags = Boolean(selectedTags?.length);
	const hasSelectedContentTypes = Boolean(selectedContentTypes?.length);
	const showEmptyState =
		!isLoading && !hasContent && !searchQuery && !hasSelectedTags && !hasSelectedContentTypes;
	const showNotFoundState =
		!isLoading && !hasContent && (searchQuery || hasSelectedTags || hasSelectedContentTypes);

	if (isLoading) return <ContentMasonry items={[]} isLoading renderItem={() => null} />;
	if (showEmptyState)
		return (
			<div className="flex h-full flex-col items-center justify-center py-12 text-center">
				<div className="w-full max-w-md space-y-4 p-8">
					<FileText className="mx-auto h-16 w-16 text-muted-foreground opacity-50" />
					<div>
						<h3 className="mb-2 text-xl font-semibold">{strings.emptyTitle}</h3>
						<p className="mb-6 text-muted-foreground">{strings.emptyDescription}</p>
						{onAddContent && <Button onClick={onAddContent}>{strings.addContent}</Button>}
					</div>
				</div>
			</div>
		);
	if (showNotFoundState)
		return (
			<div className="py-12 text-center">
				<div className="text-muted-foreground">
					<Search className="mx-auto mb-4 h-12 w-12 opacity-50" />
					<p className="mb-2 text-lg">{strings.notFoundTitle}</p>
					<p className="text-sm">{strings.notFoundDescription}</p>
					{onClearFilters && (
						<Button className="mt-4" onClick={onClearFilters} variant="tertiary">
							{strings.clearFilters}
						</Button>
					)}
				</div>
			</div>
		);
	return (
		<>
			{renderItems?.(items) ?? (
				<ContentMasonry
					items={items}
					onItemHover={onItemHover}
					renderItem={(item, index) => (
						<ContentCard
							excludedTag={excludedTag}
							index={index}
							item={item}
							onDelete={onDelete}
							onEdit={onEdit}
							onOpen={onOpen}
							strings={strings}
							resolveMediaUrl={resolveMediaUrl}
						/>
					)}
				/>
			)}
			{hasNext && <div aria-hidden className="h-px w-full" ref={sentinelRef} />}
		</>
	);
}

function useLoadMore(enabled: boolean, action?: () => void) {
	const ref = useRef<HTMLDivElement>(null);
	useEffect(() => {
		const target = ref.current;
		if (!enabled || !action || !target || typeof IntersectionObserver === "undefined") return;
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries.some((entry) => entry.isIntersecting)) action();
			},
			{ rootMargin: "200px 0px" }
		);
		observer.observe(target);
		return () => observer.disconnect();
	}, [action, enabled]);
	return ref;
}
