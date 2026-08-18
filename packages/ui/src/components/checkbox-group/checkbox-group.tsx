import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox";
import { motion, AnimatePresence } from "framer-motion";
import {
	useRef,
	useState,
	useEffect,
	useCallback,
	useLayoutEffect,
	createContext,
	useContext,
	forwardRef,
	type ReactNode,
	type HTMLAttributes,
} from "react";

import { cn } from "../../cn";
import { fontWeights } from "../../lib/font-weights";
import { useShape } from "../../lib/shape";
import { spring } from "../../lib/springs";
import { useMergeSplitBlocks, SelectionBackgrounds } from "../../lib/use-merge-split";
import { useProximityHover } from "../../lib/use-proximity-hover";

interface CheckboxGroupContextValue {
	activeIndex: number | null;
}

const CheckboxGroupContext = createContext<CheckboxGroupContextValue | null>(null);

function useCheckboxGroup() {
	const ctx = useContext(CheckboxGroupContext);
	if (!ctx) throw new Error("useCheckboxGroup must be used within a CheckboxGroup");
	return ctx;
}

interface CheckboxGroupProps extends HTMLAttributes<HTMLDivElement> {
	children: ReactNode;
	checkedIndices?: Set<number>;
}

interface ReadonlyCheckboxItemProps extends HTMLAttributes<HTMLDivElement> {
	checked: boolean;
	label: string;
}

interface EditableCheckboxItemProps extends Omit<HTMLAttributes<HTMLDivElement>, "onToggle"> {
	checked: boolean;
	children: ReactNode;
	onToggle: (checked: boolean) => void;
}

