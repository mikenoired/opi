import { cn } from "@synapse/ui/cn";
import {
	Button,
	Select,
	SelectTrigger,
	Tooltip,
	TooltipProvider,
	SelectContent,
	SelectItem,
} from "@synapse/ui/components";
import { Extension, type Editor as TiptapEditor } from "@tiptap/core";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import Image from "@tiptap/extension-image";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import Placeholder from "@tiptap/extension-placeholder";
import { Markdown } from "@tiptap/markdown";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { JSONContent } from "@tiptap/react";
import { EditorContent, ReactNodeViewRenderer, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { common, createLowlight } from "lowlight";
import {
	Bold,
	Code2,
	FileCode2,
	ImageIcon,
	Italic,
	Link,
	List,
	ListOrdered,
	Minus,
	Quote,
	Redo2,
	SquareCheckBig,
	Strikethrough,
	Underline,
	Undo2,
} from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useRef } from "react";

import { imageFilesToDataUrls, looksLikeMarkdown } from "./editor-input";
import { EditableTaskItemView, ReadonlyTaskItemView, TaskListView } from "./readonly-task-item";
import { SlashMenu } from "./slash-menu";

const lowlight = createLowlight(common);

const editorTextSpacing = [
	"[&_p]:mt-0!",
	"[&_p]:mb-4!",
	"[&_h1]:mt-8!",
	"[&_h1]:mb-4!",
	"[&_h2]:mt-7!",
	"[&_h2]:mb-3!",
	"[&_h3]:mt-6!",
	"[&_h3]:mb-2!",
	"[&_ul]:mt-3!",
	"[&_ul]:mb-4!",
	"[&_ol]:mt-3!",
	"[&_ol]:mb-4!",
	"[&_li+li]:mt-1.5!",
	"[&_blockquote]:my-5!",
	"[&_pre]:my-5!",
	"[&_table]:my-5!",
	"[&_hr]:my-8!",
	"[&_img]:my-5!",
	"[&_figure]:my-5!",
	"*:first:mt-0!",
] as const;

const editorContentClassName = cn(
	"synapse-editor-content synapse-prose min-h-[420px] max-w-none px-1 py-5 text-base leading-7 outline-none",
	editorTextSpacing,
	"[&_p.is-editor-empty:first-child::before]:pointer-events-none",
	"[&_p.is-editor-empty:first-child::before]:float-left",
	"[&_p.is-editor-empty:first-child::before]:h-0",
	"[&_p.is-editor-empty:first-child::before]:text-muted-foreground/60",
	"[&_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]"
);

export interface RichTextEditorStrings {
	blockquote: string;
	bold: string;
	bulletList: string;
	code: string;
	codeBlock: string;
	commandsNotFound: string;
	heading2: string;
	heading3: string;
	heading4: string;
	image: string;
	imageLoadError: string;
	italic: string;
	link: string;
	noteContent: string;
	orderedList: string;
	paragraph: string;
	placeholder: string;
	redo: string;
	separator: string;
	strike: string;
	taskList: string;
	underline: string;
	undo: string;
}

export const defaultRichTextEditorStrings: RichTextEditorStrings = {
	blockquote: "Цитата",
	bold: "Жирный",
	bulletList: "Маркированный список",
	code: "Строчный код",
	codeBlock: "Блок кода",
	commandsNotFound: "Команды не найдены",
	heading2: "Заголовок 2",
	heading3: "Заголовок 3",
	heading4: "Заголовок 4",
	image: "Изображение",
	imageLoadError: "Не удалось добавить изображение",
	italic: "Курсив",
	link: "Ссылка",
	noteContent: "Содержимое заметки",
	orderedList: "Нумерованный список",
	paragraph: "Текст",
	placeholder: "Начните с мысли, идеи или наблюдения…",
	redo: "Повторить",
	separator: "Разделитель",
	strike: "Зачёркнутый",
	taskList: "Список задач",
	underline: "Подчёркнутый",
	undo: "Отменить",
};

