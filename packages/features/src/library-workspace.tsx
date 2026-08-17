import { useI18n } from "@synapse/i18n";
import type { Content, CreateContent } from "@synapse/shared/schemas";
import { Button } from "@synapse/ui/components";
import { ArrowLeft, FileText, LinkIcon, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { ConfiguredAppSidebar, DashboardSurface } from "./app-shell";
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
import { TagHeader, TagLabel } from "./tag-header";
import { TagStack } from "./tag-stack";

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
	sidebarFooter?: ReactNode;
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
	sidebarFooter,
}: LibraryWorkspaceProps) {
	const { searchPlaceholder, t } = useI18n();
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
		add: navigation?.find((item) => item.id === "add")?.label ?? t("library.add"),
		dashboard: navigation?.find((item) => item.id === "dashboard")?.label ?? t("library.title"),
		graph: navigation?.find((item) => item.id === "graph")?.label ?? t("library.graph"),
		settings: navigation?.find((item) => item.id === "settings")?.label ?? t("library.settings"),
		tags: navigation?.find((item) => item.id === "tags")?.label ?? t("library.tags"),
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
				footer={sidebarFooter}
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
								aria: t("library.searchAria"),
								clear: t("library.cancel"),
								placeholder: searchPlaceholder,
								types: {
									audio: t("library.types.audio"),
									csv: t("library.types.csv"),
									doc: t("library.types.doc"),
									docx: t("library.types.docx"),
									epub: t("library.types.epub"),
									link: t("library.types.link"),
									media: t("library.types.media"),
									note: t("library.types.note"),
									pdf: t("library.types.pdf"),
									todo: t("library.types.todo"),
									xlsx: t("library.types.xlsx"),
								},
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
							/>
						</div>
					</main>
				) : activePage === "tags" ? (
					<TagDirectory items={items} />
				) : (
					<LibraryGraphView
						items={items}
						onOpenContent={setViewing}
						onOpenTag={(tag) => {
							setSearch(tag);
							onSelectPage("dashboard");
						}}
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
					options={createOptions(t)}
					preloadedFiles={preloadedFiles}
					suggestedType={inferContentTypeFromFiles(preloadedFiles)}
				/>
			)}
			{editing && (
				<ContentEditorDialog
					item={editing}
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
				/>
			)}
			{dragActive && (
				<div className="pointer-events-none fixed inset-0 z-100 grid place-items-center bg-black/60 backdrop-blur-sm">
					<div className="rounded-xl border-2 border-primary bg-background px-8 py-6 text-center text-lg font-semibold">
						{t("library.add")}
					</div>
				</div>
			)}
		</div>
	);
}

function createOptions(t: ReturnType<typeof useI18n>["t"]) {
	return [
		{
			description: t("library.types.note") ?? "",
			icon: "note" as const,
			key: "note" as const,
			label: t("library.types.note") ?? "Note",
		},
		{
			description: t("library.types.todo") ?? "",
			icon: "todo" as const,
			key: "todo" as const,
			label: t("library.types.todo") ?? "Todo",
		},
		{
			description: t("library.types.link") ?? "",
			icon: "link" as const,
			key: "link" as const,
			label: t("library.types.link") ?? "Link",
		},
		{
			description: t("library.types.media") ?? "",
			icon: "media" as const,
			key: "media" as const,
			label: t("library.types.media") ?? "Media",
		},
		{
			description: t("library.types.audio") ?? "",
			icon: "audio" as const,
			key: "audio" as const,
			label: t("library.types.audio") ?? "Audio",
		},
		{
			description: t("library.types.doc") ?? "",
			icon: "document" as const,
			key: "doc" as const,
			label: t("library.types.doc") ?? "Document",
		},
	];
}

