import { MediaSettingsPanel } from "@synapse/features";

import { api } from "@/shared/api/hooks";
import { useI18n } from "@/shared/lib/i18n";
import { useUserPreferences } from "@/shared/lib/user-preferences-context";

/** Web provides state and persistence; the settings visual is shared. */
export default function MediaTab() {
	const { data: storageUsage } = api.user.getStorageUsage.useQuery();
	const { isReady, mediaAutoplayEnabled, setMediaAutoplayEnabled } = useUserPreferences();
	const { locale, t } = useI18n();
	return (
		<MediaSettingsPanel
			autoplayEnabled={mediaAutoplayEnabled}
			disabled={!isReady}
			files={storageUsage?.files ?? 0}
			locale={locale}
			onAutoplayChange={setMediaAutoplayEnabled}
			storageBytes={storageUsage?.fileSize ?? 0}
			strings={{
				autoplayDescription: t("autoplay.description"),
				autoplayTitle: t("autoplay.title"),
				files: t("files"),
				storageLabel: t("storage.local"),
				storageUsed: t("storage.used"),
			}}
		/>
	);
}
