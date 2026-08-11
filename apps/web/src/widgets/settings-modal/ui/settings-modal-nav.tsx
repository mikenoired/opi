import { ConfiguredSettingsNavigation } from "@synapse/features/app-shell";
import type { SettingsTabConfig } from "@synapse/features/runtime";

import { getSettingsHref } from "@/features/settings/lib/settings-modal-url";
import { isSettingsTab, type SettingsTabKey } from "@/features/settings/model/settings-tabs";
import { webRuntime } from "@/platform/web-runtime";
import { useI18n } from "@/shared/lib/i18n";
import { useRouter } from "@/shared/router/navigation";

export function SettingsModalNav({
	activeTab,
	pathname,
	search,
}: {
	activeTab: SettingsTabKey;
	pathname: string;
	search: string;
}) {
	const router = useRouter();
	const { t } = useI18n();
	const labels: Record<SettingsTabKey, string> = {
		ai: t("aiUsage"),
		appearance: t("appearance"),
		general: t("general"),
		media: t("mediaStorage"),
	};
	const tabs: SettingsTabConfig[] = webRuntime.configuration.settings.map((tab) => ({
		...tab,
		groups: [],
		label: labels[tab.id as SettingsTabKey],
	}));
	return (
		<ConfiguredSettingsNavigation
			activeId={activeTab}
			capabilities={{ enabled: ["account", "ai", "cloud-storage", "media-import"] }}
			tabs={tabs}
			onSelect={(value) => {
				if (isSettingsTab(value))
					router.replace(getSettingsHref(pathname, new URLSearchParams(search), value), { scroll: false });
			}}
		/>
	);
}
