import { useI18n } from "@synapse/i18n";
import type { Content, UpdateContent } from "@synapse/shared/schemas";
import { Button, CheckboxGroup, CheckboxItem, InputField } from "@synapse/ui/components";
import type { JSONContent } from "@tiptap/core";
import { Plus, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { ContentTypeHeader, type ContentTypePickerOption } from "./content-type-picker";
import { BaseModal } from "./dialogs/base-modal";
import { ConfirmDialog } from "./dialogs/confirm-dialog";
import { RichTextEditor, type RichTextEditorProps } from "./editor/rich-text-editor";
import { TagEditor } from "./tag-editor";
import type { TagSuggestion } from "./tag-input";

export interface ContentEditDialogProps {
	content: Content;
	editor?: Pick<RichTextEditorProps, "onError" | "onRequestLink">;
	onOpenChange(open: boolean): void;
	onError?(error: unknown): void;
	onSave(input: UpdateContent): Promise<Content>;
	onSaved?(content: Content): void;
	onSuggestTags?(input: { content: string; title?: string; type: Content["type"] }): Promise<string[]>;
	open: boolean;
	tagSuggestions?: TagSuggestion[];
}

function toEditorDocument(value: string): JSONContent {
	if (!value) return { content: [], type: "doc" };
	try {
		const parsed = JSON.parse(value) as JSONContent;
		if (parsed.type === "doc") return parsed;
	} catch {
		// Plain-text legacy notes become a paragraph without changing their meaning.
	}
	return { content: [{ content: [{ text: value, type: "text" }], type: "paragraph" }], type: "doc" };
}

function toTodos(value: string): Array<{ marked: boolean; text: string }> {
	try {
		const todos = JSON.parse(value) as Array<{ marked?: boolean; text?: string }>;
		return Array.isArray(todos)
			? todos
					.filter((todo): todo is { marked: boolean; text: string } => typeof todo?.text === "string")
					.map((todo) => ({ marked: Boolean(todo.marked), text: todo.text }))
			: [];
	} catch {
		return [];
	}
}

/** The canonical note/todo editor. Persistence and AI are passed in as platform services. */
export function ContentEditDialog({
	content,
	editor,
	onOpenChange,
	onError,
	onSave,
	onSaved,
	onSuggestTags,
	open,
	tagSuggestions,
}: ContentEditDialogProps) {
	const { t } = useI18n();
	const isTodo = content.type === "todo";
	const isEditableText = content.type === "note" || isTodo;
	const [title, setTitle] = useState(content.title ?? "");
	const [tags, setTags] = useState(content.tags);
	const [document, setDocument] = useState(() => toEditorDocument(content.content));
	const [todos, setTodos] = useState(() => toTodos(content.content));
	const [todoInput, setTodoInput] = useState("");
	const [fullScreen, setFullScreen] = useState(false);
	const [saving, setSaving] = useState(false);
	const [dirty, setDirty] = useState(false);
	const [confirmClose, setConfirmClose] = useState(false);
	const editorOption: ContentTypePickerOption = {
		description: "",
		icon: isTodo ? "todo" : "note",
		key: content.type,
		label: isTodo
			? t("content.editTodo")
			: content.type === "note"
				? t("content.editNote")
				: t("content.editContent"),
	};

	useEffect(() => {
		setTitle(content.title ?? "");
		setTags(content.tags);
		setDocument(toEditorDocument(content.content));
		setTodos(toTodos(content.content));
		setTodoInput("");
		setDirty(false);
	}, [content]);

	const canSave = useMemo(
		() =>
			isTodo
				? todos.length > 0 && todos.every((todo) => todo.text.trim())
				: isEditableText
					? Boolean(document.content?.length)
					: true,
		[document.content?.length, isEditableText, isTodo, todos]
	);
	const requestClose = () => {
		if (saving) return;
		if (dirty) setConfirmClose(true);
		else onOpenChange(false);
	};
	const resetDraft = () => {
		setTitle(content.title ?? "");
		setTags(content.tags);
		setDocument(toEditorDocument(content.content));
		setDirty(false);
	};
	const save = async () => {
		if (!canSave || saving) return;
		setSaving(true);
		try {
			const updated = await onSave({
				...(isEditableText
					? { content: isTodo ? JSON.stringify(todos) : JSON.stringify(document), type: content.type }
					: {}),
				id: content.id,
				tags,
				title: title.trim() || undefined,
			});
			setDirty(false);
			onSaved?.(updated);
			onOpenChange(false);
		} catch (error) {
			onError?.(error);
		} finally {
			setSaving(false);
		}
	};
	const addTodo = () => {
		const value = todoInput.trim();
		if (!value) return;
		setTodos((current) => [...current, { marked: false, text: value }]);
		setTodoInput("");
		setDirty(true);
	};
	return (
		<>
			<BaseModal
				className={!fullScreen ? "h-[min(840px,calc(100dvh-2rem))]" : undefined}
				closeOnOverlayClick={false}
				onOpenChange={(next) => (next ? onOpenChange(true) : requestClose())}
				open={open}
				size="xl"
				variant={fullScreen ? "fullscreen" : "default"}>
				<div className="flex min-h-0 flex-1 flex-col">
					<ContentTypeHeader
						isFullScreen={fullScreen}
						onBack={requestClose}
						onToggleFullScreen={() => setFullScreen((value) => !value)}
						options={[editorOption]}
						type={content.type}
					/>
					<form
						className="flex min-h-0 flex-1 flex-col"
						onSubmit={(event) => {
							event.preventDefault();
							void save();
						}}>
						<div className="min-h-0 flex-1 overflow-y-auto p-6">
							<div className="mx-auto w-full max-w-3xl">
								<input
									aria-label={t("content.titlePlaceholder")}
									className="h-auto w-full border-0 bg-transparent px-0 text-3xl leading-tight font-semibold tracking-tight outline-none placeholder:text-muted-foreground focus-visible:ring-0"
									data-testid="content-title"
									disabled={saving}
									onChange={(event) => {
										setTitle(event.target.value);
										setDirty(true);
									}}
									placeholder={t("content.titlePlaceholder")}
									type="text"
									value={title}
								/>
								<div className="mt-3">
									<TagEditor
										aiGenerate={
											onSuggestTags
												? {
														content: isTodo
															? JSON.stringify(todos)
															: isEditableText
																? JSON.stringify(document)
																: content.content,
														disabled: saving,
														mode: "draft",
														title: title.trim() || undefined,
														type: content.type,
													}
												: undefined
										}
										disabled={saving}
										onGenerateTags={
											onSuggestTags
												? async (input) =>
														onSuggestTags({
															content: input.mode === "draft" ? (input.content ?? "") : content.content,
															title: input.mode === "draft" ? input.title : undefined,
															type: input.mode === "draft" ? input.type : content.type,
														})
												: undefined
										}
										onTagsChange={(next) => {
											setTags(next);
											setDirty(true);
										}}
										onError={onError ? (message) => onError(new Error(message)) : undefined}
										placeholder={t("content.addTag")}
										suggestions={tagSuggestions}
										tags={tags}
									/>
								</div>
								{isTodo ? (
									<div className="mt-6 space-y-4">
										<div className="flex gap-2">
											<InputField
												disabled={saving}
												labelHidden
												label={t("content.todoPlaceholder")}
												onChange={setTodoInput}
												onKeyDown={(event) => {
													if (event.key === "Enter") {
														event.preventDefault();
														addTodo();
													}
												}}
												placeholder={t("content.todoPlaceholder")}
												value={todoInput}
											/>
											<Button
												disabled={saving || !todoInput.trim()}
												leadingIcon={Plus}
												onClick={addTodo}
												type="button">
												{t("content.addTodo")}
											</Button>
										</div>
										{todos.length ? (
											<div className="space-y-2">
												{todos.map((todo, index) => (
													<div className="group flex items-center gap-2" key={`${todo.text}-${index}`}>
														<CheckboxGroup
															checkedIndices={todo.marked ? new Set([0]) : new Set()}
															className="w-auto">
															<CheckboxItem
																checked={todo.marked}
																index={0}
																label={`Mark todo item ${index + 1}`}
																onToggle={() => {
																	setTodos((current) =>
																		current.map((item, itemIndex) =>
																			itemIndex === index ? { ...item, marked: !item.marked } : item
																		)
																	);
																	setDirty(true);
																}}
																className="size-5 px-0"
															/>
														</CheckboxGroup>
														<InputField
															label="Todo item"
															labelHidden
															disabled={saving}
															onChange={(value) => {
																setTodos((current) =>
																	current.map((item, itemIndex) =>
																		itemIndex === index ? { ...item, text: value } : item
																	)
																);
																setDirty(true);
															}}
															value={todo.text}
														/>
														<Button
															className="opacity-0 group-hover:opacity-100"
															disabled={saving}
															onClick={() => {
																setTodos((current) => current.filter((_, itemIndex) => itemIndex !== index));
																setDirty(true);
															}}
															size="icon"
															type="button"
															variant="ghost">
															<X className="size-4 text-destructive" />
														</Button>
													</div>
												))}
											</div>
										) : (
											<p className="text-sm text-muted-foreground">{t("content.emptyTodos")}</p>
										)}
									</div>
								) : isEditableText ? (
									<div className="mt-5">
										<RichTextEditor
											{...editor}
											data={document}
											onChange={(next) => {
												setDocument(next);
												setDirty(true);
											}}
											onReset={resetDraft}
											onSave={() => void save()}
											readOnly={saving}
											resetDisabled={saving || !dirty}
											saveDisabled={saving || !canSave}
										/>
									</div>
								) : (
									<p className="mt-6 text-sm leading-6 text-muted-foreground">
										Изменяйте название и теги материала. Исходный файл останется без изменений.
									</p>
								)}
							</div>
						</div>
						{content.type !== "note" && (
							<div className="flex shrink-0 justify-end gap-2 border-t bg-background p-4 sm:px-6">
								<Button disabled={saving} onClick={requestClose} type="button" variant="tertiary">
									{t("library.cancel")}
								</Button>
								<Button disabled={saving || !canSave} type="submit">
									{saving ? t("content.saving") : t("library.save")}
								</Button>
							</div>
						)}
					</form>
				</div>
			</BaseModal>
			<ConfirmDialog
				cancelText={t("library.cancel")}
				confirmText={t("content.discard")}
				description={t("library.unsavedDescription")}
				onConfirm={() => {
					setDirty(false);
					setConfirmClose(false);
					onOpenChange(false);
				}}
				onOpenChange={setConfirmClose}
				open={confirmClose}
				title={t("library.unsavedTitle")}
			/>
		</>
	);
}
