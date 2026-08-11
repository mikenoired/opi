import { getQueryTypesForFilter } from "@synapse/shared/content-types";
import type { Content } from "@synapse/shared/schemas";
import { FileText, FileUp, Image, Link, ListChecks, Music2, X } from "lucide-react";
import type { ComponentType } from "react";

const options: Array<{ icon: ComponentType<{ className?: string }>; label: string; type: Content["type"] }> =
	[
		{ icon: FileText, label: "Заметки", type: "note" },
		{ icon: Image, label: "Медиа", type: "media" },
		{ icon: Music2, label: "Аудио", type: "audio" },
		{ icon: Link, label: "Ссылки", type: "link" },
		{ icon: ListChecks, label: "Задачи", type: "todo" },
		{ icon: FileUp, label: "Документы", type: "doc" },
	];

export interface ContentTypeFilterProps {
	availableTypes: Content["type"][];
	className?: string;
	onClear: () => void;
	onToggle: (type: Content["type"]) => void;
	selectedTypes: Content["type"][];
}

/** Platform-neutral content-type control shared by the Web and Desktop renderers. */
export function ContentTypeFilter({
	availableTypes,
	className,
	onClear,
	onToggle,
	selectedTypes,
}: ContentTypeFilterProps) {
	const available = options.filter((option) =>
		getQueryTypesForFilter(option.type).some((type) => availableTypes.includes(type))
	);
	if (available.length === 0) return null;

	return (
		<div className={`flex items-center gap-2 overflow-x-auto ${className ?? ""}`}>
			{available.map(({ icon: Icon, label, type }) => {
				const selected = selectedTypes.includes(type);
				return (
					<button
						key={type}
						type="button"
						aria-pressed={selected}
						onClick={() => onToggle(type)}
						className={`flex h-9 shrink-0 items-center gap-2 rounded-full border px-3 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${
							selected
								? "border-primary/50 bg-primary/10 text-primary"
								: "border-border bg-background text-muted-foreground hover:border-foreground/20 hover:bg-muted hover:text-foreground"
						}`}>
						<Icon className="size-4" />
						{label}
					</button>
				);
			})}
			{selectedTypes.length > 0 && (
				<button
					type="button"
					onClick={onClear}
					className="flex h-9 shrink-0 items-center gap-2 rounded-full border border-destructive/20 bg-destructive/10 px-3 text-sm font-medium text-destructive hover:bg-destructive/15">
					<X className="size-4" />
					Сбросить
				</button>
			)}
		</div>
	);
}
