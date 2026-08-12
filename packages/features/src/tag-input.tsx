import { normalizeTagTitle, uniqueTagTitles } from "@synapse/core";
import { MAX_TAGS_PER_CONTENT } from "@synapse/shared/schemas";
import { InputField } from "@synapse/ui/components";
import type { ReactNode } from "react";
import { useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { ContentTag } from "./content-tag";

export interface TagSuggestion {
	color?: number;
	id: string;
	title: string;
}

export interface TagInputProps {
	action?: ReactNode;
	disabled?: boolean;
	inputClassName?: string;
	maxTags?: number;
	onTagsChange(tags: string[]): void;
	placeholder?: string;
	limitMessage?: string;
	suggestions?: TagSuggestion[];
	tags: string[];
}

function mergeTags(tags: string[], names: string[]) {
	return uniqueTagTitles([...tags, ...names]);
}

/** Platform-neutral tag input. Suggestion sources and optional actions are supplied by the shell. */
export function TagInput({
	action,
	disabled = false,
	inputClassName,
	limitMessage = `Можно добавить не более ${MAX_TAGS_PER_CONTENT} тегов`,
	maxTags = MAX_TAGS_PER_CONTENT,
	onTagsChange,
	placeholder = "+ Добавить тег",
	suggestions = [],
	tags,
}: TagInputProps) {
	const [currentTag, setCurrentTag] = useState("");
	const [limitError, setLimitError] = useState("");
	const [suggestionsOpen, setSuggestionsOpen] = useState(false);
	const suggestionsId = useId();
	const inputContainerRef = useRef<HTMLDivElement>(null);
	const [suggestionsPosition, setSuggestionsPosition] = useState({ left: 0, top: 0, width: 0 });
	const selectedTags = new Set(tags.map(normalizeTagTitle));
	const colorByTitle = new Map(suggestions.map((tag) => [normalizeTagTitle(tag.title), tag.color ?? 0]));
	const availableSuggestions = useMemo(() => {
		const query = normalizeTagTitle(currentTag);
		return suggestions
			.filter((tag) => !selectedTags.has(normalizeTagTitle(tag.title)))
			.filter((tag) => !query || normalizeTagTitle(tag.title).includes(query))
			.sort((left, right) => left.title.localeCompare(right.title));
	}, [currentTag, selectedTags, suggestions]);
	useLayoutEffect(() => {
		if (!suggestionsOpen || !availableSuggestions.length) return;
		const updatePosition = () => {
			const rect = inputContainerRef.current?.getBoundingClientRect();
			if (!rect) return;
			const horizontalInset = 8;
			const width = Math.min(rect.width, window.innerWidth - horizontalInset * 2);
			setSuggestionsPosition({
				left: Math.min(Math.max(horizontalInset, rect.left), window.innerWidth - horizontalInset - width),
				top: rect.bottom + 4,
				width,
			});
		};
		updatePosition();
		window.addEventListener("resize", updatePosition);
		document.addEventListener("scroll", updatePosition, true);
		return () => {
			window.removeEventListener("resize", updatePosition);
			document.removeEventListener("scroll", updatePosition, true);
		};
	}, [availableSuggestions.length, suggestionsOpen]);
	const addTag = () => {
		if (!currentTag.trim()) return;
		if (tags.length >= maxTags) {
			setLimitError(limitMessage);
			return;
		}
		const normalized = normalizeTagTitle(currentTag);
		// When a tag already exists, keep its established spelling. Tag identity
		// remains case-insensitive, while newly created tags retain user casing.
		const existing = suggestions.find((tag) => normalizeTagTitle(tag.title) === normalized);
		const nextTags = mergeTags(tags, [existing?.title ?? currentTag]);
		if (nextTags.length !== tags.length) {
			onTagsChange(nextTags);
			setLimitError("");
		}
		setCurrentTag("");
	};
	const selectTag = (id: string) => {
		const tag = availableSuggestions.find((candidate) => candidate.id === id);
		if (!tag) return;
		if (tags.length >= maxTags) {
			setLimitError(limitMessage);
			return;
		}
		onTagsChange(mergeTags(tags, [tag.title]));
		setLimitError("");
		setCurrentTag("");
		setSuggestionsOpen(false);
	};
	const removeTag = (tagToRemove: string) => {
		onTagsChange(tags.filter((tag) => normalizeTagTitle(tag) !== normalizeTagTitle(tagToRemove)));
		setLimitError("");
	};

	return (
		<div className="flex flex-wrap gap-2">
			{tags.map((tag) => (
				<ContentTag
					className="max-w-full"
					color={colorByTitle.get(normalizeTagTitle(tag)) ?? 0}
					disabled={disabled}
					key={tag}
					onRemove={removeTag}
					tag={tag}
				/>
			))}
			<div className="relative flex min-w-0 flex-1" ref={inputContainerRef}>
				<InputField
					aria-autocomplete="list"
					aria-controls={suggestionsId}
					aria-expanded={suggestionsOpen && availableSuggestions.length > 0}
					label="Добавить тег"
					labelHidden
					className={inputClassName ?? "min-w-0 flex-1"}
					disabled={disabled}
					onChange={setCurrentTag}
					onFocus={() => setSuggestionsOpen(true)}
					onBlur={() => setSuggestionsOpen(false)}
					onKeyDown={(event) => {
						if (event.key === "Enter" || event.key === " ") {
							event.preventDefault();
							addTag();
						}
					}}
					placeholder={placeholder}
					value={currentTag}
				/>
			</div>
			{suggestionsOpen &&
				availableSuggestions.length > 0 &&
				typeof document !== "undefined" &&
				createPortal(
					<div
						className="fixed z-200 max-h-52 overflow-y-auto rounded-lg border bg-popover p-1 shadow-md"
						id={suggestionsId}
						onMouseDown={(event) => event.preventDefault()}
						role="listbox"
						style={suggestionsPosition}>
						{availableSuggestions.map((tag) => (
							<button
								className="hover:bg-hover focus-visible:bg-hover block w-full truncate rounded-md px-3 py-2 text-left text-sm text-foreground transition-colors outline-none"
								key={tag.id}
								onClick={() => selectTag(tag.id)}
								role="option"
								type="button">
								{tag.title}
							</button>
						))}
					</div>,
					document.body
				)}
			{action}
			{limitError && (
				<p className="w-full text-sm text-destructive" role="status">
					{limitError}
				</p>
			)}
		</div>
	);
}
