import { MediaSettingsPanel } from "@synapse/features";

import { api } from "@/shared/api/hooks";
import { useUserPreferences } from "@/shared/lib/user-preferences-context";

/** Web provides state and persistence; the settings visual is shared. */
export default function MediaTab() {
	const { data: storageUsage } = api.user.getStorageUsage.useQuery();
	const { isReady, mediaAutoplayEnabled, setMediaAutoplayEnabled } = useUserPreferences();
	return (
		<MediaSettingsPanel
			autoplayEnabled={mediaAutoplayEnabled}
			disabled={!isReady}
			files={storageUsage?.files ?? 0}
			onAutoplayChange={setMediaAutoplayEnabled}
			storageBytes={storageUsage?.fileSize ?? 0}
		/>
	);
}
