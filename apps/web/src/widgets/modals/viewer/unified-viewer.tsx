import type { Content, LinkContent } from "@synapse/shared/schemas";
import {
	calculateReadingTime,
	calculateReadingTimeFromLinkContent,
	parseAudioJson,
	parseLinkContent,
	parseMediaJson,
} from "@synapse/shared/schemas";
import { cn } from "@synapse/ui/cn";
import { prose } from "@synapse/ui/prose";
import DOMPurify from "dompurify";
import { AnimatePresence, motion } from "framer-motion";
import { Download, Edit2, Globe, Info, Pause, Play, Trash2, User, Volume2, VolumeX } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { ContentSuggestions } from "@/features/content-suggestions/content-suggestions";
import { EditContentDialog } from "@/features/edit-content/ui/edit-content-dialog";
import { api } from "@/shared/api/hooks";
import useMouseActivity from "@/shared/hooks/use-mouse-activity";
import { useI18n } from "@/shared/lib/i18n";
import { getPresignedMediaUrl } from "@/shared/lib/image-utils";
import { useUserPreferences } from "@/shared/lib/user-preferences-context";
import Image from "@/shared/router/image";
import { useRouter } from "@/shared/router/navigation";
import { ContentTag } from "@/shared/ui/content-tag";
import { GenerateTagsButton, type SuggestedTag } from "@/shared/ui/generate-tags-button";
import { PixelSparkles } from "@/shared/ui/pixel-sparkles";
import { CustomVideoPlayer } from "@/widgets/content-viewer/ui/custom-video-player";
import { EditorRenderer } from "@/widgets/editor/ui/editor-renderer";

import { BaseModal } from "../base";
import { ViewerOverlayControls, type ViewerOverlayAction } from "../components";
import { ConfirmDialog } from "../dialogs";
import { useModalGestures, useModalKeyboard } from "../hooks";
import { showToast } from "../utils";
import { ViewerDetails } from "./viewer-details";

interface UnifiedViewerModalProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	item: Content;
	items?: Content[];
	onEdit?: (id: string) => void;
	onDelete?: (id: string) => void | Promise<void>;
	onContentUpdated?: (content: Content) => void;
	onTagNavigate?: () => void;
	onViewerNavigate?: (item: Content) => void;
}

function ensureDataUri(base64: string): string {
	if (!base64) return "";
	if (base64.startsWith("data:")) return base64;
	return `data:image/jpeg;base64,${base64}`;
}

function formatDate(date: string, locale: string) {
	return new Date(date).toLocaleDateString(locale, {
		day: "numeric",
		month: "long",
		year: "numeric",
	});
}

function formatDuration(seconds: number) {
	const safeSeconds = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
	const minutes = Math.floor(safeSeconds / 60);
	const remainder = Math.floor(safeSeconds % 60);
	return `${minutes}:${remainder.toString().padStart(2, "0")}`;
}

function buildDownloadName(item: Content, url: string) {
	const extension = url.split("?")[0]?.split(".").pop()?.trim();
	const safeTitle = (item.title || item.id).trim().replace(/[^a-zA-Z0-9-_]+/g, "-");
	return extension ? `${safeTitle}.${extension}` : safeTitle;
}

function isDocumentType(type: Content["type"]) {
	return ["doc", "pdf", "docx", "epub", "xlsx", "csv"].includes(type);
}

function isViewportFitType(type: Content["type"]) {
	return type !== "note" && type !== "todo" && !isDocumentType(type);
}

function getReadingTime(item: Content, linkContent: LinkContent | null, minuteLabel: string) {
	if (item.type === "link" && linkContent) {
		return calculateReadingTimeFromLinkContent(linkContent);
	}

	if (item.type === "audio") {
		const audio = parseAudioJson(item.content);
		const duration = audio?.audio.durationSec;
		if (!duration) return undefined;
		return `${Math.max(1, Math.ceil(duration / 60))} ${minuteLabel}`;
	}

	if (item.type === "note" || item.type === "todo" || isDocumentType(item.type)) {
		return calculateReadingTime(item.content);
	}

	return undefined;
}

function localizeReadingTime(value: string | undefined, t: ReturnType<typeof useI18n>["t"]) {
	if (!value) return undefined;
	if (value === "less than a minute") return t("viewer.lessThanMinute");
	return value.replace(/ min/g, ` ${t("viewer.minutes")}`).replace(/ h/g, ` ${t("viewer.hours")}`);
}

