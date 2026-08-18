import { cn } from "@monolyth/ui/cn";
import { Button } from "@monolyth/ui/components";
import type { ComponentProps, ReactNode } from "react";

type ButtonVariant = ComponentProps<typeof Button>["variant"];

interface ModalActionsProps {
	children?: ReactNode;
	className?: string;
	position?: "left" | "center" | "right" | "space-between";
}

export function ModalActions({ children, className, position = "right" }: ModalActionsProps) {
	const positionClasses = {
		"left": "justify-start",
		"center": "justify-center",
		"right": "justify-end",
		"space-between": "justify-between",
	};

	return (
		<div className={cn("flex items-center gap-3", positionClasses[position], className)}>{children}</div>
	);
}

interface ActionButtonProps {
	children: ReactNode;
	onClick?: () => void;
	variant?: ButtonVariant;
	disabled?: boolean;
	loading?: boolean;
	type?: "button" | "submit";
	className?: string;
}

function ActionButton({
	children,
	onClick,
	variant = "primary",
	disabled = false,
	loading = false,
	type = "button",
	className,
}: ActionButtonProps) {
	return (
		<Button
			type={type}
			variant={variant}
			onClick={onClick}
			disabled={disabled || loading}
			className={className}>
			{loading ? "Загрузка..." : children}
		</Button>
	);
}

ModalActions.Primary = ActionButton;
ModalActions.Secondary = ActionButton;
ModalActions.Button = ActionButton;
