import { useI18n } from "@monolyth/i18n";
import { cn } from "@monolyth/ui/cn";
import {
	Button,
	DropdownContent,
	DropdownMenu,
	DropdownTrigger,
	MenuItem,
	Select,
	SelectTrigger,
	Tooltip,
	TooltipProvider,
	SelectContent,
	SelectItem,
} from "@monolyth/ui/components";
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
	Heading2,
	Heading3,
	Heading4,
	ImageIcon,
	Italic,
	Link,
	List,
	ListOrdered,
	Minus,
	Quote,
	Redo2,
	RotateCcw,
	Save,
	SquareCheckBig,
	Strikethrough,
	Underline,
	Undo2,
	MoreHorizontal,
	Pilcrow,
} from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";

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
	"monolyth-editor-content monolyth-prose min-h-[420px] max-w-none px-1 pt-5 pb-[calc(5rem+env(safe-area-inset-bottom))] text-base leading-7 outline-none",
	editorTextSpacing,
	"[&_p.is-editor-empty:first-child::before]:pointer-events-none",
	"[&_p.is-editor-empty:first-child::before]:float-left",
	"[&_p.is-editor-empty:first-child::before]:h-0",
	"[&_p.is-editor-empty:first-child::before]:text-muted-foreground/60",
	"[&_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]"
);

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
		name: "monolythShortcuts",
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
	onReset?: () => void;
	onSave?: () => void;
	readOnly?: boolean;
	resetDisabled?: boolean;
	saveDisabled?: boolean;
}

interface ToolbarButtonProps {
	active?: boolean;
	className?: string;
	children: ReactNode;
	disabled?: boolean;
	label: string;
	onClick: () => void;
	shortcut?: string;
}

