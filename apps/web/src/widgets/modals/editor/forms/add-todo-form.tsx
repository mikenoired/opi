import type { Content } from "@synapse/shared/schemas";
import { Button, Input } from "@synapse/ui/components";
import { Plus, X } from "lucide-react";
import { useState } from "react";

import { api } from "@/shared/api/hooks";
import { TagEditor } from "@/shared/ui/tag-editor";

import { ModalActions, ModalBody } from "../../layout";
import { showToast } from "../../utils";

interface AddTodoFormProps {
	initialTags?: string[];
	onSuccess: (content?: Content) => void;
}

export function AddTodoForm({ initialTags = [], onSuccess }: AddTodoFormProps) {
	const [title, setTitle] = useState("");
	const [tags, setTags] = useState<string[]>(initialTags);
	const [todos, setTodos] = useState<{ text: string; marked: boolean }[]>([{ text: "", marked: false }]);
	const [currentTodo, setCurrentTodo] = useState("");
	const utils = api.useUtils();

	const createMutation = api.content.create.useMutation();

	const handleAddTodo = () => {
		if (currentTodo.trim()) {
			setTodos([...todos, { text: currentTodo.trim(), marked: false }]);
			setCurrentTodo("");
		}
	};

	const handleRemoveTodo = (index: number) => {
		setTodos(todos.filter((_, i) => i !== index));
	};

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();

		const validTodos = todos.filter((t) => t.text.trim());
		if (validTodos.length === 0) {
			showToast.error("Добавьте хотя бы одну задачу");
			return;
		}

		try {
			const content = await createMutation.mutateAsync({
				type: "todo",
				title: title || undefined,
				content: JSON.stringify(validTodos),
				tags,
			});

			void Promise.all([
				utils.content.getAvailableTypes.invalidate(),
				utils.content.getTags.invalidate(),
				utils.content.getTagsWithContent.invalidate(),
				utils.graph.getGraph.invalidate(),
			]);

			showToast.success("Список задач создан");
			onSuccess(content);
		} catch {
			showToast.error("Ошибка при создании списка");
		}
	};

	return (
		<form onSubmit={handleSubmit} className="flex h-full flex-col">
			<ModalBody scrollable>
				<div className="space-y-4">
					<div className="space-y-2">
						<label htmlFor="title" className="text-sm font-medium">
							Заголовок
						</label>
						<Input
							id="title"
							placeholder="Название списка..."
							value={title}
							onChange={(e) => setTitle(e.target.value)}
							disabled={createMutation.isPending}
						/>
					</div>

					<div className="space-y-2">
						<label className="text-sm font-medium">Задачи</label>
						{todos.map((todo, index) => (
							<div key={index} className="flex items-center gap-2">
								<Input
									value={todo.text}
									onChange={(e) => {
										const newTodos = [...todos];
										newTodos[index].text = e.target.value;
										setTodos(newTodos);
									}}
									placeholder="Задача..."
									disabled={createMutation.isPending}
								/>
								<button
									type="button"
									onClick={() => handleRemoveTodo(index)}
									className="rounded p-2 transition-colors hover:bg-destructive/20"
									disabled={createMutation.isPending}>
									<X className="h-4 w-4" />
								</button>
							</div>
						))}
						<div className="flex gap-2">
							<Input
								placeholder="Добавить задачу..."
								value={currentTodo}
								onChange={(e) => setCurrentTodo(e.target.value)}
								onKeyDown={(e) => {
									if (e.key === "Enter") {
										e.preventDefault();
										handleAddTodo();
									}
								}}
								disabled={createMutation.isPending}
							/>
							<Button
								type="button"
								onClick={handleAddTodo}
								disabled={!currentTodo.trim() || createMutation.isPending}
								variant="tertiary">
								<Plus className="h-4 w-4" />
							</Button>
						</div>
					</div>

					<div className="space-y-2">
						<label className="text-sm font-medium">Теги</label>
						<TagEditor
							tags={tags}
							onTagsChange={setTags}
							disabled={createMutation.isPending}
							aiGenerate={{
								mode: "draft",
								type: "todo",
								title,
								content: JSON.stringify(todos.filter((todo) => todo.text.trim())),
								disabled: todos.filter((todo) => todo.text.trim()).length === 0,
							}}
						/>
					</div>
				</div>
			</ModalBody>

			<div className="shrink-0 border-t bg-background p-6 pt-4">
				<ModalActions position="right">
					<Button
						type="button"
						variant="tertiary"
						onClick={() => onSuccess()}
						disabled={createMutation.isPending}>
						Отмена
					</Button>
					<Button
						type="submit"
						disabled={createMutation.isPending || todos.filter((t) => t.text.trim()).length === 0}
						loading={createMutation.isPending}>
						{createMutation.isPending ? "Сохранение..." : "Сохранить"}
					</Button>
				</ModalActions>
			</div>
		</form>
	);
}
