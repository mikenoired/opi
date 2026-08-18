/// <reference types="bun" />

import { describe, expect, test } from "bun:test";

import {
	advanceColumnZoom,
	createColumnZoomState,
	initialColumnCount,
	itemChangesColumn,
	maximumColumnCount,
	normalizePinchDelta,
	normalizeWheelDelta,
	projectMasonry,
	settleColumnCount,
	transitionFor,
} from "./content-masonry-engine";

describe("column zoom state", () => {
	test("accumulates partial progress without committing a column", () => {
		const state = advanceColumnZoom(createColumnZoomState(4), 0.2, 1, 6);
		expect(state).toEqual({ committedColumns: 4, density: 4.2, gestureTravel: 0.2 });
		const transition = transitionFor(state);
		expect(transition).toMatchObject({ direction: 1, from: 4, to: 5 });
		expect(transition.progress).toBeCloseTo(0.2);
	});

	test("carries overshoot into the next transition", () => {
		const state = advanceColumnZoom(createColumnZoomState(4), 1.35, 1, 6);
		expect(state.committedColumns).toBe(5);
		expect(state.density).toBe(5.35);
		const transition = transitionFor(state);
		expect(transition).toMatchObject({ direction: 1, from: 5, to: 6 });
		expect(transition.progress).toBeCloseTo(0.35);
	});

	test("reverses symmetrically", () => {
		const state = advanceColumnZoom(createColumnZoomState(5), -0.7, 1, 6);
		const transition = transitionFor(state);
		expect(transition).toMatchObject({ direction: -1, from: 5, to: 4 });
		expect(transition.progress).toBeCloseTo(0.7);
		const reversed = advanceColumnZoom(state, 0.4, 1, 6);
		expect(transitionFor(reversed).progress).toBeCloseTo(0.3);
	});

	test("keeps physical travel separate from clamped visual density", () => {
		const state = advanceColumnZoom(createColumnZoomState(6), 0.4, 1, 6);
		expect(state.density).toBe(6);
		expect(state.gestureTravel).toBe(0.4);
	});
});

describe("gesture normalization", () => {
	test("normalizes wheel units and preserves direction", () => {
		expect(normalizeWheelDelta(3, 1, 800)).toBeGreaterThan(0);
		expect(normalizeWheelDelta(-3, 1, 800)).toBeLessThan(0);
		expect(normalizeWheelDelta(1, 2, 800)).toBeGreaterThan(normalizeWheelDelta(1, 1, 800));
	});

	test("maps an outward pinch to fewer columns", () => {
		expect(normalizePinchDelta(100, 120)).toBeLessThan(0);
		expect(normalizePinchDelta(120, 100)).toBeGreaterThan(0);
	});

	test("uses velocity when choosing the settle target", () => {
		expect(settleColumnCount(4.4, 0, 1, 6)).toBe(4);
		expect(settleColumnCount(4.4, 2, 1, 6)).toBe(5);
		expect(settleColumnCount(4.6, -2, 1, 6)).toBe(4);
		expect(settleColumnCount(4.2, 100, 1, 6)).toBe(4);
	});
});

describe("native masonry projection", () => {
	test("marks only cards that change their column", () => {
		expect(itemChangesColumn(0, 4.5)).toBe(false);
		expect(itemChangesColumn(3, 4.5)).toBe(false);
		expect(itemChangesColumn(4, 4.5)).toBe(true);
		expect(itemChangesColumn(8, 4.5)).toBe(true);
		expect(itemChangesColumn(4, 5)).toBe(false);
	});

	test("preserves the existing responsive defaults", () => {
		expect(initialColumnCount(600, false)).toBe(1);
		expect(initialColumnCount(1024, false)).toBe(2);
		expect(initialColumnCount(1400, false)).toBe(3);
		expect(initialColumnCount(2000, false)).toBe(4);
		expect(initialColumnCount(2600, false)).toBe(5);
	});

	test("limits density when cards would become unusably narrow", () => {
		expect(maximumColumnCount(375, false)).toBe(1);
		expect(maximumColumnCount(1200, false)).toBe(6);
	});

	test("interpolates item geometry between adjacent layouts", () => {
		const four = projectMasonry(1000, 4, [100, 100, 100, 100, 100]);
		const halfway = projectMasonry(1000, 4.5, [100, 100, 100, 100, 100]);
		const five = projectMasonry(1000, 5, [100, 100, 100, 100, 100]);

		expect(halfway.columnWidth).toBeCloseTo((four.columnWidth + five.columnWidth) / 2);
		expect(halfway.items[4]?.x).toBeCloseTo((four.items[4]!.x + five.items[4]!.x) / 2);
		expect(halfway.items[4]?.y).toBeCloseTo(58);
		expect(halfway.height).toBeCloseTo(158);
	});

	test("uses the left gutter without leaving a right gutter", () => {
		const projection = projectMasonry(1000, 4, [100, 100, 100, 100], 16, 16);
		expect(projection.items[0]?.x).toBe(16);
		const last = projection.items[3];
		expect((last?.x ?? 0) + (last?.width ?? 0)).toBe(1000);
	});

	test("does not introduce a geometry step at a column boundary", () => {
		const heights = [180, 260, 140, 220, 320, 160, 280, 200];
		const before = projectMasonry(1200, 4.999_999, heights);
		const atBoundary = projectMasonry(1200, 5, heights);
		const after = projectMasonry(1200, 5.000_001, heights);

		for (const index of heights.keys()) {
			expect(before.items[index]?.x).toBeCloseTo(atBoundary.items[index]?.x ?? 0, 2);
			expect(after.items[index]?.x).toBeCloseTo(atBoundary.items[index]?.x ?? 0, 2);
			expect(before.items[index]?.y).toBeCloseTo(atBoundary.items[index]?.y ?? 0, 2);
			expect(after.items[index]?.y).toBeCloseTo(atBoundary.items[index]?.y ?? 0, 2);
		}
	});
});
