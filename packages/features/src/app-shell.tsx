import { SIDEBAR_ANIMATION } from "@synapse/shared/animations";
import { cn } from "@synapse/ui/cn";
import { TabItem, Tabs, TabsList, Tooltip, TooltipProvider, useProximityHover } from "@synapse/ui/components";
import { AnimatePresence, motion } from "framer-motion";
import {
	ChevronLeft,
	HardDrive,
	Home,
	Network,
	Palette,
	Plus,
	Settings2,
	Sparkles,
	Tag,
	X,
} from "lucide-react";
import {
	createContext,
	useContext,
	useEffect,
	useRef,
	useState,
	type ComponentType,
	type ReactNode,
} from "react";

import type {
	AppIcon,
	AppRouteId,
	CapabilitySnapshot,
	NavigationItemConfig,
	SettingsTabConfig,
} from "./runtime/config";
import { isVisible } from "./runtime/config";

export interface AppSidebarItem {
	id: string;
	icon: ComponentType<{ className?: string }>;
	label: string;
	onSelect: () => void;
	onHover?: () => void;
	selected?: boolean;
	variant?: "action" | "navigation";
}

export interface ConfiguredAppSidebarProps {
	activeId?: string;
	activeRoute?: AppRouteId;
	capabilities: CapabilitySnapshot;
	collapseLabel?: string;
	expandLabel?: string;
	items: NavigationItemConfig[];
	labels?: Record<string, string | undefined>;
	onCommand?(command: string): void;
	onItemHover?(id: string): void;
	onNavigate?(route: AppRouteId): void;
	footer?: ReactNode;
}

/**
 * Turns the serializable navigation configuration into the one canonical
 * sidebar. Platform constructors supply routing and command dispatch only.
 */
export function ConfiguredAppSidebar({
	activeId,
	activeRoute,
	capabilities,
	collapseLabel,
	expandLabel,
	items,
	labels,
	onCommand,
	onItemHover,
	onNavigate,
	footer,
}: ConfiguredAppSidebarProps) {
	const visibleItems = items.filter((item) => isVisible(item.when, capabilities));
	return (
		<AppSidebar
			collapseLabel={collapseLabel}
			expandLabel={expandLabel}
			items={visibleItems.map((item) => ({
				icon: navigationIcon(item.icon),
				id: item.id,
				label: labels?.[item.id] ?? item.label,
				onHover: () => onItemHover?.(item.id),
				onSelect: () => {
					if (item.command) onCommand?.(item.command);
					else if (item.route) onNavigate?.(item.route);
				},
				selected: activeId ? item.id === activeId : item.route === activeRoute,
				variant: item.variant,
			}))}
			footer={footer}
		/>
	);
}

/** Shared Synapse frame. Platforms supply behaviour, never a second navigation design. */
export function AppSidebar({
	collapseLabel = "Свернуть",
	expanded: controlledExpanded,
	expandLabel = "Развернуть",
	initiallyExpanded = true,
	items,
	footer,
	onExpandedChange,
}: {
	collapseLabel?: string;
	expanded?: boolean;
	expandLabel?: string;
	initiallyExpanded?: boolean;
	items: AppSidebarItem[];
	footer?: ReactNode;
	onExpandedChange?: (expanded: boolean) => void;
}) {
	const [uncontrolledExpanded, setUncontrolledExpanded] = useState(initiallyExpanded);
	const expanded = controlledExpanded ?? uncontrolledExpanded;
	const toggle = () => {
		const next = !expanded;
		setUncontrolledExpanded(next);
		onExpandedChange?.(next);
	};
	return (
		<>
			<TooltipProvider>
				<motion.aside
					animate={{ width: expanded ? 256 : 64 }}
					initial={false}
					transition={SIDEBAR_ANIMATION}
					className="relative hidden h-screen shrink-0 flex-col sm:flex">
					<nav className="flex-1 overflow-y-auto px-3 py-4">
						<SidebarButtonGroup selectedIndex={getSelectedIndex(items)}>
							<SidebarToggle
								ariaLabel={expanded ? collapseLabel : expandLabel}
								isExpanded={expanded}
								label={expanded ? collapseLabel : expandLabel}
								onClick={toggle}
							/>
							{items.map((item, index) => (
								<DesktopSidebarItem key={item.id} index={index + 1} isExpanded={expanded} item={item} />
							))}
						</SidebarButtonGroup>
					</nav>
					{footer && <div className="border-t px-3 py-3">{footer}</div>}
				</motion.aside>
			</TooltipProvider>
			<nav className="fixed right-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-3 z-50 rounded-full border bg-background/95 p-2 backdrop-blur-sm sm:hidden">
				<div className="mx-auto flex max-w-sm justify-between gap-1 font-medium">
					{items.map((item) => (
						<MobileSidebarItem key={item.id} item={item} />
					))}
				</div>
			</nav>
		</>
	);
}

