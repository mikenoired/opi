import { AppearanceSettingsPanel } from "@synapse/features";
import { useTheme } from "next-themes";

import { useI18n } from "@/shared/lib/i18n";
import { useUserPreferences } from "@/shared/lib/user-preferences-context";

/** Web binds browser theme and persisted preferences to the common visual. */
export default function AppearanceTab() {
	const { theme, setTheme } = useTheme();
	const { t } = useI18n();
	const preferences = useUserPreferences();
	return (
		<AppearanceSettingsPanel
			autoTagColorEnabled={preferences.autoTagColorEnabled}
			colorPalette={preferences.colorPalette}
			interfaceLanguage={preferences.interfaceLanguage}
			isReady={preferences.isReady}
			noteSparklesEnabled={preferences.noteSparklesEnabled}
			onAutoTagColorEnabledChange={preferences.setAutoTagColorEnabled}
			onColorPaletteChange={preferences.setColorPalette}
			onInterfaceLanguageChange={preferences.setInterfaceLanguage}
			onNoteSparklesEnabledChange={preferences.setNoteSparklesEnabled}
			onThemeChange={setTheme}
			theme={theme}
			strings={{
				autoTagColorsDescription: t("appearance.tagColors.description"),
				autoTagColorsTitle: t("appearance.tagColors.title"),
				description: t("appearance.description"),
				languageDescription: t("language.description"),
				languageEnglish: t("language.english"),
				languageRussian: t("language.russian"),
				languageTitle: t("language"),
				noteSparklesDescription: t("appearance.noteSparkles.description"),
				noteSparklesTitle: t("appearance.noteSparkles.title"),
				paletteDescription: t("appearance.palette.description"),
				paletteLabels: {
					arctic: t("appearance.palette.arctic"),
					desert: t("appearance.palette.desert"),
					ember: t("appearance.palette.ember"),
					forest: t("appearance.palette.forest"),
					noir: t("appearance.palette.noir"),
					sakura: t("appearance.palette.sakura"),
					slate: t("appearance.palette.slate"),
					twilight: t("appearance.palette.twilight"),
				},
				paletteTitle: t("appearance.palette.title"),
				themeLabels: {
					dark: t("appearance.theme.dark"),
					light: t("appearance.theme.light"),
					system: t("appearance.theme.system"),
				},
				themeTitle: t("appearance.theme.title"),
				title: t("appearance.title"),
			}}
		/>
	);
}
