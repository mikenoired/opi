import { type ReactNode, useState } from "react";

import { ContentTag } from "./content-tag";
import { TagInput, type TagSuggestion } from "./tag-input";

export interface TagManagerProps {
	tags: string[];
	tagIds?: string[];
	onAddTag?: (tag: string) => void | Promise<void>;
	onRemoveTag?: (tag: string) => void | Promise<void>;
	editable?: boolean;
	className?: string;
	inputPlaceholder?: string;
	additionalAction?: ReactNode;
	onTagNavigate?: () => void;
	tagColors?: Record<string, number>;
	suggestions?: TagSuggestion[];
}

export function TagManager({
	tags,
	tagIds,
	onAddTag,
	onRemoveTag,
	editable = true,
	className,
	inputPlaceholder = "Добавить тег...",
	additionalAction,
	onTagNavigate,
	tagColors,
	suggestions,
}: TagManagerProps) {
	const [isAdding, setIsAdding] = useState(false);
	const updateTags = async (next: string[]) => {
		if (isAdding) return;
		const removed = tags.find((tag) => !next.includes(tag));
		const added = next.find((tag) => !tags.includes(tag));
		if (!removed && !added) return;
		setIsAdding(true);
		try {
			if (removed) await onRemoveTag?.(removed);
			if (added) await onAddTag?.(added);
		} finally {
			setIsAdding(false);
		}
	};

	return (
		<div className={className}>
			{/* Existing tags */}
			{tags.length > 0 && (
				<div className="mb-3 flex flex-wrap gap-2">
					{tags.map((tag, tagIndex) => (
						<ContentTag
							color={tagColors?.[tagIds?.[tagIndex] ?? tag.trim().toLocaleLowerCase()] ?? 0}
							key={tag}
							tag={tag}
							tagId={editable ? undefined : tagIds?.[tagIndex]}
							onRemove={editable ? onRemoveTag : undefined}
							onNavigate={onTagNavigate}
							className="bg-muted/60 px-2 py-1 text-xs hover:bg-muted"
						/>
					))}
				</div>
			)}

			{editable && onAddTag && (
				<TagInput
					action={additionalAction}
					disabled={isAdding}
					onTagsChange={(next) => void updateTags(next)}
					placeholder={inputPlaceholder}
					suggestions={suggestions}
					tags={tags}
				/>
			)}
		</div>
	);
}
