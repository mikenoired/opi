import { SIDEBAR_ANIMATION } from "@monolyth/shared/animations";
import { motion } from "framer-motion";
import { Palette } from "lucide-react";
import { MouseEventHandler } from "react";

interface ThemeModeSelectorProps {
	selected: boolean;
	title: string;
	onClick: MouseEventHandler<HTMLButtonElement>;
	icon: typeof Palette;
}

export default function ThemeModeSelector({ selected, title, onClick, icon: Icon }: ThemeModeSelectorProps) {
	return (
		<button
			type="button"
			role="radio"
			aria-checked={selected}
			aria-label={title}
			title={title}
			onClick={onClick}
			className="group relative flex size-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:z-10 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none aria-checked:text-foreground">
			{selected && (
				<motion.span
					layoutId="appearance-theme-selection"
					className="absolute inset-0 rounded-full bg-background shadow-sm"
					transition={SIDEBAR_ANIMATION}
					aria-hidden="true"
				/>
			)}
			<Icon className="relative z-10 size-4 transition-colors" />
		</button>
	);
}
