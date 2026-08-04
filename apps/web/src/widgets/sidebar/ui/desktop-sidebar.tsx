import { SIDEBAR_ANIMATION } from "@synapse/shared/animations";
import { cn } from "@synapse/ui/cn";
import { Tooltip, TooltipProvider, useProximityHover } from "@synapse/ui/components";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft } from "lucide-react";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";

import { useDashboard } from "@/shared/lib/dashboard-context";
import { useI18n } from "@/shared/lib/i18n";
import Link from "@/shared/router/link";
import { usePathname } from "@/shared/router/navigation";

import type { NavItem } from "./sidebar";

export default function DesktopSidebar({ navItems }: { navItems: NavItem[] }) {
	const { isSidebarExpanded, toggleSidebar } = useDashboard();
	const pathname = usePathname();
	const { t } = useI18n();
	const sidebarToggleLabel = isSidebarExpanded ? t("position.collapse") : t("position.expand");
	const sidebarToggleAriaLabel = isSidebarExpanded
		? t("settings.sidebar.collapse")
		: t("settings.sidebar.expand");
	const activeNavIndex = navItems.findIndex((item) => item.isActive ?? item.href === pathname);
	const selectedIndex = activeNavIndex === -1 ? null : activeNavIndex + 1;

	return (
		<TooltipProvider>
			<motion.aside
				animate={{ width: isSidebarExpanded ? 256 : 64 }}
				initial={false}
				transition={SIDEBAR_ANIMATION}
				className="relative hidden h-screen shrink-0 flex-col sm:flex">
				<div className="flex h-full flex-col">
					<nav className="flex-1 overflow-y-auto px-3 py-4">
						<SidebarButtonGroup selectedIndex={selectedIndex}>
							<SidebarToggle
								label={sidebarToggleLabel}
								ariaLabel={sidebarToggleAriaLabel}
								isExpanded={isSidebarExpanded}
								onClick={toggleSidebar}
								index={0}
							/>
							{navItems.map((item) => (
								<SidebarItem
									key={item.label}
									item={item}
									pathname={pathname}
									isExpanded={isSidebarExpanded}
									index={navItems.indexOf(item) + 1}
								/>
							))}
						</SidebarButtonGroup>
					</nav>
				</div>
			</motion.aside>
		</TooltipProvider>
	);
}

interface SidebarInteractionContextValue {
	setPressedIndex: (index: number | null) => void;
}

const SidebarInteractionContext = createContext<SidebarInteractionContextValue | null>(null);

function useSidebarInteraction() {
	const context = useContext(SidebarInteractionContext);
	if (!context) throw new Error("useSidebarInteraction must be used within SidebarButtonGroup");
	return context;
}

function SidebarButtonGroup({
	children,
	selectedIndex,
}: {
	children: ReactNode;
	selectedIndex: number | null;
}) {
	const containerRef = useRef<HTMLDivElement>(null);
	const { activeIndex, itemRects, handlers, registerItem } = useProximityHover(containerRef);
	const [pressedIndex, setPressedIndex] = useState<number | null>(null);

	useEffect(() => {
		containerRef.current?.querySelectorAll<HTMLElement>("[data-sidebar-index]").forEach((element) => {
			registerItem(Number(element.dataset.sidebarIndex), element);
		});
	}, [children, registerItem]);

	const activeRect = activeIndex !== null ? itemRects[activeIndex] : null;
	const pressedRect = pressedIndex !== null ? itemRects[pressedIndex] : null;
	const selectedRect = selectedIndex !== null ? itemRects[selectedIndex] : null;
	const verticalRect = (rect: { top: number; height: number } | null) =>
		rect ? { top: rect.top, height: rect.height, opacity: 1 } : { opacity: 0 };

	return (
		<SidebarInteractionContext.Provider value={{ setPressedIndex }}>
			<div
				ref={containerRef}
				onMouseEnter={handlers.onMouseEnter}
				onMouseMove={handlers.onMouseMove}
				onMouseLeave={() => {
					handlers.onMouseLeave();
					setPressedIndex(null);
				}}
				className="relative flex flex-col gap-2"
				data-sidebar-button-group>
				<motion.div
					className="pointer-events-none absolute inset-x-0 z-1 rounded-lg bg-primary shadow-sm"
					initial={false}
					animate={verticalRect(selectedRect)}
					transition={{ type: "spring", duration: 0.16, bounce: 0, opacity: { duration: 0.08 } }}
				/>
				<AnimatePresence>
					{activeRect && (
						<motion.div
							className="pointer-events-none absolute inset-x-0 z-0 rounded-lg bg-accent/50"
							initial={{ top: activeRect.top, height: activeRect.height, opacity: 0 }}
							animate={verticalRect(activeRect)}
							exit={{ opacity: 0, transition: { duration: 0.06 } }}
							transition={{ type: "spring", duration: 0.16, bounce: 0, opacity: { duration: 0.08 } }}
						/>
					)}
				</AnimatePresence>
				<AnimatePresence>
					{pressedRect && (
						<motion.div
							className="pointer-events-none absolute inset-x-0 z-2 rounded-lg bg-accent"
							initial={{ top: pressedRect.top, height: pressedRect.height, opacity: 0 }}
							animate={verticalRect(pressedRect)}
							exit={{ opacity: 0, transition: { duration: 0.08 } }}
							transition={{ type: "spring", duration: 0.08, bounce: 0, opacity: { duration: 0.04 } }}
						/>
					)}
				</AnimatePresence>
				{children}
			</div>
		</SidebarInteractionContext.Provider>
	);
}

