import { getAudioDisplayTitle, parseAudioJson, parseLinkContent } from "@synapse/core";
import type { Content, LinkContent } from "@synapse/shared/schemas";
import { extractTextFromStructuredContent } from "@synapse/shared/schemas";
import { motion } from "framer-motion";
import { Check, FileText, ListChecks, Music2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { ContentCardFrame } from "./content-card-frame";
import { ContentTag } from "./content-tag";

export interface ContentCardStrings {
	delete: string;
	done: string;
	emptyNote: string;
	edit: string;
	open: string;
	untitled: string;
}

export interface ContentCardProps {
	disableAnimation?: boolean;
	excludedTag?: string;
	index: number;
	item: Content;
	onDelete?: (item: Content) => void;
	onEdit?: (item: Content) => void;
	onOpen?: (item: Content) => void;
	strings: ContentCardStrings;
	resolveMediaUrl?: (url: string) => string;
}

/** Canonical card visual. Cards never fetch, mutate, route, or inspect a platform. */
export function ContentCard({
	disableAnimation,
	excludedTag,
	index,
	item,
	onDelete,
	onEdit,
	onOpen,
	strings,
	resolveMediaUrl,
}: ContentCardProps) {
	const visibleTags = excludedTag ? item.tags.filter((tag) => tag !== excludedTag) : item.tags;
	const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null);
	const menuRef = useRef<HTMLDivElement>(null);
	useEffect(() => {
		if (!menuPosition) return;
		const closeOnOutsidePointer = (event: PointerEvent) => {
			if (!menuRef.current?.contains(event.target as Node)) setMenuPosition(null);
		};
		const closeOnEscape = (event: KeyboardEvent) => {
			if (event.key === "Escape") setMenuPosition(null);
		};
		window.addEventListener("pointerdown", closeOnOutsidePointer);
		window.addEventListener("keydown", closeOnEscape);
		return () => {
			window.removeEventListener("pointerdown", closeOnOutsidePointer);
			window.removeEventListener("keydown", closeOnEscape);
		};
	}, [menuPosition]);
	const runMenuAction = (action: () => void) => {
		setMenuPosition(null);
		action();
	};
	return (
		<>
			<div
				className="cursor-pointer"
				onClick={() => onOpen?.(item)}
				onContextMenu={(event) => {
					event.preventDefault();
					setMenuPosition({ x: event.clientX, y: event.clientY });
				}}>
				<motion.div
					initial={disableAnimation ? false : { opacity: 0, y: 20 }}
					animate={disableAnimation ? undefined : { opacity: 1, y: 0 }}
					transition={disableAnimation ? undefined : { duration: 0.2 }}
					className="group">
					<ContentCardFrame type={item.type}>
						<ContentCardBody
							item={item}
							index={index}
							tags={visibleTags}
							strings={strings}
							resolveMediaUrl={resolveMediaUrl}
						/>
					</ContentCardFrame>
				</motion.div>
			</div>
			{menuPosition &&
				createPortal(
					<div
						className="fixed z-200 min-w-36 rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10"
						ref={menuRef}
						role="menu"
						style={{ left: menuPosition.x, top: menuPosition.y }}>
						<CardMenuItem onClick={() => runMenuAction(() => onOpen?.(item))}>{strings.open}</CardMenuItem>
						{onEdit && (
							<CardMenuItem onClick={() => runMenuAction(() => onEdit(item))}>{strings.edit}</CardMenuItem>
						)}
						{onDelete && (
							<CardMenuItem onClick={() => runMenuAction(() => onDelete(item))}>
								{strings.delete}
							</CardMenuItem>
						)}
					</div>,
					document.body
				)}
		</>
	);
}

function CardMenuItem({ children, onClick }: { children: string; onClick(): void }) {
	return (
		<button
			className="flex w-full cursor-pointer items-center rounded-md px-1.5 py-1 text-left text-sm outline-hidden hover:bg-accent hover:text-accent-foreground"
			onClick={onClick}
			role="menuitem"
			type="button">
			{children}
		</button>
	);
}

function ContentCardBody({
	item,
	index,
	strings,
	tags,
	resolveMediaUrl,
}: {
	index: number;
	item: Content;
	strings: ContentCardStrings;
	tags: string[];
	resolveMediaUrl?: (url: string) => string;
}) {
	const notePreview = useMemo(() => getNotePreview(item.content), [item.content]);
	if (item.type === "todo")
		return <TodoPreview content={item.content} doneLabel={strings.done} tags={tags} />;
	if (item.type === "link") return <LinkPreview item={item} tags={tags} untitled={strings.untitled} />;
	if (item.type === "media" || item.type === "audio")
		return <MediaPreview item={item} resolveMediaUrl={resolveMediaUrl} />;
	if (isDocumentType(item.type)) return <DocumentPreview item={item} index={index} tags={tags} />;
	return (
		<>
			<h3 className="line-clamp-2 text-lg leading-snug font-semibold tracking-tight text-foreground">
				{item.title || strings.untitled}
			</h3>
			<p className="wrap-break-words mt-3 line-clamp-5 text-sm leading-6 whitespace-pre-wrap text-muted-foreground">
				{notePreview || strings.emptyNote}
			</p>
			<TagList tags={tags} className="mt-auto pt-5" />
		</>
	);
}

