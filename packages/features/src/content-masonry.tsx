import { Skeleton } from "@monolyth/ui/components";
import {
	animate,
	motion,
	motionValue,
	useMotionValue,
	useReducedMotion,
	type MotionValue,
} from "framer-motion";
import {
	memo,
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
	type PointerEvent as ReactPointerEvent,
	type ReactNode,
} from "react";

import {
	advanceColumnZoom,
	COLUMN_ZOOM_SETTINGS,
	COLUMN_ZOOM_SETTLE_SPRING,
	createColumnZoomState,
	initialColumnCount,
	itemChangesColumn,
	MASONRY_GAP,
	maximumColumnCount,
	normalizePinchDelta,
	normalizeWheelDelta,
	projectMasonry,
	settleColumnCount,
	transitionFor,
	type ColumnZoomState,
} from "./content-masonry-engine";

import "./content-masonry.css";

export interface ContentMasonryProps<T extends { id: string }> {
	compact?: boolean;
	isLoading?: boolean;
	items: T[];
	onItemHover?: () => void;
	renderItem: (item: T, index: number) => ReactNode;
	zoomable?: boolean;
}

interface ItemMotion {
	width: MotionValue<number>;
	x: MotionValue<number>;
	y: MotionValue<number>;
}

const MASONRY_REFLOW_TRANSITION = {
	duration: 0.28,
	ease: [0.22, 1, 0.36, 1],
} as const;

interface RenderedEntry<T> {
	id: string;
	item?: T;
	node: ReactNode;
}

interface TouchPoint {
	x: number;
	y: number;
}

interface ZoomAnchor {
	elementId: string;
	focalY: number;
	ratioY: number;
}

