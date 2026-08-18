import { getTagColor } from "@monolyth/shared/tag-colors";
import { cn } from "@monolyth/ui/cn";
import { Badge } from "@monolyth/ui/components";
import { X } from "lucide-react";
import type { CSSProperties, MouseEvent, ReactNode } from "react";

type BadgeProps = React.ComponentProps<typeof Badge>;

export interface ContentTagProps {
	children?: ReactNode;
	className?: string;
	color?: number;
	disabled?: boolean;
	onNavigate?(tagId: string): void;
	onRemove?(tag: string): void;
	style?: CSSProperties;
	tag: string;
	tagId?: string;
	variant?: BadgeProps["variant"];
}

/** Shared tag visual. Lookup and navigation are deliberately outside the component. */
export function ContentTag({
	children,
	className,
	color = 0,
	disabled = false,
	onNavigate,
	onRemove,
	style,
	tag,
	tagId,
	variant = "solid",
}: ContentTagProps) {
	const value = getTagColor(color);
	const badgeStyle = {
		...(value ? { "--tag-color": value, "backgroundColor": `${value}20`, "borderColor": `${value}58` } : {}),
		...style,
	} as CSSProperties;
	const dot = color > 0 && (
		<span className="size-1.5 shrink-0 rounded-full bg-(--tag-color)" aria-hidden="true" />
	);
	const stop = (event: MouseEvent) => event.stopPropagation();
	if (onRemove)
		return (
			<Badge
				variant={variant}
				className={cn("flex max-w-full items-center gap-1", className)}
				style={badgeStyle}>
				{dot}
				<span className="min-w-0 truncate">{children ?? tag}</span>
				<button
					type="button"
					onClick={(event) => {
						stop(event);
						onRemove(tag);
					}}
					className="ml-1 shrink-0 rounded-full p-0.5 hover:bg-destructive/20"
					disabled={disabled}
					aria-label={`Remove ${tag}`}>
					<X className="size-3" />
				</button>
			</Badge>
		);
	if (tagId && onNavigate)
		return (
			<Badge variant={variant} className={cn("max-w-full cursor-pointer", className)} style={badgeStyle}>
				<button
					type="button"
					onClick={(event) => {
						stop(event);
						onNavigate(tagId);
					}}
					className="inline-flex items-center gap-1 text-inherit">
					{dot}
					<span className="min-w-0 truncate">{children ?? tag}</span>
				</button>
			</Badge>
		);
	return (
		<Badge variant={variant} className={cn("max-w-full", className)} style={badgeStyle}>
			{dot}
			<span className="block truncate">{children ?? tag}</span>
		</Badge>
	);
}