function TodoPreview({ content, doneLabel, tags }: { content: string; doneLabel: string; tags: string[] }) {
	const todos = parseTodos(content);
	const done = todos.filter((todo) => todo.marked).length;
	return (
		<div className="flex flex-col gap-2">
			<div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
				<ListChecks className="h-4 w-4" />
				{done} /{todos.length} {doneLabel}
			</div>
			<div className="flex flex-col gap-1" role="list">
				{todos.slice(0, 3).map((todo, todoIndex) => (
					<div className="flex h-8 items-center gap-2.5 px-0 text-[13px]" key={todoIndex} role="listitem">
						<span
							aria-hidden="true"
							className="grid size-[15px] shrink-0 place-items-center rounded-[5px] border-[1.5px] border-border">
							{todo.marked && <Check className="size-3" strokeWidth={2.5} />}
						</span>
						<span className={todo.marked ? "text-foreground line-through opacity-60" : "text-foreground"}>
							{todo.text}
						</span>
					</div>
				))}
			</div>
			{todos.length > 3 && <div className="text-xs text-muted-foreground">+{todos.length - 3}...</div>}
			<TagList tags={tags} className="mt-3" />
		</div>
	);
}

function LinkPreview({ item, tags, untitled }: { item: Content; tags: string[]; untitled: string }) {
	const link = parseLinkContent(item.content) as LinkContent | null;
	if (!link)
		return (
			<>
				<div className="mb-4">
					<a
						href={item.url || item.content}
						target="_blank"
						rel="noreferrer"
						onClick={(event) => event.stopPropagation()}
						className="text-sm break-all text-(--link) hover:underline">
						{item.url || item.content}
					</a>
				</div>
				<TagList tags={tags} />
			</>
		);
	const text = link.rawText || extractTextFromStructuredContent(link.content);
	return (
		<div className="space-y-3">
			<h3 className="line-clamp-2 text-base leading-tight font-semibold">
				{link.title || item.title || untitled}
			</h3>
			{text && (
				<p className="line-clamp-3 text-sm leading-relaxed text-muted-foreground">
					{text.length > 200 ? `${text.slice(0, 200)}...` : text}
				</p>
			)}
			<div className="truncate text-xs text-(--link)">{link.url}</div>
			<TagList tags={tags} />
		</div>
	);
}

function MediaPreview({
	item,
	resolveMediaUrl,
}: {
	item: Content;
	resolveMediaUrl?: (url: string) => string;
}) {
	const audio = item.type === "audio" ? parseAudioJson(item.content) : null;
	const source =
		audio?.cover?.url ||
		item.thumbnail_url ||
		(item.type === "media" ? item.media_url : "") ||
		(audio?.cover?.thumbnailBase64 && `data:image/jpeg;base64,${audio.cover.thumbnailBase64}`) ||
		(item.thumbnail_base64 && `data:image/jpeg;base64,${item.thumbnail_base64}`);
	const title = getAudioDisplayTitle(audio, item.title);
	const subtitle = [audio?.track?.artist, audio?.track?.album].filter(Boolean).join(" · ");
	const resolvedSource = source ? (resolveMediaUrl ? resolveMediaUrl(source) : source) : "";
	return (
		<div className="relative min-h-44 overflow-hidden rounded-xl bg-card">
			{resolvedSource ? (
				<img src={resolvedSource} alt={title || ""} className="absolute inset-0 h-full w-full object-cover" />
			) : (
				<div className="flex min-h-44 items-center justify-center text-muted-foreground">
					{item.type === "audio" ? <Music2 /> : <FileText />}
				</div>
			)}
			<div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/65 to-transparent p-4 pt-12 text-sm font-medium text-white">
				<div className="truncate">{title}</div>
				{subtitle && <div className="mt-0.5 truncate text-xs font-normal text-white/75">{subtitle}</div>}
			</div>
		</div>
	);
}

function DocumentPreview({ item, tags }: { index: number; item: Content; tags: string[] }) {
	return (
		<div className="min-h-44 rounded-xl bg-card p-5">
			<div className="mb-6 flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
				<FileText className="size-5" />
			</div>
			<h3 className="line-clamp-2 text-base font-semibold">{item.title}</h3>
			<p className="mt-2 line-clamp-3 text-sm text-muted-foreground">{getNotePreview(item.content, 160)}</p>
			<TagList tags={tags} className="mt-4" />
		</div>
	);
}

function TagList({ className, tags }: { className?: string; tags: string[] }) {
	if (tags.length === 0) return null;
	return (
		<div className={`flex flex-wrap gap-1 ${className ?? ""}`}>
			{tags.map((tag) => (
				<ContentTag key={tag} tag={tag} className="text-xs" />
			))}
		</div>
	);
}

function getNotePreview(content: string, maxLength = 280): string {
	try {
		const parsed = JSON.parse(content);
		const text = parsed?.type === "doc" ? extractTextFromStructuredContent(parsed) : content;
		const normalized = text.replace(/\s+/g, " ").trim();
		return normalized.length <= maxLength ? normalized : `${normalized.slice(0, maxLength).trimEnd()}...`;
	} catch {
		const normalized = content.replace(/\s+/g, " ").trim();
		return normalized.length <= maxLength ? normalized : `${normalized.slice(0, maxLength).trimEnd()}...`;
	}
}
function parseTodos(content: string): Array<{ marked: boolean; text: string }> {
	try {
		const parsed: unknown = JSON.parse(content);
		return Array.isArray(parsed)
			? parsed.filter(
					(todo): todo is { marked: boolean; text: string } =>
						typeof todo === "object" &&
						todo !== null &&
						"text" in todo &&
						"marked" in todo &&
						typeof todo.text === "string" &&
						typeof todo.marked === "boolean"
				)
			: [];
	} catch {
		return [];
	}
}
function isDocumentType(type: Content["type"]) {
	return ["doc", "pdf", "docx", "epub", "xlsx", "csv"].includes(type);
}