async function editLink(
	editor: TiptapEditor,
	onRequestLink?: (currentHref: string) => string | null | Promise<string | null>
): Promise<boolean> {
	if (!onRequestLink) return false;
	const current = String(editor.getAttributes("link").href ?? "");
	const href = await onRequestLink(current);
	if (href === null) return false;
	if (!href.trim()) return editor.chain().focus().extendMarkRange("link").unsetLink().run();
	return editor.chain().focus().extendMarkRange("link").setLink({ href: href.trim() }).run();
}

function createEditorShortcuts(
	onRequestLink?: (currentHref: string) => string | null | Promise<string | null>
) {
	return Extension.create({
		name: "synapseShortcuts",
		addKeyboardShortcuts() {
			return {
				"Mod-k": () => {
					void editLink(this.editor, onRequestLink);
					return Boolean(onRequestLink);
				},
				"Mod-Shift-7": () => this.editor.commands.toggleOrderedList(),
				"Mod-Shift-8": () => this.editor.commands.toggleBulletList(),
			};
		},
	});
}

const NoInPageAnchorLinks = Extension.create({
	name: "noInPageAnchorLinks",
	addProseMirrorPlugins() {
		return [
			new Plugin({
				key: new PluginKey("noInPageAnchorLinks"),
				appendTransaction: (_transactions, _oldState, newState) => {
					const linkType = newState.schema.marks.link;
					if (!linkType) return null;
					const tr = newState.tr;
					let modified = false;
					newState.doc.descendants((node, pos) => {
						if (!node.isText || !node.marks) return;
						const href = node.marks.find((mark) => mark.type === linkType)?.attrs?.href;
						if (typeof href === "string" && href.startsWith("#")) {
							tr.removeMark(pos, pos + node.nodeSize, linkType);
							modified = true;
						}
					});
					return modified ? tr.setMeta("addToHistory", false) : null;
				},
			}),
		];
	},
});

export interface RichTextEditorProps {
	data?: JSONContent | null;
	onChange?: (data: JSONContent) => void;
	onError?: (message: string) => void;
	onRequestLink?: (currentHref: string) => string | null | Promise<string | null>;
	readOnly?: boolean;
	strings?: Partial<RichTextEditorStrings>;
}

interface ToolbarButtonProps {
	active?: boolean;
	children: ReactNode;
	disabled?: boolean;
	label: string;
	onClick: () => void;
	shortcut?: string;
}

function ToolbarButton({ active, children, disabled, label, onClick, shortcut }: ToolbarButtonProps) {
	return (
		<Tooltip
			side="bottom"
			sideOffset={6}
			content={
				<>
					<span>{label}</span>
					{shortcut && (
						<kbd
							className="rounded bg-background/15 px-1 font-mono ring-1 ring-background/20"
							data-slot="kbd">
							{shortcut}
						</kbd>
					)}
				</>
			}>
			<Button
				aria-label={label}
				disabled={disabled}
				onClick={onClick}
				size="icon"
				type="button"
				variant={active ? "secondary" : "ghost"}>
				{children}
			</Button>
		</Tooltip>
	);
}

