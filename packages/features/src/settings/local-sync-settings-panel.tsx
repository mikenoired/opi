import { useI18n } from "@synapse/i18n";
import { Button, Switch } from "@synapse/ui/components";
import { RefreshCw } from "lucide-react";
import { useState } from "react";

import { ConfirmDialog } from "../dialogs/confirm-dialog";

export interface LocalSyncSettingsPanelProps {
	isSyncing?: boolean;
	onSync(): Promise<void>;
	onSyncPolicyChange(value: "automatic" | "manual"): Promise<void> | void;
	session?: { eligible: boolean; email: string; plan: string };
	statistics?: {
		conflictCount?: number;
		itemCount: number;
		localBytes: number;
		pendingSyncCount: number;
		tagCount: number;
	};
	syncPolicy: "automatic" | "manual";
	progress?: { completed: number; phase: "download" | "upload" | "finalizing"; total: number };
}

/** Shared Desktop extension visual. It receives only declared settings and service callbacks. */
export function LocalSyncSettingsPanel({
	isSyncing,
	onSync,
	onSyncPolicyChange,
	session,
	syncPolicy,
	progress,
}: LocalSyncSettingsPanelProps) {
	const { t } = useI18n();
	const [confirmAutomatic, setConfirmAutomatic] = useState(false);
	const automatic = syncPolicy === "automatic";
	return (
		<section className="space-y-4">
			<h2 className="text-xl font-semibold tracking-tight">Synapse Sync</h2>
			<div className="flex items-center justify-between gap-4 rounded-xl border p-4">
				<div>
					<p className="font-medium">Автоматическая синхронизация</p>
					<p className="mt-1 text-sm text-muted-foreground">
						Синхронизировать изменения на устройствах автоматически.
					</p>
				</div>
				<Switch
					aria-label="Автоматическая синхронизация"
					checked={automatic}
					disabled={isSyncing || !session?.eligible}
					onToggle={() => (automatic ? void onSyncPolicyChange("manual") : setConfirmAutomatic(true))}
				/>
			</div>
			<div className="space-y-3">
				<p className="text-sm text-muted-foreground">
					{session?.eligible ? t("sync.withPlan", { plan: session.plan }) : t("sync.unavailable")}
				</p>
				{!automatic && (
					<Button
						leadingIcon={RefreshCw}
						disabled={!session?.eligible || isSyncing}
						onClick={() => void onSync()}>
						{isSyncing ? t("sync.syncing") : t("sync.sync")}
					</Button>
				)}
				{isSyncing && progress && (
					<div aria-live="polite" className="space-y-1.5">
						<div className="flex justify-between text-xs text-muted-foreground">
							<span>
								{progress.phase === "download"
									? "Получаем изменения"
									: progress.phase === "upload"
										? "Передаём материалы"
										: "Завершаем синхронизацию"}
							</span>
							<span>
								{progress.completed} / {progress.total}
							</span>
						</div>
						<div className="h-1.5 overflow-hidden rounded-full bg-muted">
							<div
								className="h-full rounded-full bg-primary transition-[width] duration-300"
								style={{ width: `${Math.round((progress.completed / Math.max(progress.total, 1)) * 100)}%` }}
							/>
						</div>
					</div>
				)}
			</div>
			<ConfirmDialog
				cancelText="Отмена"
				confirmText="Включить и синхронизировать"
				description="Будет выполнена начальная синхронизация материалов между этим устройством и Synapse."
				onConfirm={async () => {
					await onSyncPolicyChange("automatic");
					await onSync();
				}}
				onOpenChange={setConfirmAutomatic}
				open={confirmAutomatic}
				title="Включить автоматическую синхронизацию?"
			/>
		</section>
	);
}
