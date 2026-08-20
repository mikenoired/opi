import { normalizeTagTitle, uniqueTagTitles } from "@monolyth/core";
import { useI18n } from "@monolyth/i18n";
import type { Content } from "@monolyth/shared/schemas";
import { MAX_TAGS_PER_CONTENT } from "@monolyth/shared/schemas";
import { Button, InputField, useProximityHover } from "@monolyth/ui/components";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, Tags, Trash2, X } from "lucide-react";
import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
	type ReactNode,
} from "react";

import { BaseModal } from "./dialogs/base-modal";
import { ConfirmDialog } from "./dialogs/confirm-dialog";

export interface ContentTagBatchChange {
	add: string[];
	ids: string[];
	remove: string[];
}

interface ContentSelectionContextValue {
	clear(): void;
	isSelected(id: string): boolean;
	selectionMode: boolean;
	toggle(id: string, selected?: boolean): void;
}

const ContentSelectionContext = createContext<ContentSelectionContextValue | null>(null);

export function useContentSelection() {
	return useContext(ContentSelectionContext);
}

export function ContentSelectionLayer({
	children,
	items,
	onDeleteMany,
	onUpdateTags,
	selectionKey,
}: {
	children: ReactNode;
	items: Content[];
	onDeleteMany?(items: Content[]): Promise<void> | void;
	onUpdateTags?(input: ContentTagBatchChange): Promise<Content[] | void> | Content[] | void;
	selectionKey: string;
}) {
	const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
	const clear = useCallback(() => setSelectedIds(new Set()), []);
	const toggle = useCallback((id: string, selected?: boolean) => {
		setSelectedIds((current) => {
			const next = new Set(current);
			const shouldSelect = selected ?? !next.has(id);
			if (shouldSelect) next.add(id);
			else next.delete(id);
			return next;
		});
	}, []);
	useEffect(clear, [clear, selectionKey]);
	useEffect(() => {
		const available = new Set(items.map((item) => item.id));
		setSelectedIds((current) => {
			if ([...current].every((id) => available.has(id))) return current;
			return new Set([...current].filter((id) => available.has(id)));
		});
	}, [items]);
	useEffect(() => {
		if (!selectedIds.size) return;
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key !== "Escape") return;
			if (event.target instanceof HTMLElement && event.target.closest("[role=dialog]")) return;
			clear();
		};
		document.addEventListener("keydown", onKeyDown);
		return () => document.removeEventListener("keydown", onKeyDown);
	}, [clear, selectedIds.size]);
	const selectedItems = useMemo(() => items.filter((item) => selectedIds.has(item.id)), [items, selectedIds]);
	const context = useMemo<ContentSelectionContextValue>(
		() => ({
			clear,
			isSelected: (id) => selectedIds.has(id),
			selectionMode: selectedIds.size > 0,
			toggle,
		}),
		[clear, selectedIds, toggle]
	);
	return (
		<ContentSelectionContext.Provider value={context}>
			<ContentSelectionToolbar
				items={selectedItems}
				onClear={clear}
				onDeleteMany={onDeleteMany}
				onUpdateTags={onUpdateTags}
			/>
			{children}
		</ContentSelectionContext.Provider>
	);
}