const CheckboxGroup = forwardRef<HTMLDivElement, CheckboxGroupProps>(
	({ children, checkedIndices = new Set(), className, ...props }, ref) => {
		const containerRef = useRef<HTMLDivElement>(null);
		const groupIdCounter = useRef(0);
		const prevGroupMap = useRef(new Map<number, number>());

		const { activeIndex, setActiveIndex, itemRects, sessionRef, handlers, registerItem, measureItems } =
			useProximityHover(containerRef);

		const synchronizeItems = useCallback(() => {
			const items = Array.from(
				containerRef.current?.querySelectorAll<HTMLElement>("[data-checkbox-item]") ?? []
			);
			items.forEach((item, index) => {
				item.dataset.proximityIndex = String(index);
				registerItem(index, item);
			});
			measureItems();
		}, [measureItems, registerItem]);

		useLayoutEffect(() => {
			synchronizeItems();
			// Row geometry does not change when a checkbox toggles. Register once on
			// mount: re-registering every render feeds measurement state back into
			// the component and can cause an update loop with animated backgrounds.
			// eslint-disable-next-line react-hooks/exhaustive-deps
		}, []);

		// Group contiguous checked indices into runs with stable IDs
		const runs: { start: number; end: number }[] = [];
		const sortedChecked = [...checkedIndices].sort((a, b) => a - b);
		for (const idx of sortedChecked) {
			const last = runs[runs.length - 1];
			if (last && idx === last.end + 1) {
				last.end = idx;
			} else {
				runs.push({ start: idx, end: idx });
			}
		}

		// Assign stable IDs: reuse previous ID if any member overlaps
		const usedIds = new Set<number>();
		const newGroupMap = new Map<number, number>();
		const checkedGroups = runs.map((run) => {
			let stableId: number | null = null;
			for (let i = run.start; i <= run.end; i++) {
				const prevId = prevGroupMap.current.get(i);
				if (prevId !== undefined && !usedIds.has(prevId)) {
					stableId = prevId;
					break;
				}
			}
			const id = stableId ?? ++groupIdCounter.current;
			usedIds.add(id);
			for (let i = run.start; i <= run.end; i++) {
				newGroupMap.set(i, id);
			}
			return { ...run, id };
		});
		prevGroupMap.current = newGroupMap;

		const [focusedIndex, setFocusedIndex] = useState<number | null>(null);

		const activeRect = activeIndex !== null ? itemRects[activeIndex] : null;
		const focusRect = focusedIndex !== null ? itemRects[focusedIndex] : null;
		const shape = useShape();

		// Selected backgrounds, with the merge/split boundary animation when one
		// unchecked row bridges or splits two checked runs.
		const blocks = useMergeSplitBlocks(checkedGroups, itemRects, shape.mergedRadius);

		return (
			<CheckboxGroupContext.Provider value={{ activeIndex }}>
				<div
					ref={(node) => {
						(containerRef as React.RefObject<HTMLDivElement | null>).current = node;
						if (typeof ref === "function") ref(node);
						else if (ref) (ref as React.RefObject<HTMLDivElement | null>).current = node;
					}}
					onMouseEnter={handlers.onMouseEnter}
					onMouseMove={handlers.onMouseMove}
					onMouseLeave={handlers.onMouseLeave}
					onFocus={(e) => {
						const indexAttr = (e.target as HTMLElement)
							.closest("[data-proximity-index]")
							?.getAttribute("data-proximity-index");
						if (indexAttr != null) {
							const idx = Number(indexAttr);
							setActiveIndex(idx);
							setFocusedIndex((e.target as HTMLElement).matches(":focus-visible") ? idx : null);
						}
					}}
					onBlur={(e) => {
						// Don't clear hover when focus moves to another item within the group
						if (containerRef.current?.contains(e.relatedTarget as Node)) return;
						setFocusedIndex(null);
						setActiveIndex(null);
					}}
					onKeyDown={(e) => {
						// Scope to row wrappers only. The inner checkbox primitive also
						// carries role="checkbox", so a bare [role="checkbox"] selector
						// matches twice per row and arrows skip onto the hidden control.
						const items = Array.from(
							containerRef.current?.querySelectorAll("[data-proximity-index]") ?? []
						) as HTMLElement[];
						const currentIdx = items.indexOf(e.target as HTMLElement);
						if (currentIdx === -1) return;

						if (["ArrowDown", "ArrowUp"].includes(e.key)) {
							e.preventDefault();
							const next =
								e.key === "ArrowDown"
									? (currentIdx + 1) % items.length
									: (currentIdx - 1 + items.length) % items.length;
							items[next].focus();
						} else if (e.key === "Home") {
							e.preventDefault();
							items[0]?.focus();
						} else if (e.key === "End") {
							e.preventDefault();
							items[items.length - 1]?.focus();
						}
					}}
					role="group"
					className={cn("relative flex w-72 max-w-full flex-col select-none", className)}
					{...props}>
					{/* Selected backgrounds (merged for contiguous checked items).
              A run is normally one block; mid merge/split it is drawn as two
              abutting halves — see useMergeSplitBlocks. */}
					<SelectionBackgrounds blocks={blocks} />

					{/* Hover background */}
					<AnimatePresence>
						{activeRect && (
							<motion.div
								key={sessionRef.current}
								className={`absolute ${shape.bg} pointer-events-none bg-hover`}
								initial={{
									opacity: 0,
									top: activeRect.top,
									left: activeRect.left,
									width: activeRect.width,
									height: activeRect.height,
								}}
								animate={{
									opacity: 1,
									top: activeRect.top,
									left: activeRect.left,
									width: activeRect.width,
									height: activeRect.height,
								}}
								exit={{ opacity: 0, transition: spring.fast.exit }}
								transition={{
									...spring.fast,
									opacity: { duration: 0.08 },
								}}
							/>
						)}
					</AnimatePresence>

					{/* Focus ring */}
					<AnimatePresence>
						{focusRect && (
							<motion.div
								className={`absolute ${shape.focusRing} pointer-events-none z-20 border border-(--focus-ring)`}
								initial={false}
								animate={{
									left: focusRect.left - 2,
									top: focusRect.top - 2,
									width: focusRect.width + 4,
									height: focusRect.height + 4,
								}}
								exit={{ opacity: 0, transition: spring.fast.exit }}
								transition={{
									...spring.fast,
									opacity: { duration: 0.08 },
								}}
							/>
						)}
					</AnimatePresence>

					{children}
				</div>
			</CheckboxGroupContext.Provider>
		);
	}
);

CheckboxGroup.displayName = "CheckboxGroup";

interface CheckboxItemProps extends HTMLAttributes<HTMLDivElement> {
	label: string;
	index: number;
	checked: boolean;
	onToggle: () => void;
}