function StructuredContentRenderer({ content }: { content: LinkContent["content"] }) {
	return (
		<article className={cn("max-w-none", prose)}>
			{content.content.map((block, index) => {
				if (block.type === "heading") {
					const level = Math.min(block.attrs?.level || 1, 6);
					if (level === 1)
						return (
							<h1 key={index} className="mt-6 mb-4 text-3xl font-semibold text-foreground first:mt-0">
								{block.content}
							</h1>
						);
					if (level === 2)
						return (
							<h2 key={index} className="mt-6 mb-4 text-2xl font-semibold text-foreground first:mt-0">
								{block.content}
							</h2>
						);
					if (level === 3)
						return (
							<h3 key={index} className="mt-6 mb-4 text-xl font-semibold text-foreground first:mt-0">
								{block.content}
							</h3>
						);
					if (level === 4)
						return (
							<h4 key={index} className="mt-6 mb-4 text-lg font-semibold text-foreground first:mt-0">
								{block.content}
							</h4>
						);
					if (level === 5)
						return (
							<h5 key={index} className="mt-6 mb-4 text-base font-semibold text-foreground first:mt-0">
								{block.content}
							</h5>
						);
					return (
						<h6 key={index} className="mt-6 mb-4 text-sm font-semibold text-foreground first:mt-0">
							{block.content}
						</h6>
					);
				}

				if (block.type === "paragraph") {
					return (
						<p key={index} className="mb-4 leading-7 text-foreground/90">
							{block.content}
						</p>
					);
				}

				if (block.type === "quote") {
					return (
						<blockquote
							key={index}
							className="my-5 rounded-r-md border-l-4 border-primary bg-muted/40 px-4 py-3">
							<p className="mb-0 text-foreground/80 italic">{block.content}</p>
						</blockquote>
					);
				}

				if (block.type === "code") {
					return (
						<pre
							key={index}
							className="my-5 overflow-x-auto rounded-lg border border-border bg-muted p-4 text-sm">
							<code>{block.content}</code>
						</pre>
					);
				}

				if (block.type === "image" && block.attrs?.src) {
					return (
						<figure key={index} className="my-6 space-y-2">
							<img
								src={block.attrs.src}
								alt={block.attrs.alt || ""}
								className="w-full rounded-xl border border-border object-cover"
							/>
						</figure>
					);
				}

				if (block.type === "list") {
					const items = block.content?.split("\n").filter(Boolean) ?? [];
					const ListTag = block.attrs?.listType === "ordered" ? "ol" : "ul";
					return (
						<ListTag key={index} className="my-4 list-inside space-y-2 pl-2">
							{items.map((value, itemIndex) => (
								<li key={itemIndex}>{value.trim()}</li>
							))}
						</ListTag>
					);
				}

				if (block.type === "divider") {
					return <hr key={index} className="my-8 border-border" />;
				}

				return null;
			})}
		</article>
	);
}

function TodoRenderer({ content, emptyLabel }: { content: string; emptyLabel: string }) {
	const todos = useMemo(() => {
		try {
			return JSON.parse(content) as Array<{ marked: boolean; text: string }>;
		} catch {
			return [];
		}
	}, [content]);

	if (todos.length === 0) {
		return <p className="text-sm text-muted-foreground">{emptyLabel}</p>;
	}

	return (
		<div className="flex flex-col gap-3">
			{todos.map((todo, index) => (
				<div
					key={`${todo.text}-${index}`}
					className="flex items-start gap-3 rounded-2xl border border-border/70 bg-background/80 px-4 py-3">
					<input
						type="checkbox"
						checked={todo.marked}
						readOnly
						className="mt-0.5 h-4 w-4 rounded border-border"
					/>
					<span className={cn("leading-6 text-foreground", todo.marked && "line-through opacity-60")}>
						{todo.text}
					</span>
				</div>
			))}
		</div>
	);
}

function NoteRenderer({ item }: { item: Content }) {
	const parsed = useMemo(() => {
		if (item.type !== "note") return null;
		try {
			return JSON.parse(item.content);
		} catch {
			return null;
		}
	}, [item.content, item.type]);

	if (parsed?.type === "doc") {
		// Tiptap reads the initial `content` only when the editor is created.
		// Remount the read-only renderer after an edit so the viewer shows the
		// saved note immediately.
		return <EditorRenderer key={item.content} data={parsed} />;
	}

	return <pre className="font-sans leading-7 whitespace-pre-wrap text-foreground/90">{item.content}</pre>;
}

function LinkRenderer({ item, linkContent }: { item: Content; linkContent: LinkContent | null }) {
	if (!linkContent) {
		return (
			<div className="rounded-2xl border border-border bg-card p-5 sm:p-6">
				<p className="rounded-xl bg-muted/50 p-3 font-mono text-sm break-all">{item.content}</p>
			</div>
		);
	}

	return (
		<div className="space-y-6">
			<div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
				<div className="inline-flex items-center gap-2 rounded-full bg-muted px-3 py-1">
					<Globe className="size-4" />
					<span className="max-w-55 truncate">{new URL(linkContent.url).hostname}</span>
				</div>
				{linkContent.metadata.author && (
					<div className="inline-flex items-center gap-2 rounded-full bg-muted px-3 py-1">
						<User className="size-4" />
						<span className="max-w-55 truncate">{linkContent.metadata.author}</span>
					</div>
				)}
			</div>

			{linkContent.metadata.image && (
				<img
					src={linkContent.metadata.image}
					alt={linkContent.title}
					className="h-64 w-full rounded-2xl border border-border object-cover md:h-80"
				/>
			)}

			<StructuredContentRenderer content={linkContent.content} />
		</div>
	);
}