function ContentSelectionToolbar({
	items,
	onClear,
	onDeleteMany,
	onUpdateTags,
}: {
	items: Content[];
	onClear(): void;
	onDeleteMany?(items: Content[]): Promise<void> | void;
	onUpdateTags?(input: ContentTagBatchChange): Promise<Content[] | void> | Content[] | void;
}) {
	const { t } = useI18n();
	const reducedMotion = useReducedMotion();
	const [deleteOpen, setDeleteOpen] = useState(false);
	const [tagsOpen, setTagsOpen] = useState(false);
	const [deleting, setDeleting] = useState(false);
	return (
		<>
			<AnimatePresence>
				{items.length > 0 && (
					<div className="pointer-events-none sticky top-16 z-80 flex h-0 items-start justify-center">
						<motion.div
							aria-label={t("library.selection.actionsAria")}
							className="pointer-events-auto rounded-full border border-foreground/10 bg-background/90 p-1.5 shadow-xl backdrop-blur-xl"
							initial={
								reducedMotion ? { opacity: 0 } : { filter: "blur(8px)", opacity: 0, scale: 0.94, y: -10 }
							}
							animate={reducedMotion ? { opacity: 1 } : { filter: "blur(0px)", opacity: 1, scale: 1, y: 0 }}
							exit={reducedMotion ? { opacity: 0 } : { filter: "blur(6px)", opacity: 0, scale: 0.96, y: -8 }}
							transition={{ duration: reducedMotion ? 0.08 : 0.2 }}
							role="toolbar">
							<ProximityActions>
								<span className="shrink-0 px-3 text-sm font-medium tabular-nums" aria-live="polite">
									{t("library.selection.selected", { count: items.length })}
								</span>
								<Button
									disabled={!onUpdateTags}
									leadingIcon={Tags}
									onClick={() => setTagsOpen(true)}
									variant="ghost">
									{t("library.selection.tags")}
								</Button>
								<Button
									className="text-destructive hover:text-destructive"
									disabled={!onDeleteMany}
									leadingIcon={Trash2}
									onClick={() => setDeleteOpen(true)}
									variant="ghost">
									{t("library.selection.delete")}
								</Button>
								<span aria-hidden className="mx-0.5 h-5 w-px bg-border" />
								<Button
									aria-label={t("library.selection.clear")}
									onClick={onClear}
									size="icon-sm"
									variant="ghost">
									<X />
								</Button>
							</ProximityActions>
						</motion.div>
					</div>
				)}
			</AnimatePresence>
			<TagBatchDialog items={items} onOpenChange={setTagsOpen} onSave={onUpdateTags} open={tagsOpen} />
			<ConfirmDialog
				confirmText={t("library.selection.deleteConfirm", {
					count: items.length,
				})}
				description={t("library.selection.deleteDescription")}
				icon={Trash2}
				loading={deleting}
				onConfirm={async () => {
					if (!onDeleteMany) return;
					setDeleting(true);
					try {
						await onDeleteMany(items);
						onClear();
					} finally {
						setDeleting(false);
					}
				}}
				onOpenChange={setDeleteOpen}
				open={deleteOpen}
				title={t("library.selection.deleteTitle", { count: items.length })}
			/>
		</>
	);
}

function ProximityActions({ children }: { children: ReactNode }) {
	const ref = useRef<HTMLDivElement>(null);
	const { activeIndex, handlers, itemRects, registerItem } = useProximityHover(ref, { axis: "x" });
	useEffect(() => {
		ref.current
			?.querySelectorAll<HTMLElement>("button")
			.forEach((button, index) => registerItem(index, button));
	}, [children, registerItem]);
	const rect = activeIndex === null ? undefined : itemRects[activeIndex];
	return (
		<div
			className="relative flex items-center gap-1"
			onMouseEnter={handlers.onMouseEnter}
			onMouseLeave={handlers.onMouseLeave}
			onMouseMove={handlers.onMouseMove}
			ref={ref}>
			<AnimatePresence>
				{rect && (
					<motion.span
						aria-hidden
						className="pointer-events-none absolute rounded-lg bg-accent/70"
						initial={{ left: rect.left, opacity: 0, width: rect.width }}
						animate={{
							height: rect.height,
							left: rect.left,
							opacity: 1,
							top: rect.top,
							width: rect.width,
						}}
						exit={{ opacity: 0 }}
						transition={{ bounce: 0, duration: 0.16, type: "spring" }}
					/>
				)}
			</AnimatePresence>
			{children}
		</div>
	);
}

type TagState = "all" | "mixed" | "none";

