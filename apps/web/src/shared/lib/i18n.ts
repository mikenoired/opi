import { useCallback } from "react";

import { en, searchPlaceholders as enSearchPlaceholders } from "./locale/en";
import type { TranslationKey, TranslationMap } from "./locale/en";
import { ru, searchPlaceholders as ruSearchPlaceholders } from "./locale/ru";
import { useUserPreferences } from "./user-preferences-context";

export type { TranslationKey } from "./locale/en";

const translations: Record<"ru" | "en", TranslationMap> = { ru, en };
const localizedSearchPlaceholders = {
	ru: ruSearchPlaceholders,
	en: enSearchPlaceholders,
};

type ExtractParams<
	S extends string,
	Acc extends string = never,
> = S extends `${string}{${infer Param}}${infer Rest}`
	? Param extends string
		? ExtractParams<Rest, Acc | Param>
		: Acc
	: Acc;

type ReplacementsFor<K extends TranslationKey> = [ExtractParams<(typeof en)[K]>] extends [never]
	? undefined
	: Record<ExtractParams<(typeof en)[K]>, string | number>;

export type KeysWithoutParams = {
	[K in TranslationKey]: [ExtractParams<(typeof en)[K]>] extends [never] ? K : never;
}[TranslationKey];

export function useI18n() {
	const { interfaceLanguage } = useUserPreferences();
	const searchPlaceholder = localizedSearchPlaceholders[interfaceLanguage][0];

	const t = useCallback(
		<K extends TranslationKey>(
			key: K,
			...rest: ReplacementsFor<K> extends undefined ? [] : [ReplacementsFor<K>]
		) => {
			const replacements = rest[0];
			let value: string = translations[interfaceLanguage][key] ?? key;

			if (replacements) {
				for (const [name, replacement] of Object.entries(replacements)) {
					value = value.replaceAll(`{${name}}`, String(replacement));
				}
			}

			return value;
		},
		[interfaceLanguage]
	);

	return {
		interfaceLanguage,
		locale: interfaceLanguage === "ru" ? "ru-RU" : "en-US",
		searchPlaceholder,
		t,
	};
}
