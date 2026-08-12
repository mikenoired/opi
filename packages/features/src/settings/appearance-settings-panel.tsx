import type { ColorPalette, InterfaceLanguage } from "@synapse/shared/preferences";
import { cn } from "@synapse/ui/cn";
import { Switch } from "@synapse/ui/components";
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
	strings: {
		autoTagColorsDescription: string;
		autoTagColorsTitle: string;
		description: string;
		languageDescription: string;
		languageEnglish: string;
		languageRussian: string;
		languageTitle: string;
		noteSparklesDescription: string;
		noteSparklesTitle: string;
		paletteDescription: string;
		paletteLabels: Record<ColorPalette, string>;
		paletteTitle: string;
		themeLabels: Record<"dark" | "light" | "system", string>;
		themeTitle: string;
		title: string;
	};
}

export function AppearanceSettingsPanel(props: AppearanceSettingsPanelProps) {
	const { strings } = props;
	return (
		<div className="space-y-6 py-1">
			<div>
				<h2 className="text-xl font-semibold tracking-tight">{strings.title}</h2>
				<p className="mt-1 text-sm text-muted-foreground">{strings.description}</p>
			</div>
			<fieldset className="space-y-3" disabled={!props.isReady}>
				<legend id="appearance-theme-label" className="text-sm font-medium">
					{strings.themeTitle}
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
							title={strings.themeLabels[value]}
							onClick={() => props.onThemeChange(value)}
						/>
					))}
				</div>
			</fieldset>
			<fieldset className="space-y-3" disabled={!props.isReady}>
				<legend className="text-sm font-medium">{strings.paletteTitle}</legend>
				<p className="text-sm leading-5 text-muted-foreground">{strings.paletteDescription}</p>
				<PaletteSelector
					title={strings.paletteTitle}
					palettes={paletteOptions}
					currentPalette={props.colorPalette}
					paletteLables={strings.paletteLabels}
					onColorPaletteChange={props.onColorPaletteChange}
				/>
			</fieldset>
			<PreferenceRow icon={Languages} title={strings.languageTitle} description={strings.languageDescription}>
				<div className="inline-flex shrink-0 self-start rounded-xl bg-background p-1 sm:self-center">
					{(
						[
							{ label: strings.languageRussian, value: "ru" },
							{ label: strings.languageEnglish, value: "en" },
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
				title={strings.noteSparklesTitle}
				description={strings.noteSparklesDescription}>
				<Switch
					checked={props.noteSparklesEnabled}
					aria-label={strings.noteSparklesTitle}
					disabled={!props.isReady}
					className="self-start sm:self-center"
					onToggle={() => props.onNoteSparklesEnabledChange(!props.noteSparklesEnabled)}
				/>
			</PreferenceRow>
			<PreferenceRow
				icon={Palette}
				title={strings.autoTagColorsTitle}
				description={strings.autoTagColorsDescription}>
				<Switch
					checked={props.autoTagColorEnabled}
					aria-label={strings.autoTagColorsTitle}
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
