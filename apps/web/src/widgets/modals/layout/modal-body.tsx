import { cn } from "@monolyth/ui/cn";
import type { ReactNode } from "react";

import { modalSpacing } from "@/shared/ui/design-tokens";

interface ModalBodyProps {
	children: ReactNode;
	className?: string;
	scrollable?: boolean;
	noPadding?: boolean;
}

export function ModalBody({ children, className, scrollable = true, noPadding = false }: ModalBodyProps) {
	return (
		<div
			className={cn(
				"flex-1",
				scrollable && "overflow-x-hidden overflow-y-auto",
				!noPadding && "p-6",
				className
			)}
			style={!noPadding ? { padding: modalSpacing.contentPadding.desktop } : undefined}>
			{children}
		</div>
	);
}