function TagBatchDialog({
	items,
	onOpenChange,
	onSave,
	open,
}: {
	items: Content[];
	onOpenChange(open: boolean): void;
	onSave?(input: ContentTagBatchChange): Promise<Content[] | void> | Content[] | void;
	open: boolean;
}) {
	const { t } = useI18n();
	const counts = useMemo(() => {
		const result = new Map<string, { count: number; title: string }>();
		for (const item of items)
			for (const title of item.tags) {
				const key = normalizeTagTitle(title);
				const current = result.get(key);
				result.set(key, {
					count: (current?.count ?? 0) + 1,
					title: current?.title ?? title,
				});
			}
		return result;
	}, [items]);
	const [overrides, setOverrides] = useState<Map<string, TagState>>(() => new Map());
	const [newTags, setNewTags] = useState<Map<string, string>>(() => new Map());
	const [newTag, setNewTag] = useState("");
	const [error, setError] = useState("");
	const [saving, setSaving] = useState(false);
	useEffect(() => {
		if (open) {
			setOverrides(new Map());
			setNewTags(new Map());
			setNewTag("");
			setError("");
		}
	}, [open]);
	const stateOf = (key: string): TagState =>
		overrides.get(key) ?? ((counts.get(key)?.count ?? 0) === items.length ? "all" : "mixed");
	const entries = uniqueTagTitles([
		...Array.from(counts.values(), (entry) => entry.title),
		...newTags.values(),
	]).sort((a, b) => a.localeCompare(b));
	const addNewTag = () => {
		const title = newTag.trim();
		if (!title) return;
		const key = normalizeTagTitle(title);
		if (!counts.has(key)) setNewTags((current) => new Map(current).set(key, title));
		setOverrides((current) => new Map(current).set(key, "all"));
		setNewTag("");
		setError("");
	};
	return (
		<BaseModal onOpenChange={onOpenChange} open={open} size="sm">
			<div className="space-y-5 p-6">
				<div>
					<h2 className="text-xl font-semibold">
						{t("library.selection.editTags", { count: items.length })}
					</h2>
					<p className="mt-1 text-sm text-muted-foreground">{t("library.selection.mixedHelp")}</p>
				</div>
				<div className="max-h-64 space-y-1 overflow-y-auto">
					{entries.map((title) => {
						const key = normalizeTagTitle(title);
						const state = stateOf(key);
						return (
							<button
								aria-checked={state === "mixed" ? "mixed" : state === "all"}
								className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-hover"
								key={key}
								onClick={() =>
									setOverrides((current) => new Map(current).set(key, state === "all" ? "none" : "all"))
								}
								role="checkbox"
								type="button">
								<span className="grid size-5 place-items-center rounded border border-border bg-background">
									{state === "all" ? <Check className="size-3.5" /> : state === "mixed" ? "−" : null}
								</span>
								<span>{title}</span>
								{state === "mixed" && (
									<span className="ml-auto text-xs text-muted-foreground">
										{t("library.selection.partial", {
											count: counts.get(key)?.count ?? 0,
											total: items.length,
										})}
									</span>
								)}
							</button>
						);
					})}
				</div>
				<div className="flex gap-2">
					<InputField
						className="min-w-0 flex-1"
						label={t("library.selection.newTag")}
						labelHidden
						onChange={setNewTag}
						onKeyDown={(event) => {
							if (event.key === "Enter") {
								event.preventDefault();
								addNewTag();
							}
						}}
						placeholder={t("library.selection.newTag")}
						value={newTag}
					/>
					<Button onClick={addNewTag} variant="tertiary">
						{t("library.selection.addTag")}
					</Button>
				</div>
				<div className="flex justify-end gap-2">
					<Button disabled={saving} onClick={() => onOpenChange(false)} variant="tertiary">
						{t("library.selection.cancel")}
					</Button>
					<Button
						loading={saving}
						onClick={async () => {
							if (!onSave) return;
							const add: string[] = [];
							const remove: string[] = [];
							for (const [key, target] of overrides) {
								const base = counts.get(key);
								if (target === "all" && (base?.count ?? 0) < items.length)
									add.push(base?.title ?? newTags.get(key) ?? key);
								if (target === "none" && (base?.count ?? 0) > 0) remove.push(base!.title);
							}
							if (!add.length && !remove.length) return onOpenChange(false);
							if (
								items.some(
									(item) =>
										uniqueTagTitles([
											...item.tags.filter(
												(tag) => !remove.map(normalizeTagTitle).includes(normalizeTagTitle(tag))
											),
											...add,
										]).length > MAX_TAGS_PER_CONTENT
								)
							) {
								setError(
									t("library.selection.tagLimit", {
										count: MAX_TAGS_PER_CONTENT,
									})
								);
								return;
							}
							setSaving(true);
							try {
								await onSave({
									add,
									ids: items.map((item) => item.id),
									remove,
								});
								onOpenChange(false);
							} finally {
								setSaving(false);
							}
						}}>
						{t("library.selection.save")}
					</Button>
				</div>
				{error && (
					<p className="text-sm text-destructive" role="alert">
						{error}
					</p>
				)}
			</div>
		</BaseModal>
	);
}
