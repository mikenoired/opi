import { afterEach, describe, expect, test } from "bun:test";

import { Window } from "happy-dom";

const browser = new Window({ url: "http://localhost" });
browser.matchMedia = ((query: string) => ({
	addEventListener() {},
	addListener() {},
	dispatchEvent: () => true,
	matches: query.includes("prefers-reduced-motion"),
	media: query,
	onchange: null,
	removeEventListener() {},
	removeListener() {},
})) as unknown as typeof browser.matchMedia;
Object.assign(globalThis, {
	cancelAnimationFrame: browser.cancelAnimationFrame.bind(browser),
	document: browser.document,
	Element: browser.Element,
	HTMLElement: browser.HTMLElement,
	MutationObserver: browser.MutationObserver,
	Node: browser.Node,
	navigator: browser.navigator,
	requestAnimationFrame: browser.requestAnimationFrame.bind(browser),
	window: browser,
});
globalThis.ResizeObserver = class ResizeObserver {
	constructor(private readonly callback: ResizeObserverCallback) {}
	disconnect() {}
	observe(target: Element) {
		const masonry = target.classList.contains("masonry-grid");
		const height = masonry
			? 0
			: Number((target.firstElementChild as HTMLElement | null)?.dataset.testHeight ?? 100);
		queueMicrotask(() =>
			this.callback(
				[
					{
						contentRect: { height, width: masonry ? 640 : 0 },
						target,
					} as ResizeObserverEntry,
				],
				this
			)
		);
	}
	unobserve() {}
};
globalThis.IntersectionObserver = class IntersectionObserver {
	root = null;
	rootMargin = "0px";
	thresholds = [];
	disconnect() {}
	observe() {}
	takeRecords() {
		return [];
	}
	unobserve() {}
} as unknown as typeof IntersectionObserver;

const { act, cleanup, fireEvent, render, screen, waitFor } = await import("@testing-library/react");
const { ContentGridSurface } = await import("./content-grid-surface");
const { ContentMasonry } = await import("./content-masonry");
const { I18nProvider } = await import("@monolyth/i18n");

afterEach(cleanup);