function SidebarToggle({
	label,
	ariaLabel,
	isExpanded,
	onClick,
	index,
}: {
	label: string;
	ariaLabel: string;
	isExpanded: boolean;
	onClick: () => void;
	index: number;
}) {
	const { setPressedIndex } = useSidebarInteraction();

	return (
		<Tooltip side="right" sideOffset={5} disabled={isExpanded} content={label}>
			<button
				data-sidebar-index={index}
				onClick={onClick}
				onMouseDown={() => setPressedIndex(index)}
				onMouseUp={() => setPressedIndex(null)}
				onMouseLeave={() => setPressedIndex(null)}
				aria-label={ariaLabel}
				className="relative z-10 flex h-10 w-full cursor-pointer items-center justify-start rounded-lg pl-2.5 text-muted-foreground transition-colors hover:text-foreground">
				<div className="flex h-10 w-full items-center overflow-hidden">
					<motion.div
						initial={false}
						animate={{ rotate: isExpanded ? 0 : 180 }}
						className="flex size-5 shrink-0 items-center justify-center"
						transition={{ duration: 0.3, ease: "easeInOut" }}>
						<ChevronLeft className="size-5" />
					</motion.div>
					<AnimatePresence mode="wait">
						{isExpanded && (
							<motion.span
								initial={{ opacity: 0, width: 0 }}
								animate={{ opacity: 1, width: "100%" }}
								exit={{ opacity: 0, width: 0 }}
								transition={SIDEBAR_ANIMATION}
								className="ml-3 overflow-hidden text-left text-sm font-medium whitespace-nowrap">
								{label}
							</motion.span>
						)}
					</AnimatePresence>
				</div>
				<span className="sr-only">{ariaLabel}</span>
			</button>
		</Tooltip>
	);
}

function SidebarItem({
	item,
	pathname,
	isExpanded,
	index,
}: {
	item: NavItem;
	pathname?: string;
	isExpanded: boolean;
	index: number;
}) {
	const { setPressedIndex } = useSidebarInteraction();
	const isActive = item.isActive ?? item.href === pathname;
	const isActionButton = !item.href;

	const buttonContent = (
		<div className="flex h-10 w-full items-center overflow-hidden">
			<item.icon className="size-5 shrink-0" aria-hidden="true" />
			<AnimatePresence mode="wait">
				{isExpanded && (
					<motion.span
						initial={{ opacity: 0, width: 0 }}
						animate={{ opacity: 1, width: "100%" }}
						exit={{ opacity: 0, width: 0 }}
						transition={SIDEBAR_ANIMATION}
						className="ml-3 overflow-hidden text-left text-sm font-medium whitespace-nowrap">
						{item.label}
					</motion.span>
				)}
			</AnimatePresence>
		</div>
	);

	const buttonClassName = cn(
		"relative z-10 flex h-10 w-full items-center justify-start rounded-lg pl-2.5 transition-colors",
		isActive
			? "pointer-events-none font-semibold text-primary-foreground"
			: isActionButton
				? "border border-primary/20 bg-primary/10 pl-[0.55rem] font-semibold text-primary hover:text-primary"
				: "text-muted-foreground hover:text-foreground"
	);

	const itemElement = item.href ? (
		<Link
			data-sidebar-index={index}
			onMouseDown={() => setPressedIndex(index)}
			onMouseUp={() => setPressedIndex(null)}
			onMouseLeave={() => setPressedIndex(null)}
			href={item.href}
			scroll={false}
			className={buttonClassName}>
			{buttonContent}
		</Link>
	) : (
		<button
			data-sidebar-index={index}
			onClick={item.action}
			onMouseEnter={item.onMouseEnter}
			onMouseDown={() => setPressedIndex(index)}
			onMouseUp={() => setPressedIndex(null)}
			onMouseLeave={() => setPressedIndex(null)}
			className={cn(buttonClassName, "cursor-pointer")}>
			{buttonContent}
		</button>
	);

	return (
		<Tooltip delayDuration={2} side="right" disabled={isExpanded} content={item.label}>
			{itemElement}
		</Tooltip>
	);
}
