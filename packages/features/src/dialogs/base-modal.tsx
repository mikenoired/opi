import { cn } from "@synapse/ui/cn";
import { AnimatePresence, motion } from "framer-motion";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export interface BaseModalProps {
	children: ReactNode;
	className?: string;
	closeOnEscape?: boolean;
	closeOnOverlayClick?: boolean;
	onOpenChange(open: boolean): void;
	open: boolean;
	overlayDecoration?: ReactNode;
	preventScroll?: boolean;
	size?: "sm" | "md" | "lg" | "xl" | "full";
	variant?: "default" | "fullscreen" | "drawer";
}

const sizeClasses = {
	sm: "max-w-md",
	md: "max-w-2xl",
	lg: "max-w-4xl",
	xl: "max-w-6xl",
	full: "max-w-none h-dvh w-screen rounded-none",
};
const animations = {
	content: {
		animate: { opacity: 1, scale: 1, y: 0 },
		exit: { opacity: 0, scale: 0.98, y: 10 },
		initial: { opacity: 0, scale: 0.95, y: 20 },
		transition: {
			bounce: 0.1,
			duration: 0.35,
			opacity: { delay: 0.05, duration: 0.2 },
			type: "spring" as const,
		},
	},
	fullscreen: {
		animate: { opacity: 1 },
		exit: { opacity: 0 },
		initial: { opacity: 0 },
		transition: { duration: 0.25, ease: "easeOut" as const },
	},
	slideUp: {
		animate: { opacity: 1, y: 0 },
		exit: { opacity: 0, y: "100%" },
		initial: { opacity: 0, y: "100%" },
		transition: { damping: 30, stiffness: 300, type: "spring" as const },
	},
};

/** Platform-neutral focus-safe modal shell. Transport and routing stay outside. */
export function BaseModal({
	children,
	className,
	closeOnEscape = true,
	closeOnOverlayClick = true,
	onOpenChange,
	open,
	overlayDecoration,
	preventScroll = true,
	size = "lg",
	variant = "default",
}: BaseModalProps) {
	const [mounted, setMounted] = useState(false);
	const modalRef = useFocusTrap(open);
	useEffect(() => setMounted(true), []);
	useEffect(() => {
		if (!preventScroll) return;
		if (open) {
			document.body.style.overflow = "hidden";
			document.body.style.paddingRight = "var(--removed-body-scroll-bar-size, 0px)";
		} else {
			document.body.style.overflow = "";
			document.body.style.paddingRight = "";
		}
		return () => {
			document.body.style.overflow = "";
			document.body.style.paddingRight = "";
		};
	}, [open, preventScroll]);
	useEffect(() => {
		if (!closeOnEscape || !open) return;
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") onOpenChange(false);
		};
		document.addEventListener("keydown", onKeyDown);
		return () => document.removeEventListener("keydown", onKeyDown);
	}, [closeOnEscape, onOpenChange, open]);
	if (!mounted) return null;
	const animation =
		variant === "fullscreen"
			? animations.fullscreen
			: variant === "drawer"
				? animations.slideUp
				: animations.content;
	return createPortal(
		<AnimatePresence mode="wait">
			{open && (
				<motion.div
					key="modal-overlay"
					className="fixed inset-0 z-200 flex items-center justify-center bg-black/50 backdrop-blur-sm"
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					exit={{ opacity: 0 }}
					transition={{ duration: 0.2, ease: "easeOut" }}
					onClick={closeOnOverlayClick ? () => onOpenChange(false) : undefined}>
					{overlayDecoration}
					<motion.div
						key="modal-content"
						ref={modalRef}
						initial={animation.initial}
						animate={animation.animate}
						exit={animation.exit}
						transition={animation.transition}
						className={cn(
							"relative z-10 m-4 flex flex-col overflow-hidden rounded-lg border border-border bg-background shadow-2xl",
							variant === "fullscreen" && "m-0 h-dvh w-screen rounded-none",
							variant === "drawer" && "w-full max-w-lg",
							variant === "default" && sizeClasses[size],
							variant === "default" && "max-h-[95dvh]",
							className
						)}
						onClick={(event) => event.stopPropagation()}>
						{children}
					</motion.div>
				</motion.div>
			)}
		</AnimatePresence>,
		document.body
	);
}

function useFocusTrap(enabled: boolean) {
	const modalRef = useRef<HTMLDivElement>(null);
	const previous = useRef<HTMLElement | null>(null);
	useEffect(() => {
		const modal = modalRef.current;
		if (!enabled || !modal) return;
		previous.current = document.activeElement as HTMLElement;
		const focusable = modal.querySelectorAll<HTMLElement>(
			'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
		);
		const first = focusable[0];
		const last = focusable[focusable.length - 1];
		first?.focus();
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key !== "Tab") return;
			if (event.shiftKey && document.activeElement === first) {
				event.preventDefault();
				last?.focus();
			} else if (!event.shiftKey && document.activeElement === last) {
				event.preventDefault();
				first?.focus();
			}
		};
		modal.addEventListener("keydown", onKeyDown);
		return () => {
			modal.removeEventListener("keydown", onKeyDown);
			previous.current?.focus();
		};
	}, [enabled]);
	return modalRef;
}
