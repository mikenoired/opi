import { cn } from "@monolyth/ui/cn";
import type { ComponentPropsWithoutRef } from "react";

type ScrollAreaProps = ComponentPropsWithoutRef<"div">;

export function ScrollArea({ className, children, ...props }: ScrollAreaProps) {
	return (
		<div className={cn("overflow-auto", className)} {...props}>
			{children}
		</div>
	);
}
