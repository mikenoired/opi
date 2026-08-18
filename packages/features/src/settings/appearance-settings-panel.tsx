import { useI18n } from "@monolyth/i18n";
import type { ColorPalette, InterfaceLanguage } from "@monolyth/shared/preferences";
import { cn } from "@monolyth/ui/cn";
import { Switch } from "@monolyth/ui/components";
import {
	Circle,
	Flame,
	Flower2,
	Languages,
	Monitor,
	Moon,
	Palette,
	Snowflake,
	Sparkles,
	Sprout,
	Sun,
	Sunset,
	Waves,
} from "lucide-react";
import type { ReactNode } from "react";

import PaletteSelector from "./palette-selector";
import ThemeModeSelector from "./theme-mode-selector";

const themeOptions = [
	{ icon: Monitor, value: "system" },
	{ icon: Sun, value: "light" },
	{ icon: Moon, value: "dark" },
] as const;

const paletteOptions = [
	{ icon: Sunset, preview: "var(--palette-desert)", value: "desert" },
	{ icon: Waves, preview: "var(--palette-twilight)", value: "twilight" },
	{ icon: Snowflake, preview: "var(--palette-arctic)", value: "arctic" },
	{ icon: Circle, preview: "var(--palette-noir)", value: "noir" },
	{ icon: Sprout, preview: "var(--palette-forest)", value: "forest" },
	{ icon: Flame, preview: "var(--palette-ember)", value: "ember" },
	{ icon: Palette, preview: "var(--palette-slate)", value: "slate" },
	{ icon: Flower2, preview: "var(--palette-sakura)", value: "sakura" },
] as const satisfies Array<{ icon: typeof Palette; preview: string; value: ColorPalette }>;

export interface AppearanceSettingsPanelProps {
	autoTagColorEnabled: boolean;
	colorPalette: ColorPalette;
	interfaceLanguage: InterfaceLanguage;
	isReady: boolean;
	noteSparklesEnabled: boolean;
	onAutoTagColorEnabledChange(value: boolean): void;
	onColorPaletteChange(value: ColorPalette): void;
	onInterfaceLanguageChange(value: InterfaceLanguage): void;
	onNoteSparklesEnabledChange(value: boolean): void;
	onThemeChange(value: "dark" | "light" | "system"): void;
	theme: string | undefined;
}

export function AppearanceSettingsPanel(props: AppearanceSettingsPanelProps) {
	const { t } = useI18n();
	return (
		<div className="space-y-6 py-1">
			<div>
				<h2 className="text-xl font-semibold tracking-tight">{t("appearance.theme.title")}</h2>
				<p className="mt-1 text-sm text-muted-foreground">{t("appearance.description")}</p>
			</div>
			<fieldset className="space-y-3" disabled={!props.isReady}>
				<legend id="appearance-theme-label" className="text-sm font-medium">
					{t("appearance.theme.title")}
				</legend>
				<div
					className="inline-flex rounded-full bg-muted p-1"
					role="radiogroup"
					aria-labelledby="appearance-theme-label">
					{themeOptions.map(({ icon: Icon, value }) => (
						<ThemeModeSelector
							key={value}
							icon={Icon}
							selected={props.theme === value}
							title={
								value === "dark"
									? t("appearance.theme.dark")
									: value === "light"
										? t("appearance.theme.light")
										: t("appearance.theme.system")
							}
							onClick={() => props.onThemeChange(value)}
						/>
					))}
				</div>
			</fieldset>
			<fieldset className="space-y-3" disabled={!props.isReady}>
				<legend className="text-sm font-medium">{t("appearance.palette.title")}</legend>
				<p className="text-sm leading-5 text-muted-foreground">{t("appearance.palette.description")}</p>
				<PaletteSelector
					title={t("appearance.palette.title")}
					palettes={paletteOptions}
					currentPalette={props.colorPalette}
					paletteLables={{
						arctic: t("appearance.palette.arctic"),
						desert: t("appearance.palette.desert"),
						ember: t("appearance.palette.ember"),
						forest: t("appearance.palette.forest"),
						noir: t("appearance.palette.noir"),
						sakura: t("appearance.palette.sakura"),
						slate: t("appearance.palette.slate"),
						twilight: t("appearance.palette.twilight"),
					}}
					onColorPaletteChange={props.onColorPaletteChange}
				/>
			</fieldset>
			<PreferenceRow
				icon={Languages}
				title={t("appearance.language.title")}
				description={t("appearance.language.description")}>
				<div className="inline-flex shrink-0 self-start rounded-xl bg-background p-1 sm:self-center">
					{(
						[
							{ label: t("appearance.language.russian"), value: "ru" },
							{ label: t("appearance.language.english"), value: "en" },
						] as const
					).map((option) => (
						<button
							key={option.value}
							type="button"
							disabled={!props.isReady}
							onClick={() => props.onInterfaceLanguageChange(option.value)}
							className={cn(
								"h-9 rounded-lg px-3 text-sm font-medium transition-colors",
								props.interfaceLanguage === option.value
									? "bg-primary text-primary-foreground shadow-sm"
									: "text-muted-foreground hover:bg-muted hover:text-foreground",
								!props.isReady && "cursor-not-allowed opacity-50"
							)}>
							{option.label}
						</button>
					))}
				</div>
			</PreferenceRow>
			<PreferenceRow
				icon={Sparkles}
				title={t("appearance.noteSparkles.title")}
				description={t("appearance.noteSparkles.description")}>
				<Switch
					checked={props.noteSparklesEnabled}
					aria-label={t("appearance.noteSparkles.title")}
					disabled={!props.isReady}
					className="self-start sm:self-center"
					onToggle={() => props.onNoteSparklesEnabledChange(!props.noteSparklesEnabled)}
				/>
			</PreferenceRow>
			<PreferenceRow
				icon={Palette}
				title={t("appearance.autoTagColors.title")}
				description={t("appearance.autoTagColors.description")}>
				<Switch
					checked={props.autoTagColorEnabled}
					aria-label={t("appearance.autoTagColors.title")}
					disabled={!props.isReady}
					className="self-start sm:self-center"
					onToggle={() => props.onAutoTagColorEnabledChange(!props.autoTagColorEnabled)}
				/>
			</PreferenceRow>
		</div>
	);
}

function PreferenceRow({
	children,
	description,
	icon: Icon,
	title,
}: {
	children: ReactNode;
	description: string;
	icon: typeof Palette;
	title: string;
}) {
	return (
		<div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
			<div className="min-w-0 space-y-1.5">
				<div className="inline-flex items-center gap-2 text-sm font-medium text-foreground">
					<Icon className="size-4 text-muted-foreground" />
					{title}
				</div>
				<p className="max-w-md text-sm leading-5 text-muted-foreground">{description}</p>
			</div>
			{children}
		</div>
	);
}