function getSelectedIndex(items: AppSidebarItem[]) {
	const activeIndex = items.findIndex((item) => item.selected);
	return activeIndex === -1 ? null : activeIndex + 1;
}

interface SidebarInteractionContextValue {
	setPressedIndex: (index: number | null) => void;
}

const SidebarInteractionContext = createContext<SidebarInteractionContextValue | null>(null);

function useSidebarInteraction() {
	const context = useContext(SidebarInteractionContext);
	if (!context) throw new Error("Sidebar item must be used within AppSidebar");
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
	const { activeIndex, handlers, itemRects, registerItem } = useProximityHover(containerRef);
	const [pressedIndex, setPressedIndex] = useState<number | null>(null);

	useEffect(() => {
		containerRef.current?.querySelectorAll<HTMLElement>("[data-sidebar-index]").forEach((element) => {
			registerItem(Number(element.dataset.sidebarIndex), element);
		});
	}, [children, registerItem]);

	const activeRect = activeIndex === null ? null : itemRects[activeIndex];
	const pressedRect = pressedIndex === null ? null : itemRects[pressedIndex];
	const selectedRect = selectedIndex === null ? null : itemRects[selectedIndex];
	const verticalRect = (rect: { height: number; top: number } | null) =>
		rect ? { height: rect.height, opacity: 1, top: rect.top } : { opacity: 0 };

	return (
		<SidebarInteractionContext.Provider value={{ setPressedIndex }}>
			<div
				ref={containerRef}
				onMouseEnter={handlers.onMouseEnter}
				onMouseLeave={() => {
					handlers.onMouseLeave();
					setPressedIndex(null);
				}}
				onMouseMove={handlers.onMouseMove}
				className="relative flex flex-col gap-2">
				<motion.div
					className="pointer-events-none absolute inset-x-0 z-1 rounded-lg bg-primary shadow-sm"
					initial={false}
					animate={verticalRect(selectedRect)}
					transition={{ bounce: 0, duration: 0.16, opacity: { duration: 0.08 }, type: "spring" }}
				/>
				<AnimatePresence>
					{activeRect && (
						<motion.div
							className="pointer-events-none absolute inset-x-0 z-0 rounded-lg bg-accent/50"
							initial={{ height: activeRect.height, opacity: 0, top: activeRect.top }}
							animate={verticalRect(activeRect)}
							exit={{ opacity: 0, transition: { duration: 0.06 } }}
							transition={{ bounce: 0, duration: 0.16, opacity: { duration: 0.08 }, type: "spring" }}
						/>
					)}
				</AnimatePresence>
				<AnimatePresence>
					{pressedRect && (
						<motion.div
							className="pointer-events-none absolute inset-x-0 z-2 rounded-lg bg-accent"
							initial={{ height: pressedRect.height, opacity: 0, top: pressedRect.top }}
							animate={verticalRect(pressedRect)}
							exit={{ opacity: 0, transition: { duration: 0.08 } }}
							transition={{ bounce: 0, duration: 0.08, opacity: { duration: 0.04 }, type: "spring" }}
						/>
					)}
				</AnimatePresence>
				{children}
			</div>
		</SidebarInteractionContext.Provider>
	);
}

