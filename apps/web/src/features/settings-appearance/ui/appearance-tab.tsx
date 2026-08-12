import { AppearanceSettingsPanel } from "@synapse/features";
import { useTheme } from "next-themes";

import { useUserPreferences } from "@/shared/lib/user-preferences-context";

/** Web binds browser theme and persisted preferences to the common visual. */
export default function AppearanceTab() {
	const { theme, setTheme } = useTheme();
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
		/>
	);
}
