import { ContentCard } from "@synapse/features";
import type { Content } from "@synapse/shared/schemas";
import { lazy, Suspense, useState } from "react";
import toast from "react-hot-toast";

import { api } from "@/shared/api/hooks";
import { useI18n } from "@/shared/lib/i18n";

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
	const [editOpen, setEditOpen] = useState(false);
	const utils = api.useUtils();
	const { t } = useI18n();
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
	return (
		<>
			<ContentCard
				item={props.item}
				index={props.index}
				disableAnimation={props.disableAnimation}
				excludedTag={props.excludedTag}
				onOpen={props.onItemClick}
				onDelete={(item) => deleteMutation.mutate({ id: item.id })}
				onEdit={() => setEditOpen(true)}
				strings={{
					delete: t("delete"),
					done: t("done"),
					edit: t("edit"),
					emptyNote: t("emptyNote"),
					open: t("open"),
					untitled: t("untitled"),
				}}
			/>
			{editOpen && (props.item.type === "note" || props.item.type === "todo") && (
				<Suspense fallback={null}>
					<EditContentDialog
						open={editOpen}
						onOpenChange={setEditOpen}
						content={props.item}
						onContentUpdated={props.onContentUpdated}
					/>
				</Suspense>
			)}
		</>
	);
}
