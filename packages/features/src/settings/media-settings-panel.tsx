import { formatSize } from "@synapse/shared/formatting";
import { Button, Switch } from "@synapse/ui/components";
import { FolderUp, HardDrive, PlayCircle } from "lucide-react";

export interface MediaSettingsPanelProps {
	autoplayEnabled: boolean;
	disabled?: boolean;
	files: number;
	locale: string;
	onAutoplayChange: (enabled: boolean) => void;
	onImport?(): void;
	storageBytes: number;
	strings: {
		autoplayDescription: string;
		autoplayTitle: string;
		files: string;
		import?: string;
		storageLabel: string;
		storageUsed: string;
	};
}

/** Platform-neutral presentation of media preferences and storage usage. */
export function MediaSettingsPanel({
	autoplayEnabled,
	disabled = false,
	files,
	locale,
	onAutoplayChange,
	onImport,
	storageBytes,
	strings,
}: MediaSettingsPanelProps) {
	return (
		<div className="space-y-4 py-1">
			<div className="rounded-2xl bg-muted p-4">
				<div className="mb-5 inline-flex items-center gap-2 rounded-full bg-background px-3 py-1.5 text-sm text-foreground">
					<HardDrive className="size-4 text-muted-foreground" />
					<span>{strings.storageLabel}</span>
				</div>
				<div className="space-y-3">
					<StorageMetric label={strings.storageUsed} value={formatSize(storageBytes, { locale })} />
					<StorageMetric label={strings.files} value={files.toLocaleString(locale)} />
				</div>
				{onImport && strings.import && (
					<Button className="mt-4" onClick={onImport} variant="tertiary">
						<FolderUp className="size-4" />
						{strings.import}
					</Button>
				)}
			</div>
			<div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
				<div className="min-w-0 space-y-1.5">
					<div className="inline-flex items-center gap-2 text-sm font-medium text-foreground">
						<PlayCircle className="size-4 text-muted-foreground" />
						{strings.autoplayTitle}
					</div>
					<p className="max-w-md text-sm leading-5 text-muted-foreground">{strings.autoplayDescription}</p>
				</div>
				<Switch
					aria-label={strings.autoplayTitle}
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
