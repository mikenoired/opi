import { ColorPalette } from "@monolyth/shared/preferences";
import { cn } from "@monolyth/ui/cn";
import { Palette } from "lucide-react";

interface PaletteSelectorProps {
	title: string;
	palettes: Array<{ icon: typeof Palette; preview: string; value: ColorPalette }>;
	currentPalette: ColorPalette;
	paletteLables: Record<ColorPalette, string>;
	onColorPaletteChange: (value: ColorPalette) => void;
}

export default function PaletteSelector({
	title,
	palettes,
	currentPalette,
	paletteLables,
	onColorPaletteChange,
}: PaletteSelectorProps) {
	return (
		<div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-label={title}>
			{palettes.map(({ icon: Icon, preview, value }) => {
				const selected = currentPalette === value;
				return (
					<button
						key={value}
						type="button"
						role="radio"
						aria-checked={selected}
						onClick={() => onColorPaletteChange(value)}
						className={cn(
							"group flex min-h-20 flex-col justify-between rounded-xl border p-3 text-left transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
							selected ? "border-primary bg-primary/10" : "border-border bg-card hover:bg-hover"
						)}>
						<div className="flex items-center justify-between">
							<Icon className="size-4 text-muted-foreground" />
							<span
								className="size-3 rounded-full ring-1 ring-black/10 dark:ring-white/15"
								style={{ backgroundColor: preview }}
							/>
						</div>
						<span className="text-sm font-medium text-foreground">{paletteLables[value]}</span>
					</button>
				);
			})}
		</div>
	);
}
