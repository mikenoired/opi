import type { Content } from "@synapse/shared/schemas";
import { Button, Input } from "@synapse/ui/components";
import { useState } from "react";

import { api } from "@/shared/api/hooks";
import { TagEditor } from "@/shared/ui/tag-editor";
import { Editor } from "@/widgets/editor/ui/editor";

import { ModalActions, ModalBody } from "../../layout";
import { showToast } from "../../utils";

interface AddNoteFormProps {
	initialTags?: string[];
	onSuccess: (content?: Content) => void;
	isFullScreen?: boolean;
}

export function AddNoteForm({ initialTags = [], onSuccess, isFullScreen }: AddNoteFormProps) {
	const [title, setTitle] = useState("");
	const [editorData, setEditorData] = useState<any>(null);
	const [tags, setTags] = useState<string[]>(initialTags);
	const utils = api.useUtils();

	const createMutation = api.content.create.useMutation();

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();

		if (!editorData) {
			showToast.error("Добавьте содержимое заметки");
			return;
		}

		try {
			const content = await createMutation.mutateAsync({
				type: "note",
				title: title || undefined,
				content: JSON.stringify(editorData),
				tags,
			});

			void Promise.all([
				utils.content.getAvailableTypes.invalidate(),
				utils.content.getTags.invalidate(),
				utils.content.getTagsWithContent.invalidate(),
				utils.graph.getGraph.invalidate(),
			]);

			showToast.success("Заметка создана");
			onSuccess(content);
		} catch {
			showToast.error("Ошибка при создании заметки");
		}
	};

	return (
		<form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
			<div className={`shrink-0 px-6 pt-8 pb-4 ${isFullScreen ? "bg-background" : ""}`}>
				<div className="mx-auto w-full max-w-3xl">
					<Input
						id="title"
						placeholder="Заголовок заметки"
						value={title}
						onChange={(e) => setTitle(e.target.value)}
						disabled={createMutation.isPending}
						className="h-auto border-none bg-transparent! px-0 text-3xl! font-semibold tracking-tight shadow-none focus-visible:ring-0"
					/>
					<div className="mt-3">
						<TagEditor
							tags={tags}
							onTagsChange={setTags}
							disabled={createMutation.isPending}
							inputClassName="border-none shadow-none focus-visible:ring-0 h-auto flex-1 min-w-[120px]"
							aiGenerate={{
								mode: "draft",
								type: "note",
								title,
								content: JSON.stringify(editorData ?? { type: "doc", content: [] }),
								disabled: !editorData,
							}}
						/>
					</div>
				</div>
			</div>

			<ModalBody scrollable noPadding className="min-h-0">
				<div className="px-6 pb-8">
					<div className="mx-auto w-full max-w-3xl">
						<Editor data={editorData} onChange={setEditorData} readOnly={createMutation.isPending} />
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
						disabled={createMutation.isPending || !editorData}
						loading={createMutation.isPending}>
						{createMutation.isPending ? "Сохранение..." : "Сохранить"}
					</Button>
				</ModalActions>
			</div>
		</form>
	);
}