function ToolbarButton({
	active,
	children,
	className,
	disabled,
	label,
	onClick,
	shortcut,
}: ToolbarButtonProps) {
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
				className={cn("shrink-0", className)}
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
	onReset,
	onSave,
	readOnly = false,
	resetDisabled = false,
	saveDisabled = false,
}: RichTextEditorProps) {
	const { t } = useI18n();
	const editorRef = useRef<TiptapEditor | null>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);

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
				onError?.(error instanceof Error ? error.message : t("editor.imageLoadError"));
			}
		},
		[onError, t]
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
			Placeholder.configure({ placeholder: t("editor.placeholder") }),
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
				"aria-label": t("editor.noteContent"),
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

	useEffect(() => {
		if (!editor || !data) return;
		// `useEditor` applies content only on creation. Reconcile data received after
		// a save/reload without emitting another change back to the parent.
		if (JSON.stringify(editor.getJSON()) !== JSON.stringify(data)) {
			editor.commands.setContent(data, { emitUpdate: false });
		}
	}, [data, editor]);

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
			{editor &&
				!readOnly &&
				createPortal(
					<TooltipProvider delayDuration={400} skipDelayDuration={150}>
						<div className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-1/2 z-210 w-max max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-xl border border-border/80 bg-background/95 p-1.5 shadow-xl backdrop-blur">
							<div className="flex items-center justify-center gap-1">
								<div className="max-sm:hidden">
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
										<SelectTrigger placeholder={t("editor.paragraph")} />
										<SelectContent>
											<SelectItem index={0} value="0">
												{t("editor.paragraph")}
											</SelectItem>
											<SelectItem index={1} value="2">
												{t("editor.heading2")}
											</SelectItem>
											<SelectItem index={2} value="3">
												{t("editor.heading3")}
											</SelectItem>
											<SelectItem index={3} value="4">
												{t("editor.heading4")}
											</SelectItem>
										</SelectContent>
									</Select>
								</div>
								<div className="mx-1 h-5 w-px bg-border max-sm:hidden" />
								<ToolbarButton
									active={editor.isActive("bold")}
									label={t("editor.bold")}
									onClick={() => void editor.chain().focus().toggleBold().run()}
									shortcut="⌘/Ctrl+B">
									<Bold />
								</ToolbarButton>
								<ToolbarButton
									active={editor.isActive("italic")}
									label={t("editor.italic")}
									onClick={() => void editor.chain().focus().toggleItalic().run()}
									shortcut="⌘/Ctrl+I">
									<Italic />
								</ToolbarButton>
								<ToolbarButton
									active={editor.isActive("underline")}
									className="max-sm:hidden"
									label={t("editor.underline")}
									onClick={() => void editor.chain().focus().toggleUnderline().run()}
									shortcut="⌘/Ctrl+U">
									<Underline />
								</ToolbarButton>
								<ToolbarButton
									active={editor.isActive("strike")}
									className="max-[900px]:hidden"
									label={t("editor.strike")}
									onClick={() => void editor.chain().focus().toggleStrike().run()}
									shortcut="⌘/Ctrl+Shift+S">
									<Strikethrough />
								</ToolbarButton>
								<ToolbarButton
									active={editor.isActive("code")}
									className="max-[900px]:hidden"
									label={t("editor.code")}
									onClick={() => void editor.chain().focus().toggleCode().run()}
									shortcut="⌘/Ctrl+E">
									<Code2 />
								</ToolbarButton>
								<ToolbarButton
									active={editor.isActive("link")}
									className="max-sm:hidden"
									label={t("editor.link")}
									onClick={() => void editLink(editor, onRequestLink)}
									shortcut="⌘/Ctrl+K">
									<Link />
								</ToolbarButton>
								<div className="mx-1 h-5 w-px bg-border max-[900px]:hidden" />
								<ToolbarButton
									active={editor.isActive("bulletList")}
									className="max-[900px]:hidden"
									label={t("editor.bulletList")}
									onClick={() => void editor.chain().focus().toggleBulletList().run()}
									shortcut="⌘/Ctrl+Shift+8">
									<List />
								</ToolbarButton>
								<ToolbarButton
									active={editor.isActive("orderedList")}
									className="max-[900px]:hidden"
									label={t("editor.orderedList")}
									onClick={() => void editor.chain().focus().toggleOrderedList().run()}
									shortcut="⌘/Ctrl+Shift+7">
									<ListOrdered />
								</ToolbarButton>
								<ToolbarButton
									active={editor.isActive("taskList")}
									className="max-[900px]:hidden"
									label={t("editor.taskList")}
									onClick={() => void editor.chain().focus().toggleTaskList().run()}
									shortcut="⌘/Ctrl+Shift+9">
									<SquareCheckBig />
								</ToolbarButton>
								<ToolbarButton
									active={editor.isActive("blockquote")}
									className="max-[900px]:hidden"
									label={t("editor.blockquote")}
									onClick={() => void editor.chain().focus().toggleBlockquote().run()}
									shortcut="⌘/Ctrl+Shift+B">
									<Quote />
								</ToolbarButton>
								<ToolbarButton
									active={editor.isActive("codeBlock")}
									className="max-[900px]:hidden"
									label={t("editor.codeBlock")}
									onClick={() => void editor.chain().focus().toggleCodeBlock().run()}
									shortcut="⌘/Ctrl+Alt+C">
									<FileCode2 />
								</ToolbarButton>
								<ToolbarButton
									className="max-[900px]:hidden"
									label={t("editor.separator")}
									onClick={() => void editor.chain().focus().setHorizontalRule().run()}>
									<Minus />
								</ToolbarButton>
								<ToolbarButton className="max-sm:hidden" label={t("editor.image")} onClick={openImagePicker}>
									<ImageIcon />
								</ToolbarButton>
								<div className="mx-1 h-5 w-px bg-border max-[900px]:hidden" />
								<DropdownMenu>
									<DropdownTrigger
										aria-label={t("editor.more")}
										className="hidden max-[900px]:inline-flex"
										render={
											<Button size="icon" type="button" variant="ghost">
												<MoreHorizontal />
											</Button>
										}
									/>
									<DropdownContent align="center" className="w-56" side="top">
										<MenuItem
											icon={Strikethrough}
											index={0}
											label={t("editor.strike")}
											onSelect={() => editor.chain().focus().toggleStrike().run()}
										/>
										<MenuItem
											icon={Code2}
											index={1}
											label={t("editor.code")}
											onSelect={() => editor.chain().focus().toggleCode().run()}
										/>
										<MenuItem
											icon={List}
											index={2}
											label={t("editor.bulletList")}
											onSelect={() => editor.chain().focus().toggleBulletList().run()}
										/>
										<MenuItem
											icon={ListOrdered}
											index={3}
											label={t("editor.orderedList")}
											onSelect={() => editor.chain().focus().toggleOrderedList().run()}
										/>
										<MenuItem
											icon={SquareCheckBig}
											index={4}
											label={t("editor.taskList")}
											onSelect={() => editor.chain().focus().toggleTaskList().run()}
										/>
										<MenuItem
											icon={Quote}
											index={5}
											label={t("editor.blockquote")}
											onSelect={() => editor.chain().focus().toggleBlockquote().run()}
										/>
										<MenuItem
											icon={FileCode2}
											index={6}
											label={t("editor.codeBlock")}
											onSelect={() => editor.chain().focus().toggleCodeBlock().run()}
										/>
										<MenuItem
											icon={Minus}
											index={7}
											label={t("editor.separator")}
											onSelect={() => editor.chain().focus().setHorizontalRule().run()}
										/>
										<div className="hidden max-sm:contents">
											<MenuItem
												icon={Pilcrow}
												index={8}
												label={t("editor.paragraph")}
												onSelect={() => editor.chain().focus().setParagraph().run()}
											/>
											<MenuItem
												icon={Heading2}
												index={9}
												label={t("editor.heading2")}
												onSelect={() => editor.chain().focus().setHeading({ level: 2 }).run()}
											/>
											<MenuItem
												icon={Heading3}
												index={10}
												label={t("editor.heading3")}
												onSelect={() => editor.chain().focus().setHeading({ level: 3 }).run()}
											/>
											<MenuItem
												icon={Heading4}
												index={11}
												label={t("editor.heading4")}
												onSelect={() => editor.chain().focus().setHeading({ level: 4 }).run()}
											/>
											<MenuItem
												icon={Underline}
												index={12}
												label={t("editor.underline")}
												onSelect={() => editor.chain().focus().toggleUnderline().run()}
											/>
											<MenuItem
												icon={Link}
												index={13}
												label={t("editor.link")}
												onSelect={() => void editLink(editor, onRequestLink)}
											/>
											<MenuItem
												icon={ImageIcon}
												index={14}
												label={t("editor.image")}
												onSelect={openImagePicker}
											/>
										</div>
									</DropdownContent>
								</DropdownMenu>
								<ToolbarButton
									disabled={!editor.can().undo()}
									label={t("editor.undo")}
									onClick={() => void editor.chain().focus().undo().run()}
									shortcut="⌘/Ctrl+Z">
									<Undo2 />
								</ToolbarButton>
								<ToolbarButton
									disabled={!editor.can().redo()}
									label={t("editor.redo")}
									onClick={() => void editor.chain().focus().redo().run()}
									shortcut="⌘/Ctrl+Shift+Z">
									<Redo2 />
								</ToolbarButton>
								{(onReset || onSave) && (
									<>
										<div className="mx-1 h-5 w-px bg-border" />
										<ToolbarButton
											disabled={resetDisabled}
											label={t("editor.reset")}
											onClick={() => onReset?.()}>
											<RotateCcw />
										</ToolbarButton>
										<ToolbarButton
											disabled={saveDisabled}
											label={t("editor.save")}
											onClick={() => onSave?.()}>
											<Save />
										</ToolbarButton>
									</>
								)}
							</div>
						</div>
					</TooltipProvider>,
					document.body
				)}
			<EditorContent editor={editor} />
			{editor && !readOnly && <SlashMenu editor={editor} onImage={openImagePicker} />}
		</div>
	);
}
