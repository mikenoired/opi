import { Button } from "@synapse/ui/components";
import { Info, X, type LucideIcon } from "lucide-react";

import { BaseModal } from "./base-modal";

export interface ConfirmDialogProps {
	cancelText?: string;
	confirmText?: string;
	description?: string;
	icon?: LucideIcon;
	loading?: boolean;
	onCancel?(): void;
	onConfirm(): void | Promise<void>;
	onOpenChange(open: boolean): void;
	open: boolean;
	testId?: string;
	title: string;
	variant?: "tertiary" | "primary" | "secondary" | "ghost";
}

/** Shared confirmation visual. Only the callback decides what is being confirmed. */
export function ConfirmDialog({
	cancelText = "Cancel",
	confirmText = "Confirm",
	description,
	icon: Icon = Info,
	loading = false,
	onCancel,
	onConfirm,
	onOpenChange,
	open,
	testId,
	title,
}: ConfirmDialogProps) {
	const cancel = () => {
		onCancel?.();
		onOpenChange(false);
	};
	const confirm = async () => {
		await onConfirm();
		onOpenChange(false);
	};
	return (
		<BaseModal
			open={open}
			onOpenChange={onOpenChange}
			size="sm"
			closeOnOverlayClick={!loading}
			closeOnEscape={!loading}>
			<div className="p-6" data-testid={testId}>
				<div className="flex items-start gap-4">
					<div className="rounded-full bg-muted/50 p-3 text-primary">
						<Icon className="size-6" />
					</div>
					<div className="min-w-0 flex-1">
						<h2 className="mb-2 text-xl font-semibold text-foreground">{title}</h2>
						{description && <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>}
					</div>
					{!loading && (
						<button
							type="button"
							onClick={cancel}
							className="rounded p-1 transition-colors hover:bg-muted"
							aria-label={cancelText}>
							<X className="size-5 text-muted-foreground" />
						</button>
					)}
				</div>
				<div className="mt-6 flex items-center justify-end gap-3">
					<Button variant="tertiary" onClick={cancel} disabled={loading}>
						{cancelText}
					</Button>
					<Button
						data-testid={testId ? `${testId}-confirm` : undefined}
						variant="primary"
						onClick={() => void confirm()}
						disabled={loading}>
						{loading ? "Loading…" : confirmText}
					</Button>
				</div>
			</div>
		</BaseModal>
	);
}
