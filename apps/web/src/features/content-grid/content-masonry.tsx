import type { Content } from "@synapse/shared/schemas";
import { Skeleton } from "@synapse/ui/components";
import { lazy, memo } from "react";
import Masonry from "react-masonry-css";

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

const defaultBreakpoints = {
	default: 4,
	2560: 5,
	1920: 4,
	1280: 3,
	1024: 2,
	768: 2,
	640: 1,
};

const compactBreakpoints = {
	default: 5,
	1920: 4,
	1280: 3,
	900: 2,
	640: 1,
};

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
		<Masonry
			breakpointCols={compact ? compactBreakpoints : defaultBreakpoints}
			className="masonry-grid"
			columnClassName="masonry-grid_column">
			{isLoading
				? Array.from({ length: compact ? 5 : 4 }).map((_, index) => (
						<div className="mb-4 bg-transparent" key={index}>
							<Skeleton className="h-40 w-full rounded-lg" />
						</div>
					))
				: items.map((item, index) => (
						<div
							key={item.id}
							className={`animate-in rounded-xl shadow duration-300 fade-in-0`}
							onMouseEnter={onItemHover}>
							<Item
								item={item}
								index={index}
								onContentUpdated={onContentUpdated}
								onContentDeleted={onContentDeleted}
								onItemClick={onItemClick}
								excludedTag={excludedTag}
							/>
						</div>
					))}
		</Masonry>
	)
);
