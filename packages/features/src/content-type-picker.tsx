import type { Content } from "@synapse/shared/schemas";
import { cn } from "@synapse/ui/cn";
import { Button } from "@synapse/ui/components";
import {
	ArrowLeft,
	FileText,
	FileUp,
	Image as ImageIcon,
	Link,
	ListChecks,
	Maximize,
	Minimize,
	Music2,
} from "lucide-react";

export type ContentTypePickerIcon = "audio" | "document" | "link" | "media" | "note" | "todo";

export interface ContentTypePickerOption {
	description: string;
	icon: ContentTypePickerIcon;
	key: Content["type"];
	label: string;
}

export interface ContentTypePickerStrings {
	description: string;
	eyebrow: string;
	fullScreen: string;
	suitable: string;
	title: string;
	windowed: string;
}

export interface ContentTypePickerProps {
	onSelect(type: Content["type"]): void;
	options: ContentTypePickerOption[];
	suggestedType?: Content["type"] | null;
	strings: Pick<ContentTypePickerStrings, "description" | "eyebrow" | "suitable" | "title">;
}

export interface ContentTypeHeaderProps {
	isFullScreen: boolean;
	onBack(): void;
	onToggleFullScreen(): void;
	options: ContentTypePickerOption[];
	strings: Pick<ContentTypePickerStrings, "fullScreen" | "windowed">;
	type: Content["type"];
}

/** Shared type selection and header visuals for every content creation flow. */
export function ContentTypePicker({ onSelect, options, suggestedType, strings }: ContentTypePickerProps) {
	return (
		<div className="flex flex-col gap-6 p-6 sm:p-7">
			<div className="space-y-2">
				<p className="text-sm font-medium text-muted-foreground">{strings.eyebrow}</p>
				<h2 className="text-2xl font-semibold text-foreground">{strings.title}</h2>
				<p className="max-w-xl text-sm leading-6 text-muted-foreground">{strings.description}</p>
			</div>
			<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
				{options.map((option) => {
					const Icon = iconFor(option.icon);
					const isSuggested = suggestedType === option.key;
					return (
						<button
							className={cn(
								"group rounded-2xl border border-border bg-card p-4 text-left transition-colors duration-150 hover:border-foreground/20 hover:bg-accent/40",
								isSuggested && "border-primary/40 bg-primary/5"
							)}
							key={option.key}
							onClick={() => onSelect(option.key)}
							type="button">
							<div className="flex items-start justify-between gap-3">
								<div className="flex size-10 items-center justify-center rounded-xl bg-muted text-foreground transition-colors group-hover:bg-background">
									<Icon className="size-4.5" />
								</div>
								{isSuggested && (
									<span className="rounded-full bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
										{strings.suitable}
									</span>
								)}
							</div>
							<div className="mt-4 space-y-1">
								<h3 className="text-base font-medium text-foreground">{option.label}</h3>
								<p className="text-sm leading-6 text-muted-foreground">{option.description}</p>
							</div>
						</button>
					);
				})}
			</div>
		</div>
	);
}

export function ContentTypeHeader({
	isFullScreen,
	onBack,
	onToggleFullScreen,
	options,
	strings,
	type,
}: ContentTypeHeaderProps) {
	const option = options.find((entry) => entry.key === type) ?? options[0];
	if (!option) return null;
	const Icon = iconFor(option.icon);
	return (
		<div className="flex items-center justify-between border-b border-border px-5 py-4 sm:px-6">
			<div className="flex min-w-0 items-center gap-3">
				<Button className="h-9 w-9 p-0" onClick={onBack} size="sm" variant="ghost">
					<ArrowLeft className="size-4" />
				</Button>
				<div className="flex min-w-0 items-center gap-3">
					<div className="flex size-9 items-center justify-center rounded-xl bg-muted text-foreground">
						<Icon className="size-4" />
					</div>
					<div className="min-w-0">
						<p className="text-sm font-medium text-foreground">{option.label}</p>
						<p className="truncate text-xs text-muted-foreground">{option.description}</p>
					</div>
				</div>
			</div>
			{type === "note" && (
				<Button
					className="h-9 gap-2 px-3 text-muted-foreground"
					leadingIcon={isFullScreen ? Minimize : Maximize}
					onClick={onToggleFullScreen}
					size="sm"
					variant="tertiary">
					<span className="hidden sm:inline">{isFullScreen ? strings.windowed : strings.fullScreen}</span>
				</Button>
			)}
		</div>
	);
}

function iconFor(icon: ContentTypePickerIcon) {
	return { audio: Music2, document: FileUp, link: Link, media: ImageIcon, note: FileText, todo: ListChecks }[
		icon
	];
}
