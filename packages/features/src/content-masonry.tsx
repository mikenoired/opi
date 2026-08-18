import { Skeleton } from "@synapse/ui/components";
import { memo, type ReactNode } from "react";
import Masonry from "react-masonry-css";

import "./content-masonry.css";

const defaultBreakpoints = { default: 4, 2560: 5, 1920: 4, 1280: 3, 1024: 2, 768: 2, 640: 1 };
const compactBreakpoints = { default: 5, 1920: 4, 1280: 3, 900: 2, 640: 1 };

export interface ContentMasonryProps<T extends { id: string }> {
	compact?: boolean;
	isLoading?: boolean;
	items: T[];
	onItemHover?: () => void;
	renderItem: (item: T, index: number) => ReactNode;
}

/** The exact content-grid layout used by both Synapse renderers. */
export const ContentMasonry = memo(function ContentMasonry<T extends { id: string }>({
	compact = false,
	isLoading = false,
	items,
	onItemHover,
	renderItem,
}: ContentMasonryProps<T>) {
	return (
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
							className="animate-in fade-in-0 rounded-xl shadow duration-300"
							onMouseEnter={onItemHover}>
							{renderItem(item, index)}
						</div>
					))}
		</Masonry>
	);
}) as <T extends { id: string }>(props: ContentMasonryProps<T>) => ReactNode;
