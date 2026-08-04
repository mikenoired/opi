import type { Content } from "@synapse/shared/schemas";
import { cn } from "@synapse/ui/cn";
import { X } from "lucide-react";
import { type ChangeEvent, type FocusEvent, useEffect, useRef, useState } from "react";

import { contentTypeOptions, isContentTypeFilterAvailable } from "@/shared/lib/content-type-options";
import { useDashboard } from "@/shared/lib/dashboard-context";
import { useI18n } from "@/shared/lib/i18n";

interface ContentFilterProps {
	searchQuery: string;
	setSearchQuery: (query: string) => void;
	availableContentTypes: Content["type"][];
	selectedContentTypes: Content["type"][];
	onClearContentTypes: () => void;
	onToggleContentType: (type: Content["type"]) => void;
}

export function ContentFilter({
	searchQuery,
	setSearchQuery,
	availableContentTypes,
	selectedContentTypes,
	onClearContentTypes,
	onToggleContentType,
}: ContentFilterProps) {
	const searchInputRef = useRef<HTMLInputElement>(null);
	const [filtersOpen, setFiltersOpen] = useState(false);
	const { setTriggerSearchFocus } = useDashboard();
	const { searchPlaceholder, t } = useI18n();
	const hasActiveTypeFilters = selectedContentTypes.length > 0;
	const availableOptions = contentTypeOptions.filter((option) =>
		isContentTypeFilterAvailable(option.key, availableContentTypes)
	);

	useEffect(() => {
		if (searchInputRef.current) setTriggerSearchFocus(() => searchInputRef.current?.focus);
	}, [setTriggerSearchFocus]);

	const handleBlur = (event: FocusEvent<HTMLDivElement>) => {
		if (!event.currentTarget.contains(event.relatedTarget)) {
			setFiltersOpen(false);
		}
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
					ref={searchInputRef}
					id="search"
					type="text"
					placeholder={searchPlaceholder}
					aria-label={t("search.aria")}
					value={searchQuery}
					autoFocus
					onChange={(e: ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
					className="w-full rounded-[inherit] bg-muted/50 px-4 py-3 pr-16 text-lg outline-none placeholder:text-muted-foreground sm:text-2xl"
				/>
			</div>

			<div
				className={cn(
					"grid transition-all duration-200 ease-out",
					filtersOpen && availableOptions.length > 0
						? "grid-rows-[1fr] opacity-100"
						: "grid-rows-[0fr] opacity-0"
				)}>
				<div className="overflow-hidden">
					<div className="flex items-center gap-2 overflow-x-auto bg-muted/50 px-4 py-2">
						{availableOptions.map(({ key, icon: Icon, label, labelKey }) => {
							const selected = selectedContentTypes.includes(key);

							return (
								<button
									key={key}
									type="button"
									aria-pressed={selected}
									onClick={() => onToggleContentType(key)}
									className={cn(
										"flex h-9 shrink-0 items-center gap-2 rounded-full border px-3 text-sm font-medium transition-all duration-150 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
										selected
											? "border-primary/50 bg-primary/10 text-primary"
											: "border-border bg-background text-muted-foreground hover:border-foreground/20 hover:bg-muted hover:text-foreground"
									)}>
									<Icon className="size-4" />
									<span>{t(labelKey) || label}</span>
								</button>
							);
						})}

						{hasActiveTypeFilters && (
							<button
								type="button"
								onClick={onClearContentTypes}
								className="flex h-9 shrink-0 animate-in items-center gap-2 rounded-full border border-destructive/20 bg-destructive/10 px-3 text-sm font-medium text-destructive duration-200 fade-in-0 slide-in-from-left-2 hover:bg-destructive/15 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
								<X className="size-4" />
								<span>{t("clearFilters")}</span>
							</button>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}