describe("content grid selection", () => {
	test("user accumulates a selection and clears it with Escape", async () => {
		renderGrid(<ContentGridSurface isLoading={false} items={items} />);
		const cards = screen.getAllByRole("option");

		fireEvent.click(cards[0]!, { ctrlKey: true });
		fireEvent.click(cards[1]!);

		expect(cards[0]!.getAttribute("aria-selected")).toBe("true");
		expect(cards[1]!.getAttribute("aria-selected")).toBe("true");
		expect(await screen.findByText("2 выбрано")).toBeTruthy();
		fireEvent.keyDown(document, { key: "Escape" });
		await waitFor(() => {
			expect(cards[0]!.getAttribute("aria-selected")).toBe("false");
			expect(cards[1]!.getAttribute("aria-selected")).toBe("false");
		});
	});

	test("context menu selection exposes mixed tags and preserves unrelated tags", async () => {
		let change: { add: string[]; ids: string[]; remove: string[] } | undefined;
		renderGrid(
			<ContentGridSurface
				isLoading={false}
				items={items}
				onUpdateTags={async (input) => {
					change = input;
				}}
			/>
		);
		const cards = screen.getAllByRole("option");
		fireEvent.contextMenu(cards[0]!, { clientX: 20, clientY: 20 });
		fireEvent.click(await screen.findByRole("menuitem", { name: "Выбрать" }));
		fireEvent.click(cards[1]!);
		fireEvent.click(await screen.findByRole("button", { name: "Теги" }));

		const mixed = await screen.findByRole("checkbox", { name: /first-only/ });
		expect(mixed.getAttribute("aria-checked")).toBe("mixed");
		fireEvent.click(mixed);
		fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));

		await waitFor(() =>
			expect(change).toEqual({
				add: ["first-only"],
				ids: ["first", "second"],
				remove: [],
			})
		);
	});

	test("user confirms one batch deletion for every selected item", async () => {
		let deleted: string[] = [];
		renderGrid(
			<ContentGridSurface
				isLoading={false}
				items={items}
				onDeleteMany={async (selected) => {
					deleted = selected.map((item) => item.id);
				}}
			/>
		);
		const cards = screen.getAllByRole("option");
		fireEvent.click(cards[0]!, { metaKey: true });
		fireEvent.click(cards[1]!);
		fireEvent.click(await screen.findByRole("button", { name: "Удалить" }));
		fireEvent.click(await screen.findByRole("button", { name: "Удалить 2" }));

		await waitFor(() => expect(deleted).toEqual(["first", "second"]));
	});

	test("selection toolbar stays below the search row instead of covering it", async () => {
		renderGrid(<ContentGridSurface isLoading={false} items={items} />);
		fireEvent.click(screen.getAllByRole("option")[0]!, { ctrlKey: true });

		const toolbar = await screen.findByRole("toolbar");
		expect(toolbar.parentElement?.classList.contains("sticky")).toBe(true);
		expect(toolbar.parentElement?.classList.contains("items-start")).toBe(true);
		expect(toolbar.classList.contains("fixed")).toBe(false);
	});

	test("touch user enters selection mode with a long press", async () => {
		renderGrid(<ContentGridSurface isLoading={false} items={items} />);
		const card = screen.getAllByRole("option")[0]!;

		await act(async () => {
			fireEvent.pointerDown(card, {
				clientX: 10,
				clientY: 10,
				pointerId: 1,
				pointerType: "touch",
			});
			await new Promise((resolve) => setTimeout(resolve, 475));
			fireEvent.pointerUp(card, {
				clientX: 10,
				clientY: 10,
				pointerId: 1,
				pointerType: "touch",
			});
		});

		expect(card.getAttribute("aria-selected")).toBe("true");
		expect(await screen.findByText("1 выбрано")).toBeTruthy();
	});
});

describe("content grid layout updates", () => {
	test("starts at the container edge without a second left gutter", async () => {
		const { container } = render(
			<ContentMasonry
				items={[{ id: "first", height: 100 }]}
				renderItem={(item) => <div data-test-height={item.height}>{item.id}</div>}
			/>
		);

		const first = container.querySelector<HTMLElement>("[data-masonry-item=first]")!;
		await waitFor(() => expect(translateX(first)).toBe(0));
	});

	test("reflows remaining cards after an item is removed", async () => {
		const renderMasonry = (layoutItems: Array<{ height: number; id: string }>) => (
			<ContentMasonry
				items={layoutItems}
				renderItem={(item) => <div data-test-height={item.height}>{item.id}</div>}
			/>
		);
		const { container, rerender } = render(
			renderMasonry([
				{ id: "first", height: 100 },
				{ id: "second", height: 220 },
				{ id: "third", height: 100 },
			])
		);
		const second = container.querySelector<HTMLElement>("[data-masonry-item=second]")!;
		await waitFor(() => expect(translateX(second)).toBeGreaterThan(0));

		rerender(
			renderMasonry([
				{ id: "second", height: 220 },
				{ id: "third", height: 100 },
			])
		);

		await waitFor(() => expect(translateX(second)).toBe(0));
	});
});

function translateX(element: HTMLElement) {
	const match = element.style.transform.match(/translateX\(([-\d.]+)px\)/);
	return match ? Number(match[1]) : 0;
}

function renderGrid(node: React.ReactNode) {
	return render(<I18nProvider language="ru">{node}</I18nProvider>);
}

const items = [content("first", ["common", "first-only"]), content("second", ["common", "second-only"])];

function content(id: string, tags: string[]) {
	return {
		content: `${id} body`,
		created_at: "2026-01-01T00:00:00.000Z",
		id,
		tag_ids: tags.map((tag) => `id-${tag}`),
		tags,
		title: id,
		type: "note" as const,
		updated_at: "2026-01-01T00:00:00.000Z",
		user_id: "user-1",
	};
}
