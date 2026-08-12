import type { BinaryFile } from "@synapse/api";
import type { Content } from "@synapse/shared/schemas";
import { Button, CheckboxGroup, CheckboxItem, InputField, Label } from "@synapse/ui/components";
import type { JSONContent } from "@tiptap/core";
import { Plus, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { ContentTypeHeader, ContentTypePicker, type ContentTypePickerOption } from "./content-type-picker";
import { BaseModal } from "./dialogs/base-modal";
import { ConfirmDialog } from "./dialogs/confirm-dialog";
import { DocumentDropZone } from "./document-drop-zone";
import { RichTextEditor } from "./editor/rich-text-editor";
import { inferMimeType } from "./file-import";
import { MediaDropZone } from "./media-drop-zone";
import { useAppServices } from "./runtime";
import { TagEditor } from "./tag-editor";

export interface ContentCreateDialogStrings {
	addItem: string;
	addTag: string;
	addTodo: string;
	cancel: string;
	changeTypeDescription: string;
	changeTypeTitle: string;
	chooseFiles: string;
	contentRequired: string;
	create: string;
	creating: string;
	discard: string;
	description: string;
	documentFiles: string;
	eyebrow: string;
	fileRequired: string;
	files: string;
	fullScreen: string;
	linkParsed: string;
	linkParsingFailed: string;
	linkUrl: string;
	makeTrack: string;
	parse: string;
	parsing: string;
	save: string;
	suggestTags: string;
	suggestingTags: string;
	tags: string;
	title: string;
	titleOptional: string;
	titlePlaceholder: string;
	todoRequired: string;
	todoTitle: string;
	typePickerTitle: string;
	unsavedDescription: string;
	unsavedTitle: string;
	upload: string;
	uploading: (count: number) => string;
	windowed: string;
}

const defaultStrings: ContentCreateDialogStrings = {
	addItem: "Добавить пункт…",
	addTag: "+ Добавить тег",
	addTodo: "Добавить",
	cancel: "Отмена",
	changeTypeDescription: "Несохранённые изменения будут удалены. Перейти к выбору другого типа?",
	changeTypeTitle: "Сменить тип материала?",
	chooseFiles: "Выбрать файлы",
	contentRequired: "Добавьте содержимое заметки",
	create: "Создать",
	creating: "Сохранение…",
	discard: "Удалить изменения",
	description: "Выберите формат — в дальнейшем его можно будет открыть и найти в библиотеке.",
	documentFiles: "Документы",
	eyebrow: "Новый материал",
	fileRequired: "Выберите хотя бы один файл",
	files: "Файлы",
	fullScreen: "На весь экран",
	linkParsed: "Ссылка распознана",
	linkParsingFailed: "Не удалось распознать ссылку",
	linkUrl: "https://example.com",
	makeTrack: "Создать трек в плейлисте",
	parse: "Распознать",
	parsing: "Обработка…",
	save: "Сохранить",
	suggestTags: "AI-теги",
	suggestingTags: "Генерация…",
	tags: "Теги",
	title: "Заголовок",
	titleOptional: "Заголовок (необязательно)",
	titlePlaceholder: "Введите заголовок…",
	todoRequired: "Добавьте хотя бы одну задачу",
	todoTitle: "Название списка…",
	typePickerTitle: "Что добавим?",
	unsavedDescription: "Есть несохранённые изменения. Закрыть без сохранения?",
	unsavedTitle: "Несохранённые изменения",
	upload: "Загрузить",
	uploading: (count) => `Загрузка ${count} файлов…`,
	windowed: "Оконный режим",
};

export interface ContentCreateDialogProps {
	initialTags?: string[];
	onContentAdded?(content?: Content | Content[]): void;
	onError?(message: string): void;
	onOpenChange(open: boolean): void;
	open: boolean;
	options: ContentTypePickerOption[];
	preloadedFiles?: File[];
	strings?: Partial<ContentCreateDialogStrings>;
	suggestedType?: Content["type"] | null;
}

/**
 * Canonical content-creation flow. It knows only the transport-neutral client
 * port, so REST and Electron IPC run the same type picker and import forms.
 */
export function ContentCreateDialog({
	initialTags = [],
	onContentAdded,
	onError,
	onOpenChange,
	open,
	options,
	preloadedFiles = [],
	strings: stringOverrides,
	suggestedType,
}: ContentCreateDialogProps) {
	const strings = { ...defaultStrings, ...stringOverrides };
	const { client } = useAppServices();
	const [type, setType] = useState<Content["type"] | null>(null);
	const [isFullScreen, setIsFullScreen] = useState(false);
	const [title, setTitle] = useState("");
	const [tags, setTags] = useState(initialTags);
	const [note, setNote] = useState<JSONContent | null>(null);
	const [todos, setTodos] = useState<Array<{ marked: boolean; text: string }>>([]);
	const [todoInput, setTodoInput] = useState("");
	const [url, setUrl] = useState("");
	const [parsing, setParsing] = useState(false);
	const [parsedDescription, setParsedDescription] = useState<string>();
	const [files, setFiles] = useState<File[]>([]);
	const [makeTrack, setMakeTrack] = useState(false);
	const [saving, setSaving] = useState(false);
	const [confirmAction, setConfirmAction] = useState<"close" | "changeType" | null>(null);
	const [ignorePreloadedFiles, setIgnorePreloadedFiles] = useState(false);
	const initializedOpenRef = useRef(false);
	const activePreloadedFiles = useMemo(
		() => (!ignorePreloadedFiles && type && type === suggestedType ? preloadedFiles : []),
		[ignorePreloadedFiles, preloadedFiles, suggestedType, type]
	);

	useEffect(() => {
		if (!open) {
			initializedOpenRef.current = false;
			setType(null);
			setIsFullScreen(false);
			setTitle("");
			setTags(initialTags);
			setNote(null);
			setTodos([]);
			setTodoInput("");
			setUrl("");
			setParsedDescription(undefined);
			setFiles([]);
			setMakeTrack(false);
			setIgnorePreloadedFiles(false);
			return;
		}
		if (initializedOpenRef.current) return;
		initializedOpenRef.current = true;
		setType(suggestedType ?? null);
		setTags(initialTags);
		setIgnorePreloadedFiles(false);
	}, [initialTags, open, suggestedType]);

	useEffect(() => {
		if (activePreloadedFiles.length) setFiles(activePreloadedFiles);
	}, [activePreloadedFiles]);

	const fail = (message: string) => onError?.(message);
	const addFiles = (next: File[]) => {
		const accepted = next.filter((file) => acceptsFile(type, file));
		if (accepted.length !== next.length) fail("Некоторые файлы не подходят для выбранного типа");
		setFiles((current) => [...current, ...accepted]);
	};
	const isDirty = Boolean(
		title ||
		url ||
		files.length ||
		hasMeaningfulNoteContent(note) ||
		todos.length ||
		todoInput ||
		makeTrack ||
		!sameTags(tags, initialTags)
	);
	const resetDraft = () => {
		// The parent keeps dropped files until the modal closes. Do not hydrate them
		// again when the user picks another type after explicitly discarding a draft.
		setIgnorePreloadedFiles(true);
		setType(null);
		setIsFullScreen(false);
		setTitle("");
		setTags(initialTags);
		setNote(null);
		setTodos([]);
		setTodoInput("");
		setUrl("");
		setParsedDescription(undefined);
		setFiles([]);
		setMakeTrack(false);
	};
	const requestClose = () => {
		if (saving) return;
		if (isDirty) setConfirmAction("close");
		else onOpenChange(false);
	};
	const requestTypeChange = () => {
		if (saving) return;
		if (isDirty) setConfirmAction("changeType");
		else resetDraft();
	};
	const save = async () => {
		if (!type || saving) return;
		setSaving(true);
		try {
			if (type === "note") {
				if (!hasMeaningfulNoteContent(note)) return fail(strings.contentRequired);
				onContentAdded?.(
					await client.content.create({
						content: JSON.stringify(note),
						media_type: "image",
						tags,
						title: title || undefined,
						type,
					})
				);
			} else if (type === "todo") {
				const valid = todos.filter((todo) => todo.text.trim());
				if (!valid.length) return fail(strings.todoRequired);
				onContentAdded?.(
					await client.content.create({
						content: JSON.stringify(valid),
						media_type: "image",
						tags,
						title: title || undefined,
						type,
					})
				);
			} else if (type === "link") {
				if (!url.trim()) return fail(strings.linkUrl);
				onContentAdded?.(
					await client.content.create({
						content: url.trim(),
						media_type: "image",
						tags,
						title: title || undefined,
						type,
						url: url.trim(),
					})
				);
			} else {
				if (!files.length) return fail(strings.fileRequired);
				const payload = await Promise.all(files.map(toBinaryFile));
				if (type === "audio" || type === "media") {
					const result = await client.content.upload({
						files: payload,
						makeTrack: type === "audio" ? makeTrack : undefined,
						tags: tags.length ? tags : undefined,
						title: title || undefined,
					});
					if (result.errors.length) fail(result.errors.join(", "));
					onContentAdded?.(result.contents);
				} else {
					const imported = await Promise.all(
						payload.map((file) =>
							client.content.importFile({
								file,
								tags: tags.length ? tags : undefined,
								title: title || undefined,
							})
						)
					);
					onContentAdded?.(imported.map((result) => result.content));
				}
			}
			onOpenChange(false);
		} catch (error) {
			fail(error instanceof Error ? error.message : "Не удалось сохранить материал");
		} finally {
			setSaving(false);
		}
	};
	const parseLink = async () => {
		if (!url.trim() || parsing) return;
		setParsing(true);
		try {
			const parsed = await client.content.parseLink({ url: url.trim() });
			if (!title && parsed.title) setTitle(parsed.title);
			setParsedDescription(parsed.description);
		} catch {
			fail(strings.linkParsingFailed);
		} finally {
			setParsing(false);
		}
	};
	const addTodo = () => {
		const text = todoInput.trim();
		if (!text) return;
		setTodos((current) => [...current, { marked: false, text }]);
		setTodoInput("");
	};
	const size = !type ? "md" : type === "note" || type === "todo" ? "xl" : "lg";
	return (
		<>
			<BaseModal
				className={type === "note" && !isFullScreen ? "h-[min(840px,calc(100vh-2rem))]" : undefined}
				onOpenChange={(next) => (next ? onOpenChange(true) : requestClose())}
				open={open}
				size={size}
				variant={isFullScreen ? "fullscreen" : "default"}>
				{type && (
					<ContentTypeHeader
						isFullScreen={isFullScreen}
						onBack={requestTypeChange}
						onToggleFullScreen={() => setIsFullScreen((value) => !value)}
						options={options}
						strings={{ fullScreen: strings.fullScreen, windowed: strings.windowed }}
						type={type}
					/>
				)}
				{!type ? (
					<ContentTypePicker
						onSelect={setType}
						options={options}
						strings={{
							description: strings.description,
							eyebrow: strings.eyebrow,
							title: strings.typePickerTitle,
						}}
					/>
				) : (
					<form
						className="flex min-h-0 flex-1 flex-col"
						onSubmit={(event) => {
							event.preventDefault();
							void save();
						}}>
						<div className="min-h-0 flex-1 overflow-y-auto p-6">
							{type === "note" ? (
								<div className="mx-auto flex h-full max-w-3xl flex-col">
									<InputField
										className="h-auto border-none bg-transparent! px-0 text-3xl! font-semibold tracking-tight shadow-none focus-visible:ring-0"
										data-testid="content-title"
										disabled={saving}
										onChange={setTitle}
										placeholder={strings.titlePlaceholder}
										value={title}
										label={strings.titlePlaceholder}
										labelHidden
									/>
									<div className="mt-3">
										<TagEditor
											aiGenerate={{
												content: JSON.stringify(note ?? { content: [], type: "doc" }),
												disabled: saving || !hasMeaningfulNoteContent(note),
												mode: "draft",
												title: title || undefined,
												type: "note",
											}}
											disabled={saving}
											onError={fail}
											onTagsChange={setTags}
											placeholder={strings.addTag}
											strings={{ generate: strings.suggestTags, generating: strings.suggestingTags }}
											tags={tags}
										/>
									</div>
									<div className="mt-5 min-h-0 flex-1">
										<RichTextEditor data={note} onChange={setNote} readOnly={saving} />
									</div>
								</div>
							) : type === "todo" ? (
								<TodoForm
									onError={fail}
									strings={strings}
									title={title}
									setTitle={setTitle}
									tags={tags}
									setTags={setTags}
									todos={todos}
									setTodos={setTodos}
									todoInput={todoInput}
									setTodoInput={setTodoInput}
									addTodo={addTodo}
									saving={saving}
								/>
							) : type === "link" ? (
								<LinkForm
									onError={fail}
									strings={strings}
									title={title}
									setTitle={setTitle}
									tags={tags}
									setTags={setTags}
									url={url}
									setUrl={setUrl}
									parsing={parsing}
									parsedDescription={parsedDescription}
									onParse={() => void parseLink()}
									saving={saving}
								/>
							) : (
								<FileForm
									type={type}
									strings={strings}
									title={title}
									setTitle={setTitle}
									tags={tags}
									setTags={setTags}
									files={files}
									setFiles={setFiles}
									makeTrack={makeTrack}
									setMakeTrack={setMakeTrack}
									onAddFiles={addFiles}
									saving={saving}
								/>
							)}
						</div>
						<div className="flex shrink-0 justify-end gap-2 border-t bg-background p-4 sm:px-6">
							<Button disabled={saving} onClick={() => onOpenChange(false)} type="button" variant="tertiary">
								{strings.cancel}
							</Button>
							<Button disabled={saving} loading={saving} type="submit">
								{saving
									? type === "audio" || type === "media" || isDocument(type)
										? strings.uploading(files.length)
										: strings.creating
									: type === "audio" || type === "media" || isDocument(type)
										? strings.upload
										: strings.save}
							</Button>
						</div>
					</form>
				)}
			</BaseModal>
			<ConfirmDialog
				cancelText={strings.cancel}
				confirmText={strings.discard}
				description={
					confirmAction === "changeType" ? strings.changeTypeDescription : strings.unsavedDescription
				}
				onConfirm={() => {
					if (confirmAction === "changeType") resetDraft();
					else onOpenChange(false);
					setConfirmAction(null);
				}}
				onOpenChange={(open) => {
					if (!open) setConfirmAction(null);
				}}
				open={confirmAction !== null}
				testId={confirmAction === "changeType" ? "change-type-confirm" : "discard-draft-confirm"}
				title={confirmAction === "changeType" ? strings.changeTypeTitle : strings.unsavedTitle}
			/>
		</>
	);
}

function TodoForm({
	addTodo,
	onError,
	saving,
	setTags,
	setTitle,
	setTodoInput,
	setTodos,
	strings,
	tags,
	title,
	todoInput,
	todos,
}: {
	addTodo(): void;
	onError(message: string): void;
	saving: boolean;
	setTags(tags: string[]): void;
	setTitle(value: string): void;
	setTodoInput(value: string): void;
	setTodos(
		value:
			| Array<{ marked: boolean; text: string }>
			| ((current: Array<{ marked: boolean; text: string }>) => Array<{ marked: boolean; text: string }>)
	): void;
	strings: ContentCreateDialogStrings;
	tags: string[];
	title: string;
	todoInput: string;
	todos: Array<{ marked: boolean; text: string }>;
}) {
	return (
		<div className="mx-auto max-w-3xl space-y-5">
			<label className="grid gap-2 text-sm font-medium">
				{strings.title}
				<InputField
					data-testid="content-title"
					disabled={saving}
					onChange={setTitle}
					placeholder={strings.todoTitle}
					labelHidden
					label={strings.todoTitle}
					value={title}
				/>
			</label>
			<div className="space-y-2">
				<Label>{strings.addTodo}</Label>
				{todos.map((todo, index) => (
					<div className="flex gap-2" key={`${todo.text}-${index}`}>
						<InputField
							label="Todo tags"
							labelHidden
							disabled={saving}
							onChange={(value) =>
								setTodos((current) =>
									current.map((item, itemIndex) => (itemIndex === index ? { ...item, text: value } : item))
								)
							}
							value={todo.text}
						/>
						<Button
							disabled={saving}
							onClick={() => setTodos((current) => current.filter((_, itemIndex) => itemIndex !== index))}
							size="icon"
							type="button"
							variant="ghost">
							<X className="size-4" />
						</Button>
					</div>
				))}
				<div className="flex gap-2">
					<InputField
						data-testid="todo-item"
						disabled={saving}
						label={strings.addItem}
						labelHidden
						onChange={setTodoInput}
						onKeyDown={(event) => {
							if (event.key === "Enter") {
								event.preventDefault();
								addTodo();
							}
						}}
						placeholder={strings.addItem}
						value={todoInput}
					/>
					<Button disabled={saving || !todoInput.trim()} onClick={addTodo} type="button" variant="tertiary">
						<Plus className="size-4" />
					</Button>
				</div>
			</div>
			<div className="grid gap-2 text-sm font-medium">
				<Label>{strings.tags}</Label>
				<TagEditor
					aiGenerate={{
						content: JSON.stringify(todos.filter((todo) => todo.text.trim())),
						disabled: saving || !todos.some((todo) => todo.text.trim()),
						mode: "draft",
						title: title || undefined,
						type: "todo",
					}}
					disabled={saving}
					onError={onError}
					onTagsChange={setTags}
					placeholder={strings.addTag}
					strings={{ generate: strings.suggestTags, generating: strings.suggestingTags }}
					tags={tags}
				/>
			</div>
		</div>
	);
}

function LinkForm({
	onError,
	onParse,
	parsedDescription,
	parsing,
	saving,
	setTags,
	setTitle,
	setUrl,
	strings,
	tags,
	title,
	url,
}: {
	onError(message: string): void;
	onParse(): void;
	parsedDescription?: string;
	parsing: boolean;
	saving: boolean;
	setTags(tags: string[]): void;
	setTitle(value: string): void;
	setUrl(value: string): void;
	strings: ContentCreateDialogStrings;
	tags: string[];
	title: string;
	url: string;
}) {
	return (
		<div className="mx-auto max-w-3xl space-y-5">
			<label className="grid gap-2 text-sm font-medium">
				<span>URL</span>
				<div className="flex gap-2">
					<InputField
						label={strings.linkUrl}
						labelHidden
						data-testid="content-url"
						disabled={saving || parsing}
						onChange={setUrl}
						placeholder={strings.linkUrl}
						required
						type="url"
						value={url}
					/>
					<Button
						disabled={saving || parsing || !url.trim()}
						onClick={onParse}
						type="button"
						variant="tertiary">
						{parsing ? strings.parsing : strings.parse}
					</Button>
				</div>
			</label>
			{parsedDescription && (
				<p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">{parsedDescription}</p>
			)}
			<label className="grid gap-2 text-sm font-medium">
				{strings.titleOptional}
				<InputField
					data-testid="content-title"
					disabled={saving}
					label={strings.titlePlaceholder}
					labelHidden
					onChange={setTitle}
					placeholder={strings.titlePlaceholder}
					value={title}
				/>
			</label>
			<div className="grid gap-2 text-sm font-medium">
				<Label>{strings.tags}</Label>
				<TagEditor
					aiGenerate={{
						content: parsedDescription ?? url,
						disabled: saving || !url.trim(),
						mode: "draft",
						title: title || undefined,
						type: "link",
					}}
					disabled={saving}
					onError={onError}
					onTagsChange={setTags}
					placeholder={strings.addTag}
					strings={{ generate: strings.suggestTags, generating: strings.suggestingTags }}
					tags={tags}
				/>
			</div>
		</div>
	);
}

function FileForm({
	files,
	makeTrack,
	onAddFiles,
	saving,
	setFiles,
	setMakeTrack,
	setTags,
	setTitle,
	strings,
	tags,
	title,
	type,
}: {
	files: File[];
	makeTrack: boolean;
	onAddFiles(files: File[]): void;
	saving: boolean;
	setFiles(value: File[] | ((current: File[]) => File[])): void;
	setMakeTrack(value: boolean): void;
	setTags(tags: string[]): void;
	setTitle(value: string): void;
	strings: ContentCreateDialogStrings;
	tags: string[];
	title: string;
	type: Content["type"];
}) {
	const isDocumentType = isDocument(type);
	const [dragActive, setDragActive] = useState(false);
	const previewUrls = useMemo(() => files.map((file) => URL.createObjectURL(file)), [files]);
	useEffect(() => () => previewUrls.forEach((url) => URL.revokeObjectURL(url)), [previewUrls]);
	const onDrag = (event: React.DragEvent) => setDragActive(event.type !== "dragleave");
	const onDrop = (event: React.DragEvent) => {
		event.preventDefault();
		setDragActive(false);
		onAddFiles(Array.from(event.dataTransfer.files));
	};
	const moveFile = (from: number, to: number) =>
		setFiles((current) => {
			const next = [...current];
			const [file] = next.splice(from, 1);
			next.splice(to, 0, file);
			return next;
		});
	return (
		<div className="mx-auto max-w-3xl space-y-5">
			<label className="grid gap-2 text-sm font-medium">
				{isDocumentType ? strings.documentFiles : strings.files}
				{isDocumentType ? (
					<DocumentDropZone
						dragActive={dragActive}
						isLoading={saving}
						onDrag={onDrag}
						onDrop={onDrop}
						onFileSelect={(selected) => onAddFiles(Array.from(selected))}
						onRemoveFile={(index) =>
							setFiles((current) => current.filter((_, fileIndex) => fileIndex !== index))
						}
						selectedFiles={files}
					/>
				) : (
					<MediaDropZone
						dragActive={dragActive}
						kind={type === "audio" ? "audio" : "media"}
						isLoading={saving}
						onDrag={onDrag}
						onDrop={onDrop}
						onFileSelect={(selected) => onAddFiles(Array.from(selected))}
						onMoveFile={moveFile}
						onRemoveFile={(index) =>
							setFiles((current) => current.filter((_, fileIndex) => fileIndex !== index))
						}
						previewUrls={previewUrls}
						selectedFiles={files}
					/>
				)}
			</label>
			{!isDocumentType && (
				<>
					<label className="grid gap-2 text-sm font-medium">
						{strings.titleOptional}
						<InputField
							label={strings.titleOptional}
							labelHidden
							data-testid="content-title"
							disabled={saving}
							onChange={setTitle}
							placeholder={strings.titlePlaceholder}
							value={title}
						/>
					</label>
					{type === "audio" && (
						<div>
							<CheckboxGroup checkedIndices={makeTrack ? new Set([0]) : new Set()} className="w-auto">
								<CheckboxItem
									checked={makeTrack}
									index={0}
									label={strings.makeTrack}
									onToggle={() => setMakeTrack(!makeTrack)}
									aria-disabled={saving}
									className={saving ? "pointer-events-none opacity-50" : undefined}
								/>
							</CheckboxGroup>
						</div>
					)}
					<div className="grid gap-2 text-sm font-medium">
						<Label>{strings.tags}</Label>
						<TagEditor disabled={saving} onTagsChange={setTags} placeholder={strings.addTag} tags={tags} />
					</div>
				</>
			)}
		</div>
	);
}

function isDocument(type: Content["type"]): boolean {
	return ["doc", "pdf", "docx", "epub", "xlsx", "csv"].includes(type);
}

function hasMeaningfulNoteContent(document: JSONContent | null): boolean {
	const visit = (node: JSONContent): boolean => {
		if (node.type === "text") return Boolean(node.text);
		if (node.type && !["doc", "paragraph", "hardBreak"].includes(node.type)) return true;
		return node.content?.some(visit) ?? false;
	};
	return document?.content?.some(visit) ?? false;
}

function sameTags(left: string[], right: string[]): boolean {
	return left.length === right.length && left.every((tag) => right.includes(tag));
}

function acceptsFile(type: Content["type"] | null, file: File): boolean {
	if (!type) return false;
	const mimeType = inferMimeType(file.name, file.type);
	if (type === "audio") return mimeType.startsWith("audio/");
	if (type === "media") return mimeType.startsWith("image/") || mimeType.startsWith("video/");
	return isDocument(type) ? /\.(pdf|docx|epub|xlsx|xls|csv)$/i.test(file.name) : false;
}
async function toBinaryFile(file: File): Promise<BinaryFile> {
	return {
		bytes: new Uint8Array(await file.arrayBuffer()),
		name: file.name,
		size: file.size,
		type: inferMimeType(file.name, file.type),
	};
}
