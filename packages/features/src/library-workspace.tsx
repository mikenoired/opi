import type { Content, CreateContent } from "@synapse/shared/schemas";
import { Button } from "@synapse/ui/components";
import { X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { ConfiguredAppSidebar, DashboardSurface } from "./app-shell";
import type { ContentCardStrings } from "./content-card";
import { ContentCreateDialog } from "./content-create-dialog";
import { ContentEditDialog } from "./content-edit-dialog";
import { ContentFilterBar } from "./content-filter-bar";
import { ContentGridSurface } from "./content-grid-surface";
import { ContentViewer } from "./content-viewer";
import { ConfirmDialog } from "./dialogs/confirm-dialog";
import { inferContentTypeFromFiles, normalizeDroppedFiles } from "./file-import";
import { GraphSurface } from "./graph-surface";
import { useAppServices } from "./runtime";
import type { NavigationItemConfig } from "./runtime/config";
import { TagEditor } from "./tag-editor";

export interface LibraryWorkspaceStrings extends ContentCardStrings {
	add: string;
	clearFilters: string;
	cancel: string;
	content: string;
	deleteConfirm: string;
	discardChanges: string;
	emptyDescription: string;
	emptyTitle: string;
	graph: string;
	graphEmpty: string;
	linkUrl: string;
	notFoundDescription: string;
	notFoundTitle: string;
	save: string;
	searchAria: string;
	searchPlaceholder: string;
	settings: string;
	tags: string;
	tagsEmpty: string;
	title: string;
	type: string;
	unsavedDescription: string;
	unsavedTitle: string;
	types: Partial<Record<Content["type"], string>>;
	viewerClose: string;
	viewerCreated: (date: string) => string;
	viewerDeleteDescription: string;
	viewerDeleteTitle: string;
	viewerDetails: string;
	viewerDownload: string;
	viewerEmptyTasks: string;
	viewerNext: string;
	viewerPrevious: string;
	viewerRecommendationsAria: string;
	viewerRecommendationsEyebrow: string;
	viewerRecommendationsLoadingMore: string;
	viewerRecommendationsTitle: string;
	viewerSuggestTags: string;
	viewerUpdated: (date: string) => string;
}

export interface LibraryWorkspaceProps {
	activePage: "dashboard" | "graph" | "tags";
	command?: "content.add";
	isLoading?: boolean;
	items: Content[];
	navigation?: NavigationItemConfig[];
	onDelete(item: Content): Promise<void> | void;
	onContentCreated?(): void;
	onOpenSettings(): void;
	onSave(input: CreateContent & { id?: string }): Promise<void>;
	onSelectPage(page: "dashboard" | "graph" | "tags"): void;
	strings: LibraryWorkspaceStrings;
}

/** Shared workspace assembly used unchanged by Web and Electron. */
export function LibraryWorkspace({
	activePage,
	command,
	isLoading = false,
	items,
	navigation,
	onDelete,
	onContentCreated,
	onOpenSettings,
	onSave,
	onSelectPage,
	strings,
}: LibraryWorkspaceProps) {
	const [search, setSearch] = useState("");
	const [types, setTypes] = useState<Content["type"][]>([]);
	const [creating, setCreating] = useState(false);
	const [preloadedFiles, setPreloadedFiles] = useState<File[]>([]);
	const [dragActive, setDragActive] = useState(false);
	const dragDepth = useRef(0);
	const [editing, setEditing] = useState<Content | null>(null);
	const [viewing, setViewing] = useState<Content | null>(null);
	const visibleItems = useMemo(
		() =>
			items.filter(
				(item) =>
					(!search ||
						[item.title, item.content, item.tags.join(" ")]
							.join(" ")
							.toLocaleLowerCase()
							.includes(search.toLocaleLowerCase())) &&
					(types.length === 0 || types.includes(item.type))
			),
		[items, search, types]
	);
	const availableTypes = useMemo(() => Array.from(new Set(items.map((item) => item.type))), [items]);
	const labels = {
		add: navigation?.find((item) => item.id === "add")?.label ?? strings.add,
		dashboard: navigation?.find((item) => item.id === "dashboard")?.label ?? strings.title,
		graph: navigation?.find((item) => item.id === "graph")?.label ?? strings.graph,
		settings: navigation?.find((item) => item.id === "settings")?.label ?? strings.settings,
		tags: navigation?.find((item) => item.id === "tags")?.label ?? strings.tags,
	};
	const viewerSuggestions = useMemo(() => {
		if (!viewing) return [];
		return viewing.tags.flatMap((tag, tagIndex) => {
			const related = items.filter(
				(candidate) => candidate.id !== viewing.id && candidate.tags.includes(tag)
			);
			return related.length
				? [
						{
							items: related.slice(0, 12),
							tag: {
								color: 0,
								id: viewing.tag_ids[tagIndex] ?? tag,
								itemCount: related.length,
								title: tag,
							},
						},
					]
				: [];
		});
	}, [items, viewing]);
	useEffect(() => {
		const isFileDrag = (event: DragEvent) => event.dataTransfer?.types.includes("Files");
		const onDragEnter = (event: DragEvent) => {
			if (!isFileDrag(event)) return;
			event.preventDefault();
			dragDepth.current += 1;
			setDragActive(true);
		};
		const onDragLeave = (event: DragEvent) => {
			if (!isFileDrag(event)) return;
			event.preventDefault();
			dragDepth.current = Math.max(0, dragDepth.current - 1);
			if (!dragDepth.current) setDragActive(false);
		};
		const onDragOver = (event: DragEvent) => {
			if (isFileDrag(event)) event.preventDefault();
		};
		const onDrop = (event: DragEvent) => {
			if (!isFileDrag(event)) return;
			event.preventDefault();
			dragDepth.current = 0;
			setDragActive(false);
			const { files } = normalizeDroppedFiles(Array.from(event.dataTransfer?.files ?? []));
			if (!files.length) return;
			setPreloadedFiles(files);
			setCreating(true);
		};
		const onPaste = (event: ClipboardEvent) => {
			const target = event.target;
			if (target instanceof HTMLElement && target.closest("input, textarea, [contenteditable='true']"))
				return;
			const { files } = normalizeDroppedFiles(Array.from(event.clipboardData?.files ?? []));
			if (!files.length) return;
			event.preventDefault();
			setPreloadedFiles(files);
			setCreating(true);
		};
		window.addEventListener("dragenter", onDragEnter);
		window.addEventListener("dragleave", onDragLeave);
		window.addEventListener("dragover", onDragOver);
		window.addEventListener("drop", onDrop);
		window.addEventListener("paste", onPaste);
		return () => {
			window.removeEventListener("dragenter", onDragEnter);
			window.removeEventListener("dragleave", onDragLeave);
			window.removeEventListener("dragover", onDragOver);
			window.removeEventListener("drop", onDrop);
			window.removeEventListener("paste", onPaste);
		};
	}, []);
	useEffect(() => {
		if (command === "content.add") setCreating(true);
	}, [command]);
	return (
		<div className="flex h-screen min-h-0 w-full overflow-hidden bg-background dark:bg-muted">
			<ConfiguredAppSidebar
				activeId={activePage}
				activeRoute={activePage}
				capabilities={{ enabled: [] }}
				items={navigation ?? []}
				labels={labels}
				onCommand={(command) => {
					if (command === "content.add") setCreating(true);
					if (command === "settings.open") onOpenSettings();
				}}
				onNavigate={(route) => {
					if (route === "dashboard" || route === "graph" || route === "tags") onSelectPage(route);
				}}
			/>
			<DashboardSurface>
				{activePage === "dashboard" ? (
					<main className="relative flex h-full min-w-0 flex-col overflow-y-auto">
						<ContentFilterBar
							availableTypes={availableTypes}
							searchQuery={search}
							selectedContentTypes={types}
							setSearchQuery={setSearch}
							onClearContentTypes={() => setTypes([])}
							onToggleContentType={(type) =>
								setTypes((current) =>
									current.includes(type) ? current.filter((value) => value !== type) : [...current, type]
								)
							}
							labels={{
								aria: strings.searchAria,
								clear: strings.cancel,
								placeholder: strings.searchPlaceholder,
								types: strings.types,
							}}
						/>
						<div className="p-4">
							<ContentGridSurface
								isLoading={isLoading}
								items={visibleItems}
								onAddContent={() => setCreating(true)}
								onClearFilters={() => {
									setSearch("");
									setTypes([]);
								}}
								onDelete={(item) => void onDelete(item)}
								onEdit={setEditing}
								onOpen={setViewing}
								searchQuery={search}
								selectedContentTypes={types}
								strings={{
									...strings,
									addContent: strings.add,
									clearFilters: strings.clearFilters,
									notFoundDescription: strings.notFoundDescription,
									notFoundTitle: strings.notFoundTitle,
								}}
							/>
						</div>
					</main>
				) : activePage === "tags" ? (
					<TagDirectory
						items={items}
						strings={strings}
						onSelect={(tag) => {
							setSearch(tag);
							onSelectPage("dashboard");
						}}
					/>
				) : (
					<LibraryGraphView
						items={items}
						onOpenContent={setViewing}
						onOpenTag={(tag) => {
							setSearch(tag);
							onSelectPage("dashboard");
						}}
						strings={strings}
					/>
				)}
			</DashboardSurface>
			{creating && (
				<ContentCreateDialog
					initialTags={[]}
					onContentAdded={() => onContentCreated?.()}
					onOpenChange={(open) => {
						setCreating(open);
						if (!open) setPreloadedFiles([]);
					}}
					open
					options={createOptions(strings)}
					preloadedFiles={preloadedFiles}
					suggestedType={inferContentTypeFromFiles(preloadedFiles)}
				/>
			)}
			{editing && (
				<ContentEditorDialog
					item={editing}
					strings={strings}
					onClose={() => setEditing(null)}
					onSave={async (input) => {
						await onSave(input);
						setEditing(null);
					}}
				/>
			)}
			{viewing && (
				<ContentViewer
					item={viewing}
					items={visibleItems}
					onDelete={onDelete}
					onEdit={(next) => {
						setViewing(null);
						setEditing(next);
					}}
					onOpenChange={(open) => {
						if (!open) setViewing(null);
					}}
					onSelect={setViewing}
					onUpdate={async (input) => {
						await onSave({
							content: input.content ?? viewing.content,
							document_images: input.document_images ?? viewing.document_images,
							id: viewing.id,
							media_type: input.media_type ?? viewing.media_type ?? "image",
							media_url: input.media_url ?? viewing.media_url,
							tags: input.tags ?? viewing.tags,
							thumbnail_base64: input.thumbnail_base64 ?? viewing.thumbnail_base64,
							thumbnail_url: input.thumbnail_url ?? viewing.thumbnail_url,
							title: input.title ?? viewing.title,
							type: input.type ?? viewing.type,
							url: input.url ?? viewing.url,
						});
						setViewing((current) => (current ? { ...current, ...input } : current));
					}}
					open
					suggestionGroups={viewerSuggestions}
					suggestionStrings={{
						ariaLabel: strings.viewerRecommendationsAria,
						delete: strings.delete,
						done: strings.done,
						edit: strings.edit,
						emptyNote: strings.emptyNote,
						eyebrow: strings.viewerRecommendationsEyebrow,
						loadingMore: strings.viewerRecommendationsLoadingMore,
						open: strings.open,
						title: strings.viewerRecommendationsTitle,
						untitled: strings.untitled,
					}}
					strings={{
						addTag: strings.tags,
						cancel: strings.cancel,
						close: strings.viewerClose,
						created: strings.viewerCreated,
						delete: strings.delete,
						deleteDescription: strings.viewerDeleteDescription,
						deleteTitle: strings.viewerDeleteTitle,
						details: strings.viewerDetails,
						download: strings.viewerDownload,
						edit: strings.edit,
						emptyTasks: strings.viewerEmptyTasks,
						next: strings.viewerNext,
						previous: strings.viewerPrevious,
						suggestTags: strings.viewerSuggestTags,
						tags: strings.tags,
						types: strings.types,
						untitled: strings.untitled,
						updated: strings.viewerUpdated,
					}}
				/>
			)}
			{dragActive && (
				<div className="pointer-events-none fixed inset-0 z-100 grid place-items-center bg-black/60 backdrop-blur-sm">
					<div className="rounded-xl border-2 border-primary bg-background px-8 py-6 text-center text-lg font-semibold">
						{strings.add}
					</div>
				</div>
			)}
		</div>
	);
}

function createOptions(strings: LibraryWorkspaceStrings) {
	return [
		{
			description: strings.types.note ?? "",
			icon: "note" as const,
			key: "note" as const,
			label: strings.types.note ?? "Note",
		},
		{
			description: strings.types.todo ?? "",
			icon: "todo" as const,
			key: "todo" as const,
			label: strings.types.todo ?? "Todo",
		},
		{
			description: strings.types.link ?? "",
			icon: "link" as const,
			key: "link" as const,
			label: strings.types.link ?? "Link",
		},
		{
			description: strings.types.media ?? "",
			icon: "media" as const,
			key: "media" as const,
			label: strings.types.media ?? "Media",
		},
		{
			description: strings.types.audio ?? "",
			icon: "audio" as const,
			key: "audio" as const,
			label: strings.types.audio ?? "Audio",
		},
		{
			description: strings.types.doc ?? "",
			icon: "document" as const,
			key: "doc" as const,
			label: strings.types.doc ?? "Document",
		},
	];
}

function TagDirectory({
	items,
	onSelect,
	strings,
}: {
	items: Content[];
	onSelect(tag: string): void;
	strings: LibraryWorkspaceStrings;
}) {
	const tags = useMemo(() => {
		const counts = new Map<string, number>();
		for (const item of items) for (const tag of item.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
		return [...counts.entries()].sort(([a], [b]) => a.localeCompare(b));
	}, [items]);
	return (
		<section className="p-6">
			<h1 className="text-2xl font-semibold">{strings.tags}</h1>
			{tags.length ? (
				<div className="mt-6 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
					{tags.map(([tag, count]) => (
						<button
							type="button"
							key={tag}
							onClick={() => onSelect(tag)}
							className="flex items-center justify-between rounded-xl bg-card p-4 text-left shadow-sm hover:bg-muted">
							<span>#{tag}</span>
							<span className="text-sm text-muted-foreground">{count}</span>
						</button>
					))}
				</div>
			) : (
				<p className="mt-5 text-muted-foreground">{strings.tagsEmpty}</p>
			)}
		</section>
	);
}
function LibraryGraphView({
	items,
	onOpenContent,
	onOpenTag,
	strings,
}: {
	items: Content[];
	onOpenContent(item: Content): void;
	onOpenTag(tag: string): void;
	strings: LibraryWorkspaceStrings;
}) {
	const graph = useMemo(() => {
		const tags = new Map<string, { id: string; title: string }>();
		const edges: Array<{ fromNode: string; toNode: string }> = [];
		for (const item of items)
			item.tags.forEach((title, index) => {
				const id = item.tag_ids[index] ?? title;
				tags.set(id, { id, title });
				edges.push({ fromNode: item.id, toNode: id });
			});
		return {
			edges,
			nodes: [
				...items.map((item) => ({
					color: 0,
					content: item.title ?? strings.untitled,
					id: item.id,
					type: item.type,
				})),
				...[...tags.values()].map((tag) => ({
					color: 0,
					content: tag.title,
					id: tag.id,
					metadata: { tag_id: tag.id },
					type: "tag",
				})),
			],
		};
	}, [items, strings.untitled]);
	return (
		<section className="h-full min-h-0 p-6">
			<h1 className="mb-5 text-2xl font-semibold">{strings.graph}</h1>
			<div className="h-[calc(100%-3.5rem)] min-h-100">
				<GraphSurface
					edges={graph.edges}
					nodes={graph.nodes}
					onNodeClick={(node) =>
						node.type === "tag"
							? onOpenTag(String(node.content ?? ""))
							: items.find((item) => item.id === node.id) &&
								onOpenContent(items.find((item) => item.id === node.id)!)
					}
					strings={{ empty: strings.graphEmpty, zoomIn: "+", zoomOut: "−" }}
				/>
			</div>
		</section>
	);
}

function ContentEditorDialog({
	item,
	onClose,
	onSave,
	strings,
}: {
	item: Content;
	onClose(): void;
	onSave(input: CreateContent & { id?: string }): Promise<void>;
	strings: LibraryWorkspaceStrings;
}) {
	const { client } = useAppServices();
	const [draft, setDraft] = useState<CreateContent & { id?: string }>(() => ({
		content: item.content,
		id: item.id,
		media_type: item.media_type ?? "image",
		tags: item.tags,
		title: item.title ?? "",
		type: item.type,
		url: item.url,
	}));
	const [saving, setSaving] = useState(false);
	const [confirmClose, setConfirmClose] = useState(false);
	const isDirty =
		draft.content !== item.content ||
		draft.title !== (item.title ?? "") ||
		draft.type !== item.type ||
		draft.url !== item.url ||
		JSON.stringify(draft.tags ?? []) !== JSON.stringify(item.tags);
	const requestClose = () => {
		if (saving) return;
		if (isDirty) setConfirmClose(true);
		else onClose();
	};
	if (item.type === "note" || item.type === "todo") {
		return (
			<ContentEditDialog
				content={item}
				onOpenChange={(open) => {
					if (!open) onClose();
				}}
				onSave={async (input) => {
					await onSave({
						content: input.content ?? item.content,
						document_images: input.document_images ?? item.document_images,
						id: item.id,
						media_type: input.media_type ?? item.media_type ?? "image",
						media_url: input.media_url ?? item.media_url,
						tags: input.tags ?? item.tags,
						thumbnail_base64: input.thumbnail_base64 ?? item.thumbnail_base64,
						thumbnail_url: input.thumbnail_url ?? item.thumbnail_url,
						title: input.title ?? item.title,
						type: input.type ?? item.type,
						url: input.url ?? item.url,
					});
					return { ...item, ...input, tags: input.tags ?? item.tags, title: input.title ?? item.title };
				}}
				open
				onSuggestTags={async (input) => {
					const result = await client.ai.suggestTags({ ...input, mode: "draft" });
					if (!result.success) throw new Error(result.error ?? "Не удалось подобрать теги");
					return [...result.existing.map((tag) => tag.name), ...result.newTags];
				}}
				strings={{
					addTag: "+ Добавить тег",
					addTodo: strings.add,
					cancel: strings.cancel,
					discard: strings.cancel,
					emptyTodos: strings.emptyTitle,
					editNote: strings.edit,
					editTodo: strings.edit,
					save: strings.save,
					saving: strings.save,
					titlePlaceholder: strings.title,
					todoPlaceholder: strings.title,
					unsavedDescription: strings.deleteConfirm,
					unsavedTitle: strings.title,
				}}
			/>
		);
	}
	return (
		<>
			<div
				className="fixed inset-0 z-100 flex items-center justify-center bg-black/40 p-4"
				role="presentation"
				onMouseDown={requestClose}>
				<form
					className="w-full max-w-xl space-y-4 rounded-2xl bg-background p-6 shadow-xl"
					onMouseDown={(event) => event.stopPropagation()}
					onSubmit={async (event) => {
						event.preventDefault();
						setSaving(true);
						try {
							await onSave({ ...draft, tags: draft.tags?.filter(Boolean) ?? [] });
						} finally {
							setSaving(false);
						}
					}}>
					<div className="flex items-center justify-between">
						<h2 className="text-xl font-semibold">{strings.edit}</h2>
						<button type="button" aria-label={strings.cancel} onClick={requestClose}>
							<X className="size-5" />
						</button>
					</div>
					<label className="grid gap-2 text-sm font-medium">
						{strings.type}
						<select
							value={draft.type}
							onChange={(event) => setDraft({ ...draft, type: event.target.value as Content["type"] })}
							className="rounded-lg border bg-background p-2">
							{Object.entries(strings.types).map(([type, label]) => (
								<option key={type} value={type}>
									{label}
								</option>
							))}
						</select>
					</label>
					<label className="grid gap-2 text-sm font-medium">
						{strings.title}
						<input
							value={draft.title ?? ""}
							onChange={(event) => setDraft({ ...draft, title: event.target.value })}
							className="rounded-lg border bg-background p-2"
						/>
					</label>
					{draft.type === "link" && (
						<label className="grid gap-2 text-sm font-medium">
							{strings.linkUrl}
							<input
								value={draft.url ?? ""}
								onChange={(event) => setDraft({ ...draft, url: event.target.value })}
								className="rounded-lg border bg-background p-2"
							/>
						</label>
					)}
					<div className="grid gap-2 text-sm font-medium">
						<span>{strings.tags}</span>
						<TagEditor onTagsChange={(tags) => setDraft({ ...draft, tags })} tags={draft.tags ?? []} />
					</div>
					<label className="grid gap-2 text-sm font-medium">
						{strings.content}
						<textarea
							required
							value={draft.content}
							onChange={(event) => setDraft({ ...draft, content: event.target.value })}
							className="min-h-40 rounded-lg border bg-background p-2"
						/>
					</label>
					<div className="flex justify-end gap-2">
						<Button type="button" variant="tertiary" onClick={requestClose}>
							{strings.cancel}
						</Button>
						<Button disabled={saving}>{strings.save}</Button>
					</div>
				</form>
			</div>
			<ConfirmDialog
				cancelText={strings.cancel}
				confirmText={strings.discardChanges}
				description={strings.unsavedDescription}
				onConfirm={onClose}
				onOpenChange={setConfirmClose}
				open={confirmClose}
				title={strings.unsavedTitle}
			/>
		</>
	);
}
