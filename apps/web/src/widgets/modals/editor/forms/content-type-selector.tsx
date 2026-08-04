import type { Content } from "@synapse/shared/schemas";
import { cn } from "@synapse/ui/cn";
import { Button } from "@synapse/ui/components";
import { ArrowLeft, Maximize, Minimize } from "lucide-react";

import { contentTypeOptions, getContentTypeMeta } from "@/shared/lib/content-type-options";
import { useI18n } from "@/shared/lib/i18n";

interface ContentTypePickerProps {
	onSelect: (type: Content["type"]) => void;
	suggestedType?: Content["type"] | null;
}

export function ContentTypePicker({ onSelect, suggestedType }: ContentTypePickerProps) {
	const { t } = useI18n();

	return (
		<div className="flex flex-col gap-6 p-6 sm:p-7">
			<div className="space-y-2">
				<p className="text-sm font-medium text-muted-foreground">{t("addContent.eyebrow")}</p>
				<h2 className="text-2xl font-semibold text-foreground">{t("addContent.title")}</h2>
				<p className="max-w-xl text-sm leading-6 text-muted-foreground">{t("addContent.description")}</p>
			</div>

			<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
				{contentTypeOptions.map(({ key, icon: Icon, label, labelKey, description, descriptionKey }) => {
					const isSuggested = suggestedType === key;

					return (
						<button
							key={key}
							type="button"
							onClick={() => onSelect(key)}
							className={cn(
								"group rounded-2xl border border-border bg-card p-4 text-left transition-colors duration-150 hover:border-foreground/20 hover:bg-accent/40",
								isSuggested && "border-primary/40 bg-primary/5"
							)}>
							<div className="flex items-start justify-between gap-3">
								<div className="flex size-10 items-center justify-center rounded-xl bg-muted text-foreground transition-colors group-hover:bg-background">
									<Icon className="size-4.5" />
								</div>
								{isSuggested && (
									<span className="rounded-full bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
										{t("suitable")}
									</span>
								)}
							</div>
							<div className="mt-4 space-y-1">
								<h3 className="text-base font-medium text-foreground">{t(labelKey) || label}</h3>
								<p className="text-sm leading-6 text-muted-foreground">{t(descriptionKey) || description}</p>
							</div>
						</button>
					);
				})}
			</div>
		</div>
	);
}

interface ContentTypeHeaderProps {
	type: Content["type"];
	onBack: () => void;
	isFullScreen: boolean;
	onToggleFullScreen: () => void;
}

export function ContentTypeHeader({
	type,
	onBack,
	isFullScreen,
	onToggleFullScreen,
}: ContentTypeHeaderProps) {
	const meta = getContentTypeMeta(type);
	const Icon = meta.icon;
	const { t } = useI18n();

	return (
		<div className="flex items-center justify-between border-b border-border px-5 py-4 sm:px-6">
			<div className="flex min-w-0 items-center gap-3">
				<Button variant="ghost" size="sm" onClick={onBack} className="h-9 w-9 p-0">
					<ArrowLeft className="size-4" />
				</Button>
				<div className="flex min-w-0 items-center gap-3">
					<div className="flex size-9 items-center justify-center rounded-xl bg-muted text-foreground">
						<Icon className="size-4" />
					</div>
					<div className="min-w-0">
						<p className="text-sm font-medium text-foreground">{t(meta.labelKey) || meta.label}</p>
						<p className="truncate text-xs text-muted-foreground">
							{t(meta.descriptionKey) || meta.description}
						</p>
					</div>
				</div>
			</div>

			{type === "note" && (
				<Button
					variant="tertiary"
					size="sm"
					onClick={onToggleFullScreen}
					leadingIcon={isFullScreen ? Minimize : Maximize}
					className="h-9 gap-2 px-3 text-muted-foreground">
					<span className="hidden sm:inline">{isFullScreen ? t("view.windowed") : t("view.fullscreen")}</span>
				</Button>
			)}
		</div>
	);
}