function TagDirectory({ items }: { items: Content[] }) {
	const { t } = useI18n();
	const { client } = useAppServices();
	const [colors, setColors] = useState<Record<string, number>>({});
	const [ids, setIds] = useState<Record<string, string>>({});
	const [selectedTag, setSelectedTag] = useState<{ key: string; title: string }>();
	useEffect(() => {
		let active = true;
		void client.content.getTags().then((tags) => {
			if (!active) return;
			setColors(Object.fromEntries(tags.map((tag) => [tag.title.trim().toLocaleLowerCase(), tag.color])));
			setIds(Object.fromEntries(tags.map((tag) => [tag.title.trim().toLocaleLowerCase(), tag.id])));
		});
		return () => {
			active = false;
		};
	}, [client]);
	const tags = useMemo(() => {
		const groups = new Map<string, { items: Content[]; title: string }>();
		for (const item of items)
			for (const title of item.tags) {
				const key = title.trim().toLocaleLowerCase();
				const group = groups.get(key) ?? { items: [], title };
				group.items.push(item);
				groups.set(key, group);
			}
		return [...groups.entries()].sort(([, a], [, b]) => a.title.localeCompare(b.title));
	}, [items]);
	const selectedItems = selectedTag
		? items.filter((item) => item.tags.some((tag) => tag.trim().toLocaleLowerCase() === selectedTag.key))
		: [];

	if (selectedTag)
		return (
			<section className="flex h-full min-h-0 flex-col">
				<header className="flex items-center gap-3 px-6 py-4">
					<Button
						aria-label="Back to tags"
						onClick={() => setSelectedTag(undefined)}
						size="icon"
						variant="ghost">
						<ArrowLeft className="size-4" />
					</Button>
					<TagHeader
						color={colors[selectedTag.key] ?? 0}
						labels={{
							none: t("library.tagColor.none"),
							option: (number) => t("library.tagColor.option", { number }),
							picker: t("library.tagColor.picker"),
						}}
						onColorChange={(color) => {
							const id = ids[selectedTag.key];
							if (!id) return;
							void client.content
								.updateTagColor({ id, color })
								.then((tag) => setColors((current) => ({ ...current, [selectedTag.key]: tag.color })));
						}}
						title={selectedTag.title}
					/>
				</header>
				<main className="min-h-0 flex-1 overflow-y-auto p-6">
					<ContentGridSurface
						excludedTag={selectedTag.title}
						isLoading={false}
						items={selectedItems}
						selectedTags={[selectedTag.key]}
					/>
				</main>
			</section>
		);
	return (
		<section className="p-6">
			<h1 className="text-2xl font-semibold">{t("library.tags")}</h1>
			{tags.length ? (
				<div className="mt-6 grid grid-cols-1 gap-x-6 gap-y-12 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
					{tags.map(([key, tag]) => (
						<button
							type="button"
							key={key}
							onClick={() => setSelectedTag({ key, title: tag.title })}
							className="group text-left">
							<div className="mb-3 flex items-center justify-between text-lg font-medium">
								<TagLabel color={colors[key] ?? 0} title={tag.title} />
								<span className="text-sm text-muted-foreground">{tag.items.length}</span>
							</div>
							<TagStack items={tag.items} renderPreview={DesktopTagPreview} />
						</button>
					))}
				</div>
			) : (
				<p className="mt-5 text-muted-foreground">{t("library.tagsEmpty")}</p>
			)}
		</section>
	);
}

