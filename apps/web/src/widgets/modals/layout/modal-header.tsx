import { cn } from "@monolyth/ui/cn";
import { Button } from "@monolyth/ui/components";
import type { LucideIcon } from "lucide-react";
import { X } from "lucide-react";
import type { ReactNode } from "react";

import { ContentTag } from "@/shared/ui/content-tag";
import { modalSpacing, modalTypography } from "@/shared/ui/design-tokens";

interface ModalHeaderProps {
	children: ReactNode;
	className?: string;
	sticky?: boolean;
	bordered?: boolean;
}

export function ModalHeader({ children, className, sticky = true, bordered = true }: ModalHeaderProps) {
	return (
		<div
			className={cn(
				"shrink-0 bg-background/95 backdrop-blur",
				sticky && "sticky top-0 z-20",
				bordered && "border-b border-border",
				className
			)}
			style={{ padding: modalSpacing.headerPadding.desktop }}>
			{children}
		</div>
	);
}

interface ModalHeaderMetaProps {
	icon?: LucideIcon;
	type?: string;
	className?: string;
}

function ModalHeaderMeta({ icon: Icon, type, className }: ModalHeaderMetaProps) {
	return (
		<div className={cn("flex items-center gap-2", modalTypography.meta, className)}>
			{Icon && <Icon className="size-4" />}
			{type && <span className="leading-none">{type}</span>}
		</div>
	);
}

interface ModalHeaderTitleProps {
	children: ReactNode;
	className?: string;
}

function ModalHeaderTitle({ children, className }: ModalHeaderTitleProps) {
	return <h1 className={cn(modalTypography.title.desktop, "text-foreground", className)}>{children}</h1>;
}

interface ModalHeaderInfoProps {
	createdAt?: string;
	updatedAt?: string;
	readingTime?: string;
	className?: string;
}

function ModalHeaderInfo({ createdAt, updatedAt, readingTime, className }: ModalHeaderInfoProps) {
	const formatDate = (dateString: string) => {
		return new Date(dateString).toLocaleDateString("ru-RU", {
			year: "numeric",
			month: "short",
			day: "numeric",
			hour: "2-digit",
			minute: "2-digit",
		});
	};

	return (
		<div className={cn("flex flex-wrap items-center gap-4", modalTypography.caption, className)}>
			{createdAt && <span>Создано: {formatDate(createdAt)}</span>}
			{updatedAt && createdAt !== updatedAt && <span>Обновлено: {formatDate(updatedAt)}</span>}
			{readingTime && <span>{readingTime}</span>}
		</div>
	);
}

interface ModalHeaderTagsProps {
	tags: string[];
	tagIds?: string[];
	className?: string;
}

function ModalHeaderTags({ tags, tagIds, className }: ModalHeaderTagsProps) {
	if (tags.length === 0) return null;

	return (
		<div className={cn("flex flex-wrap gap-1", className)}>
			{tags.map((tag, tagIndex) => (
				<ContentTag
					key={tag}
					tag={tag}
					tagId={tagIds?.[tagIndex]}
					className="bg-muted/60 px-2 py-1 text-xs hover:bg-muted"
				/>
			))}
		</div>
	);
}

interface ModalHeaderActionsProps {
	onClose?: () => void;
	children?: ReactNode;
	className?: string;
}

function ModalHeaderActions({ onClose, children, className }: ModalHeaderActionsProps) {
	return (
		<div className={cn("flex items-center gap-2", className)}>
			{children}
			{onClose && (
				<Button variant="ghost" size="sm" onClick={onClose} className="h-8 w-8 p-0">
					<X className="h-4 w-4" />
				</Button>
			)}
		</div>
	);
}

ModalHeader.Meta = ModalHeaderMeta;
ModalHeader.Title = ModalHeaderTitle;
ModalHeader.Info = ModalHeaderInfo;
ModalHeader.Tags = ModalHeaderTags;
ModalHeader.Actions = ModalHeaderActions;
