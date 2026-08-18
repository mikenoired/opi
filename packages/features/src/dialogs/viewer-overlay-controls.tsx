import { Button } from "@monolyth/ui/components";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight, X, type LucideIcon } from "lucide-react";

export interface ViewerOverlayAction {
	destructive?: boolean;
	disabled?: boolean;
	icon: LucideIcon;
	label: string;
	onClick(): void;
}
export interface ViewerOverlayControlsProps {
	actions: ViewerOverlayAction[];
	canGoNext?: boolean;
	canGoPrevious?: boolean;
	closeLabel?: string;
	nextLabel?: string;
	onClose(): void;
	onNext?(): void;
	onPrevious?(): void;
	previousLabel?: string;
	visible: boolean;
}

/** Shared viewer overlay visual. Action handlers and navigation are platform dependencies. */
export function ViewerOverlayControls({
	actions,
	canGoNext = false,
	canGoPrevious = false,
	closeLabel = "Close viewer",
	nextLabel = "Next item",
	onClose,
	onNext,
	onPrevious,
	previousLabel = "Previous item",
	visible,
}: ViewerOverlayControlsProps) {
	return (
		<>
			<AnimatePresence initial={false}>
				{visible && canGoPrevious && onPrevious && (
					<motion.div
						initial={{ filter: "blur(10px)", opacity: 0, x: -16 }}
						animate={{ filter: "blur(0px)", opacity: 1, x: 0 }}
						exit={{ filter: "blur(0px)", opacity: 0, x: -16 }}
						transition={{ duration: 0.16 }}
						className="absolute top-1/2 left-5 z-20">
						<Button
							onClick={onPrevious}
							aria-label={previousLabel}
							variant="secondary"
							size="icon-lg"
							className="-translate-y-1/2 rounded-full">
							<ChevronLeft className="size-5" />
						</Button>
					</motion.div>
				)}
			</AnimatePresence>
			<AnimatePresence initial={false}>
				{visible && canGoNext && onNext && (
					<motion.div
						initial={{ filter: "blur(10px)", opacity: 0, x: 16 }}
						animate={{ filter: "blur(0px)", opacity: 1, x: 0 }}
						exit={{ filter: "blur(0px)", opacity: 0, x: 16 }}
						transition={{ duration: 0.16 }}
						className="absolute top-1/2 right-5 z-20">
						<Button
							onClick={onNext}
							aria-label={nextLabel}
							variant="secondary"
							size="icon-lg"
							className="-translate-y-1/2 rounded-full">
							<ChevronRight className="size-5" />
						</Button>
					</motion.div>
				)}
			</AnimatePresence>
			<AnimatePresence initial={false}>
				{visible && actions.length > 0 && (
					<motion.div
						initial={{ filter: "blur(10px)", opacity: 0, y: 16 }}
						animate={{ filter: "blur(0px)", opacity: 1, y: 0 }}
						exit={{ filter: "blur(10px)", opacity: 0, y: 16 }}
						transition={{ duration: 0.18 }}
						className="absolute right-6 bottom-6 z-20 flex flex-wrap items-center gap-2">
						{actions.map((action) => (
							<Button
								key={action.label}
								variant="secondary"
								leadingIcon={action.icon}
								size="sm"
								onClick={action.onClick}
								disabled={action.disabled}
								className={
									action.destructive
										? "h-10 cursor-pointer rounded-full px-4 text-destructive"
										: "h-10 cursor-pointer rounded-full px-4"
								}>
								{action.label}
							</Button>
						))}
					</motion.div>
				)}
			</AnimatePresence>
			<AnimatePresence initial={false}>
				{visible && (
					<motion.div
						initial={{ filter: "blur(10px)", opacity: 0, x: 16, y: -16 }}
						animate={{ filter: "blur(0px)", opacity: 1, x: 0, y: 0 }}
						exit={{ filter: "blur(10px)", opacity: 0, x: 16, y: -16 }}
						transition={{ duration: 0.16 }}
						className="absolute top-6 right-6 z-20">
						<Button
							variant="secondary"
							size="icon"
							onClick={onClose}
							aria-label={closeLabel}
							className="rounded-full">
							<X className="size-4" />
						</Button>
					</motion.div>
				)}
			</AnimatePresence>
		</>
	);
}
