import type { Content } from "@synapse/shared/schemas";
import { Button } from "@synapse/ui/components";
import { FileText, Search } from "lucide-react";
import { memo } from "react";

import { useInfiniteScroll } from "@/shared/hooks/use-infinite-scroll";
import { useI18n } from "@/shared/lib/i18n";

import { ContentMasonry } from "./content-masonry";

interface ContentGridProps {
	items: Content[];
	isLoading: boolean;
	fetchNext?: () => void;
	hasNext?: boolean;
	isFetchingNext?: boolean;
	onContentUpdated: (content: Content) => void;
	onContentDeleted: (contentId: string) => void;
	onItemClick: (item: Content) => void;
	onItemHover?: () => void;
	searchQuery?: string;
	selectedTags?: string[];
	selectedContentTypes?: Content["type"][];
	onClearFilters?: () => void;
	onAddContent?: () => void;
	excludedTag?: string;
}

export const ContentGrid = memo(
	({
		items,
		isLoading,
		fetchNext,
		hasNext,
		isFetchingNext,
		onContentUpdated,
		onContentDeleted,
		onItemClick,
		onItemHover,
		searchQuery,
		selectedTags,
		selectedContentTypes,
		onClearFilters,
		onAddContent,
		excludedTag,
	}: ContentGridProps) => {
		const hasContent = items.length > 0;
		const hasSelectedTags = Boolean(selectedTags?.length);
		const hasSelectedContentTypes = Boolean(selectedContentTypes?.length);
		const showEmptyState =
			!isLoading && !hasContent && !searchQuery && !hasSelectedTags && !hasSelectedContentTypes;
		const showNotFoundState =
			!isLoading && !hasContent && (searchQuery || hasSelectedTags || hasSelectedContentTypes);

		const sentinelRef = useInfiniteScroll({
			enabled: Boolean(hasNext && !isFetchingNext),
			onLoadMore: fetchNext,
		});
		const { t } = useI18n();

		if (isLoading) {
			return <ContentMasonry items={[]} isLoading />;
		}

		if (showEmptyState) {
			return (
				<div className="flex h-full flex-col items-center justify-center py-12 text-center">
					<div className="w-full max-w-md space-y-4 p-8">
						<FileText className="mx-auto h-16 w-16 text-muted-foreground opacity-50" />
						<div>
							<h3 className="mb-2 text-xl font-semibold">{t("empty.title")}</h3>
							<p className="mb-6 text-muted-foreground">{t("empty.description")}</p>
							{onAddContent && <Button onClick={onAddContent}>{t("addContent")}</Button>}
						</div>
					</div>
				</div>
			);
		}

		if (showNotFoundState) {
			return (
				<div className="py-12 text-center">
					<div className="text-muted-foreground">
						<Search className="mx-auto mb-4 h-12 w-12 opacity-50" />
						<p className="mb-2 text-lg">{t("notFound.title")}</p>
						<p className="text-sm">{t("notFound.description")}</p>
						{onClearFilters && (
							<Button variant="tertiary" onClick={onClearFilters} className="mt-4">
								{t("clearFilters")}
							</Button>
						)}
					</div>
				</div>
			);
		}

		return (
			<>
				<ContentMasonry
					items={items}
					onContentUpdated={onContentUpdated}
					onContentDeleted={onContentDeleted}
					onItemClick={onItemClick}
					onItemHover={onItemHover}
					excludedTag={excludedTag}
				/>
				{hasNext && <div ref={sentinelRef} aria-hidden className="h-px w-full" />}
			</>
		);
	}
);
