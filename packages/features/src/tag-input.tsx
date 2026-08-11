import { normalizeTagTitle, uniqueTagTitles } from "@synapse/core";
import { Input, Select, SelectContent, SelectItem, SelectTrigger } from "@synapse/ui/components";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";

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
	onTagsChange(tags: string[]): void;
	placeholder?: string;
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
	onTagsChange,
	placeholder = "+ Добавить тег",
	suggestions = [],
	tags,
}: TagInputProps) {
	const [currentTag, setCurrentTag] = useState("");
	const selectedTags = new Set(tags.map(normalizeTagTitle));
	const colorByTitle = new Map(suggestions.map((tag) => [normalizeTagTitle(tag.title), tag.color ?? 0]));
	const availableSuggestions = useMemo(() => {
		const query = normalizeTagTitle(currentTag);
		return suggestions
			.filter((tag) => !selectedTags.has(normalizeTagTitle(tag.title)))
			.filter((tag) => !query || normalizeTagTitle(tag.title).includes(query))
			.sort((left, right) => left.title.localeCompare(right.title));
	}, [currentTag, selectedTags, suggestions]);
	const addTag = () => {
		if (!currentTag.trim()) return;
		const normalized = normalizeTagTitle(currentTag);
		// When a tag already exists, keep its established spelling. Tag identity
		// remains case-insensitive, while newly created tags retain user casing.
		const existing = suggestions.find((tag) => normalizeTagTitle(tag.title) === normalized);
		const nextTags = mergeTags(tags, [existing?.title ?? currentTag]);
		if (nextTags.length !== tags.length) onTagsChange(nextTags);
		setCurrentTag("");
	};
	const selectTag = (id: string) => {
		const tag = availableSuggestions.find((candidate) => candidate.id === id);
		if (!tag) return;
		onTagsChange(mergeTags(tags, [tag.title]));
		setCurrentTag("");
	};
	const removeTag = (tagToRemove: string) => {
		onTagsChange(tags.filter((tag) => normalizeTagTitle(tag) !== normalizeTagTitle(tagToRemove)));
	};

	return (
		<div className="flex flex-wrap gap-2">
			{tags.map((tag) => (
				<ContentTag
					color={colorByTitle.get(normalizeTagTitle(tag)) ?? 0}
					disabled={disabled}
					key={tag}
					onRemove={removeTag}
					tag={tag}
				/>
			))}
			<div className="flex min-w-[180px] flex-1 gap-2">
				<Input
					className={inputClassName ?? "min-w-0 flex-1"}
					disabled={disabled}
					onChange={(event) => setCurrentTag(event.target.value)}
					onKeyDown={(event) => {
						if (event.key === "Enter" || event.key === " ") {
							event.preventDefault();
							addTag();
						}
					}}
					placeholder={placeholder}
					value={currentTag}
				/>
				{availableSuggestions.length > 0 && (
					<Select disabled={disabled} onValueChange={selectTag} value="">
						<SelectTrigger className="min-w-32" placeholder="Теги" />
						<SelectContent className="max-h-90 overflow-y-auto">
							{availableSuggestions.map((tag, index) => (
								<SelectItem index={index} key={tag.id} value={tag.id}>
									{tag.title}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				)}
			</div>
			{action}
		</div>
	);
}
