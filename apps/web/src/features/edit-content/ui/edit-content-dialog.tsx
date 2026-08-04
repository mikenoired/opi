import type { Content } from "@synapse/shared/schemas";
import { Button, Input } from "@synapse/ui/components";
import type { JSONContent } from "@tiptap/core";
import { Maximize, Minimize, Plus, X } from "lucide-react";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";

import { api } from "@/shared/api/hooks";
import { TagEditor } from "@/shared/ui/tag-editor";
import { Editor } from "@/widgets/editor/ui/editor";

interface EditContentDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	content: Content;
	onContentUpdated?: (content: Content) => void;
}

function parseEditorContent(content: string | undefined): JSONContent {
	if (!content) return { type: "doc", content: [] };

	try {
		const parsed = JSON.parse(content) as JSONContent;
		return parsed?.type === "doc" ? parsed : { type: "doc", content: [] };
	} catch {
		return {
			type: "doc",
			content: [
				{
					type: "paragraph",
					content: [{ type: "text", text: content }],
				},
			],
		};
	}
}

export function EditContentDialog({ open, onOpenChange, content, onContentUpdated }: EditContentDialogProps) {
	const [title, setTitle] = useState(content.title || "");
	const [editorData, setEditorData] = useState<JSONContent>(parseEditorContent(content.content));
	const [tags, setTags] = useState<string[]>(content.tags || []);
	const [isFullScreen, setIsFullScreen] = useState(false);
	const [startY, setStartY] = useState<number | null>(null);
	const [todoItems, setTodoItems] = useState<{ text: string; marked: boolean }[]>([]);
	const [todoInput, setTodoInput] = useState("");
	const [showUnsavedModal, setShowUnsavedModal] = useState(false);
	const [hasUnsaved, setHasUnsaved] = useState(false);
	const utils = api.useUtils();
	const handleTouchStart = (e: React.TouchEvent) => {
		setStartY(e.touches[0].clientY);
	};
	const handleTouchMove = (e: React.TouchEvent) => {
		if (startY !== null) {
			const deltaY = e.touches[0].clientY - startY;
			if (deltaY > 120) {
				onOpenChange(false);
				setStartY(null);
			}
		}
	};
	const handleTouchEnd = () => setStartY(null);

	useEffect(() => {
		setTitle(content.title || "");
		setTags(content.tags || []);
		setEditorData(parseEditorContent(content.content));
	}, [content]);

	useEffect(() => {
		if (open) {
			const originalOverflow = document.body.style.overflow;
			document.body.style.overflow = "hidden";
			return () => {
				document.body.style.overflow = originalOverflow;
			};
		}
	}, [open]);

	useEffect(() => {
		if (content.type === "todo") {
			try {
				setTodoItems(JSON.parse(content.content));
			} catch {
				setTodoItems([]);
			}
		}
	}, [content]);

	const updateContentMutation = api.content.update.useMutation({
		onSuccess: (updatedContent) => {
			void Promise.all([
				utils.content.getAvailableTypes.invalidate(),
				utils.content.getTags.invalidate(),
				utils.content.getTagsWithContent.invalidate(),
				utils.content.getTagsWithContentPage.invalidate(),
				utils.content.getSuggestions.invalidate(),
				utils.graph.getGraph.invalidate(),
				utils.user.getStorageUsage.invalidate(),
			]);
			toast.success("Saved");
			onOpenChange(false);
			onContentUpdated?.(updatedContent);
		},
		onError: (error) => {
			toast.error(`Update error: ${error.message}`);
		},
	});

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (content.type === "todo") {
			if (todoItems.length === 0 || todoItems.some((item) => !item.text.trim())) return;
			try {
				updateContentMutation.mutate({
					id: content.id,
					type: "todo",
					title: title.trim() || undefined,
					content: JSON.stringify(todoItems),
					tags,
				});
				setHasUnsaved(false);
			} catch (error) {
				toast.error(`Update error: ${error instanceof Error ? error.message : "Unknown error"}`);
			}
			return;
		}
		if (!editorData || !editorData.content || editorData.content.length === 0) return;
		try {
			const finalContent = JSON.stringify(editorData);
			updateContentMutation.mutate({
				id: content.id,
				type: "note",
				title: title.trim() || undefined,
				content: finalContent,
				tags,
			});
		} catch (error) {
			toast.error(`Update error: ${error instanceof Error ? error.message : "Unknown error"}`);
		}
	};

	const handleAddTodo = () => {
		const value = todoInput.trim();
		if (value) {
			setTodoItems([...todoItems, { text: value, marked: false }]);
			setTodoInput("");
			setHasUnsaved(true);
		}
	};
	const handleRemoveTodo = (idx: number) => {
		setTodoItems(todoItems.filter((_, i) => i !== idx));
		setHasUnsaved(true);
	};
	const handleToggleTodo = (idx: number) => {
		setTodoItems(todoItems.map((item, i) => (i === idx ? { ...item, marked: !item.marked } : item)));
		setHasUnsaved(true);
	};
	const handleEditTodo = (idx: number, value: string) => {
		setTodoItems(todoItems.map((item, i) => (i === idx ? { ...item, text: value } : item)));
		setHasUnsaved(true);
	};
	const handleClose = () => {
		if (content.type === "todo" && hasUnsaved) {
			setShowUnsavedModal(true);
		} else {
			onOpenChange(false);
		}
	};
	const handleSave = () => {
		setShowUnsavedModal(false);
		setHasUnsaved(false);
		onOpenChange(false);
	};
	const handleDiscard = () => {
		setShowUnsavedModal(false);
		setHasUnsaved(false);
		onOpenChange(false);
	};

	if (!open) return null;

	const renderTodoForm = () => (
		<div className="flex h-full flex-col">
			<div className="border-b p-6 pb-4">
				<div className="mx-auto w-full max-w-[700px]">
					<Input
						id="title"
						placeholder="Title (optional)..."
						value={title}
						onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTitle(e.target.value)}
						disabled={updateContentMutation.isPending}
						className="h-auto border-none bg-transparent! px-0 text-2xl! font-bold shadow-none focus-visible:ring-0"
					/>
					<div className="mt-3">
						<TagEditor
							tags={tags}
							onTagsChange={setTags}
							disabled={updateContentMutation.isPending}
							inputClassName="border-none shadow-none focus-visible:ring-0 h-auto flex-1"
							placeholder="+ Add tag"
							aiGenerate={{
								mode: "existing",
								contentId: content.id,
								disabled: todoItems.length === 0,
							}}
						/>
					</div>
				</div>
			</div>
			<div className="flex-1 overflow-y-auto p-6 pt-2">
				<div className="mx-auto flex w-full max-w-[700px] flex-col gap-4">
					<div className="flex gap-2">
						<Input
							placeholder="Add item..."
							value={todoInput}
							onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTodoInput(e.target.value)}
							onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
								if (e.key === "Enter") handleAddTodo();
							}}
							disabled={updateContentMutation.isPending}
							className="flex-1"
						/>
						<Button
							type="button"
							onClick={handleAddTodo}
							disabled={!todoInput.trim() || updateContentMutation.isPending}
							size="sm">
							<Plus className="mr-1 h-4 w-4" />
							Add
						</Button>
					</div>
					<div className="flex flex-col gap-2">
						{todoItems.length === 0 && <div className="text-sm text-muted-foreground">There's no items</div>}
						{todoItems.map((item, idx) => (
							<div key={idx} className="group flex items-center gap-2">
								<Input
									type="checkbox"
									checked={item.marked}
									onChange={() => handleToggleTodo(idx)}
									className="h-5 w-5 cursor-pointer"
									disabled={updateContentMutation.isPending}
								/>
								<Input
									value={item.text}
									onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleEditTodo(idx, e.target.value)}
									className="flex-1 px-2 py-1"
									disabled={updateContentMutation.isPending}
								/>
								<button
									type="button"
									onClick={() => handleRemoveTodo(idx)}
									disabled={updateContentMutation.isPending}
									className="opacity-0 transition-opacity group-hover:opacity-100">
									<X className="h-4 w-4 text-destructive" />
								</button>
							</div>
						))}
					</div>
				</div>
			</div>
		</div>
	);

	return (
		<div
			className={`fixed inset-0 z-50 flex animate-in items-center justify-center bg-black/50 backdrop-blur-md transition-all duration-300 ease-in-out fade-in-0 ${isFullScreen ? "p-5" : ""}`}
			onClick={handleClose}>
			<div
				className={`relative bg-background shadow-lg ${isFullScreen ? "h-full w-full max-w-none rounded-none" : "h-[min(840px,calc(100vh-2rem))] w-[95vw] max-w-5xl rounded-lg"} flex animate-in flex-col gap-0 p-0 transition-all duration-300 ease-in-out fade-in-0 zoom-in-95`}
				onClick={(e) => e.stopPropagation()}
				onTouchStart={handleTouchStart}
				onTouchMove={handleTouchMove}
				onTouchEnd={handleTouchEnd}>
				<div className="flex flex-row items-center justify-between border-b p-4">
					<div className="text-lg font-semibold">{content.type === "todo" ? "Edit list" : "Edit note"}</div>
					<div className="flex items-center gap-2">
						<Button variant="ghost" size="sm" onClick={() => setIsFullScreen(!isFullScreen)}>
							{isFullScreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
						</Button>
						<Button variant="ghost" size="sm" onClick={handleClose}>
							<X className="h-4 w-4" />
						</Button>
					</div>
				</div>
				<form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
					{content.type === "todo" ? (
						renderTodoForm()
					) : (
						<div className="flex h-full flex-col">
							<div className="px-6 pt-8 pb-4">
								<div className="mx-auto w-full max-w-3xl">
									<Input
										id="title"
										placeholder="Заголовок заметки"
										value={title}
										onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTitle(e.target.value)}
										disabled={updateContentMutation.isPending}
										className="h-auto border-none bg-transparent! px-0 text-3xl! font-semibold tracking-tight shadow-none focus-visible:ring-0"
									/>
									<div className="mt-3">
										<TagEditor
											tags={tags}
											onTagsChange={setTags}
											disabled={updateContentMutation.isPending}
											inputClassName="border-none shadow-none focus-visible:ring-0 h-auto flex-1"
											placeholder="+ Add tag"
											aiGenerate={{
												mode: "existing",
												contentId: content.id,
												disabled: !editorData?.content?.length,
											}}
										/>
									</div>
								</div>
							</div>
							<div className="flex-1 overflow-y-auto px-6 pb-8">
								<div className="mx-auto w-full max-w-3xl">
									<Editor
										data={editorData}
										onChange={setEditorData}
										readOnly={updateContentMutation.isPending}
									/>
								</div>
							</div>
						</div>
					)}
					<div className="sticky bottom-0 z-10 mt-auto border-t bg-background p-6 pt-4">
						<div className="flex justify-end gap-3">
							<Button
								type="button"
								variant="tertiary"
								onClick={handleClose}
								disabled={updateContentMutation.isPending}>
								Cancel
							</Button>
							<Button
								type="submit"
								disabled={
									updateContentMutation.isPending ||
									(content.type === "todo"
										? todoItems.length === 0 || todoItems.some((item) => !item.text.trim())
										: !editorData || !editorData.content || editorData.content.length === 0)
								}>
								{updateContentMutation.isPending ? "Saving..." : "Save"}
							</Button>
						</div>
					</div>
				</form>
			</div>
			{showUnsavedModal && (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
					<div className="w-full max-w-sm rounded-lg bg-background p-6 shadow-lg">
						<div className="mb-4 text-lg font-semibold">Unsaved changes</div>
						<div className="mb-6 text-sm text-muted-foreground">
							You have unsaved changes. Save or discard changes?
						</div>
						<div className="flex justify-end gap-2">
							<Button variant="tertiary" onClick={handleDiscard}>
								Discard
							</Button>
							<Button onClick={handleSave}>Save</Button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
