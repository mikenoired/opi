import { ContentMasonry as SharedContentMasonry } from "@synapse/features";
import type { Content } from "@synapse/shared/schemas";
import { lazy, memo } from "react";

const Item = lazy(() => import("@/entities/item/ui/item"));

interface ContentMasonryProps {
	items: Content[];
	isLoading?: boolean;
	onContentUpdated?: (content: Content) => void;
	onContentDeleted?: (contentId: string) => void;
	onItemClick?: (item: Content) => void;
	onItemHover?: () => void;
	excludedTag?: string;
	compact?: boolean;
}

export const ContentMasonry = memo(
	({
		items,
		isLoading = false,
		onContentUpdated,
		onContentDeleted,
		onItemClick,
		onItemHover,
		excludedTag,
		compact = false,
	}: ContentMasonryProps) => (
		<SharedContentMasonry
			items={items}
			isLoading={isLoading}
			compact={compact}
			onItemHover={onItemHover}
			renderItem={(item, index) => (
				<Item
					item={item}
					index={index}
					onContentUpdated={onContentUpdated}
					onContentDeleted={onContentDeleted}
					onItemClick={onItemClick}
					excludedTag={excludedTag}
				/>
			)}
		/>
	)
);
