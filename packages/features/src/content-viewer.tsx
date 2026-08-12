import { parseAudioJson, parseLinkContent, parseMediaJson } from "@synapse/core";
import type { Content, UpdateContent } from "@synapse/shared/schemas";
import { CheckboxGroup, CheckboxItem } from "@synapse/ui/components";
import { Download, Edit2, Image as ImageIcon, Info, Sparkles, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
	ContentSuggestionsSurface,
	type ContentSuggestionGroup,
	type ContentSuggestionsSurfaceStrings,
} from "./content-suggestions-surface";
import { BaseModal } from "./dialogs/base-modal";
import { ConfirmDialog } from "./dialogs/confirm-dialog";
import { ViewerOverlayControls, type ViewerOverlayAction } from "./dialogs/viewer-overlay-controls";
import { RichTextRenderer } from "./editor/rich-text-renderer";
import { CustomAudioPlayer, MusicPlayerBackdrop } from "./media/custom-audio-player";
import { CustomVideoPlayer } from "./media/custom-video-player";
import type { TagSuggestion } from "./tag-input";
import { ViewerDetails } from "./viewer-details";

export interface ContentViewerStrings {
	addTag: string;
	cancel: string;
	close: string;
	created: (date: string) => string;
	delete: string;
	deleteDescription: string;
	deleteTitle: string;
	details: string;
	download: string;
	edit: string;
	emptyTasks: string;
	next: string;
	previous: string;
	suggestTags: string;
	tags: string;
	untitled: string;
	types: Partial<Record<Content["type"], string>>;
	updated: (date: string) => string;
}

export interface ContentViewerProps {
	autoPlay?: boolean;
	item: Content;
	items?: Content[];
	onDelete?(item: Content): Promise<void> | void;
	onDownload?(item: Content, url: string): Promise<void> | void;
	onEdit?(item: Content): void;
	onOpenChange(open: boolean): void;
	onSelect?(item: Content): Content | null | Promise<Content | null | void> | void;
	onSuggestTags?(item: Content): Promise<string[]>;
	onTagNavigate?(): void;
	onUpdate?(input: UpdateContent): Promise<void> | void;
	open: boolean;
	resolveMediaUrl?(url: string): string;
	suggestionGroups?: ContentSuggestionGroup[];
	suggestionStrings?: ContentSuggestionsSurfaceStrings;
	suggestionsHasMore?: boolean;
	suggestionsLoading?: boolean;
	suggestionsLoadingMore?: boolean;
	onLoadMoreSuggestions?(): void;
	onSuggestionTagNavigate?(tagId: string): void;
	strings: ContentViewerStrings;
	tagColors?: Record<string, number>;
	tagSuggestions?: TagSuggestion[];
}

/**
 * Canonical fullscreen content presentation. It owns interaction state only;
 * persistence, URL signing and navigation remain explicit platform callbacks.
 */
