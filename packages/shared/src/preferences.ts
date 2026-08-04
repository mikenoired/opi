export type InterfaceLanguage = "ru" | "en";
export const COLOR_PALETTES = [
	"desert",
	"twilight",
	"arctic",
	"noir",
	"forest",
	"ember",
	"slate",
	"sakura",
] as const;
export type ColorPalette = (typeof COLOR_PALETTES)[number];

export function isColorPalette(value: unknown): value is ColorPalette {
	return typeof value === "string" && (COLOR_PALETTES as readonly string[]).includes(value);
}

export interface UserPreferences {
	autoTagColorEnabled: boolean;
	colorPalette: ColorPalette;
	interfaceLanguage: InterfaceLanguage;
	mediaAutoplayEnabled: boolean;
	noteSparklesEnabled: boolean;
}

export type UserPreferencesInput = Partial<UserPreferences>;

export const DEFAULT_USER_PREFERENCES: UserPreferences = {
	autoTagColorEnabled: true,
	colorPalette: "desert",
	interfaceLanguage: "ru",
	mediaAutoplayEnabled: true,
	noteSparklesEnabled: true,
};

export function normalizeUserPreferences(preferences?: UserPreferencesInput | null): UserPreferences {
	const interfaceLanguage =
		preferences?.interfaceLanguage === "en" || preferences?.interfaceLanguage === "ru"
			? preferences.interfaceLanguage
			: DEFAULT_USER_PREFERENCES.interfaceLanguage;
	const colorPalette = isColorPalette(preferences?.colorPalette)
		? preferences.colorPalette
		: DEFAULT_USER_PREFERENCES.colorPalette;

	return {
		...DEFAULT_USER_PREFERENCES,
		...preferences,
		colorPalette,
		interfaceLanguage,
	};
}