function SidebarToggle({
	ariaLabel,
	isExpanded,
	label,
	onClick,
}: {
	ariaLabel: string;
	isExpanded: boolean;
	label: string;
	onClick: () => void;
}) {
	const { setPressedIndex } = useSidebarInteraction();
	return (
		<Tooltip content={label} disabled={isExpanded} side="right" sideOffset={5}>
			<button
				data-sidebar-index={0}
				type="button"
				onClick={onClick}
				onMouseDown={() => setPressedIndex(0)}
				onMouseLeave={() => setPressedIndex(null)}
				onMouseUp={() => setPressedIndex(null)}
				aria-label={ariaLabel}
				className="relative z-10 flex h-10 w-full cursor-pointer items-center justify-start rounded-lg pl-2.5 text-muted-foreground transition-colors hover:text-foreground">
				<div className="flex h-10 w-full items-center overflow-hidden">
					<motion.div
						animate={{ rotate: isExpanded ? 0 : 180 }}
						className="flex size-5 shrink-0 items-center justify-center"
						initial={false}
						transition={{ duration: 0.3, ease: "easeInOut" }}>
						<ChevronLeft className="size-5" />
					</motion.div>
					<AnimatePresence mode="wait">
						{isExpanded && (
							<motion.span
								animate={{ opacity: 1, width: "100%" }}
								className="ml-3 overflow-hidden text-left text-sm font-medium whitespace-nowrap"
								exit={{ opacity: 0, width: 0 }}
								initial={{ opacity: 0, width: 0 }}
								transition={SIDEBAR_ANIMATION}>
								{label}
							</motion.span>
						)}
					</AnimatePresence>
				</div>
			</button>
		</Tooltip>
	);
}

function DesktopSidebarItem({
	index,
	isExpanded,
	item,
}: {
	index: number;
	isExpanded: boolean;
	item: AppSidebarItem;
}) {
	const { setPressedIndex } = useSidebarInteraction();
	const Icon = item.icon;
	const action = item.variant === "action";
	return (
		<Tooltip content={item.label} disabled={isExpanded} side="right" sideOffset={5}>
			<button
				data-testid={`sidebar-${item.id}`}
				data-sidebar-index={index}
				type="button"
				onClick={item.onSelect}
				onMouseDown={() => setPressedIndex(index)}
				onMouseEnter={item.onHover}
				onMouseLeave={() => setPressedIndex(null)}
				onMouseUp={() => setPressedIndex(null)}
				aria-current={item.selected ? "page" : undefined}
				className={cn(
					"relative z-10 flex h-10 w-full cursor-pointer items-center justify-start rounded-lg pl-2.5 transition-colors",
					item.selected
						? "pointer-events-none font-semibold text-primary-foreground"
						: action
							? "border border-primary/20 bg-primary/10 pl-[0.55rem] font-semibold text-primary hover:text-primary"
							: "text-muted-foreground hover:text-foreground"
				)}>
				<div className="flex h-10 w-full items-center overflow-hidden">
					<Icon className="size-5 shrink-0" />
					<AnimatePresence mode="wait">
						{isExpanded && (
							<motion.span
								animate={{ opacity: 1, width: "100%" }}
								className="ml-3 overflow-hidden text-left text-sm font-medium whitespace-nowrap"
								exit={{ opacity: 0, width: 0 }}
								initial={{ opacity: 0, width: 0 }}
								transition={SIDEBAR_ANIMATION}>
								{item.label}
							</motion.span>
						)}
					</AnimatePresence>
				</div>
			</button>
		</Tooltip>
	);
}

function MobileSidebarItem({ item }: { item: AppSidebarItem }) {
	const Icon = item.icon;
	const action = item.variant === "action";
	return (
		<button
			type="button"
			onClick={item.onSelect}
			onMouseEnter={item.onHover}
			aria-current={item.selected ? "page" : undefined}
			aria-label={item.label}
			className={cn(
				"flex min-w-0 flex-1 flex-col items-center justify-center gap-1 text-center transition-colors",
				action
					? "-mt-8 h-16 rounded-full bg-primary font-semibold text-primary-foreground shadow-lg focus-visible:ring-2 focus-visible:ring-ring"
					: item.selected
						? "font-semibold text-foreground"
						: "text-muted-foreground hover:text-foreground"
			)}>
			<Icon className={cn("mx-auto", action ? "size-7" : "size-6")} />
			{!action && <span className="truncate text-xs">{item.label}</span>}
		</button>
	);
}

export function DashboardSurface({ children }: { children: ReactNode }) {
	return (
		<motion.main className="h-screen min-h-0 min-w-0 flex-1 p-4 pl-0">
			<div
				className="h-full w-full min-w-0 flex-1 overflow-x-hidden overflow-y-auto rounded-lg bg-muted/50 pb-20 shadow-sm sm:pb-0 dark:bg-background"
				style={{ maxHeight: "100vh", height: "100%" }}>
				{children}
			</div>
		</motion.main>
	);
}

