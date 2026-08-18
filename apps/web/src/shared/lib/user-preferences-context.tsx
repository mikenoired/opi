import {
	DEFAULT_USER_PREFERENCES,
	isColorPalette,
	type ColorPalette,
	type InterfaceLanguage,
	type UserPreferences,
	type UserPreferencesInput,
	normalizeUserPreferences,
} from "@monolyth/shared/preferences";
import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";

import { api } from "@/shared/api/hooks";
import { useAuth } from "@/shared/lib/auth-context";

interface UserPreferencesContextValue extends UserPreferences {
	isReady: boolean;
	setAutoTagColorEnabled: (value: boolean) => void;
	setColorPalette: (value: ColorPalette) => void;
	setInterfaceLanguage: (value: InterfaceLanguage) => void;
	setMediaAutoplayEnabled: (value: boolean) => void;
	setNoteSparklesEnabled: (value: boolean) => void;
}

const UserPreferencesContext = createContext<UserPreferencesContextValue | undefined>(undefined);
const languageStorageKey = "monolyth-interface-language";
const paletteStorageKey = "monolyth-color-palette";
const preferencesSaveDelay = 750;

function getStoredInterfaceLanguage(): InterfaceLanguage {
	if (typeof window === "undefined") return DEFAULT_USER_PREFERENCES.interfaceLanguage;
	const storedLanguage = window.localStorage.getItem(languageStorageKey);
	return storedLanguage === "en" || storedLanguage === "ru"
		? storedLanguage
		: DEFAULT_USER_PREFERENCES.interfaceLanguage;
}

function getStoredColorPalette(): ColorPalette {
	if (typeof window === "undefined") return DEFAULT_USER_PREFERENCES.colorPalette;
	const storedPalette = window.localStorage.getItem(paletteStorageKey);
	return isColorPalette(storedPalette) ? storedPalette : DEFAULT_USER_PREFERENCES.colorPalette;
}

function getGuestPreferences(): UserPreferences {
	return normalizeUserPreferences({
		...DEFAULT_USER_PREFERENCES,
		colorPalette: getStoredColorPalette(),
		interfaceLanguage: getStoredInterfaceLanguage(),
	});
}

export function UserPreferencesProvider({ children }: { children: ReactNode }) {
	const utils = api.useUtils();
	const { user } = useAuth();
	const [isReady, setIsReady] = useState(false);
	const [preferences, setPreferences] = useState<UserPreferences>(DEFAULT_USER_PREFERENCES);
	const preferencesRef = useRef(preferences);
	const saveTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

	const preferencesQuery = api.user.getPreferences.useQuery(undefined, {
		enabled: Boolean(user),
		retry: false,
		staleTime: Number.POSITIVE_INFINITY,
		refetchOnWindowFocus: false,
	});
	const updatePreferencesMutation = api.user.updatePreferences.useMutation({ retry: false });

	const applyPreferences = useCallback((nextPreferences: UserPreferences) => {
		if (JSON.stringify(preferencesRef.current) === JSON.stringify(nextPreferences)) return;
		preferencesRef.current = nextPreferences;
		setPreferences(nextPreferences);
	}, []);

	useEffect(() => {
		if (!user) {
			applyPreferences(getGuestPreferences());
			setIsReady(true);
			return;
		}

		if (preferencesQuery.data) {
			applyPreferences(normalizeUserPreferences(preferencesQuery.data));
			setIsReady(true);
			return;
		}

		if (preferencesQuery.error) {
			applyPreferences(getGuestPreferences());
			setIsReady(true);
			return;
		}

		setIsReady(false);
	}, [applyPreferences, preferencesQuery.data, preferencesQuery.error, user]);

	useEffect(() => {
		document.documentElement.lang = preferences.interfaceLanguage;
		window.localStorage.setItem(languageStorageKey, preferences.interfaceLanguage);
	}, [preferences.interfaceLanguage]);

	useEffect(() => {
		document.documentElement.dataset.palette = preferences.colorPalette;
		window.localStorage.setItem(paletteStorageKey, preferences.colorPalette);
	}, [preferences.colorPalette]);

	useEffect(
		() => () => {
			if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
		},
		[]
	);

	const scheduleSave = useCallback(() => {
		if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

		saveTimerRef.current = setTimeout(() => {
			saveTimerRef.current = undefined;
			const preferencesToSave = preferencesRef.current;

			updatePreferencesMutation.mutate(preferencesToSave, {
				onError: () => {
					// The interface stays optimistic; the next user action will try again.
					utils.user.getPreferences.setData(undefined, preferencesRef.current);
					toast.error(
						preferencesRef.current.interfaceLanguage === "ru"
							? "Не удалось сохранить настройки"
							: "Failed to save preferences"
					);
				},
				onSuccess: (savedPreferences) => {
					const saved = normalizeUserPreferences(savedPreferences);
					const localChangedWhileSaving =
						JSON.stringify(preferencesRef.current) !== JSON.stringify(preferencesToSave);

					if (!localChangedWhileSaving) applyPreferences(saved);
					utils.user.getPreferences.setData(
						undefined,
						localChangedWhileSaving ? preferencesRef.current : saved
					);
				},
			});
		}, preferencesSaveDelay);
	}, [applyPreferences, updatePreferencesMutation, utils]);

	const updatePreferences = useCallback(
		(changes: UserPreferencesInput) => {
			const nextPreferences = normalizeUserPreferences({ ...preferencesRef.current, ...changes });
			applyPreferences(nextPreferences);

			if (!user) return;

			utils.user.getPreferences.setData(undefined, nextPreferences);
			scheduleSave();
		},
		[applyPreferences, scheduleSave, user, utils]
	);

	const setAutoTagColorEnabled = useCallback(
		(value: boolean) => updatePreferences({ autoTagColorEnabled: value }),
		[updatePreferences]
	);
	const setColorPalette = useCallback(
		(value: ColorPalette) => updatePreferences({ colorPalette: value }),
		[updatePreferences]
	);
	const setInterfaceLanguage = useCallback(
		(value: InterfaceLanguage) => updatePreferences({ interfaceLanguage: value }),
		[updatePreferences]
	);
	const setMediaAutoplayEnabled = useCallback(
		(value: boolean) => updatePreferences({ mediaAutoplayEnabled: value }),
		[updatePreferences]
	);
	const setNoteSparklesEnabled = useCallback(
		(value: boolean) => updatePreferences({ noteSparklesEnabled: value }),
		[updatePreferences]
	);

	const value = useMemo(
		() => ({
			...preferences,
			isReady,
			setAutoTagColorEnabled,
			setColorPalette,
			setInterfaceLanguage,
			setMediaAutoplayEnabled,
			setNoteSparklesEnabled,
		}),
		[
			isReady,
			preferences,
			setAutoTagColorEnabled,
			setColorPalette,
			setInterfaceLanguage,
			setMediaAutoplayEnabled,
			setNoteSparklesEnabled,
		]
	);

	return <UserPreferencesContext.Provider value={value}>{children}</UserPreferencesContext.Provider>;
}

export function useUserPreferences() {
	const context = useContext(UserPreferencesContext);
	if (!context) throw new Error("useUserPreferences must be used within a UserPreferencesProvider");
	return context;
}
