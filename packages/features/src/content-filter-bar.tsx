import type { Content } from "@synapse/shared/schemas";
import { cn } from "@synapse/ui/cn";
import { FileText, FileUp, Image, Link, ListChecks, Music2, X } from "lucide-react";
import { type ChangeEvent, type FocusEvent, useEffect, useRef, useState } from "react";

const options = [
	{ icon: FileText, type: "note" },
	{ icon: Image, type: "media" },
	{ icon: Music2, type: "audio" },
	{ icon: Link, type: "link" },
	{ icon: ListChecks, type: "todo" },
	{ icon: FileUp, type: "doc" },
] as const satisfies Array<{ icon: typeof FileText; type: Content["type"] }>;

export interface ContentFilterBarProps {
	availableTypes: Content["type"][];
	labels: {
		aria: string;
		clear: string;
		placeholder: string;
		types: Partial<Record<Content["type"], string>>;
	};
	onClearContentTypes(): void;
	onRegisterSearchFocus?(focus: () => void): void;
	onToggleContentType(type: Content["type"]): void;
	searchQuery: string;
	selectedContentTypes: Content["type"][];
	setSearchQuery(query: string): void;
}

/** Canonical search/filter visual shared by every renderer. */
export function ContentFilterBar({
	availableTypes,
	labels,
	onClearContentTypes,
	onRegisterSearchFocus,
	onToggleContentType,
	searchQuery,
	selectedContentTypes,
	setSearchQuery,
}: ContentFilterBarProps) {
	const searchInputRef = useRef<HTMLInputElement>(null);
	const [filtersOpen, setFiltersOpen] = useState(false);
	const available = options.filter((option) =>
		option.type === "doc"
			? ["doc", "pdf", "docx", "epub", "xlsx", "csv"].some((type) =>
					availableTypes.includes(type as Content["type"])
				)
			: availableTypes.includes(option.type)
	);
	useEffect(() => {
		onRegisterSearchFocus?.(() => searchInputRef.current?.focus());
	}, [onRegisterSearchFocus]);
	const handleBlur = (event: FocusEvent<HTMLDivElement>) => {
		if (!event.currentTarget.contains(event.relatedTarget)) setFiltersOpen(false);
	};
	return (
		<div
			className="sticky top-0 z-10 space-y-2 bg-background"
			onMouseEnter={() => setFiltersOpen(true)}
			onMouseLeave={() => setFiltersOpen(false)}
			onFocus={() => setFiltersOpen(true)}
			onBlur={handleBlur}>
			<div className="relative mb-0 border border-transparent border-b-border transition-[border-color,box-shadow] duration-150 focus-within:border-ring focus-within:shadow-[0_0_0_3px_color-mix(in_oklch,var(--ring)_18%,transparent)]">
				<input
					data-testid="content-search"
					ref={searchInputRef}
					id="search"
					type="text"
					placeholder={labels.placeholder}
					aria-label={labels.aria}
					value={searchQuery}
					autoFocus
					onChange={(event: ChangeEvent<HTMLInputElement>) => setSearchQuery(event.target.value)}
					className="w-full rounded-[inherit] bg-muted/50 px-4 py-3 pr-16 text-lg outline-none placeholder:text-muted-foreground sm:text-2xl"
				/>
			</div>
			<div
				className={cn(
					"grid transition-all duration-200 ease-out",
					filtersOpen && available.length > 0 ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
				)}>
				<div className="overflow-hidden">
					<div className="flex items-center gap-2 overflow-x-auto bg-muted/50 px-4 py-2">
						{available.map(({ icon: Icon, type }) => {
							const selected = selectedContentTypes.includes(type);
							return (
								<button
									key={type}
									type="button"
									aria-pressed={selected}
									onClick={() => onToggleContentType(type)}
									className={cn(
										"flex h-9 shrink-0 items-center gap-2 rounded-full border px-3 text-sm font-medium transition-all duration-150 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
										selected
											? "border-primary/50 bg-primary/10 text-primary"
											: "border-border bg-background text-muted-foreground hover:border-foreground/20 hover:bg-muted hover:text-foreground"
									)}>
									<Icon className="size-4" />
									<span>{labels.types[type] ?? type}</span>
								</button>
							);
						})}
						{selectedContentTypes.length > 0 && (
							<button
								type="button"
								onClick={onClearContentTypes}
								className="animate-in fade-in-0 slide-in-from-left-2 flex h-9 shrink-0 items-center gap-2 rounded-full border border-destructive/20 bg-destructive/10 px-3 text-sm font-medium text-destructive duration-200 hover:bg-destructive/15 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
								<X className="size-4" />
								<span>{labels.clear}</span>
							</button>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}