function DocumentRenderer({ item, previewAlt }: { item: Content; previewAlt: string }) {
	const hasHtml = useMemo(() => /<[^>]+>/g.test(item.content), [item.content]);
	const sanitized = useMemo(() => {
		if (!hasHtml) return "";
		return DOMPurify.sanitize(item.content, {
			ADD_TAGS: ["img", "table", "thead", "tbody", "tr", "td", "th"],
			ADD_ATTR: ["src", "alt", "title", "class", "style", "colspan", "rowspan"],
			ALLOW_DATA_ATTR: false,
		});
	}, [hasHtml, item.content]);

	return (
		<div className="space-y-6">
			{item.thumbnail_base64 && (
				<div className="overflow-hidden rounded-2xl border border-border bg-muted/20 p-3">
					<img
						src={ensureDataUri(item.thumbnail_base64)}
						alt={previewAlt}
						className="mx-auto w-full max-w-2xl rounded-xl object-cover"
					/>
				</div>
			)}

			<div className={cn("document-content max-w-none", prose)}>
				{hasHtml ? (
					<div dangerouslySetInnerHTML={{ __html: sanitized }} />
				) : (
					<div className="leading-7 whitespace-pre-wrap text-foreground/90">{item.content}</div>
				)}
			</div>
		</div>
	);
}

const viewerSlideVariants = {
	enter: (direction: number) => ({
		opacity: direction === 0 ? 1 : 0,
		scale: direction === 0 ? 1 : 0.985,
		x: direction > 0 ? 88 : direction < 0 ? -88 : 0,
	}),
	center: {
		opacity: 1,
		scale: 1,
		x: 0,
	},
	exit: (direction: number) => ({
		opacity: 0,
		scale: 0.985,
		x: direction > 0 ? -88 : 88,
	}),
};

const viewerSlideTransition = {
	x: { duration: 0.26, ease: [0.22, 1, 0.36, 1] },
	opacity: { duration: 0.18, ease: "easeOut" },
	scale: { duration: 0.26, ease: [0.22, 1, 0.36, 1] },
} as const;

