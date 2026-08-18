import type { Content } from "@monolyth/shared/schemas";
import { cn } from "@monolyth/ui/cn";
import type { ReactNode } from "react";

export interface TagStackProps {
	items: Content[];
	renderPreview(item: Content): ReactNode;
}

/** Shared tag-card stack; each platform supplies the preview renderer it can support. */
export function TagStack({ items, renderPreview }: TagStackProps) {
	return (
		<div className="relative aspect-square w-full cursor-pointer">
			{items
				.slice(0, 3)
				.reverse()
				.map((item, index) => (
					<div
						key={item.id}
						className={cn(
							"absolute h-full w-full overflow-hidden rounded-lg border border-border/80 bg-card shadow-md ring-1 ring-black/5 transition-all duration-300 ease-in-out group-hover:border-primary/35 group-hover:shadow-xl dark:border-white/10 dark:ring-white/10",
							index === 0 && "z-30",
							index === 1 &&
								"z-20 translate-x-1.5 -translate-y-3 rotate-0 group-hover:translate-x-4 group-hover:-translate-y-4 group-hover:rotate-3",
							index === 2 &&
								"z-10 -translate-x-1.5 translate-y-3 -rotate-2 group-hover:-translate-x-4 group-hover:translate-y-4 group-hover:-rotate-3"
						)}>
						{renderPreview(item)}
					</div>
				))}
		</div>
	);
}
