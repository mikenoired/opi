import { ContentEditDialog } from "@monolyth/features";
import type { Content } from "@monolyth/shared/schemas";
import toast from "react-hot-toast";

import { api } from "@/shared/api/hooks";
import { useWebEditorOptions } from "@/widgets/editor/lib/web-editor-options";

interface EditContentDialogProps {
	content: Content;
	onContentUpdated?(content: Content): void;
	onOpenChange(open: boolean): void;
	open: boolean;
}

/** Web persistence binding for the canonical shared content editor. */
export function EditContentDialog({ content, onContentUpdated, onOpenChange, open }: EditContentDialogProps) {
	const editor = useWebEditorOptions();
	const utils = api.useUtils();
	const { data: tags = [] } = api.content.getTags.useQuery(undefined, { staleTime: 30_000 });
	const update = api.content.update.useMutation();
	const suggest = api.ai.suggestTags.useMutation();
	const invalidate = () =>
		Promise.all([
			utils.content.getAvailableTypes.invalidate(),
			utils.content.getTags.invalidate(),
			utils.content.getTagsWithContent.invalidate(),
			utils.content.getTagsWithContentPage.invalidate(),
			utils.content.getSuggestions.invalidate(),
			utils.graph.getGraph.invalidate(),
			utils.user.getStorageUsage.invalidate(),
		]);
	return (
		<ContentEditDialog
			content={content}
			editor={editor}
			onError={(error) =>
				toast.error(error instanceof Error ? error.message : "Не удалось сохранить изменения")
			}
			onOpenChange={onOpenChange}
			onSave={async (input) => {
				const updated = await update.mutateAsync(input);
				void invalidate();
				toast.success("Сохранено");
				return updated;
			}}
			onSaved={onContentUpdated}
			onSuggestTags={async () => {
				const result = await suggest.mutateAsync({ contentId: content.id, mode: "existing" });
				if (!result.success) throw new Error(result.error ?? "Не удалось подобрать теги");
				return [...result.existing.map((tag) => tag.name), ...result.newTags];
			}}
			open={open}
			tagSuggestions={tags}
		/>
	);
}
