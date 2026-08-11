import { Button, Input } from "@synapse/ui/components";
import { Plus, X } from "lucide-react";
import { useState } from "react";

export interface TodoListItem {
	marked: boolean;
	text: string;
}

export interface TodoListProps {
	items: TodoListItem[];
	isLoading: boolean;
	onAddTodo: (text: string) => void;
	onRemoveTodo: (index: number) => void;
	onToggleTodo: (index: number) => void;
	onUpdateTodoText: (index: number, text: string) => void;
}

export function TodoList({
	items,
	isLoading,
	onAddTodo,
	onRemoveTodo,
	onToggleTodo,
	onUpdateTodoText,
}: TodoListProps) {
	const [todoInput, setTodoInput] = useState("");

	const handleAddTodo = () => {
		const value = todoInput.trim();
		if (!value) return;
		onAddTodo(value);
		setTodoInput("");
	};

	return (
		<div className="flex flex-col gap-4">
			<div className="flex gap-2">
				<Input
					placeholder="Add item..."
					value={todoInput}
					onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTodoInput(e.target.value)}
					onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
						if (e.key === "Enter") handleAddTodo();
					}}
					disabled={isLoading}
					className="flex-1"
				/>
				<Button type="button" onClick={handleAddTodo} disabled={!todoInput.trim() || isLoading} size="sm">
					<Plus className="mr-1 h-4 w-4" />
					Add
				</Button>
			</div>
			<div className="flex flex-col gap-2">
				{items.length === 0 && <div className="text-sm text-muted-foreground">There's no items</div>}
				{items.map((item, idx) => (
					<div key={idx} className="group flex items-center gap-2">
						<Input
							type="checkbox"
							checked={item.marked}
							onChange={() => onToggleTodo(idx)}
							className="h-5 w-5 cursor-pointer"
							disabled={isLoading}
						/>
						<Input
							value={item.text}
							onChange={(e: React.ChangeEvent<HTMLInputElement>) => onUpdateTodoText(idx, e.target.value)}
							className="flex-1 px-2 py-1"
							disabled={isLoading}
						/>
						<button
							type="button"
							onClick={() => onRemoveTodo(idx)}
							disabled={isLoading}
							className="opacity-0 transition-opacity group-hover:opacity-100">
							<X className="h-4 w-4 text-destructive" />
						</button>
					</div>
				))}
			</div>
		</div>
	);
}
