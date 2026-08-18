import { FileText, Plus } from "lucide-react";

/** Shared empty-library state. The action remains platform-owned. */
export function ContentEmptyState({
	actionLabel,
	description,
	onAction,
	title,
}: {
	actionLabel: string;
	description: string;
	onAction: () => void;
	title: string;
}) {
	return (
		<div className="flex h-full flex-col items-center justify-center py-12 text-center">
			<div className="w-full max-w-md space-y-4 p-8">
				<FileText className="mx-auto h-16 w-16 text-muted-foreground opacity-50" />
				<div>
					<h3 className="mb-2 text-xl font-semibold">{title}</h3>
					<p className="mb-6 text-muted-foreground">{description}</p>
					<button
						type="button"
						onClick={onAction}
						className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90">
						<Plus className="size-4" />
						{actionLabel}
					</button>
				</div>
			</div>
		</div>
	);
}
