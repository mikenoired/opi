import { SettingsModalShell } from "@monolyth/features/app-shell";
import { useI18n } from "@monolyth/i18n";

import AiTab from "@/features/settings-ai/ui/ai-tab";
import AppearanceTab from "@/features/settings-appearance/ui/appearance-tab";
import GeneralTab from "@/features/settings-general/ui/general-tab";
import MediaTab from "@/features/settings-media/ui/media-tab";
import type { SettingsTabKey } from "@/features/settings/model/settings-tabs";
import { usePathname, useSearchParams } from "@/shared/router/navigation";

import { SettingsModalNav } from "./settings-modal-nav";

interface SettingsModalProps {
	activeTab: SettingsTabKey;
	closeHref: string;
	open: boolean;
	onClose: () => void;
}

const tabComponentMap = {
	general: GeneralTab,
	appearance: AppearanceTab,
	media: MediaTab,
	ai: AiTab,
};

/** Routing is Web-owned; the visual dialog and all its interaction behavior are shared. */
export function SettingsModal({ activeTab, closeHref: _closeHref, open, onClose }: SettingsModalProps) {
	const ActiveTab = tabComponentMap[activeTab];
	const pathname = usePathname();
	const searchParams = useSearchParams();
	const { t } = useI18n();

	return (
		<SettingsModalShell
			activeKey={activeTab}
			open={open}
			onClose={onClose}
			title={t("settings.title")}
			navigation={
				<SettingsModalNav activeTab={activeTab} pathname={pathname} search={searchParams.toString()} />
			}>
			<ActiveTab />
		</SettingsModalShell>
	);
}
