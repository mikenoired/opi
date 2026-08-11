import { ContentGridSurface } from "@synapse/features";
import type { Content } from "@synapse/shared/schemas";
import { memo } from "react";

import { useI18n } from "@/shared/lib/i18n";
import { getPresignedMediaUrl } from "@/shared/lib/image-utils";

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
		const { t } = useI18n();
		return (
			<ContentGridSurface
				excludedTag={excludedTag}
				fetchNext={fetchNext}
				hasNext={hasNext}
				isFetchingNext={isFetchingNext}
				isLoading={isLoading}
				items={items}
				onAddContent={onAddContent}
				onClearFilters={onClearFilters}
				searchQuery={searchQuery}
				selectedContentTypes={selectedContentTypes}
				selectedTags={selectedTags}
				strings={{
					addContent: t("addContent"),
					clearFilters: t("clearFilters"),
					delete: t("delete"),
					done: t("done"),
					emptyDescription: t("empty.description"),
					emptyNote: t("emptyNote"),
					emptyTitle: t("empty.title"),
					edit: t("edit"),
					notFoundDescription: t("notFound.description"),
					notFoundTitle: t("notFound.title"),
					open: t("open"),
					untitled: t("untitled"),
				}}
				resolveMediaUrl={getPresignedMediaUrl}
				renderItems={(visibleItems) => (
					<ContentMasonry
						excludedTag={excludedTag}
						items={visibleItems}
						onContentDeleted={onContentDeleted}
						onContentUpdated={onContentUpdated}
						onItemClick={onItemClick}
						onItemHover={onItemHover}
					/>
				)}
			/>
		);
	}
);