const CheckboxItem = forwardRef<HTMLDivElement, CheckboxItemProps>(
	({ label, index, checked, onToggle, className, ...props }, ref) => {
		const internalRef = useRef<HTMLDivElement>(null);
		const hasMounted = useRef(false);
		const { activeIndex } = useCheckboxGroup();

		useEffect(() => {
			hasMounted.current = true;
		}, []);

		const isActive = activeIndex === index;
		const skipAnimation = !hasMounted.current;
		const shape = useShape();

		return (
			<div
				ref={(node) => {
					(internalRef as React.RefObject<HTMLDivElement | null>).current = node;
					if (typeof ref === "function") ref(node);
					else if (ref) (ref as React.RefObject<HTMLDivElement | null>).current = node;
				}}
				data-proximity-index={index}
				data-checkbox-item
				tabIndex={0}
				role="checkbox"
				aria-checked={checked}
				aria-label={label}
				onClick={onToggle}
				onMouseDown={(e) => {
					// Clicking the 15px checkbox square would natively focus the hidden
					// primitive (nearest focusable ancestor of the click target), after
					// which arrow-key nav dead-zones: the group keydown handler can't
					// find the target among the row wrappers. Prevent the native focus
					// move (click still fires) and land focus on the row instead. Skip
					// genuinely interactive children so we don't hijack their focus.
					const interactive = (e.target as HTMLElement).closest(
						'button:not([tabindex="-1"]), a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
					);
					if (interactive && interactive !== e.currentTarget) return;
					e.preventDefault();
					e.currentTarget.focus();
				}}
				onKeyDown={(e) => {
					if (e.key === " " || e.key === "Enter") {
						e.preventDefault();
						onToggle();
					}
				}}
				className={cn(
					// Fixed height (was py-1.5 around a 19.5px line box ≈ 31.5px) so the
					// text-box trim on the label doesn't shrink the row.
					`relative z-10 flex h-8 items-center gap-2.5 ${shape.item} cursor-pointer px-3 outline-none`,
					className
				)}
				{...props}>
				{/* Checkbox — Base UI primitive for accessibility */}
				<CheckboxPrimitive.Root
					checked={checked}
					onCheckedChange={() => onToggle()}
					tabIndex={-1}
					aria-hidden
					className="relative h-[15px] w-[15px] shrink-0 cursor-pointer appearance-none border-0 bg-transparent p-0 outline-none"
					onClick={(e) => e.stopPropagation()}>
					{/* Border */}
					<div
						className={cn(
							"absolute inset-0 rounded-[5px] border-solid transition-all duration-80",
							checked
								? "border-[1.5px] border-transparent"
								: isActive
									? "border-[1.5px] border-border"
									: "border-[1.5px] border-border"
						)}
					/>
					{/* Check mark */}
					<AnimatePresence>
						{checked && (
							<CheckboxPrimitive.Indicator
								keepMounted
								render={(indicatorProps) => {
									const {
										style: _s,
										onDrag: _onDrag,
										onDragStart: _onDragStart,
										onDragEnd: _onDragEnd,
										onAnimationStart: _onAnimationStart,
										onAnimationEnd: _onAnimationEnd,
										onAnimationIteration: _onAnimationIteration,
										...rest
									} = indicatorProps as React.HTMLAttributes<SVGSVGElement>;
									return (
										<motion.svg
											{...rest}
											width={18}
											height={18}
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											strokeWidth={2}
											strokeLinecap="round"
											strokeLinejoin="round"
											className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-foreground"
											initial={{ opacity: 1 }}
											animate={{ opacity: 1 }}
											exit={{ opacity: 1 }}>
											<motion.path
												d="M6 12L10 16L18 8"
												initial={{ pathLength: skipAnimation ? 1 : 0 }}
												animate={{
													pathLength: 1,
													transition: { duration: 0.08, ease: "easeOut" },
												}}
												exit={{
													pathLength: 0,
													transition: { duration: 0.04, ease: "easeIn" },
												}}
											/>
										</motion.svg>
									);
								}}
							/>
						)}
					</AnimatePresence>
				</CheckboxPrimitive.Root>

				{/* Label */}
				{/* Both stacked spans carry the text-box trim so the invisible bold
            sizer and the visible label keep identical boxes. */}
				<span className="inline-grid text-[13px]">
					<span
						className="invisible col-start-1 row-start-1 [text-box:trim-both_cap_alphabetic]"
						style={{ fontVariationSettings: fontWeights.semibold }}
						aria-hidden="true">
						{label}
					</span>
					<span
						className={cn(
							"col-start-1 row-start-1 transition-[color,font-variation-settings] duration-80 [text-box:trim-both_cap_alphabetic]",
							checked || isActive ? "text-foreground" : "text-muted-foreground"
						)}
						style={{
							fontVariationSettings: checked ? fontWeights.semibold : fontWeights.normal,
						}}>
						{label}
					</span>
				</span>
			</div>
		);
	}
);

