import { useI18n } from "@monolyth/i18n";
import { formatSize } from "@monolyth/shared/formatting";
import { Button, Switch } from "@monolyth/ui/components";
import { FolderUp, HardDrive, PlayCircle } from "lucide-react";

export interface MediaSettingsPanelProps {
	autoplayEnabled: boolean;
	disabled?: boolean;
	files: number;
	onAutoplayChange: (enabled: boolean) => void;
	onImport?(): void;
	storageBytes: number;
}

export function MediaSettingsPanel({
	autoplayEnabled,
	disabled = false,
	files,
	onAutoplayChange,
	onImport,
	storageBytes,
}: MediaSettingsPanelProps) {
	const { t, locale } = useI18n();
	return (
		<div className="space-y-4 py-1">
			<div>
				<h2 className="text-xl font-semibold tracking-tight">{t("media.title")}</h2>
				<p className="mt-1 text-sm text-muted-foreground">{t("media.description")}</p>
			</div>
			<div className="rounded-2xl bg-muted p-4">
				<div className="mb-5 inline-flex items-center gap-2 rounded-full bg-background px-3 py-1.5 text-sm text-foreground">
					<HardDrive className="size-4 text-muted-foreground" />
					<span>{t("media.storage.label")}</span>
				</div>
				<div className="space-y-3">
					<StorageMetric label={t("media.storage.used")} value={formatSize(storageBytes, { locale })} />
					<StorageMetric label={t("media.files")} value={files.toLocaleString(locale)} />
				</div>
				{onImport && t("media.import") && (
					<Button className="mt-4" onClick={onImport} variant="tertiary">
						<FolderUp className="size-4" />
						{t("media.import")}
					</Button>
				)}
			</div>
			<div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
				<div className="min-w-0 space-y-1.5">
					<div className="inline-flex items-center gap-2 text-sm font-medium text-foreground">
						<PlayCircle className="size-4 text-muted-foreground" />
						{t("media.autoplay.title")}
					</div>
					<p className="max-w-md text-sm leading-5 text-muted-foreground">
						{t("media.autoplay.description")}
					</p>
				</div>
				<Switch
					aria-label={t("media.autoplay.title")}
					checked={autoplayEnabled}
					className="self-start sm:self-center"
					disabled={disabled}
					onToggle={() => onAutoplayChange(!autoplayEnabled)}
				/>
			</div>
		</div>
	);
}

function StorageMetric({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex items-center justify-between gap-3 text-sm">
			<span className="text-muted-foreground">{label}</span>
			<span className="font-medium text-foreground">{value}</span>
		</div>
	);
}
