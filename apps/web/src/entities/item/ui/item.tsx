import { ContentCard } from "@synapse/features";
import type { Content } from "@synapse/shared/schemas";
import { lazy, Suspense, useState } from "react";
import toast from "react-hot-toast";

import { api } from "@/shared/api/hooks";
import { getPresignedMediaUrl } from "@/shared/lib/image-utils";

const EditContentDialog = lazy(() =>
	import("@/features/edit-content/ui/edit-content-dialog").then((mod) => ({ default: mod.EditContentDialog }))
);

interface ItemProps {
	disableAnimation?: boolean;
	excludedTag?: string;
	index: number;
	item: Content;
	onContentDeleted?: (contentId: string) => void;
	onContentUpdated?: (content: Content) => void;
	onItemClick?: (content: Content) => void;
}

/** Web owns mutations/modal state; the complete card visual is shared. */
export default function Item(props: ItemProps) {
	const [editing, setEditing] = useState<Content | null>(null);
	const utils = api.useUtils();
	const deleteMutation = api.content.delete.useMutation({
		onSuccess: () => {
			void Promise.all([
				utils.content.getTags.invalidate(),
				utils.content.getTagsWithContent.invalidate(),
				utils.content.getTagsWithContentPage.invalidate(),
				utils.content.getSuggestions.invalidate(),
				utils.graph.getGraph.invalidate(),
				utils.user.getStorageUsage.invalidate(),
			]);
			toast.success("Элемент удален");
			props.onContentDeleted?.(props.item.id);
		},
	});
	const openEditor = async () => {
		try {
			setEditing(await utils.content.getById.fetch({ id: props.item.id }));
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Не удалось открыть материал");
		}
	};
	return (
		<>
			<ContentCard
				item={props.item}
				index={props.index}
				disableAnimation={props.disableAnimation}
				excludedTag={props.excludedTag}
				onOpen={props.onItemClick}
				onDelete={(item) => deleteMutation.mutate({ id: item.id })}
				onEdit={() => void openEditor()}
				resolveMediaUrl={getPresignedMediaUrl}
			/>
			{editing && (
				<Suspense fallback={null}>
					<EditContentDialog
						open
						onOpenChange={(open) => {
							if (!open) setEditing(null);
						}}
						content={editing}
						onContentUpdated={props.onContentUpdated}
					/>
				</Suspense>
			)}
		</>
	);
}