/** Native, gesture-driven masonry shared by the Web and Electron renderers. */
export const ContentMasonry = memo(function ContentMasonry<T extends { id: string }>({
	compact = false,
	isLoading = false,
	items,
	onItemHover,
	renderItem,
	zoomable,
}: ContentMasonryProps<T>) {
	const canZoom = zoomable ?? !compact;
	const reducedMotion = useReducedMotion();
	const rootRef = useRef<HTMLDivElement>(null);
	const itemElements = useRef(new Map<string, HTMLDivElement>());
	const itemHeights = useRef(new Map<string, number>());
	const itemMotions = useRef(new Map<string, ItemMotion>());
	const containerWidth = useRef(0);
	const maximumColumns = useRef(1);
	const zoomState = useRef<ColumnZoomState>(createColumnZoomState(1));
	const interacted = useRef(false);
	const activeGesture = useRef(false);
	const settleAnimation = useRef<{ stop(): void } | undefined>(undefined);
	const wheelIdleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
	const layoutFrame = useRef<number | undefined>(undefined);
	const animateNextLayout = useRef(false);
	const previousEntryIds = useRef<string[]>([]);
	const anchorFrame = useRef<number | undefined>(undefined);
	const anchor = useRef<ZoomAnchor | undefined>(undefined);
	const touches = useRef(new Map<number, TouchPoint>());
	const previousPinchDistance = useRef<number | undefined>(undefined);
	const density = useMotionValue(1);
	const masonryHeight = useMotionValue(0);
	const [ready, setReady] = useState(false);

	const entries = useMemo<RenderedEntry<T>[]>(
		() =>
			isLoading
				? Array.from({ length: compact ? 5 : 4 }, (_, index) => ({
						id: `masonry-skeleton-${index}`,
						node: <Skeleton className="h-40 w-full rounded-lg" />,
					}))
				: items.map((item, index) => ({ id: item.id, item, node: renderItem(item, index) })),
		[compact, isLoading, items, renderItem]
	);

	const motions = entries.map((entry) => {
		let values = itemMotions.current.get(entry.id);
		if (!values) {
			values = { width: motionValue(320), x: motionValue(0), y: motionValue(0) };
			itemMotions.current.set(entry.id, values);
		}
		return values;
	});

	const preserveAnchor = useCallback(() => {
		if (!anchor.current || anchorFrame.current !== undefined) return;
		anchorFrame.current = requestAnimationFrame(() => {
			anchorFrame.current = undefined;
			const currentAnchor = anchor.current;
			const root = rootRef.current;
			if (!currentAnchor || !root) return;
			const element = itemElements.current.get(currentAnchor.elementId);
			if (!element) return;
			const rectangle = element.getBoundingClientRect();
			const currentY = rectangle.top + rectangle.height * currentAnchor.ratioY;
			const scrollParent = findScrollParent(root);
			if (Math.abs(currentY - currentAnchor.focalY) > 0.5)
				scrollParent.scrollTop += currentY - currentAnchor.focalY;
		});
	}, []);

	const scheduleLayout = useCallback(() => {
		if (layoutFrame.current !== undefined) return;
		layoutFrame.current = requestAnimationFrame(() => {
			layoutFrame.current = undefined;
			const width = containerWidth.current;
			if (!width) return;
			const heights = entries.map((entry) => {
				const cached = itemHeights.current.get(entry.id);
				if (cached !== undefined) return cached;
				const measured = itemElements.current.get(entry.id)?.offsetHeight ?? 0;
				if (measured) itemHeights.current.set(entry.id, measured);
				return measured;
			});
			const currentDensity = density.get();
			const projection = projectMasonry(width, currentDensity, heights, MASONRY_GAP);
			const animateReflow = animateNextLayout.current && !reducedMotion;
			animateNextLayout.current = false;
			projection.items.forEach((layout, index) => {
				const values = motions[index];
				if (!values) return;
				if (animateReflow) {
					animate(values.width, layout.width, MASONRY_REFLOW_TRANSITION);
					animate(values.x, layout.x, MASONRY_REFLOW_TRANSITION);
					animate(values.y, layout.y, MASONRY_REFLOW_TRANSITION);
				} else {
					values.width.set(layout.width);
					values.x.set(layout.x);
					values.y.set(layout.y);
				}
				const element = itemElements.current.get(entries[index]?.id ?? "");
				element?.toggleAttribute("data-column-changing", itemChangesColumn(index, currentDensity));
			});
			if (animateReflow) animate(masonryHeight, projection.height, MASONRY_REFLOW_TRANSITION);
			else masonryHeight.set(projection.height);
			const root = rootRef.current;
			if (root) {
				const transition = transitionFor(zoomState.current);
				root.dataset.columns = String(zoomState.current.committedColumns);
				root.dataset.transitionDirection = String(transition.direction);
				root.dataset.transitionProgress = String(transition.progress);
			}
			if (!ready && (entries.length === 0 || heights.every((height) => height > 0))) setReady(true);
			preserveAnchor();
		});
	}, [density, entries, masonryHeight, motions, preserveAnchor, ready, reducedMotion]);

	const updateAnchor = useCallback((x: number, y: number) => {
		const root = rootRef.current;
		if (!root) return;
		let element = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-masonry-item]");
		if (!element || !root.contains(element)) {
			element = [...itemElements.current.values()].find((candidate) => {
				const rectangle = candidate.getBoundingClientRect();
				return rectangle.bottom >= y && rectangle.top <= y;
			});
		}
		if (!element) return;
		const rectangle = element.getBoundingClientRect();
		anchor.current = {
			elementId: element.dataset.masonryItem ?? "",
			focalY: y,
			ratioY: rectangle.height ? (y - rectangle.top) / rectangle.height : 0,
		};
	}, []);

	const beginGesture = useCallback(
		(x: number, y: number) => {
			settleAnimation.current?.stop();
			settleAnimation.current = undefined;
			activeGesture.current = true;
			interacted.current = true;
			zoomState.current = { ...zoomState.current, gestureTravel: 0 };
			updateAnchor(x, y);
		},
		[updateAnchor]
	);

	const applyGestureDelta = useCallback(
		(delta: number, x: number, y: number) => {
			if (!delta) return;
			updateAnchor(x, y);
			const next = advanceColumnZoom(
				zoomState.current,
				delta,
				COLUMN_ZOOM_SETTINGS.minimumColumns,
				maximumColumns.current
			);
			zoomState.current = next;
			density.set(next.density);
		},
		[density, updateAnchor]
	);

	const finishGesture = useCallback(() => {
		if (!activeGesture.current) return;
		activeGesture.current = false;
		const target = settleColumnCount(
			density.get(),
			density.getVelocity(),
			COLUMN_ZOOM_SETTINGS.minimumColumns,
			maximumColumns.current
		);
		if (reducedMotion) {
			density.jump(target);
			zoomState.current = createColumnZoomState(target);
			scheduleLayout();
			anchor.current = undefined;
			return;
		}
		const controls = animate(density, target, COLUMN_ZOOM_SETTLE_SPRING);
		settleAnimation.current = controls;
		void controls.then(() => {
			if (settleAnimation.current !== controls) return;
			zoomState.current = createColumnZoomState(target);
			settleAnimation.current = undefined;
			anchor.current = undefined;
			scheduleLayout();
		});
	}, [density, reducedMotion, scheduleLayout]);

	useLayoutEffect(() => {
		const root = rootRef.current;
		if (!root) return;
		const updateWidth = (width: number) => {
			if (!width) return;
			if (Math.abs(width - containerWidth.current) < 0.5) return;
			containerWidth.current = width;
			maximumColumns.current = maximumColumnCount(width, compact);
			const desired = Math.min(initialColumnCount(window.innerWidth, compact), maximumColumns.current);
			const nextDensity = interacted.current
				? Math.min(maximumColumns.current, Math.max(COLUMN_ZOOM_SETTINGS.minimumColumns, density.get()))
				: desired;
			if (nextDensity !== density.get()) density.jump(nextDensity);
			zoomState.current = createColumnZoomState(nextDensity);
			scheduleLayout();
		};
		updateWidth(root.clientWidth);
		const observer = new ResizeObserver(([entry]) =>
			updateWidth(entry?.contentRect.width ?? root.clientWidth)
		);
		observer.observe(root);
		return () => observer.disconnect();
	}, [compact, density, scheduleLayout]);

	useLayoutEffect(() => {
		const nextIds = entries.map((entry) => entry.id);
		const previousIds = previousEntryIds.current;
		const changed =
			nextIds.length !== previousIds.length || nextIds.some((id, index) => id !== previousIds[index]);
		if (!changed) return;
		animateNextLayout.current = previousIds.some((id) => !nextIds.includes(id));
		previousEntryIds.current = nextIds;
		if (layoutFrame.current !== undefined) {
			cancelAnimationFrame(layoutFrame.current);
			layoutFrame.current = undefined;
		}
		scheduleLayout();
	}, [entries, scheduleLayout]);

	useLayoutEffect(() => {
		const observer = new ResizeObserver((observations) => {
			let hasChangedHeight = false;
			for (const observation of observations) {
				const element = observation.target as HTMLDivElement;
				const id = element.dataset.masonryItem ?? "";
				const height = observation.contentRect.height;
				if (Math.abs((itemHeights.current.get(id) ?? 0) - height) < 0.5) continue;
				itemHeights.current.set(id, height);
				hasChangedHeight = true;
			}
			if (hasChangedHeight) scheduleLayout();
		});
		for (const element of itemElements.current.values()) observer.observe(element);
		return () => observer.disconnect();
	}, [entries, scheduleLayout]);

	useEffect(() => {
		let previousDensity = density.get();
		return density.on("change", (nextDensity) => {
			if (Math.abs(nextDensity - zoomState.current.density) > 0.000_001) {
				const gestureTravel = zoomState.current.gestureTravel;
				zoomState.current = advanceColumnZoom(
					zoomState.current,
					nextDensity - previousDensity,
					COLUMN_ZOOM_SETTINGS.minimumColumns,
					maximumColumns.current
				);
				zoomState.current.gestureTravel = gestureTravel;
			}
			previousDensity = nextDensity;
			scheduleLayout();
		});
	}, [density, scheduleLayout]);

	useEffect(() => {
		const root = rootRef.current;
		if (!root || !canZoom) return;
		const onWheel = (event: WheelEvent) => {
			if (!event.ctrlKey) return;
			if (event.cancelable) event.preventDefault();
			if (!activeGesture.current) beginGesture(event.clientX, event.clientY);
			applyGestureDelta(
				normalizeWheelDelta(event.deltaY, event.deltaMode, root.clientHeight || window.innerHeight),
				event.clientX,
				event.clientY
			);
			if (wheelIdleTimer.current) clearTimeout(wheelIdleTimer.current);
			wheelIdleTimer.current = setTimeout(finishGesture, COLUMN_ZOOM_SETTINGS.wheel.idleMilliseconds);
		};
		root.addEventListener("wheel", onWheel, { passive: false });
		return () => {
			root.removeEventListener("wheel", onWheel);
			if (wheelIdleTimer.current) clearTimeout(wheelIdleTimer.current);
		};
	}, [applyGestureDelta, beginGesture, canZoom, finishGesture]);

	useEffect(
		() => () => {
			settleAnimation.current?.stop();
			if (layoutFrame.current !== undefined) cancelAnimationFrame(layoutFrame.current);
			if (anchorFrame.current !== undefined) cancelAnimationFrame(anchorFrame.current);
		},
		[]
	);

	const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
		if (!canZoom || event.pointerType !== "touch") return;
		touches.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
		if (touches.current.size !== 2) return;
		for (const pointerId of touches.current.keys()) event.currentTarget.setPointerCapture(pointerId);
		const [first, second] = [...touches.current.values()];
		if (!first || !second) return;
		previousPinchDistance.current = distance(first, second);
		const center = midpoint(first, second);
		beginGesture(center.x, center.y);
	};

	const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
		if (!touches.current.has(event.pointerId)) return;
		touches.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
		if (touches.current.size !== 2 || previousPinchDistance.current === undefined) return;
		if (event.cancelable) event.preventDefault();
		const [first, second] = [...touches.current.values()];
		if (!first || !second) return;
		const currentDistance = distance(first, second);
		const center = midpoint(first, second);
		applyGestureDelta(
			normalizePinchDelta(previousPinchDistance.current, currentDistance),
			center.x,
			center.y
		);
		previousPinchDistance.current = currentDistance;
	};

	const endPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
		touches.current.delete(event.pointerId);
		if (touches.current.size >= 2) return;
		previousPinchDistance.current = undefined;
		finishGesture();
	};

	useEffect(() => {
		const activeIds = new Set(entries.map((entry) => entry.id));
		for (const id of itemMotions.current.keys()) if (!activeIds.has(id)) itemMotions.current.delete(id);
		for (const id of itemHeights.current.keys()) if (!activeIds.has(id)) itemHeights.current.delete(id);
	}, [entries]);

	return (
		<motion.div
			className="masonry-grid"
			data-zoomable={canZoom || undefined}
			onPointerCancel={endPointer}
			onPointerDown={onPointerDown}
			onPointerMove={onPointerMove}
			onPointerUp={endPointer}
			ref={rootRef}
			style={{ height: masonryHeight, opacity: ready ? 1 : 0 }}>
			{entries.map((entry, index) => (
				<motion.div
					className="masonry-grid_item rounded-xl shadow"
					data-masonry-item={entry.id}
					key={entry.id}
					onMouseEnter={entry.item ? onItemHover : undefined}
					ref={(element) => {
						if (element) itemElements.current.set(entry.id, element);
						else itemElements.current.delete(entry.id);
					}}
					style={{ width: motions[index]?.width, x: motions[index]?.x, y: motions[index]?.y }}>
					{entry.node}
				</motion.div>
			))}
		</motion.div>
	);
}) as <T extends { id: string }>(props: ContentMasonryProps<T>) => ReactNode;

function distance(first: TouchPoint, second: TouchPoint) {
	return Math.hypot(second.x - first.x, second.y - first.y);
}

function midpoint(first: TouchPoint, second: TouchPoint) {
	return { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
}

function findScrollParent(element: HTMLElement) {
	let parent = element.parentElement;
	while (parent) {
		const overflow = getComputedStyle(parent).overflowY;
		if ((overflow === "auto" || overflow === "scroll") && parent.scrollHeight > parent.clientHeight)
			return parent;
		parent = parent.parentElement;
	}
	return document.scrollingElement as HTMLElement;
}
