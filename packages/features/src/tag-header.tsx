import { getTagColor, TAG_COLOR_PALETTE } from "@monolyth/shared/tag-colors";
import { Check, Palette, Slash } from "lucide-react";
import { useState } from "react";

export interface TagColorPickerLabels {
	none: string;
	option(number: number): string;
	picker: string;
}

export function TagTitle({ color, title }: { color: number; title: string }) {
	return (
		<h1
			className="rounded-full border border-transparent px-3 py-1 text-2xl font-semibold capitalize"
			style={tagTitleStyle(color)}>
			{title}
		</h1>
	);
}

export function TagLabel({ color, title }: { color: number; title: string }) {
	return (
		<span
			className="inline-flex items-center gap-2 rounded-full border border-transparent px-2.5 py-1"
			style={tagTitleStyle(color)}>
			{getTagColor(color) && <span aria-hidden className="size-2 rounded-full bg-(--tag-color)" />}
			{title}
		</span>
	);
}

export function TagHeader({
	color,
	disabled,
	labels,
	onColorChange,
	title,
}: {
	color: number;
	disabled?: boolean;
	labels: TagColorPickerLabels;
	onColorChange?(color: number): void;
	title: string;
}) {
	const [open, setOpen] = useState(false);
	return (
		<div className="relative flex flex-wrap items-center gap-3">
			<TagTitle color={color} title={title} />
			{onColorChange && (
				<div className="relative">
					<button
						aria-expanded={open}
						aria-label={labels.picker}
						className="flex size-9 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
						disabled={disabled}
						onClick={() => setOpen((value) => !value)}
						type="button">
						<Palette className="size-4" style={{ color: getTagColor(color) }} />
					</button>
					{open && (
						<div className="absolute top-11 left-0 z-30 w-56 rounded-3xl border border-border bg-background p-3 shadow-xl">
							<p className="mb-2 px-1 text-xs font-medium text-muted-foreground">{labels.picker}</p>
							<div className="grid grid-cols-7 gap-1.5">
								<ColorOption
									active={color === 0}
									ariaLabel={labels.none}
									color={0}
									onSelect={onColorChange}
								/>
								{TAG_COLOR_PALETTE.map((value, index) => (
									<ColorOption
										active={color === index + 1}
										ariaLabel={labels.option(index + 1)}
										color={index + 1}
										key={value}
										onSelect={onColorChange}
									/>
								))}
							</div>
						</div>
					)}
				</div>
			)}
		</div>
	);
}

function ColorOption({
	active,
	ariaLabel,
	color,
	onSelect,
}: {
	active: boolean;
	ariaLabel: string;
	color: number;
	onSelect(color: number): void;
}) {
	if (color === 0)
		return (
			<button
				aria-label={ariaLabel}
				aria-pressed={active}
				className="relative flex size-6 items-center justify-center rounded-full border border-border bg-muted text-muted-foreground"
				onClick={() => onSelect(0)}
				type="button">
				<Slash className="size-3" />
				{active && (
					<Check className="absolute -top-1 -right-1 size-3 rounded-full bg-foreground p-0.5 text-background" />
				)}
			</button>
		);
	return (
		<button
			aria-label={ariaLabel}
			aria-pressed={active}
			className="relative size-6 rounded-full transition-transform hover:scale-110 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
			onClick={() => onSelect(color)}
			style={{ backgroundColor: TAG_COLOR_PALETTE[color - 1] }}
			type="button">
			{active && <Check className="absolute inset-1 size-4 text-white drop-shadow-sm" />}
		</button>
	);
}

function tagTitleStyle(color: number) {
	const value = getTagColor(color);
	return value
		? { "backgroundColor": `${value}20`, "borderColor": `${value}58`, "--tag-color": value }
		: undefined;
}
