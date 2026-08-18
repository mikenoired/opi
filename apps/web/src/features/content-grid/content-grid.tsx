import { ContentGridSurface } from "@monolyth/features";
import type { Content } from "@monolyth/shared/schemas";
import { memo } from "react";

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