export function SettingsModalShell({
	activeKey,
	children,
	navigation,
	onClose,
	open,
	title,
}: {
	activeKey: string;
	children: ReactNode;
	navigation: ReactNode;
	onClose: () => void;
	open: boolean;
	title: string;
}) {
	const modalRef = useRef<HTMLDivElement>(null);
	useEffect(() => {
		if (!open) return;
		const previous = document.body.style.overflow;
		document.body.style.overflow = "hidden";
		modalRef.current?.focus();
		return () => {
			document.body.style.overflow = previous;
		};
	}, [open]);
	useEffect(() => {
		if (!open) return;
		const handler = (event: KeyboardEvent) => {
			if (event.key === "Escape") onClose();
		};
		document.addEventListener("keydown", handler);
		return () => document.removeEventListener("keydown", handler);
	}, [onClose, open]);
	return (
		<AnimatePresence>
			{open && (
				<motion.div
					initial={{ backdropFilter: "blur(0px)" }}
					animate={{ backdropFilter: "blur(10px)" }}
					exit={{ backdropFilter: "blur(0px)" }}
					transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
					onClick={onClose}
					className="fixed inset-0 z-90 flex items-center justify-center p-4 sm:p-6">
					<motion.div
						aria-hidden
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
						transition={{ duration: 0.28 }}
						className="absolute inset-0 bg-[rgba(32,29,26,.26)]"
					/>
					<motion.div
						ref={modalRef}
						tabIndex={-1}
						role="dialog"
						aria-modal="true"
						aria-labelledby="settings-modal-title"
						initial={{ filter: "blur(12px)", opacity: 0, scale: 0.98, y: 18 }}
						animate={{ filter: "blur(0px)", opacity: 1, scale: 1, y: 0 }}
						exit={{ filter: "blur(10px)", opacity: 0, scale: 0.985, y: 12 }}
						transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
						onClick={(event) => event.stopPropagation()}
						className="relative grid h-[min(760px,calc(100vh-2rem))] w-full max-w-230 overflow-hidden rounded-xl border border-border bg-background md:grid-cols-[220px_minmax(0,1fr)]">
						<button
							type="button"
							onClick={onClose}
							className="absolute top-3 right-3 z-20 flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
							aria-label="Закрыть">
							<X className="size-4.5" />
						</button>
						<div className="flex flex-col p-3 pt-12 md:border-r md:border-border md:p-3 md:pt-3">
							<div className="mb-3 px-2">
								<h1 id="settings-modal-title" className="text-lg font-semibold text-foreground">
									{title}
								</h1>
							</div>
							{navigation}
						</div>
						<div className="min-h-0 overflow-hidden">
							<div className="h-full overflow-y-auto px-4 pt-3 pb-4 md:px-6 md:pt-6 md:pb-6">
								<AnimatePresence mode="wait">
									<motion.div
										key={activeKey}
										initial={{ filter: "blur(10px)", opacity: 0, y: 10 }}
										animate={{ filter: "blur(0px)", opacity: 1, y: 0 }}
										exit={{ filter: "blur(8px)", opacity: 0, y: -6 }}
										transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}>
										{children}
									</motion.div>
								</AnimatePresence>
							</div>
						</div>
					</motion.div>
				</motion.div>
			)}
		</AnimatePresence>
	);
}

/** Declarative settings navigation: configs provide IDs and semantic icons, never JSX. */
export function ConfiguredSettingsNavigation({
	activeId,
	capabilities,
	onSelect,
	tabs,
}: {
	activeId: string;
	capabilities: CapabilitySnapshot;
	onSelect(id: string): void;
	tabs: SettingsTabConfig[];
}) {
	const visible = tabs.filter((tab) => isVisible(tab.when, capabilities));
	return (
		<Tabs value={activeId} onValueChange={onSelect} orientation="vertical">
			<TabsList orientation="vertical" aria-label="Settings">
				{visible.map((tab) => (
					<TabItem
						key={tab.id}
						value={tab.id}
						icon={settingsIcon(tab.icon)}
						label={tab.label}
						className="h-10 w-full justify-start"
					/>
				))}
			</TabsList>
		</Tabs>
	);
}

function settingsIcon(icon: AppIcon) {
	return (
		(
			{
				ai: Sparkles,
				appearance: Palette,
				localStorage: HardDrive,
				media: HardDrive,
				settings: Settings2,
			} as Partial<Record<AppIcon, typeof Settings2>>
		)[icon] ?? Settings2
	);
}

function navigationIcon(icon: AppIcon) {
	return (
		(
			{
				add: Plus,
				graph: Network,
				home: Home,
				settings: Settings2,
				tags: Tag,
			} as Partial<Record<AppIcon, typeof Settings2>>
		)[icon] ?? Settings2
	);
}
