import { normalizeTagTitle } from "@synapse/core";
import type { Content } from "@synapse/shared/schemas";
import { Input } from "@synapse/ui/components";
import { useId, useState } from "react";

import { api } from "@/shared/api/hooks";
import { useI18n } from "@/shared/lib/i18n";
import { ContentTag } from "@/shared/ui/content-tag";

import { GenerateTagsButton, type SuggestedTag } from "./generate-tags-button";

type AiGenerate =
	| {
			mode: "draft";
			type: Content["type"];
			title?: string;
			content?: string;
			image?: string;
			disabled?: boolean;
	  }
	| {
			mode: "existing";
			contentId: string;
			disabled?: boolean;
	  };

interface TagEditorProps {
	tags: string[];
	onTagsChange: (tags: string[]) => void;
	disabled?: boolean;
	aiGenerate?: AiGenerate | null;
	inputClassName?: string;
	placeholder?: string;
}

// Draft AI tag generation requires text; media images are handled via the
// `image` field instead, so "media" is allowed here.
const mediaTypes = new Set<Content["type"]>(["audio", "doc", "pdf", "docx", "epub", "xlsx", "csv"]);

function mergeTags(tags: string[], names: string[]) {
	return Array.from(
		new Map(
			[...tags, ...names]
				.map((tag) => tag.trim())
				.filter(Boolean)
				.map((tag) => [normalizeTagTitle(tag), tag])
		).values()
	);
}

export function TagEditor({
	tags,
	onTagsChange,
	disabled = false,
	aiGenerate,
	inputClassName,
	placeholder,
}: TagEditorProps) {
	const listId = useId();
	const [currentTag, setCurrentTag] = useState("");
	const { t } = useI18n();
	const { data: tagSuggestions = [] } = api.content.getTags.useQuery(undefined, {
		refetchOnMount: false,
	});

	const selectedTags = new Set(tags.map(normalizeTagTitle));
	const availableSuggestions = tagSuggestions.filter(
		(tag) => !selectedTags.has(normalizeTagTitle(tag.title))
	);

	const addTag = () => {
		if (!currentTag.trim()) return;

		const nextTags = mergeTags(tags, [currentTag]);
		if (nextTags.length !== tags.length) {
			onTagsChange(nextTags);
		}
		setCurrentTag("");
	};

	const removeTag = (tagToRemove: string) => {
		onTagsChange(tags.filter((tag) => normalizeTagTitle(tag) !== normalizeTagTitle(tagToRemove)));
	};

	const handleAiTags = (existing: SuggestedTag[], newTags: string[]) => {
		onTagsChange(mergeTags(tags, [...existing.map((tag) => tag.name), ...newTags]));
	};

	const aiDisabled =
		disabled ||
		!aiGenerate ||
		aiGenerate.disabled ||
		(aiGenerate.mode === "draft" && mediaTypes.has(aiGenerate.type));

	return (
		<div className="flex flex-wrap gap-2">
			{tags.map((tag) => (
				<ContentTag key={tag} tag={tag} onRemove={removeTag} disabled={disabled} />
			))}
			<Input
				list={listId}
				placeholder={placeholder ?? t("addTag")}
				value={currentTag}
				onChange={(e) => setCurrentTag(e.target.value)}
				onKeyDown={(e) => {
					if (e.key === "Enter") {
						e.preventDefault();
						addTag();
					}
				}}
				className={inputClassName ?? "min-w-[120px] flex-1"}
				disabled={disabled}
			/>
			<datalist id={listId}>
				{availableSuggestions.map((tag) => (
					<option key={tag.id} value={tag.title} />
				))}
			</datalist>
			{aiGenerate &&
				(aiGenerate.mode === "draft" ? (
					<GenerateTagsButton
						mode="draft"
						type={aiGenerate.type}
						title={aiGenerate.title}
						content={aiGenerate.content}
						image={aiGenerate.image}
						disabled={aiDisabled}
						onResult={handleAiTags}
					/>
				) : (
					<GenerateTagsButton
						mode="existing"
						contentId={aiGenerate.contentId}
						disabled={aiDisabled}
						onResult={handleAiTags}
					/>
				))}
		</div>
	);
}
