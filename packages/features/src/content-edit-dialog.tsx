import { uniqueTagTitles } from "@synapse/core";
import type { Content, UpdateContent } from "@synapse/shared/schemas";
import { Button, Input } from "@synapse/ui/components";
import type { JSONContent } from "@tiptap/core";
import { Maximize, Minimize, Plus, Sparkles, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { BaseModal } from "./dialogs/base-modal";
import { ConfirmDialog } from "./dialogs/confirm-dialog";
import { RichTextEditor, type RichTextEditorProps } from "./editor/rich-text-editor";
import { TagInput, type TagSuggestion } from "./tag-input";

export interface ContentEditDialogStrings {
	addTag: string;
	addTodo: string;
	cancel: string;
	discard: string;
	emptyTodos: string;
	editNote: string;
	editTodo: string;
	generateTags: string;
	generatingTags: string;
	save: string;
	saving: string;
	titlePlaceholder: string;
	todoPlaceholder: string;
	unsavedDescription: string;
	unsavedTitle: string;
}

const defaultStrings: ContentEditDialogStrings = {
	addTag: "+ Добавить тег",
	addTodo: "Добавить",
	cancel: "Отмена",
	discard: "Не сохранять",
	emptyTodos: "Список пока пуст",
	editNote: "Редактировать заметку",
	editTodo: "Редактировать список",
	generateTags: "AI-теги",
	generatingTags: "Генерация…",
	save: "Сохранить",
	saving: "Сохранение…",
	titlePlaceholder: "Заголовок",
	todoPlaceholder: "Добавить пункт…",
	unsavedDescription: "Есть несохранённые изменения. Закрыть без сохранения?",
	unsavedTitle: "Несохранённые изменения",
};

export interface ContentEditDialogProps {
	content: Content;
	editor?: Pick<RichTextEditorProps, "onError" | "onRequestLink" | "strings">;
	onOpenChange(open: boolean): void;
	onError?(error: unknown): void;
	onSave(input: UpdateContent): Promise<Content>;
	onSaved?(content: Content): void;
	onSuggestTags?(input: { content: string; title?: string; type: Content["type"] }): Promise<string[]>;
	open: boolean;
	strings?: Partial<ContentEditDialogStrings>;
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
	strings: stringOverrides,
	tagSuggestions,
}: ContentEditDialogProps) {
	const strings = { ...defaultStrings, ...stringOverrides };
	const isTodo = content.type === "todo";
	const [title, setTitle] = useState(content.title ?? "");
	const [tags, setTags] = useState(content.tags);
	const [document, setDocument] = useState(() => toEditorDocument(content.content));
	const [todos, setTodos] = useState(() => toTodos(content.content));
	const [todoInput, setTodoInput] = useState("");
	const [fullScreen, setFullScreen] = useState(false);
	const [saving, setSaving] = useState(false);
	const [suggesting, setSuggesting] = useState(false);
	const [dirty, setDirty] = useState(false);
	const [confirmClose, setConfirmClose] = useState(false);

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
				: Boolean(document.content?.length),
		[document.content?.length, isTodo, todos]
	);
	const requestClose = () => {
		if (saving) return;
		if (dirty) setConfirmClose(true);
		else onOpenChange(false);
	};
	const save = async () => {
		if (!canSave || saving) return;
		setSaving(true);
		try {
			const updated = await onSave({
				content: isTodo ? JSON.stringify(todos) : JSON.stringify(document),
				id: content.id,
				tags,
				title: title.trim() || undefined,
				type: content.type,
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
	const suggestTags = async () => {
		if (!onSuggestTags || suggesting) return;
		setSuggesting(true);
		try {
			const generated = await onSuggestTags({
				content: isTodo ? JSON.stringify(todos) : JSON.stringify(document),
				title: title.trim() || undefined,
				type: content.type,
			});
			setTags((current) => uniqueTagTitles([...current, ...generated]));
			setDirty(true);
		} catch (error) {
			onError?.(error);
		} finally {
			setSuggesting(false);
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
				className={
					fullScreen
						? "h-full max-h-none w-full max-w-none rounded-none"
						: "h-[min(840px,calc(100vh-2rem))] w-[95vw] max-w-5xl"
				}
				closeOnOverlayClick={false}
				onOpenChange={(next) => (next ? onOpenChange(true) : requestClose())}
				open={open}
				size="xl">
				<div className="flex min-h-0 flex-1 flex-col">
					<div className="flex items-center justify-between border-b p-4">
						<h2 className="text-lg font-semibold">{isTodo ? strings.editTodo : strings.editNote}</h2>
						<div className="flex items-center gap-2">
							<Button
								onClick={() => setFullScreen((value) => !value)}
								size="sm"
								type="button"
								variant="ghost">
								{fullScreen ? <Minimize className="size-4" /> : <Maximize className="size-4" />}
							</Button>
							<Button onClick={requestClose} size="sm" type="button" variant="ghost">
								<X className="size-4" />
							</Button>
						</div>
					</div>
					<form
						className="flex min-h-0 flex-1 flex-col"
						onSubmit={(event) => {
							event.preventDefault();
							void save();
						}}>
						<div className="min-h-0 flex-1 overflow-y-auto px-6 pt-8 pb-6">
							<div className="mx-auto w-full max-w-3xl">
								<Input
									className="h-auto border-none bg-transparent! px-0 text-3xl! font-semibold tracking-tight shadow-none focus-visible:ring-0"
									disabled={saving}
									onChange={(event) => {
										setTitle(event.target.value);
										setDirty(true);
									}}
									placeholder={strings.titlePlaceholder}
									value={title}
								/>
								<div className="mt-3">
									<TagInput
										action={
											onSuggestTags ? (
												<Button
													disabled={saving || suggesting}
													leadingIcon={Sparkles}
													onClick={() => void suggestTags()}
													size="sm"
													type="button">
													{suggesting ? strings.generatingTags : strings.generateTags}
												</Button>
											) : undefined
										}
										disabled={saving}
										onTagsChange={(next) => {
											setTags(next);
											setDirty(true);
										}}
										placeholder={strings.addTag}
										suggestions={tagSuggestions}
										tags={tags}
									/>
								</div>
								{isTodo ? (
									<div className="mt-6 space-y-4">
										<div className="flex gap-2">
											<Input
												disabled={saving}
												onChange={(event) => setTodoInput(event.target.value)}
												onKeyDown={(event) => {
													if (event.key === "Enter") {
														event.preventDefault();
														addTodo();
													}
												}}
												placeholder={strings.todoPlaceholder}
												value={todoInput}
											/>
											<Button
												disabled={saving || !todoInput.trim()}
												leadingIcon={Plus}
												onClick={addTodo}
												type="button">
												{strings.addTodo}
											</Button>
										</div>
										{todos.length ? (
											<div className="space-y-2">
												{todos.map((todo, index) => (
													<div className="group flex items-center gap-2" key={`${todo.text}-${index}`}>
														<Input
															checked={todo.marked}
															disabled={saving}
															onChange={() => {
																setTodos((current) =>
																	current.map((item, itemIndex) =>
																		itemIndex === index ? { ...item, marked: !item.marked } : item
																	)
																);
																setDirty(true);
															}}
															type="checkbox"
															className="size-5"
														/>
														<Input
															disabled={saving}
															onChange={(event) => {
																const value = event.target.value;
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
											<p className="text-sm text-muted-foreground">{strings.emptyTodos}</p>
										)}
									</div>
								) : (
									<div className="mt-4">
										<RichTextEditor
											{...editor}
											data={document}
											onChange={(next) => {
												setDocument(next);
												setDirty(true);
											}}
											readOnly={saving}
										/>
									</div>
								)}
							</div>
						</div>
						<div className="flex justify-end gap-3 border-t bg-background p-6 pt-4">
							<Button disabled={saving} onClick={requestClose} type="button" variant="tertiary">
								{strings.cancel}
							</Button>
							<Button disabled={saving || !canSave} type="submit">
								{saving ? strings.saving : strings.save}
							</Button>
						</div>
					</form>
				</div>
			</BaseModal>
			<ConfirmDialog
				cancelText={strings.cancel}
				confirmText={strings.discard}
				description={strings.unsavedDescription}
				onConfirm={() => {
					setDirty(false);
					setConfirmClose(false);
					onOpenChange(false);
				}}
				onOpenChange={setConfirmClose}
				open={confirmClose}
				title={strings.unsavedTitle}
			/>
		</>
	);
}
