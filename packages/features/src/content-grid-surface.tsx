import { useI18n } from "@monolyth/i18n";
import type { Content } from "@monolyth/shared/schemas";
import { Button } from "@monolyth/ui/components";
import { FileText, Search } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";

import { ContentCard } from "./content-card";
import { ContentMasonry } from "./content-masonry";
import { ContentSelectionLayer, type ContentTagBatchChange } from "./content-selection";

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
	onDeleteMany?(items: Content[]): Promise<void> | void;
	onEdit?(item: Content): void;
	onItemHover?(): void;
	onOpen?(item: Content): void;
	onUpdateTags?(input: ContentTagBatchChange): Promise<Content[] | void> | Content[] | void;
	renderItems?(items: Content[]): ReactNode;
	searchQuery?: string;
	selectedContentTypes?: Content["type"][];
	selectedTags?: string[];
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
	onDeleteMany,
	onEdit,
	onItemHover,
	onOpen,
	onUpdateTags,
	renderItems,
	searchQuery,
	selectedContentTypes,
	selectedTags,
	resolveMediaUrl,
}: ContentGridSurfaceProps) {
	const { t } = useI18n();
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
						<h3 className="mb-2 text-xl font-semibold">{t("library.emptyTitle")}</h3>
						<p className="mb-6 text-muted-foreground">{t("library.emptyDescription")}</p>
						{onAddContent && <Button onClick={onAddContent}>{t("library.add")}</Button>}
					</div>
				</div>
			</div>
		);
	if (showNotFoundState)
		return (
			<div className="py-12 text-center">
				<div className="text-muted-foreground">
					<Search className="mx-auto mb-4 h-12 w-12 opacity-50" />
					<p className="mb-2 text-lg">{t("library.notFoundTitle")}</p>
					<p className="text-sm">{t("library.notFoundDescription")}</p>
					{onClearFilters && (
						<Button className="mt-4" onClick={onClearFilters} variant="tertiary">
							{t("library.clearFilters")}
						</Button>
					)}
				</div>
			</div>
		);
	const selectionKey = JSON.stringify([excludedTag, searchQuery, selectedContentTypes, selectedTags]);
	return (
		<ContentSelectionLayer
			items={items}
			onDeleteMany={onDeleteMany}
			onUpdateTags={onUpdateTags}
			selectionKey={selectionKey}>
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
							resolveMediaUrl={resolveMediaUrl}
						/>
					)}
				/>
			)}
			{hasNext && <div aria-hidden className="h-px w-full" ref={sentinelRef} />}
		</ContentSelectionLayer>
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
