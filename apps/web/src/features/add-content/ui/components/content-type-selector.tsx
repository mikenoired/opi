import type { Content } from "@synapse/shared/schemas";
import { cn } from "@synapse/ui/cn";
import {
	FileText,
	Image as ImageIcon,
	Link,
	ListChecks,
	Maximize,
	Minimize,
	Music2,
	FileUp,
} from "lucide-react";
import { useEffect, useRef } from "react";

interface ContentTypeSelectorProps {
	type: Content["type"];
	onTypeChange: (type: Content["type"]) => void;
	isFullScreen: boolean;
	onToggleFullScreen: () => void;
}

const contentTypes = [
	{ key: "note", icon: FileText, label: "Заметка" },
	{ key: "media", icon: ImageIcon, label: "Медиа" },
	{ key: "audio", icon: Music2, label: "Аудио" },
	{ key: "link", icon: Link, label: "Ссылка" },
	{ key: "todo", icon: ListChecks, label: "Задачи" },
	{ key: "doc", icon: FileUp, label: "Документы" },
] as const;

export function ContentTypeSelector({
	type,
	onTypeChange,
	isFullScreen,
	onToggleFullScreen,
}: ContentTypeSelectorProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const activeTabElementRef = useRef<HTMLButtonElement>(null);

	useEffect(() => {
		const container = containerRef.current;

		if (type && container && activeTabElementRef.current) {
			const activeTabElement = activeTabElementRef.current;

			const { offsetLeft, offsetWidth } = activeTabElement;

			const clipLeft = offsetLeft;
			const clipRight = offsetLeft + offsetWidth;

			container.style.clipPath = `inset(0 ${Number(100 - (clipRight / container.offsetWidth) * 100).toFixed(2)}% 0 ${Number((clipLeft / container.offsetWidth) * 100).toFixed(2)}% round 8px)`;
		}
	}, [type]);

	return (
		<div className="flex flex-row items-center justify-between border-b p-4">
			<div className="relative flex items-center">
				<div className="flex items-center">
					{contentTypes.map(({ key, icon: Icon, label }) => (
						<button
							key={key}
							ref={type === key ? activeTabElementRef : null}
							type="button"
							onClick={() => onTypeChange(key)}
							className={cn(
								"flex items-center transition-colors duration-200",
								"gap-1 overflow-auto rounded-lg px-3 py-2 hover:bg-muted/50",
								type === key && "text-primary"
							)}>
							<Icon className="h-4 w-4" />
							<span className="hidden text-sm font-medium sm:inline">{label}</span>
						</button>
					))}
				</div>

				<div
					aria-hidden
					className="clip-path-container pointer-events-none absolute inset-0 flex items-center"
					ref={containerRef}
					style={{
						transform: "translateZ(0)",
						backfaceVisibility: "hidden",
					}}>
					{contentTypes.map(({ key, icon: Icon, label }) => (
						<div key={key} className="flex items-center">
							<button
								onClick={() => onTypeChange(key)}
								className={cn(
									"button flex items-center px-3 py-2",
									"gap-1 bg-primary text-primary-foreground",
									"transition-colors duration-200"
								)}
								tabIndex={-1}>
								<Icon className="h-4 w-4" />
								<span className="hidden text-sm font-medium sm:inline">{label}</span>
							</button>
						</div>
					))}
				</div>
			</div>

			{type === "note" && (
				<div className="flex items-center gap-2">
					<button onClick={onToggleFullScreen} className="text-muted-foreground hover:text-foreground">
						{isFullScreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
					</button>
				</div>
			)}
		</div>
	);
}