export function ContentViewer({
	autoPlay = false,
	item,
	items = [],
	onDelete,
	onDownload,
	onEdit,
	onOpenChange,
	onSelect,
	onSuggestTags,
	onTagNavigate,
	onUpdate,
	open,
	resolveMediaUrl = (url) => url,
	suggestionGroups = [],
	suggestionStrings = defaultSuggestionStrings,
	suggestionsHasMore = false,
	suggestionsLoading = false,
	suggestionsLoadingMore = false,
	onLoadMoreSuggestions = () => undefined,
	onSuggestionTagNavigate,
	strings,
	tagColors,
	tagSuggestions,
}: ContentViewerProps) {
	const collection = useMemo(() => {
		const entries = items.length ? items : [item];
		return Array.from(new Map(entries.map((entry) => [entry.id, entry])).values());
	}, [item, items]);
	const [index, setIndex] = useState(0);
	const [current, setCurrent] = useState(item);
	const [detailsOpen, setDetailsOpen] = useState(false);
	const [deleteOpen, setDeleteOpen] = useState(false);
	const [suggestingTags, setSuggestingTags] = useState(false);
	const [controlsVisible, setControlsVisible] = useState(true);
	const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
	const revealControls = useCallback(() => {
		setControlsVisible(true);
		if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
		controlsTimeoutRef.current = setTimeout(() => setControlsVisible(false), 2_000);
	}, []);

	useEffect(() => {
		setIndex(
			Math.max(
				0,
				collection.findIndex((entry) => entry.id === item.id)
			)
		);
		setCurrent(item);
		setDetailsOpen(false);
	}, [collection, item]);
	useEffect(() => {
		if (!open) return;
		revealControls();
		return () => {
			if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
		};
	}, [open, revealControls]);
	useEffect(() => {
		if (!open) return;
		const onKeyDown = (event: KeyboardEvent) => {
			if (
				event.target instanceof HTMLElement &&
				event.target.closest('input, textarea, select, [contenteditable="true"]')
			)
				return;
			revealControls();
			if (event.key === "ArrowLeft") void select(index - 1);
			if (event.key === "ArrowRight") void select(index + 1);
		};
		document.addEventListener("keydown", onKeyDown);
		return () => document.removeEventListener("keydown", onKeyDown);
	}, [index, open, revealControls]);

	const select = async (nextIndex: number) => {
		const next = collection[nextIndex];
		if (!next) return;
		const selected = await onSelect?.(next);
		if (selected === null) return;
		setIndex(nextIndex);
		setCurrent(selected ?? next);
		setDetailsOpen(false);
	};
	const updateTags = async (tags: string[]) => {
		if (!onUpdate) return;
		await onUpdate({ id: current.id, tags });
		setCurrent((value) => ({ ...value, tags }));
	};
	const suggestTags = async () => {
		if (!onSuggestTags || suggestingTags) return;
		setSuggestingTags(true);
		try {
			const suggested = await onSuggestTags(current);
			await updateTags([...new Set([...current.tags, ...suggested])]);
		} finally {
			setSuggestingTags(false);
		}
	};
	const media = current.type === "media" ? parseMediaJson(current.content)?.media : null;
	const audio = current.type === "audio" ? parseAudioJson(current.content) : null;
	const mediaUrl = resolveMediaUrl(media?.url ?? current.media_url ?? "");
	const audioUrl = resolveMediaUrl(audio?.audio.url ?? current.media_url ?? "");
	const audioCoverUrl = resolveMediaUrl(audio?.cover?.url ?? current.thumbnail_url ?? "");
	const isMusic = Boolean(audio?.track?.isTrack);
	const downloadUrl = current.type === "media" ? mediaUrl : current.type === "audio" ? audioUrl : "";
	const typeLabel = strings.types[current.type] ?? current.type;
	const actions: ViewerOverlayAction[] = [
		{ icon: Info, label: strings.details, onClick: () => setDetailsOpen((value) => !value) },
		...(downloadUrl && onDownload
			? [{ icon: Download, label: strings.download, onClick: () => void onDownload(current, downloadUrl) }]
			: []),
		...(onEdit ? [{ icon: Edit2, label: strings.edit, onClick: () => onEdit(current) }] : []),
		...(onDelete
			? [{ destructive: true, icon: Trash2, label: strings.delete, onClick: () => setDeleteOpen(true) }]
			: []),
	];
	return (
		<>
			<BaseModal
				className={
					current.type === "note" ? "border-0 bg-background shadow-none" : "border-0 bg-black/45 shadow-none"
				}
				onOpenChange={onOpenChange}
				open={open}
				preventScroll
				size="full"
				variant="fullscreen">
				<div
					className="relative h-full w-full overflow-hidden bg-background text-foreground"
					onPointerDown={revealControls}
					onPointerMove={revealControls}>
					{isMusic ? (
						<MusicPlayerBackdrop coverUrl={audioCoverUrl || undefined} />
					) : background(current, mediaUrl, audioCoverUrl) ? (
						<div className="pointer-events-none absolute inset-0 overflow-hidden bg-black">
							<img
								alt=""
								className="h-full w-full scale-110 object-cover opacity-25 blur-3xl"
								src={background(current, mediaUrl, audioCoverUrl)}
							/>
							<div className="absolute inset-0 bg-black/55" />
						</div>
					) : null}
					<div className="relative z-10 h-full min-h-0 overflow-y-auto">
						<div className="flex min-h-full w-full items-center justify-center px-4 py-12 sm:px-6">
							<ViewerBody
								audio={audio}
								audioCoverUrl={audioCoverUrl}
								audioUrl={audioUrl}
								autoPlay={autoPlay}
								item={current}
								media={media}
								mediaUrl={mediaUrl}
								strings={strings}
							/>
						</div>
						{(suggestionsLoading || suggestionGroups.length > 0) && (
							<ContentSuggestionsSurface
								active
								groups={suggestionGroups}
								hasMore={suggestionsHasMore}
								isLoading={suggestionsLoading}
								isLoadingMore={suggestionsLoadingMore}
								onActivate={() => undefined}
								onDelete={onDelete}
								onEdit={onEdit}
								onLoadMore={onLoadMoreSuggestions}
								onOpen={(next) => onSelect?.(next)}
								onTagNavigate={onSuggestionTagNavigate}
								strings={suggestionStrings}
							/>
						)}
					</div>
					<ViewerOverlayControls
						actions={actions}
						canGoNext={index < collection.length - 1}
						canGoPrevious={index > 0}
						closeLabel={strings.close}
						nextLabel={strings.next}
						onClose={() => onOpenChange(false)}
						onNext={() => void select(index + 1)}
						onPrevious={() => void select(index - 1)}
						previousLabel={strings.previous}
						visible={controlsVisible}
					/>
					{detailsOpen && (
						<ViewerDetails
							addTagPlaceholder={strings.addTag}
							contentTypeLabel={typeLabel}
							createdLabel={strings.created(formatDate(current.created_at))}
							item={current}
							onAddTag={(tag) => updateTags([...new Set([...current.tags, tag])])}
							onRemoveTag={(tag) => updateTags(current.tags.filter((value) => value !== tag))}
							onTagNavigate={onTagNavigate}
							additionalTagAction={
								onSuggestTags ? (
									<button
										className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-2.5 text-xs font-medium text-primary-foreground disabled:opacity-60"
										disabled={suggestingTags}
										onClick={() => void suggestTags()}
										type="button">
										<Sparkles className="size-3.5" />
										{strings.suggestTags}
									</button>
								) : undefined
							}
							tagColors={tagColors}
							suggestions={tagSuggestions}
							tagsLabel={strings.tags}
							title={current.title || strings.untitled}
							updatedLabel={
								current.updated_at !== current.created_at
									? strings.updated(formatDate(current.updated_at))
									: undefined
							}
						/>
					)}
				</div>
			</BaseModal>
			<ConfirmDialog
				cancelText={strings.cancel}
				confirmText={strings.delete}
				description={strings.deleteDescription}
				onConfirm={async () => {
					await onDelete?.(current);
					onOpenChange(false);
				}}
				onOpenChange={setDeleteOpen}
				open={deleteOpen}
				title={strings.deleteTitle}
			/>
		</>
	);
}

