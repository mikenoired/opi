import type { Content } from "@synapse/shared/schemas";
import type { ReactNode } from "react";
import { createContext, useContext } from "react";

import { useContentForm } from "./use-content-form";
import { useFormSubmission } from "./use-form-submission";
import { useLinkParser } from "./use-link-parser";
import { useMediaUpload } from "./use-media-upload";
import { useTagManager } from "./use-tag-manager";
import { useTodoManager } from "./use-todo-manager";

interface AddContentContextType {
	// Form state
	formState: ReturnType<typeof useContentForm>["state"];
	editorData: any;
	setEditorData: (data: any) => void;
	updateType: (type: Content["type"]) => void;
	updateTitle: (title: string) => void;
	updateContent: (content: string) => void;
	toggleFullScreen: () => void;

	// Tags
	tags: string[];
	currentTag: string;
	updateCurrentTag: (tag: string) => void;
	addTag: () => void;
	addTags: (names: string[]) => void;
	setTags: (names: string[]) => void;
	removeTag: (tag: string) => void;
	handleTagKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;

	// Media
	selectedFiles: File[];
	previewUrls: string[];
	dragActive: boolean;
	handleFileSelect: (files: FileList | File[]) => void;
	removeFile: (index: number) => void;
	moveFile: (fromIndex: number, toIndex: number) => void;
	handleDrag: (e: React.DragEvent) => void;
	handleDrop: (e: React.DragEvent) => void;

	// Todo
	todoItems: ReturnType<typeof useTodoManager>["items"];
	addTodo: (text: string) => void;
	removeTodo: (index: number) => void;
	toggleTodo: (index: number) => void;
	updateTodoText: (index: number, text: string) => void;
	hasValidTodos: boolean;

	// Link
	parsedLinkData: ReturnType<typeof useLinkParser>["parsedData"];
	linkParsing: ReturnType<typeof useLinkParser>["isLoading"];
	parseLink: (url: string) => Promise<any>;
	clearParsedData: () => void;

	// Form submission
	submitContent: () => Promise<boolean>;
	isSubmitting: boolean;
	uploadFiles: (
		files: File[],
		title?: string,
		tags?: string[],
		extra?: Record<string, string | boolean>
	) => Promise<{ objectName: string; url: string; thumbnail?: string; content?: Content }[]>;

	// Utils
	resetForm: () => void;
}

const AddContentContext = createContext<AddContentContextType | null>(null);

interface AddContentProviderProps {
	children: ReactNode;
	initialTags?: string[];
	onSuccess: () => void;
	onContentAdded?: (content?: Content | Content[]) => void;
}

export function AddContentProvider({
	children,
	initialTags = [],
	onSuccess,
	onContentAdded,
}: AddContentProviderProps) {
	const form = useContentForm();
	const tags = useTagManager(initialTags);
	const media = useMediaUpload();
	const todos = useTodoManager();
	const links = useLinkParser();
	const submission = useFormSubmission({ onSuccess, onContentAdded });

	const resetForm = () => {
		form.resetForm();
		tags.resetTags();
		media.resetMedia();
		todos.resetTodos();
		links.resetLink();
	};

	const submitContent = async () => {
		return await submission.submitContent(form.state, tags.tags, {
			editorData: form.editorData,
			todoItems: todos.items,
			parsedLinkData: links.parsedData,
			selectedFiles: media.selectedFiles,
		});
	};

	const value: AddContentContextType = {
		// Form state
		formState: form.state,
		editorData: form.editorData,
		setEditorData: form.setEditorData,
		updateType: form.updateType,
		updateTitle: form.updateTitle,
		updateContent: form.updateContent,
		toggleFullScreen: form.toggleFullScreen,

		// Tags
		tags: tags.tags,
		currentTag: tags.currentTag,
		updateCurrentTag: tags.updateCurrentTag,
		addTag: tags.addTag,
		addTags: tags.addTags,
		setTags: tags.setTags,
		removeTag: tags.removeTag,
		handleTagKeyDown: tags.handleKeyDown,

		// Media
		selectedFiles: media.selectedFiles,
		previewUrls: media.previewUrls,
		dragActive: media.dragActive,
		handleFileSelect: media.handleFileSelect,
		removeFile: media.removeFile,
		moveFile: media.moveFile,
		handleDrag: media.handleDrag,
		handleDrop: media.handleDrop,

		// Todo
		todoItems: todos.items,
		addTodo: todos.addTodo,
		removeTodo: todos.removeTodo,
		toggleTodo: todos.toggleTodo,
		updateTodoText: todos.updateTodoText,
		hasValidTodos: todos.hasValidTodos,

		// Link
		parsedLinkData: links.parsedData,
		linkParsing: links.isLoading,
		parseLink: links.parseLink,
		clearParsedData: links.clearParsedData,

		// Form submission
		submitContent,
		isSubmitting: submission.isLoading,
		uploadFiles: submission.uploadFiles,

		// Utils
		resetForm,
	};

	return <AddContentContext.Provider value={value}>{children}</AddContentContext.Provider>;
}

export function useAddContent() {
	const context = useContext(AddContentContext);
	if (!context) {
		throw new Error("useAddContent must be used within AddContentProvider");
	}
	return context;
}