function DesktopTagPreview(item: Content) {
	if (item.type === "media" && item.thumbnail_url)
		return <img alt="" className="h-full w-full object-cover" src={item.thumbnail_url} />;
	if (item.type === "note")
		return (
			<div className="h-full bg-card p-4">
				<h3 className="line-clamp-2 font-semibold">{item.title}</h3>
			</div>
		);
	if (item.type === "link")
		return (
			<div className="flex h-full flex-col items-center justify-center gap-2 bg-card p-4">
				<LinkIcon className="size-8 text-primary" />
				<p className="line-clamp-2 text-sm">{item.title || item.url}</p>
			</div>
		);
	return (
		<div className="flex h-full flex-col items-center justify-center gap-2 bg-card p-4">
			<FileText className="size-8 text-primary" />
			<p className="line-clamp-2 text-sm">{item.title}</p>
		</div>
	);
}
function LibraryGraphView({
	items,
	onOpenContent,
	onOpenTag,
}: {
	items: Content[];
	onOpenContent(item: Content): void;
	onOpenTag(tag: string): void;
}) {
	const { t } = useI18n();
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
					content: item.title ?? t("library.untitled"),
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
	}, [items, t]);
	return (
		<section className="h-full min-h-0 p-6">
			<h1 className="mb-5 text-2xl font-semibold">{t("library.graph")}</h1>
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
				/>
			</div>
		</section>
	);
}

function ContentEditorDialog({
	item,
	onClose,
	onSave,
}: {
	item: Content;
	onClose(): void;
	onSave(input: CreateContent & { id?: string }): Promise<void>;
}) {
	const { t } = useI18n();
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
					if (!result.success) throw new Error(result.error ?? t("tags.noSuggestions"));
					return [...result.existing.map((tag) => tag.name), ...result.newTags];
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
						<h2 className="text-xl font-semibold">{t("library.edit")}</h2>
						<button type="button" aria-label={t("library.cancel")} onClick={requestClose}>
							<X className="size-5" />
						</button>
					</div>
					<label className="grid gap-2 text-sm font-medium">
						{t("library.type")}
						<select
							value={draft.type}
							onChange={(event) => setDraft({ ...draft, type: event.target.value as Content["type"] })}
							className="rounded-lg border bg-background p-2">
							{Object.entries({
								audio: t("library.types.audio"),
								csv: t("library.types.csv"),
								doc: t("library.types.doc"),
								docx: t("library.types.docx"),
								epub: t("library.types.epub"),
								link: t("library.types.link"),
								media: t("library.types.media"),
								note: t("library.types.note"),
								pdf: t("library.types.pdf"),
								todo: t("library.types.todo"),
								xlsx: t("library.types.xlsx"),
							}).map(([type, label]) => (
								<option key={type} value={type}>
									{label}
								</option>
							))}
						</select>
					</label>
					<label className="grid gap-2 text-sm font-medium">
						{t("library.title")}
						<input
							value={draft.title ?? ""}
							onChange={(event) => setDraft({ ...draft, title: event.target.value })}
							className="rounded-lg border bg-background p-2"
						/>
					</label>
					{draft.type === "link" && (
						<label className="grid gap-2 text-sm font-medium">
							{t("library.linkUrl")}
							<input
								value={draft.url ?? ""}
								onChange={(event) => setDraft({ ...draft, url: event.target.value })}
								className="rounded-lg border bg-background p-2"
							/>
						</label>
					)}
					<div className="grid gap-2 text-sm font-medium">
						<span>{t("library.tags")}</span>
						<TagEditor onTagsChange={(tags) => setDraft({ ...draft, tags })} tags={draft.tags ?? []} />
					</div>
					<label className="grid gap-2 text-sm font-medium">
						{t("library.content")}
						<textarea
							required
							value={draft.content}
							onChange={(event) => setDraft({ ...draft, content: event.target.value })}
							className="min-h-40 rounded-lg border bg-background p-2"
						/>
					</label>
					<div className="flex justify-end gap-2">
						<Button type="button" variant="tertiary" onClick={requestClose}>
							{t("library.cancel")}
						</Button>
						<Button disabled={saving}>{t("library.save")}</Button>
					</div>
				</form>
			</div>
			<ConfirmDialog
				cancelText={t("library.cancel")}
				confirmText={t("library.discardChanges")}
				description={t("library.unsavedDescription")}
				onConfirm={onClose}
				onOpenChange={setConfirmClose}
				open={confirmClose}
				title={t("library.unsavedTitle")}
			/>
		</>
	);
}
