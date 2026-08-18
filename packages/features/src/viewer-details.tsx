import type { Content } from "@synapse/shared/schemas";
import { cn } from "@synapse/ui/cn";
import { Dropdown, useDropdown } from "@synapse/ui/components";
import { motion } from "framer-motion";
import {
	Calendar,
	FileText,
	Globe,
	Image as ImageIcon,
	ListChecks,
	Play,
	Tag,
	type LucideIcon,
} from "lucide-react";
import { type ReactNode, useEffect, useRef } from "react";

import type { TagSuggestion } from "./tag-input";
import { TagManager } from "./tag-manager";

export interface ViewerDetailsProps {
	item: Content;
	contentTypeLabel: string;
	title: string;
	createdLabel: string;
	updatedLabel?: string;
	readingTime?: string;
	authorLabel?: string;
	artistLabel?: string;
	tagsLabel: string;
	addTagPlaceholder: string;
	onAddTag: (tag: string) => void | Promise<void>;
	onRemoveTag: (tag: string) => void | Promise<void>;
	additionalTagAction?: ReactNode;
	onTagNavigate?: () => void;
	tagColors?: Record<string, number>;
	suggestions?: TagSuggestion[];
}

interface DetailsSectionProps {
	index: number;
	label: string;
	children: ReactNode;
	className?: string;
}

function DetailsSection({ index, label, children, className }: DetailsSectionProps) {
	const ref = useRef<HTMLDivElement>(null);
	const { registerItem } = useDropdown();

	useEffect(() => {
		registerItem(index, ref.current);
		return () => registerItem(index, null);
	}, [index, registerItem]);

	return (
		<div
			ref={ref}
			data-proximity-index={index}
			tabIndex={0}
			role="group"
			aria-label={label}
			className={cn("relative z-10 rounded-lg px-3 py-2.5 outline-none", className)}>
			{children}
		</div>
	);
}

function getContentIcon(type: Content["type"]): LucideIcon {
	if (type === "media") return ImageIcon;
	if (type === "audio") return Play;
	if (type === "link") return Globe;
	if (type === "todo") return ListChecks;
	return FileText;
}

export function ViewerDetails({
	item,
	contentTypeLabel,
	title,
	createdLabel,
	updatedLabel,
	readingTime,
	authorLabel,
	artistLabel,
	tagsLabel,
	addTagPlaceholder,
	onAddTag,
	onRemoveTag,
	additionalTagAction,
	onTagNavigate,
	tagColors,
	suggestions,
}: ViewerDetailsProps) {
	const Icon = getContentIcon(item.type);
	const metadata = [createdLabel, readingTime, updatedLabel, authorLabel, artistLabel].filter(
		(value): value is string => Boolean(value)
	);

	return (
		<motion.div
			initial={{ opacity: 0, y: 8, scale: 0.98 }}
			animate={{ opacity: 1, y: 0, scale: 1 }}
			exit={{ opacity: 0, y: 8, scale: 0.98 }}
			transition={{ type: "spring", duration: 0.16, bounce: 0 }}
			className="absolute right-6 bottom-20 z-20 w-[min(360px,calc(100vw-48px))] origin-bottom-right text-foreground">
			<Dropdown
				aria-label="Content details"
				className="w-full border border-border/80 bg-background/95 p-1.5 shadow-xl shadow-black/15 backdrop-blur-md">
				<DetailsSection index={0} label={contentTypeLabel}>
					<div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
						<Icon className="size-3.5" />
						<span>{contentTypeLabel}</span>
					</div>
					<p className="mt-1.5 line-clamp-2 text-sm leading-5 font-semibold text-foreground">{title}</p>
				</DetailsSection>

				<DetailsSection index={1} label="Metadata">
					<div className="flex items-start gap-2 text-xs leading-5 text-muted-foreground">
						<Calendar className="mt-0.5 size-3.5 shrink-0" />
						<div className="min-w-0 space-y-0.5">
							{metadata.map((value) => (
								<p key={value}>{value}</p>
							))}
						</div>
					</div>
				</DetailsSection>

				<DetailsSection index={2} label={tagsLabel}>
					<div className="mb-2 flex items-center gap-2 text-[11px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
						<Tag className="size-3.5" />
						{tagsLabel}
					</div>
					<TagManager
						tags={item.tags}
						tagIds={item.tag_ids}
						onAddTag={onAddTag}
						onRemoveTag={onRemoveTag}
						inputPlaceholder={addTagPlaceholder}
						additionalAction={additionalTagAction}
						onTagNavigate={onTagNavigate}
						tagColors={tagColors}
						suggestions={suggestions}
					/>
				</DetailsSection>
			</Dropdown>
		</motion.div>
	);
}
