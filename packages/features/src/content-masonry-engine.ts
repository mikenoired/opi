export const MASONRY_GAP = 16;
export const MIN_CARD_WIDTH = 180;

/** Tuning knobs for the shared Web and Electron column-zoom interaction. */
export const COLUMN_ZOOM_SETTINGS = {
	maximumColumns: { compact: 5, regular: 6 },
	minimumColumns: 1,
	pinchSensitivity: 3,
	settle: {
		maximumProjectedVelocity: 0.2,
		velocityProjection: 0.12,
	},
	wheel: {
		compressionPixels: 40,
		densityPerCompressedPixels: 180,
		idleMilliseconds: 160,
		linePixels: 16,
	},
} as const;

export const COLUMN_ZOOM_SETTLE_SPRING = {
	damping: 44,
	mass: 0.8,
	stiffness: 420,
	type: "spring",
} as const;

export interface ColumnZoomState {
	committedColumns: number;
	density: number;
	gestureTravel: number;
}

export interface ColumnTransition {
	direction: -1 | 0 | 1;
	from: number;
	progress: number;
	to: number;
}

export interface MasonryProjection {
	columnWidth: number;
	height: number;
	items: Array<{ width: number; x: number; y: number }>;
}

export function initialColumnCount(width: number, compact: boolean) {
	if (compact) {
		if (width >= 1920) return 5;
		if (width >= 1280) return 4;
		if (width >= 900) return 3;
		if (width >= 640) return 2;
		return 1;
	}
	if (width >= 2560) return 5;
	if (width >= 1920) return 4;
	if (width >= 1280) return 3;
	if (width >= 768) return 2;
	return 1;
}

export function maximumColumnCount(width: number, compact: boolean) {
	const physicalMaximum = Math.max(1, Math.floor((width + MASONRY_GAP) / (MIN_CARD_WIDTH + MASONRY_GAP)));
	return Math.min(
		compact ? COLUMN_ZOOM_SETTINGS.maximumColumns.compact : COLUMN_ZOOM_SETTINGS.maximumColumns.regular,
		physicalMaximum
	);
}

export function createColumnZoomState(columns: number): ColumnZoomState {
	return { committedColumns: columns, density: columns, gestureTravel: 0 };
}

export function advanceColumnZoom(
	state: ColumnZoomState,
	delta: number,
	minimum: number,
	maximum: number
): ColumnZoomState {
	const density = clamp(state.density + delta, minimum, maximum);
	let committedColumns = state.committedColumns;
	while (density >= committedColumns + 1 && committedColumns < maximum) committedColumns += 1;
	while (density <= committedColumns - 1 && committedColumns > minimum) committedColumns -= 1;
	return {
		committedColumns,
		density,
		gestureTravel: state.gestureTravel + delta,
	};
}

export function transitionFor(state: ColumnZoomState): ColumnTransition {
	const difference = state.density - state.committedColumns;
	if (Math.abs(difference) < 0.000_001)
		return {
			direction: 0,
			from: state.committedColumns,
			progress: 0,
			to: state.committedColumns,
		};
	const direction = difference > 0 ? 1 : -1;
	return {
		direction,
		from: state.committedColumns,
		progress: Math.abs(difference),
		to: state.committedColumns + direction,
	};
}

export function normalizeWheelDelta(deltaY: number, deltaMode: number, pageSize: number) {
	const pixels =
		deltaY * (deltaMode === 1 ? COLUMN_ZOOM_SETTINGS.wheel.linePixels : deltaMode === 2 ? pageSize : 1);
	const compressedPixels =
		Math.sign(pixels) *
		COLUMN_ZOOM_SETTINGS.wheel.compressionPixels *
		Math.log1p(Math.abs(pixels) / COLUMN_ZOOM_SETTINGS.wheel.compressionPixels);
	return compressedPixels / COLUMN_ZOOM_SETTINGS.wheel.densityPerCompressedPixels;
}

export function normalizePinchDelta(previousDistance: number, currentDistance: number) {
	if (previousDistance <= 0 || currentDistance <= 0) return 0;
	return -Math.log(currentDistance / previousDistance) * COLUMN_ZOOM_SETTINGS.pinchSensitivity;
}

export function settleColumnCount(density: number, velocity: number, minimum: number, maximum: number) {
	const projectedVelocity = clamp(
		velocity * COLUMN_ZOOM_SETTINGS.settle.velocityProjection,
		-COLUMN_ZOOM_SETTINGS.settle.maximumProjectedVelocity,
		COLUMN_ZOOM_SETTINGS.settle.maximumProjectedVelocity
	);
	return clamp(Math.round(density + projectedVelocity), minimum, maximum);
}

/** Whether this card moves to a different column in the active fractional transition. */
export function itemChangesColumn(index: number, density: number) {
	const lowerColumns = Math.max(1, Math.floor(density));
	const upperColumns = Math.max(lowerColumns, Math.ceil(density));
	return lowerColumns !== upperColumns && index % lowerColumns !== index % upperColumns;
}

export function projectMasonry(
	width: number,
	density: number,
	heights: readonly number[],
	gap = MASONRY_GAP,
	leadingInset = 0
): MasonryProjection {
	const lowerColumns = Math.max(1, Math.floor(density));
	const upperColumns = Math.max(lowerColumns, Math.ceil(density));
	const progress = density - lowerColumns;
	const availableWidth = Math.max(0, width - leadingInset);
	const lowerWidth = columnWidth(availableWidth, lowerColumns, gap);
	const upperWidth = columnWidth(availableWidth, upperColumns, gap);
	const itemWidth = interpolate(lowerWidth, upperWidth, progress);
	const lower = endpointLayout(lowerColumns, lowerWidth, heights, gap);
	const upper = endpointLayout(upperColumns, upperWidth, heights, gap);

	return {
		columnWidth: itemWidth,
		height: interpolate(lower.height, upper.height, progress),
		items: heights.map((_, index) => ({
			width: itemWidth,
			x: leadingInset + interpolate(lower.items[index]?.x ?? 0, upper.items[index]?.x ?? 0, progress),
			y: interpolate(lower.items[index]?.y ?? 0, upper.items[index]?.y ?? 0, progress),
		})),
	};
}

function endpointLayout(columns: number, width: number, heights: readonly number[], gap: number) {
	const columnHeights = Array.from({ length: columns }, () => 0);
	const items = heights.map((height, index) => {
		const column = index % columns;
		const point = { x: column * (width + gap), y: columnHeights[column] ?? 0 };
		columnHeights[column] = point.y + height + gap;
		return point;
	});
	return {
		height: Math.max(0, ...columnHeights.map((height) => Math.max(0, height - gap))),
		items,
	};
}

function columnWidth(width: number, columns: number, gap: number) {
	return Math.max(0, (width - gap * (columns - 1)) / columns);
}

function interpolate(from: number, to: number, progress: number) {
	return from + (to - from) * progress;
}

function clamp(value: number, minimum: number, maximum: number) {
	return Math.min(maximum, Math.max(minimum, value));
}
