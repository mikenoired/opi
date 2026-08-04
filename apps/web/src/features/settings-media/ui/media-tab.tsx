import { formatSize } from "@synapse/shared/formatting";
import { Switch } from "@synapse/ui/components";
import { HardDrive, PlayCircle } from "lucide-react";

import { api } from "@/shared/api/hooks";
import { useI18n } from "@/shared/lib/i18n";
import { useUserPreferences } from "@/shared/lib/user-preferences-context";

function StorageMetric({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex items-center justify-between gap-3 text-sm">
			<span className="text-muted-foreground">{label}</span>
			<span className="font-medium text-foreground">{value}</span>
		</div>
	);
}

function AutoplayPreference({
	disabled,
	enabled,
	onToggle,
}: {
	disabled: boolean;
	enabled: boolean;
	onToggle: () => void;
}) {
	const { t } = useI18n();

	return (
		<div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
			<div className="min-w-0 space-y-1.5">
				<div className="inline-flex items-center gap-2 text-sm font-medium text-foreground">
					<PlayCircle className="size-4 text-muted-foreground" />
					{t("autoplay.title")}
				</div>
				<p className="max-w-md text-sm leading-5 text-muted-foreground">{t("autoplay.description")}</p>
			</div>
			<Switch
				aria-label={t("autoplay.title")}
				disabled={disabled}
				onToggle={onToggle}
				checked={enabled}
				className="self-start sm:self-center"
			/>
		</div>
	);
}

export default function MediaTab() {
	const { data: storageUsage } = api.user.getStorageUsage.useQuery();
	const { isReady, mediaAutoplayEnabled, setMediaAutoplayEnabled } = useUserPreferences();
	const { locale, t } = useI18n();
	const { fileSize, files } = storageUsage || { fileSize: 0, files: 0 };

	const usedSpaceBytes = fileSize || 0;
	const totalFiles = files || 0;

	return (
		<div className="space-y-4 py-1">
			<div className="rounded-2xl bg-muted p-4">
				<div className="mb-5 inline-flex items-center gap-2 rounded-full bg-background px-3 py-1.5 text-sm text-foreground">
					<HardDrive className="size-4 text-muted-foreground" />
					<span>{t("storage.local")}</span>
				</div>

				<div className="space-y-3">
					<StorageMetric label={t("storage.used")} value={formatSize(usedSpaceBytes, { locale })} />
					<StorageMetric label={t("files")} value={totalFiles.toLocaleString(locale)} />
				</div>
			</div>

			<AutoplayPreference
				disabled={!isReady}
				enabled={mediaAutoplayEnabled}
				onToggle={() => setMediaAutoplayEnabled(!mediaAutoplayEnabled)}
			/>
		</div>
	);
}