function ViewerBody({
	audio,
	audioCoverUrl,
	audioUrl,
	autoPlay,
	item,
	media,
	mediaUrl,
	strings,
}: {
	audio: ReturnType<typeof parseAudioJson>;
	audioCoverUrl: string;
	audioUrl: string;
	autoPlay: boolean;
	item: Content;
	media: NonNullable<ReturnType<typeof parseMediaJson>>["media"] | null | undefined;
	mediaUrl: string;
	strings: ContentViewerStrings;
}) {
	if (item.type === "media") {
		if (media?.type === "video")
			return (
				<CustomVideoPlayer
					autoPlay={autoPlay}
					className="h-full w-full"
					poster={media.thumbnailUrl}
					src={mediaUrl}
				/>
			);
		return mediaUrl ? (
			<img
				alt={item.title || ""}
				className="max-h-[calc(100vh-6rem)] max-w-[calc(100vw-2rem)] object-contain shadow-2xl"
				src={mediaUrl}
			/>
		) : (
			<MediaFallback />
		);
	}
	if (item.type === "audio")
		return (
			<CustomAudioPlayer
				autoPlay={autoPlay}
				coverUrl={audioCoverUrl || undefined}
				isMusic={Boolean(audio?.track?.isTrack)}
				metadata={{
					album: audio?.track?.album,
					artist: audio?.track?.artist,
					bitrateKbps: audio?.audio.bitrateKbps,
					channels: audio?.audio.channels,
					durationSec: audio?.audio.durationSec,
					genre: audio?.track?.genre,
					mimeType: audio?.audio.mimeType,
					sampleRateHz: audio?.audio.sampleRateHz,
					title: audio?.track?.title,
					year: audio?.track?.year,
				}}
				src={audioUrl}
				title={item.title || strings.untitled}
			/>
		);
	if (item.type === "note") return <NoteBody item={item} strings={strings} />;
	if (item.type === "todo") return <TodoBody item={item} strings={strings} />;
	if (item.type === "link") return <LinkBody item={item} />;
	return <DocumentBody item={item} />;
}

