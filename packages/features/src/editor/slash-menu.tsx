import { useI18n } from "@monolyth/i18n";
import type { Editor } from "@tiptap/core";
import {
	FileCode2,
	Heading2,
	Heading3,
	Heading4,
	ImageIcon,
	List,
	ListOrdered,
	Minus,
	Pilcrow,
	Quote,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { filterSlashCommands, type SlashCommandOption } from "./editor-input";

interface SlashCommand extends SlashCommandOption {
	icon: typeof Pilcrow;
	run: () => void;
}

interface SlashState {
	from: number;
	left: number;
	query: string;
	to: number;
	top: number;
}

interface SlashMenuProps {
	editor: Editor;
	onImage: () => void;
}

export function SlashMenu({ editor, onImage }: SlashMenuProps) {
	const { t } = useI18n();
	const [activeIndex, setActiveIndex] = useState(0);
	const [state, setState] = useState<SlashState | null>(null);

	const run = useCallback(
		(command: (chain: ReturnType<Editor["chain"]>) => void) => {
			if (!state) return;
			const chain = editor.chain().focus().deleteRange({ from: state.from, to: state.to });
			command(chain);
			setState(null);
		},
		[editor, state]
	);

	const commands = useMemo<SlashCommand[]>(
		() => [
			{
				aliases: ["text", "paragraph", "p"],
				icon: Pilcrow,
				label: t("editor.paragraph"),
				run: () => run((chain) => void chain.setParagraph().run()),
			},
			{
				aliases: ["heading", "h2"],
				icon: Heading2,
				label: t("editor.heading2"),
				run: () => run((chain) => void chain.setHeading({ level: 2 }).run()),
			},
			{
				aliases: ["heading", "h3"],
				icon: Heading3,
				label: t("editor.heading3"),
				run: () => run((chain) => void chain.setHeading({ level: 3 }).run()),
			},
			{
				aliases: ["heading", "h4"],
				icon: Heading4,
				label: t("editor.heading4"),
				run: () => run((chain) => void chain.setHeading({ level: 4 }).run()),
			},
			{
				aliases: ["bullet", "list", "ul"],
				icon: List,
				label: t("editor.bulletList"),
				run: () => run((chain) => void chain.toggleBulletList().run()),
			},
			{
				aliases: ["ordered", "list", "ol"],
				icon: ListOrdered,
				label: t("editor.orderedList"),
				run: () => run((chain) => void chain.toggleOrderedList().run()),
			},
			{
				aliases: ["quote", "blockquote"],
				icon: Quote,
				label: t("editor.blockquote"),
				run: () => run((chain) => void chain.toggleBlockquote().run()),
			},
			{
				aliases: ["code", "codeblock"],
				icon: FileCode2,
				label: t("editor.codeBlock"),
				run: () => run((chain) => void chain.toggleCodeBlock().run()),
			},
			{
				aliases: ["divider", "horizontal", "hr"],
				icon: Minus,
				label: t("editor.separator"),
				run: () => run((chain) => void chain.setHorizontalRule().run()),
			},
			{
				aliases: ["image", "photo", "picture"],
				icon: ImageIcon,
				label: t("editor.image"),
				run: () =>
					run((chain) => {
						chain.run();
						onImage();
					}),
			},
		],
		[onImage, run, t]
	);
	const visibleCommands = useMemo(
		() => filterSlashCommands(commands, state?.query ?? ""),
		[commands, state?.query]
	);

	useEffect(() => {
		const update = () => {
			const { empty, $from } = editor.state.selection;
			if (!empty || $from.parent.type.name !== "paragraph") {
				setState(null);
				return;
			}

			const text = $from.parent.textBetween(0, $from.parentOffset, undefined, "\ufffc");
			const match = /^\/([\p{L}\p{N}\s-]*)$/u.exec(text);
			if (!match) {
				setState(null);
				return;
			}

			const coords = editor.view.coordsAtPos($from.pos);
			setState({
				from: $from.start(),
				left: Math.max(8, Math.min(coords.left, window.innerWidth - 288)),
				query: match[1] ?? "",
				to: $from.pos,
				top: coords.bottom + 6,
			});
		};

		editor.on("transaction", update);
		return () => {
			editor.off("transaction", update);
		};
	}, [editor]);

	useEffect(() => setActiveIndex(0), [state?.query]);

	useEffect(() => {
		if (!state) return;
		const handleKeyDown = (event: KeyboardEvent) => {
			if (!editor.view.dom.contains(event.target as Node)) return;
			if (event.key === "Escape") {
				event.preventDefault();
				event.stopPropagation();
				setState(null);
				return;
			}
			if (!visibleCommands.length) return;
			if (event.key === "ArrowDown" || event.key === "ArrowUp") {
				event.preventDefault();
				event.stopPropagation();
				const direction = event.key === "ArrowDown" ? 1 : -1;
				setActiveIndex((index) => (index + direction + visibleCommands.length) % visibleCommands.length);
				return;
			}
			if (event.key === "Enter") {
				event.preventDefault();
				event.stopPropagation();
				visibleCommands[activeIndex]?.run();
			}
		};

		document.addEventListener("keydown", handleKeyDown, true);
		return () => document.removeEventListener("keydown", handleKeyDown, true);
	}, [activeIndex, editor, state, visibleCommands]);

	if (!state) return null;

	return (
		<div
			className="fixed z-50 max-h-72 w-70 overflow-y-auto rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg"
			role="listbox"
			style={{ left: state.left, top: state.top }}>
			{visibleCommands.length ? (
				visibleCommands.map((command, index) => {
					const Icon = command.icon;
					return (
						<button
							aria-selected={index === activeIndex}
							className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent aria-selected:bg-accent"
							key={command.label}
							onMouseDown={(event) => {
								event.preventDefault();
								command.run();
							}}
							role="option"
							type="button">
							<Icon className="size-4" />
							{command.label}
						</button>
					);
				})
			) : (
				<div className="px-2 py-1.5 text-sm text-muted-foreground">{t("editor.commandsNotFound")}</div>
			)}
		</div>
	);
}