export function RichTextEditor({
	data,
	onChange,
	onError,
	onRequestLink,
	readOnly = false,
	strings: stringsOverride,
}: RichTextEditorProps) {
	const editorRef = useRef<TiptapEditor | null>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const strings = { ...defaultRichTextEditorStrings, ...stringsOverride };

	const insertImageFiles = useCallback(
		async (files: File[], position?: number) => {
			const editor = editorRef.current;
			if (!editor || !files.length) return;
			try {
				const images = await imageFilesToDataUrls(files);
				const content: JSONContent[] = [
					...images.map(({ alt, src }) => ({ type: "image", attrs: { alt, src } })),
					{ type: "paragraph" },
				];
				const chain = editor.chain().focus();
				if (position !== undefined) chain.setTextSelection(position);
				chain.insertContent(content).run();
			} catch (error) {
				onError?.(error instanceof Error ? error.message : strings.imageLoadError);
			}
		},
		[onError, strings.imageLoadError]
	);

	const editor = useEditor({
		immediatelyRender: false,
		shouldRerenderOnTransaction: true,
		extensions: [
			StarterKit.configure({ codeBlock: false, link: { openOnClick: false } }),
			CodeBlockLowlight.configure({ lowlight }),
			Image.configure({
				allowBase64: true,
				HTMLAttributes: { class: "h-auto max-w-full rounded-lg", loading: "lazy" },
			}),
			Markdown,
			createEditorShortcuts(onRequestLink),
			NoInPageAnchorLinks,
			Placeholder.configure({ placeholder: strings.placeholder }),
			TaskList.extend({
				addNodeView() {
					return ReactNodeViewRenderer(TaskListView);
				},
			}),
			readOnly
				? TaskItem.extend({
						addNodeView() {
							return ReactNodeViewRenderer(ReadonlyTaskItemView);
						},
					}).configure({ nested: false })
				: TaskItem.extend({
						addNodeView() {
							return ReactNodeViewRenderer(EditableTaskItemView);
						},
					}).configure({ nested: false }),
		],
		editorProps: {
			attributes: {
				"aria-label": strings.noteContent,
				"class": editorContentClassName,
				"role": "textbox",
			},
			handleDrop(view, event, moved) {
				if (moved) return false;
				const files = Array.from(event.dataTransfer?.files ?? []).filter((file) =>
					file.type.startsWith("image/")
				);
				if (!files.length) return false;
				event.preventDefault();
				const position = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos;
				void insertImageFiles(files, position);
				return true;
			},
			handlePaste(_view, event) {
				const files = Array.from(event.clipboardData?.files ?? []).filter((file) =>
					file.type.startsWith("image/")
				);
				if (files.length) {
					event.preventDefault();
					void insertImageFiles(files);
					return true;
				}

				const html = event.clipboardData?.getData("text/html");
				const text = event.clipboardData?.getData("text/plain");
				if (!html && text && looksLikeMarkdown(text)) {
					event.preventDefault();
					editorRef.current?.commands.insertContent(text, { contentType: "markdown" });
					return true;
				}
				return false;
			},
		},
		content: data || "",
		editable: !readOnly,
		onUpdate({ editor }) {
			onChange?.(editor.getJSON());
		},
	});

	useEffect(() => {
		editorRef.current = editor;
		return () => {
			if (editorRef.current === editor) editorRef.current = null;
		};
	}, [editor]);

	useEffect(() => {
		editor?.setEditable(!readOnly);
	}, [editor, readOnly]);

	const openImagePicker = useCallback(() => fileInputRef.current?.click(), []);

	return (
		<div className="w-full">
			<input
				accept="image/jpeg,image/png,image/gif,image/webp"
				className="hidden"
				multiple
				onChange={(event) => {
					void insertImageFiles(Array.from(event.currentTarget.files ?? []));
					event.currentTarget.value = "";
				}}
				ref={fileInputRef}
				type="file"
			/>
			{editor && !readOnly && (
				<>
					<TooltipProvider delayDuration={400} skipDelayDuration={150}>
						<div className="sticky top-0 z-10 flex flex-wrap items-center gap-1 border-y border-border/70 bg-background/95 py-2 backdrop-blur">
							<Select
								value={
									editor.isActive("heading", { level: 2 })
										? "2"
										: editor.isActive("heading", { level: 3 })
											? "3"
											: editor.isActive("heading", { level: 4 })
												? "4"
												: "0"
								}
								onValueChange={(value) => {
									const level = Number(value);
									if (level)
										editor
											.chain()
											.focus()
											.setHeading({ level: level as 2 | 3 | 4 })
											.run();
									else editor.chain().focus().setParagraph().run();
								}}>
								<SelectTrigger placeholder={strings.paragraph} />
								<SelectContent>
									<SelectItem index={0} value="0">
										{strings.paragraph}
									</SelectItem>
									<SelectItem index={1} value="2">
										{strings.heading2}
									</SelectItem>
									<SelectItem index={2} value="3">
										{strings.heading3}
									</SelectItem>
									<SelectItem index={3} value="4">
										{strings.heading4}
									</SelectItem>
								</SelectContent>
							</Select>
							<div className="mx-1 h-5 w-px bg-border" />
							<ToolbarButton
								active={editor.isActive("bold")}
								label={strings.bold}
								onClick={() => void editor.chain().focus().toggleBold().run()}
								shortcut="⌘/Ctrl+B">
								<Bold />
							</ToolbarButton>
							<ToolbarButton
								active={editor.isActive("italic")}
								label={strings.italic}
								onClick={() => void editor.chain().focus().toggleItalic().run()}
								shortcut="⌘/Ctrl+I">
								<Italic />
							</ToolbarButton>
							<ToolbarButton
								active={editor.isActive("underline")}
								label={strings.underline}
								onClick={() => void editor.chain().focus().toggleUnderline().run()}
								shortcut="⌘/Ctrl+U">
								<Underline />
							</ToolbarButton>
							<ToolbarButton
								active={editor.isActive("strike")}
								label={strings.strike}
								onClick={() => void editor.chain().focus().toggleStrike().run()}
								shortcut="⌘/Ctrl+Shift+S">
								<Strikethrough />
							</ToolbarButton>
							<ToolbarButton
								active={editor.isActive("code")}
								label={strings.code}
								onClick={() => void editor.chain().focus().toggleCode().run()}
								shortcut="⌘/Ctrl+E">
								<Code2 />
							</ToolbarButton>
							<ToolbarButton
								active={editor.isActive("link")}
								label={strings.link}
								onClick={() => void editLink(editor, onRequestLink)}
								shortcut="⌘/Ctrl+K">
								<Link />
							</ToolbarButton>
							<div className="mx-1 h-5 w-px bg-border" />
							<ToolbarButton
								active={editor.isActive("bulletList")}
								label={strings.bulletList}
								onClick={() => void editor.chain().focus().toggleBulletList().run()}
								shortcut="⌘/Ctrl+Shift+8">
								<List />
							</ToolbarButton>
							<ToolbarButton
								active={editor.isActive("orderedList")}
								label={strings.orderedList}
								onClick={() => void editor.chain().focus().toggleOrderedList().run()}
								shortcut="⌘/Ctrl+Shift+7">
								<ListOrdered />
							</ToolbarButton>
							<ToolbarButton
								active={editor.isActive("taskList")}
								label={strings.taskList}
								onClick={() => void editor.chain().focus().toggleTaskList().run()}
								shortcut="⌘/Ctrl+Shift+9">
								<SquareCheckBig />
							</ToolbarButton>
							<ToolbarButton
								active={editor.isActive("blockquote")}
								label={strings.blockquote}
								onClick={() => void editor.chain().focus().toggleBlockquote().run()}
								shortcut="⌘/Ctrl+Shift+B">
								<Quote />
							</ToolbarButton>
							<ToolbarButton
								active={editor.isActive("codeBlock")}
								label={strings.codeBlock}
								onClick={() => void editor.chain().focus().toggleCodeBlock().run()}
								shortcut="⌘/Ctrl+Alt+C">
								<FileCode2 />
							</ToolbarButton>
							<ToolbarButton
								label={strings.separator}
								onClick={() => void editor.chain().focus().setHorizontalRule().run()}>
								<Minus />
							</ToolbarButton>
							<ToolbarButton label={strings.image} onClick={openImagePicker}>
								<ImageIcon />
							</ToolbarButton>
							<div className="mx-1 h-5 w-px bg-border" />
							<ToolbarButton
								disabled={!editor.can().undo()}
								label={strings.undo}
								onClick={() => void editor.chain().focus().undo().run()}
								shortcut="⌘/Ctrl+Z">
								<Undo2 />
							</ToolbarButton>
							<ToolbarButton
								disabled={!editor.can().redo()}
								label={strings.redo}
								onClick={() => void editor.chain().focus().redo().run()}
								shortcut="⌘/Ctrl+Shift+Z">
								<Redo2 />
							</ToolbarButton>
						</div>
					</TooltipProvider>
					<SlashMenu editor={editor} onImage={openImagePicker} strings={strings} />
				</>
			)}
			<EditorContent editor={editor} />
		</div>
	);
}