function NoteBody({ item, strings }: { item: Content; strings: ContentViewerStrings }) {
	const document = useMemo(() => {
		try {
			const parsed = JSON.parse(item.content);
			return parsed?.type === "doc" ? parsed : null;
		} catch {
			return null;
		}
	}, [item.content]);
	return (
		<article className="w-full max-w-3xl rounded-2xl bg-background px-5 py-10 sm:px-10">
			<h1 className="mb-7 text-3xl font-semibold tracking-tight sm:text-4xl">
				{item.title || strings.untitled}
			</h1>
			{document ? (
				<RichTextRenderer data={document} />
			) : (
				<pre className="font-sans leading-7 whitespace-pre-wrap">{item.content}</pre>
			)}
		</article>
	);
}

function TodoBody({ item, strings }: { item: Content; strings: ContentViewerStrings }) {
	const todos = useMemo(() => {
		try {
			const parsed: unknown = JSON.parse(item.content);
			return Array.isArray(parsed)
				? parsed.filter(
						(entry): entry is { marked: boolean; text: string } => typeof entry?.text === "string"
					)
				: [];
		} catch {
			return [];
		}
	}, [item.content]);
	return (
		<section className="max-w-3xl min-w-xl">
			<h1 className="mb-6 text-2xl font-semibold">{item.title || strings.untitled}</h1>
			{todos.length ? (
				<CheckboxGroup
					checkedIndices={new Set(todos.flatMap((todo, index) => (todo.marked ? [index] : [])))}
					className="w-full gap-3">
					{todos.map((todo, index) => (
						<CheckboxItem
							checked={todo.marked}
							className="h-auto rounded-xl border border-border p-3"
							index={index}
							key={`${todo.text}-${index}`}
							label={todo.text}
							onToggle={() => {}}
						/>
					))}
				</CheckboxGroup>
			) : (
				<p className="text-muted-foreground">{strings.emptyTasks}</p>
			)}
		</section>
	);
}

function LinkBody({ item }: { item: Content }) {
	const link = useMemo(() => parseLinkContent(item.content), [item.content]);
	const url = link?.url ?? item.url ?? item.content;
	return (
		<article className="w-full max-w-3xl rounded-2xl bg-card p-6 shadow-xl">
			<p className="mb-3 text-sm text-muted-foreground">{url}</p>
			<h1 className="mb-5 text-2xl font-semibold">{link?.title || item.title || url}</h1>
			{link?.metadata.image && (
				<img alt="" className="mb-6 max-h-80 w-full rounded-xl object-cover" src={link.metadata.image} />
			)}
			{link?.rawText ? (
				<p className="leading-7 whitespace-pre-wrap">{link.rawText}</p>
			) : (
				<a className="text-primary underline" href={url} rel="noreferrer" target="_blank">
					{url}
				</a>
			)}
		</article>
	);
}

function DocumentBody({ item }: { item: Content }) {
	return (
		<article className="w-full max-w-3xl rounded-2xl bg-card p-6 shadow-xl">
			<h1 className="mb-5 text-2xl font-semibold">{item.title}</h1>
			{item.thumbnail_base64 && (
				<img
					alt=""
					className="mb-6 max-h-96 w-full rounded-xl object-contain"
					src={toDataUri(item.thumbnail_base64)}
				/>
			)}
			<pre className="font-sans leading-7 whitespace-pre-wrap">{item.content}</pre>
		</article>
	);
}
function MediaFallback() {
	return (
		<div className="flex size-32 items-center justify-center rounded-2xl bg-card text-muted-foreground">
			<ImageIcon className="size-10" />
		</div>
	);
}
function background(item: Content, mediaUrl: string, audioCoverUrl: string) {
	return item.type === "media" ? mediaUrl : item.type === "audio" ? audioCoverUrl : "";
}
function toDataUri(value: string) {
	return value.startsWith("data:") ? value : `data:image/jpeg;base64,${value}`;
}
function formatDate(value: string) {
	return new Date(value).toLocaleDateString();
}

const defaultSuggestionStrings: ContentSuggestionsSurfaceStrings = {
	ariaLabel: "Related content",
	delete: "Delete",
	done: "done",
	edit: "Edit",
	emptyNote: "Empty note",
	eyebrow: "Continue exploring",
	loadingMore: "Loading more",
	open: "Open",
	title: "Related content",
	untitled: "Untitled",
};