CheckboxItem.displayName = "CheckboxItem";

function EditableCheckboxItem({
	checked,
	children,
	onToggle,
	className,
	...props
}: EditableCheckboxItemProps) {
	const shape = useShape();

	return (
		<div
			aria-checked={checked}
			className={cn(
				`relative z-10 flex h-8 items-center gap-2.5 ${shape.item} cursor-pointer px-3 transition-colors duration-80 outline-none`,
				className
			)}
			data-checkbox-item
			tabIndex={0}
			onKeyDown={(event) => {
				if (event.key === " " || event.key === "Enter") {
					event.preventDefault();
					onToggle(!checked);
				}
			}}
			onClick={(event) => {
				if (!(event.target as HTMLElement).closest('[contenteditable="true"]')) onToggle(!checked);
			}}
			role="checkbox"
			{...props}>
			<CheckboxPrimitive.Root
				aria-hidden="true"
				checked={checked}
				onCheckedChange={onToggle}
				tabIndex={-1}
				className="relative grid size-[15px] shrink-0 place-items-center rounded-[5px] border-[1.5px] border-border bg-transparent p-0 text-foreground transition-colors duration-80 outline-none data-checked:border-transparent"
				onClick={(event) => event.stopPropagation()}>
				<AnimatePresence>
					{checked && (
						<CheckboxPrimitive.Indicator
							keepMounted
							render={(indicatorProps) => {
								const {
									style: _s,
									onDrag: _onDrag,
									onDragStart: _onDragStart,
									onDragEnd: _onDragEnd,
									onAnimationStart: _onAnimationStart,
									onAnimationEnd: _onAnimationEnd,
									onAnimationIteration: _onAnimationIteration,
									...rest
								} = indicatorProps as React.HTMLAttributes<SVGSVGElement>;
								return (
									<motion.svg
										{...rest}
										width={18}
										height={18}
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										strokeWidth={2}
										strokeLinecap="round"
										strokeLinejoin="round"
										className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-foreground"
										initial={{ opacity: 1 }}
										animate={{ opacity: 1 }}
										exit={{ opacity: 1 }}>
										<motion.path
											d="M6 12L10 16L18 8"
											initial={{ pathLength: 0 }}
											animate={{
												pathLength: 1,
												transition: { duration: 0.08, ease: "easeOut" },
											}}
											exit={{
												pathLength: 0,
												transition: { duration: 0.04, ease: "easeIn" },
											}}
										/>
									</motion.svg>
								);
							}}
						/>
					)}
				</AnimatePresence>
			</CheckboxPrimitive.Root>
			<div className="min-w-0 flex-1 text-[13px] leading-5 [text-box:trim-both_cap_alphabetic]">
				{children}
			</div>
		</div>
	);
}

function ReadonlyCheckboxItem({ checked, label, className, ...props }: ReadonlyCheckboxItemProps) {
	const shape = useShape();

	return (
		<div
			aria-checked={checked}
			aria-label={label}
			className={cn(`relative z-10 flex h-8 items-center gap-2.5 ${shape.item} px-3 outline-none`, className)}
			data-checkbox-item
			role="checkbox"
			{...props}>
			<AnimatedCheck checked={checked} />
			<span
				className={cn(
					"min-w-0 text-[13px] [text-box:trim-both_cap_alphabetic]",
					checked ? "font-medium text-foreground line-through opacity-60" : "text-foreground"
				)}>
				{label}
			</span>
		</div>
	);
}

function AnimatedCheck({ checked }: { checked: boolean }) {
	return (
		<span
			aria-hidden="true"
			className="relative grid size-[15px] shrink-0 place-items-center rounded-[5px] border-[1.5px] border-border text-foreground">
			<AnimatePresence>
				{checked && (
					<motion.svg
						width={18}
						height={18}
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth={2}
						strokeLinecap="round"
						strokeLinejoin="round"
						className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
						initial={{ opacity: 1 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 1 }}>
						<motion.path
							d="M6 12L10 16L18 8"
							initial={{ pathLength: 0 }}
							animate={{ pathLength: 1, transition: { duration: 0.08, ease: "easeOut" } }}
							exit={{ pathLength: 0, transition: { duration: 0.04, ease: "easeIn" } }}
						/>
					</motion.svg>
				)}
			</AnimatePresence>
		</span>
	);
}

export { CheckboxGroup, EditableCheckboxItem, ReadonlyCheckboxItem, CheckboxItem };

export default CheckboxGroup;