export function UnifiedViewerModal({
	open,
	onOpenChange,
	item,
	items = [],
	onEdit,
	onDelete,
	onContentUpdated,
	onTagNavigate,
	onViewerNavigate,
}: UnifiedViewerModalProps) {
	const { locale, t } = useI18n();
	const router = useRouter();
	const utils = api.useUtils();
	const [currentIndex, setCurrentIndex] = useState(0);
	const [direction, setDirection] = useState(0);
	const [showDetails, setShowDetails] = useState(false);
	const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
	const [editOpen, setEditOpen] = useState(false);
	const [updatedItems, setUpdatedItems] = useState<Record<string, Content>>({});
	const [discoveredItems, setDiscoveredItems] = useState<Content[]>([]);
	const [isDownloading, setIsDownloading] = useState(false);
	const [sparklesStartedFor, setSparklesStartedFor] = useState<string | null>(null);
	const [sideWidths, setSideWidths] = useState({ left: 0, right: 0 });
	const [noteArticle, setNoteArticle] = useState<HTMLElement | null>(null);
	const [audioState, setAudioState] = useState({
		currentTime: 0,
		duration: 0,
		isPlaying: false,
		muted: false,
		seeking: false,
		seekValue: 0,
		volume: 1,
	});
	const audioRef = useRef<HTMLAudioElement | null>(null);
	const { bind, isHovered } = useMouseActivity(1800);
	const { isReady: preferencesReady, mediaAutoplayEnabled, noteSparklesEnabled } = useUserPreferences();

	const baseItems = useMemo(() => {
		return (items.length > 0 ? items : [item]).filter(Boolean);
	}, [item, items]);
	const normalizedItems = useMemo(() => {
		return Array.from(new Map([...baseItems, ...discoveredItems].map((entry) => [entry.id, entry])).values());
	}, [baseItems, discoveredItems]);

	const currentBaseItem = normalizedItems[currentIndex] ?? item;
	const currentDetailQuery = api.content.getById.useQuery(
		{ id: currentBaseItem.id },
		{
			enabled: open,
			refetchOnMount: "always",
			retry: false,
		}
	);
	const currentItem = updatedItems[currentBaseItem.id] ?? currentDetailQuery.data ?? currentBaseItem;
	const activeNoteId = currentItem.type === "note" ? currentItem.id : null;
	const linkContent = useMemo(
		() => (currentItem.type === "link" ? parseLinkContent(currentItem.content) : null),
		[currentItem.content, currentItem.type]
	);
	const readingTime = useMemo(() => {
		return localizeReadingTime(getReadingTime(currentItem, linkContent, t("viewer.minutes")), t);
	}, [currentItem, linkContent, t]);
	const mediaData = useMemo(
		() => (currentItem.type === "media" ? (parseMediaJson(currentItem.content)?.media ?? null) : null),
		[currentItem.content, currentItem.type]
	);
	const audioData = useMemo(
		() => (currentItem.type === "audio" ? parseAudioJson(currentItem.content) : null),
		[currentItem.content, currentItem.type]
	);
	const mediaUrl = mediaData?.url ? getPresignedMediaUrl(mediaData.url) : "";
	const videoPosterUrl = mediaData?.thumbnailUrl ? getPresignedMediaUrl(mediaData.thumbnailUrl) : undefined;
	const audioUrl = audioData?.audio?.url ? getPresignedMediaUrl(audioData.audio.url) : "";
	const coverUrl = audioData?.cover?.url ? getPresignedMediaUrl(audioData.cover.url) : "";

	const backgroundSrc = useMemo(() => {
		if (currentItem.type === "media") {
			if (mediaData?.type === "video" && mediaData.thumbnailUrl)
				return getPresignedMediaUrl(mediaData.thumbnailUrl);
			return mediaUrl;
		}

		if (currentItem.type === "audio") {
			return coverUrl;
		}

		if (isDocumentType(currentItem.type) && currentItem.thumbnail_base64) {
			return ensureDataUri(currentItem.thumbnail_base64);
		}

		if (currentItem.type === "link" && linkContent?.metadata.image) {
			return linkContent.metadata.image;
		}

		return "";
	}, [
		coverUrl,
		currentItem.thumbnail_base64,
		currentItem.type,
		linkContent?.metadata.image,
		mediaData?.thumbnailUrl,
		mediaData?.type,
		mediaUrl,
	]);

	const downloadUrl = currentItem.type === "media" ? mediaUrl : currentItem.type === "audio" ? audioUrl : "";
	const contentTypeLabel =
		currentItem.type === "audio"
			? t("audio")
			: currentItem.type === "media"
				? t("media")
				: currentItem.type === "note"
					? t("note")
					: currentItem.type === "todo"
						? t("todo")
						: currentItem.type === "link"
							? t("link")
							: t("documents");

	useEffect(() => {
		setUpdatedItems({});
		setDiscoveredItems([]);
	}, [item.id]);

	useEffect(() => {
		setSparklesStartedFor(null);

		if (!open || !activeNoteId) return;

		const timeout = window.setTimeout(() => setSparklesStartedFor(activeNoteId), 10_000);
		return () => window.clearTimeout(timeout);
	}, [activeNoteId, open]);

	useEffect(() => {
		if (!open || !activeNoteId || !noteArticle) {
			setSideWidths({ left: 0, right: 0 });
			return;
		}

		const updateSideWidths = () => {
			const bounds = noteArticle.getBoundingClientRect();
			if (window.innerWidth <= bounds.width) {
				setSideWidths({ left: 0, right: 0 });
				return;
			}

			setSideWidths({ left: Math.max(0, bounds.left), right: Math.max(0, window.innerWidth - bounds.right) });
		};

		const observer = new ResizeObserver(updateSideWidths);
		observer.observe(noteArticle);
		window.addEventListener("resize", updateSideWidths);
		updateSideWidths();

		return () => {
			observer.disconnect();
			window.removeEventListener("resize", updateSideWidths);
		};
	}, [activeNoteId, noteArticle, open]);

	useEffect(() => {
		if (!open) {
			setShowDetails(false);
			setDirection(0);
			return;
		}

		const nextIndex = baseItems.findIndex((entry) => entry.id === item.id);
		setCurrentIndex(nextIndex >= 0 ? nextIndex : 0);
		setDirection(0);
		setShowDetails(false);
	}, [baseItems, item.id, open]);

	useEffect(() => {
		if (currentItem.type !== "audio" || !audioRef.current) {
			return;
		}

		audioRef.current.muted = audioState.muted;
		audioRef.current.volume = audioState.volume;
	}, [audioState.muted, audioState.volume, currentItem.type]);

	useEffect(() => {
		const element = audioRef.current;
		if (element) {
			element.pause();
		}

		if (currentItem.type !== "audio") {
			setAudioState({
				currentTime: 0,
				duration: 0,
				isPlaying: false,
				muted: false,
				seeking: false,
				seekValue: 0,
				volume: 1,
			});
		}
	}, [currentItem.id, currentItem.type]);

	useEffect(() => {
		const element = audioRef.current;
		if (!element || currentItem.type !== "audio") return;

		const handleLoaded = () => {
			setAudioState((current) => ({
				...current,
				duration: element.duration || 0,
				currentTime: element.currentTime || 0,
			}));

			if (!preferencesReady || !mediaAutoplayEnabled || element.currentTime > 0) {
				setAudioState((current) => ({ ...current, isPlaying: false }));
				return;
			}

			element
				.play()
				.then(() => {
					setAudioState((current) => ({ ...current, isPlaying: true }));
				})
				.catch(() => {
					setAudioState((current) => ({ ...current, isPlaying: false }));
				});
		};

		const handleTimeUpdate = () => {
			setAudioState((current) =>
				current.seeking ? current : { ...current, currentTime: element.currentTime }
			);
		};

		const handleEnded = () => {
			setAudioState((current) => ({ ...current, isPlaying: false }));
		};

		const handlePause = () => {
			setAudioState((current) => ({ ...current, isPlaying: false }));
		};

		element.addEventListener("loadedmetadata", handleLoaded);
		element.addEventListener("timeupdate", handleTimeUpdate);
		element.addEventListener("ended", handleEnded);
		element.addEventListener("pause", handlePause);

		if (element.readyState >= 1) {
			handleLoaded();
		}

		return () => {
			element.removeEventListener("loadedmetadata", handleLoaded);
			element.removeEventListener("timeupdate", handleTimeUpdate);
			element.removeEventListener("ended", handleEnded);
			element.removeEventListener("pause", handlePause);
		};
	}, [audioUrl, currentItem.type, mediaAutoplayEnabled, preferencesReady]);

	const updateContentMutation = api.content.update.useMutation({
		onSuccess: (updatedContent) => {
			setUpdatedItems((current) => ({ ...current, [updatedContent.id]: updatedContent }));
			void Promise.all([
				utils.content.getTags.invalidate(),
				utils.content.getTagsWithContent.invalidate(),
				utils.content.getTagsWithContentPage.invalidate(),
				utils.content.getSuggestions.invalidate(),
				utils.graph.getGraph.invalidate(),
				utils.user.getStorageUsage.invalidate(),
			]);
			onContentUpdated?.(updatedContent);
		},
	});

	const deleteContentMutation = api.content.delete.useMutation({
		onSuccess: () => {
			void Promise.all([
				utils.content.getTags.invalidate(),
				utils.content.getTagsWithContent.invalidate(),
				utils.content.getTagsWithContentPage.invalidate(),
				utils.content.getSuggestions.invalidate(),
				utils.graph.getGraph.invalidate(),
				utils.user.getStorageUsage.invalidate(),
			]);
			onOpenChange(false);
		},
	});

	const goToIndex = (nextIndex: number) => {
		if (nextIndex < 0 || nextIndex >= normalizedItems.length || nextIndex === currentIndex) {
			return;
		}

		setDirection(nextIndex > currentIndex ? 1 : -1);
		setCurrentIndex(nextIndex);
		setShowDetails(false);
		onViewerNavigate?.(normalizedItems[nextIndex]!);
	};

	const goToNext = () => {
		goToIndex(currentIndex + 1);
	};

	const goToPrevious = () => {
		goToIndex(currentIndex - 1);
	};

	const openSuggestedItem = (suggestedItem: Content) => {
		const existingIndex = normalizedItems.findIndex((entry) => entry.id === suggestedItem.id);
		if (existingIndex >= 0) {
			goToIndex(existingIndex);
			return;
		}

		onViewerNavigate?.(suggestedItem);
		setDiscoveredItems((current) => [...current, suggestedItem]);
		setDirection(1);
		setCurrentIndex(normalizedItems.length);
		setShowDetails(false);
	};

	useModalKeyboard({
		enabled: open && !editOpen,
		onEscape: () => onOpenChange(false),
		shortcuts: [
			{ key: "ArrowLeft", handler: goToPrevious, preventDefault: true },
			{ key: "ArrowRight", handler: goToNext, preventDefault: true },
			{
				key: " ",
				handler: () => {
					if (currentItem.type !== "audio") return;
					toggleAudio();
				},
				preventDefault: currentItem.type === "audio",
			},
		],
	});

	const gestures = useModalGestures({
		enabled: open && !editOpen && normalizedItems.length > 1,
		swipe: {
			direction: "horizontal",
			threshold: 50,
			onSwipeLeft: goToNext,
			onSwipeRight: goToPrevious,
		},
	});

	const handleAddTag = async (tag: string) => {
		try {
			const updatedTags = [...new Set([...(currentItem.tags || []), tag])];
			await updateContentMutation.mutateAsync({ id: currentItem.id, tags: updatedTags });
			showToast.success(t("viewer.tagAdded"));
		} catch {
			showToast.error(t("viewer.tagAddError"));
		}
	};

	const handleRemoveTag = async (tag: string) => {
		try {
			const updatedTags = currentItem.tags.filter((value) => value !== tag);
			await updateContentMutation.mutateAsync({ id: currentItem.id, tags: updatedTags });
			showToast.success(t("viewer.tagRemoved"));
		} catch {
			showToast.error(t("viewer.tagRemoveError"));
		}
	};

	const handleAiTags = async (existing: SuggestedTag[], newTags: string[]) => {
		try {
			const names = [...existing.map((t) => t.name), ...newTags];
			const updatedTags = [...new Set([...(currentItem.tags || []), ...names])];
			await updateContentMutation.mutateAsync({ id: currentItem.id, tags: updatedTags });
		} catch {
			showToast.error(t("viewer.tagsError"));
		}
	};

	const handleEdit = () => {
		if (currentItem.type === "note") {
			if (!currentDetailQuery.data && currentDetailQuery.isFetching) {
				showToast.info(t("viewer.loadingNote"));
				return;
			}

			setEditOpen(true);
			return;
		}

		if (onEdit) {
			onEdit(currentItem.id);
		} else {
			router.push(`/edit/${currentItem.id}`);
		}
		onOpenChange(false);
	};

	const handleDownload = async () => {
		if (!downloadUrl) return;
		setIsDownloading(true);
		try {
			const response = await fetch(downloadUrl);
			if (!response.ok) throw new Error("Download failed");
			const blob = await response.blob();
			const objectUrl = window.URL.createObjectURL(blob);
			const link = document.createElement("a");
			link.href = objectUrl;
			link.download = buildDownloadName(currentItem, downloadUrl);
			document.body.append(link);
			link.click();
			link.remove();
			window.URL.revokeObjectURL(objectUrl);
		} catch {
			showToast.error(t("viewer.downloadError"));
		} finally {
			setIsDownloading(false);
		}
	};

	const confirmDelete = async () => {
		try {
			if (onDelete) {
				await onDelete(currentItem.id);
				onOpenChange(false);
				showToast.success(t("viewer.contentDeleted"));
				return;
			}
			await deleteContentMutation.mutateAsync({ id: currentItem.id });
			showToast.success(t("viewer.contentDeleted"));
		} catch {
			showToast.error(t("viewer.deleteError"));
		}
	};

	const toggleAudio = () => {
		const element = audioRef.current;
		if (!element || currentItem.type !== "audio") return;
		if (audioState.isPlaying) {
			element.pause();
			setAudioState((current) => ({ ...current, isPlaying: false }));
			return;
		}
		element
			.play()
			.then(() => {
				setAudioState((current) => ({ ...current, isPlaying: true }));
			})
			.catch(() => {
				setAudioState((current) => ({ ...current, isPlaying: false }));
			});
	};

	const overlayActions = useMemo<ViewerOverlayAction[]>(() => {
		const actions: ViewerOverlayAction[] = [
			{
				icon: Info,
				label: showDetails ? t("position.collapse") : t("details"),
				onClick: () => setShowDetails((current) => !current),
			},
		];
		if (downloadUrl) {
			actions.push({
				icon: Download,
				label: isDownloading ? t("viewer.downloading") : t("viewer.download"),
				onClick: handleDownload,
				disabled: isDownloading,
			});
		}
		if (currentItem.type === "note" || onEdit) {
			actions.push({
				icon: Edit2,
				label: currentItem.type === "note" && currentDetailQuery.isFetching ? t("viewer.loading") : t("edit"),
				onClick: handleEdit,
				disabled: currentItem.type === "note" && !currentDetailQuery.data && currentDetailQuery.isFetching,
			});
		}
		if (onDelete) {
			actions.push({
				icon: Trash2,
				label: t("delete"),
				onClick: () => setShowDeleteConfirm(true),
				destructive: true,
			});
		}
		return actions;
	}, [
		currentDetailQuery.data,
		currentDetailQuery.isFetching,
		currentItem.type,
		downloadUrl,
		handleDownload,
		isDownloading,
		onDelete,
		onEdit,
		showDetails,
	]);

	const showNoteSparkles =
		preferencesReady &&
		noteSparklesEnabled &&
		sparklesStartedFor === activeNoteId &&
		sideWidths.left > 0 &&
		sideWidths.right > 0;

	const renderContent = () => {
		if (currentItem.type === "media") {
			if (mediaData?.type === "video") {
				return (
					<CustomVideoPlayer
						src={mediaUrl}
						poster={videoPosterUrl}
						autoPlay={preferencesReady && mediaAutoplayEnabled}
						className="h-full w-full"
					/>
				);
			}
			return (
				<img
					src={mediaUrl}
					alt={currentItem.title || t("viewer.mediaAlt")}
					className="max-h-full max-w-full object-contain"
					draggable={false}
				/>
			);
		}

		if (currentItem.type === "audio") {
			const progress = audioState.duration > 0 ? (audioState.currentTime / audioState.duration) * 100 : 0;
			return (
				<div className="flex max-h-full w-full max-w-[min(88vw,720px)] flex-col items-center gap-6 overflow-y-auto rounded-4xl border border-white/10 bg-[rgba(18,18,18,0.58)] px-5 py-6 sm:px-7 sm:py-8">
					<audio ref={audioRef} src={audioUrl} className="hidden" />
					<div className="relative aspect-square w-full max-w-[320px] overflow-hidden rounded-[28px] border border-white/10 bg-white/5 sm:max-w-90">
						{coverUrl ? (
							<>
								<Image
									src={coverUrl}
									alt={audioData?.track?.title || currentItem.title || t("viewer.coverAlt")}
									fill
									unoptimized
									className="absolute inset-0 scale-105 object-cover opacity-35 blur-2xl"
								/>
								<Image
									src={coverUrl}
									alt={audioData?.track?.title || currentItem.title || t("viewer.coverAlt")}
									fill
									unoptimized
									className="relative z-10 object-cover"
								/>
							</>
						) : (
							<div className="flex h-full w-full items-center justify-center bg-white/5 text-sm text-white/50">
								{t("viewer.noCover")}
							</div>
						)}
					</div>

					<div className="space-y-1 text-center text-white">
						<p className="text-xl leading-tight font-medium">
							{audioData?.track?.title || currentItem.title || t("audio")}
						</p>
						{(audioData?.track?.artist || audioData?.track?.album) && (
							<p className="text-sm text-white/60">
								{[audioData?.track?.artist, audioData?.track?.album].filter(Boolean).join(" • ")}
							</p>
						)}
					</div>

					<div className="w-full max-w-140 rounded-[28px] border border-white/10 bg-black/48 px-4 py-4 text-white sm:px-5">
						<div className="flex flex-col gap-4">
							<div className="flex items-center justify-center">
								<button
									type="button"
									onClick={toggleAudio}
									className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-black transition-colors hover:bg-white/90">
									{audioState.isPlaying ? <Pause className="size-5" /> : <Play className="size-5" />}
								</button>
							</div>
							<div className="flex items-center gap-3">
								<div className="w-11 text-right text-xs text-white/60 tabular-nums">
									{formatDuration(audioState.currentTime)}
								</div>
								<input
									type="range"
									min={0}
									max={100}
									value={audioState.seeking ? audioState.seekValue : progress}
									onMouseDown={() => setAudioState((current) => ({ ...current, seeking: true }))}
									onTouchStart={() => setAudioState((current) => ({ ...current, seeking: true }))}
									onChange={(e) =>
										setAudioState((current) => ({ ...current, seekValue: Number(e.target.value) }))
									}
									onMouseUp={() => {
										if (!audioRef.current) return;
										const next = (audioState.seekValue / 100) * (audioState.duration || 0);
										audioRef.current.currentTime = Number.isFinite(next) ? next : 0;
										setAudioState((current) => ({
											...current,
											currentTime: audioRef.current?.currentTime || 0,
											seeking: false,
										}));
									}}
									onTouchEnd={() => {
										if (!audioRef.current) return;
										const next = (audioState.seekValue / 100) * (audioState.duration || 0);
										audioRef.current.currentTime = Number.isFinite(next) ? next : 0;
										setAudioState((current) => ({
											...current,
											currentTime: audioRef.current?.currentTime || 0,
											seeking: false,
										}));
									}}
									className="flex-1 cursor-pointer"
								/>
								<div className="w-11 text-xs text-white/60 tabular-nums">
									{formatDuration(audioState.duration)}
								</div>
							</div>
							<div className="flex items-center justify-center gap-3">
								<button
									type="button"
									onClick={() => setAudioState((current) => ({ ...current, muted: !current.muted }))}
									className="flex h-8 w-8 items-center justify-center rounded-full text-white/60 transition-colors hover:bg-white/10 hover:text-white">
									{audioState.muted || audioState.volume === 0 ? (
										<VolumeX className="size-4" />
									) : (
										<Volume2 className="size-4" />
									)}
								</button>
								<input
									type="range"
									min={0}
									max={1}
									step={0.01}
									value={audioState.muted ? 0 : audioState.volume}
									onChange={(e) =>
										setAudioState((current) => ({ ...current, volume: Number(e.target.value) }))
									}
									className="w-32 cursor-pointer"
								/>
							</div>
						</div>
					</div>
				</div>
			);
		}

		if (currentItem.type === "note") {
			return (
				<div className="relative z-10 min-h-full w-full text-foreground">
					<article
						ref={setNoteArticle}
						className="relative z-10 mx-auto w-full max-w-3xl px-5 py-16 sm:px-8 sm:py-20">
						<header className="mb-8 border-b border-border pb-7">
							<h1 className="text-3xl leading-tight font-semibold tracking-tight text-foreground sm:text-4xl">
								{currentItem.title || t("untitled")}
							</h1>
							{currentItem.tags.length > 0 && (
								<div className="mt-5 flex flex-wrap gap-2">
									{currentItem.tags.map((tag, tagIndex) => (
										<ContentTag
											key={tag}
											tag={tag}
											tagId={currentItem.tag_ids[tagIndex]}
											onNavigate={onTagNavigate}
										/>
									))}
								</div>
							)}
						</header>
						<div className="text-foreground">
							<NoteRenderer item={currentItem} />
						</div>
					</article>
				</div>
			);
		}

		if (currentItem.type === "todo") {
			return (
				<div className="h-full w-full max-w-5xl overflow-hidden rounded-[30px] border border-white/10 bg-[rgba(16,16,16,0.82)]">
					<div className="h-full overflow-y-auto px-5 py-6 sm:px-8 sm:py-8">
						<div className="mx-auto w-full max-w-3xl rounded-2xl border border-border bg-card p-5 sm:p-6">
							<TodoRenderer content={currentItem.content} emptyLabel={t("viewer.emptyTasks")} />
						</div>
					</div>
				</div>
			);
		}

		if (currentItem.type === "link") {
			return (
				<div className="h-full w-full max-w-5xl overflow-hidden rounded-[30px] border border-white/10 bg-[rgba(16,16,16,0.82)]">
					<div className="h-full overflow-y-auto px-5 py-6 sm:px-8 sm:py-8">
						<div className="mx-auto w-full max-w-3xl rounded-2xl border border-border bg-card p-5 sm:p-6">
							<LinkRenderer item={currentItem} linkContent={linkContent} />
						</div>
					</div>
				</div>
			);
		}

		if (isDocumentType(currentItem.type)) {
			return (
				<div className="h-full w-full max-w-5xl overflow-hidden rounded-[30px] border border-white/10 bg-[rgba(16,16,16,0.82)]">
					<div className="h-full overflow-y-auto px-5 py-6 sm:px-8 sm:py-8">
						<div className="mx-auto w-full max-w-3xl rounded-2xl border border-border bg-card p-5 sm:p-6">
							<DocumentRenderer item={currentItem} previewAlt={t("viewer.documentPreviewAlt")} />
						</div>
					</div>
				</div>
			);
		}

		return null;
	};

	return (
		<>
			<BaseModal
				open={open}
				onOpenChange={onOpenChange}
				size="full"
				variant="fullscreen"
				className={cn(
					"border-0 shadow-none",
					currentItem.type === "note" ? "bg-background" : "bg-black/35 backdrop-blur-xl"
				)}
				preventScroll>
				<div
					className={cn(
						"relative h-full w-full overflow-hidden",
						currentItem.type === "note" ? "bg-background" : "bg-black"
					)}
					{...bind}>
					{backgroundSrc && (
						<div className="absolute inset-0 overflow-hidden">
							<img
								src={backgroundSrc}
								alt=""
								className="h-full w-full scale-110 object-cover opacity-28 blur-3xl"
								draggable={false}
							/>
							<div className="absolute inset-0 bg-black/55" />
						</div>
					)}

					<div className="relative z-10 h-full w-full overflow-hidden">
						<div className="relative h-full w-full overflow-hidden">
							<AnimatePresence initial={false} mode="sync" custom={direction}>
								<motion.div
									key={currentItem.id}
									custom={direction}
									variants={viewerSlideVariants}
									initial="enter"
									animate="center"
									exit="exit"
									transition={viewerSlideTransition}
									{...gestures}
									className="absolute inset-0 overflow-y-auto overscroll-y-contain">
									{showNoteSparkles && (
										<motion.div
											aria-hidden="true"
											className="pointer-events-none fixed inset-0 z-0 overflow-hidden text-muted-foreground opacity-70"
											initial={{ opacity: 0 }}
											animate={{ opacity: 0.7 }}
											transition={{ duration: 5, ease: "easeOut" }}>
											<div
												className="absolute inset-y-0 left-0"
												style={{
													width: sideWidths.left,
													maskImage: "linear-gradient(to right, black 0%, black 58%, transparent 100%)",
													WebkitMaskImage: "linear-gradient(to right, black 0%, black 58%, transparent 100%)",
												}}>
												<PixelSparkles pixelSize={5} speed={0.38} fireSpeed={0.35} density={0.26} />
											</div>
											<div
												className="absolute inset-y-0 right-0"
												style={{
													width: sideWidths.right,
													maskImage: "linear-gradient(to left, black 0%, black 58%, transparent 100%)",
													WebkitMaskImage: "linear-gradient(to left, black 0%, black 58%, transparent 100%)",
												}}>
												<PixelSparkles pixelSize={5} speed={0.38} fireSpeed={0.35} density={0.26} />
											</div>
										</motion.div>
									)}
									<div
										className={cn(
											"flex w-full items-center justify-center",
											isViewportFitType(currentItem.type)
												? "h-svh max-h-svh min-h-svh px-4 py-10 sm:px-6"
												: "min-h-svh"
										)}>
										{renderContent()}
									</div>
									<ContentSuggestions
										item={currentItem}
										onItemClick={openSuggestedItem}
										onTagNavigate={onTagNavigate}
										onContentUpdated={(updatedContent) => {
											setUpdatedItems((current) => ({
												...current,
												[updatedContent.id]: updatedContent,
											}));
											onContentUpdated?.(updatedContent);
										}}
										onContentDeleted={onDelete}
										dark={currentItem.type !== "note"}
									/>
								</motion.div>
							</AnimatePresence>
						</div>
					</div>

					<ViewerOverlayControls
						visible={isHovered}
						actions={overlayActions}
						canGoPrevious={currentIndex > 0}
						canGoNext={currentIndex < normalizedItems.length - 1}
						onPrevious={goToPrevious}
						onNext={goToNext}
						onClose={() => onOpenChange(false)}
						closeLabel={t("viewer.close")}
						nextLabel={t("viewer.next")}
						previousLabel={t("viewer.previous")}
					/>

					<AnimatePresence initial={false}>
						{showDetails && (
							<ViewerDetails
								item={currentItem}
								contentTypeLabel={contentTypeLabel}
								title={currentItem.title || t("untitled")}
								createdLabel={t("viewer.created", { date: formatDate(currentItem.created_at, locale) })}
								updatedLabel={
									currentItem.updated_at !== currentItem.created_at
										? t("viewer.updated", { date: formatDate(currentItem.updated_at, locale) })
										: undefined
								}
								readingTime={readingTime}
								authorLabel={
									currentItem.type === "link" && linkContent?.metadata.author
										? t("viewer.author", { author: linkContent.metadata.author })
										: undefined
								}
								artistLabel={
									currentItem.type === "audio" && audioData?.track?.artist
										? t("viewer.artist", { artist: audioData.track.artist })
										: undefined
								}
								tagsLabel={t("tags")}
								addTagPlaceholder={t("viewer.addTag")}
								onAddTag={handleAddTag}
								onRemoveTag={handleRemoveTag}
								onTagNavigate={onTagNavigate}
								additionalTagAction={
									<GenerateTagsButton
										mode="existing"
										contentId={currentItem.id}
										disabled={
											updateContentMutation.isPending ||
											currentItem.type === "audio" ||
											(currentItem.type === "media" && mediaData?.type !== "image")
										}
										onResult={handleAiTags}
										className="shrink-0 whitespace-nowrap"
									/>
								}
							/>
						)}
					</AnimatePresence>
				</div>
			</BaseModal>

			{currentItem.type === "note" && (
				<EditContentDialog
					open={editOpen}
					onOpenChange={setEditOpen}
					content={currentItem}
					onContentUpdated={(updatedContent) => {
						setUpdatedItems((current) => ({ ...current, [updatedContent.id]: updatedContent }));
						onContentUpdated?.(updatedContent);
					}}
				/>
			)}

			<ConfirmDialog
				open={showDeleteConfirm}
				onOpenChange={setShowDeleteConfirm}
				title={t("viewer.deleteTitle")}
				description={t("viewer.deleteDescription")}
				confirmText={t("delete")}
				cancelText={t("cancel")}
				variant="primary"
				onConfirm={confirmDelete}
			/>
		</>
	);
}
