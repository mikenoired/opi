import { ContentViewer, type ContentSuggestionGroup } from "@synapse/features";
import type { Content } from "@synapse/shared/schemas";
import { useCallback, useMemo, useState } from "react";
import toast from "react-hot-toast";

import { EditContentDialog } from "@/features/edit-content/ui/edit-content-dialog";
import { api } from "@/shared/api/hooks";
import { useI18n } from "@/shared/lib/i18n";
import { getPresignedMediaUrl } from "@/shared/lib/image-utils";
import { useUserPreferences } from "@/shared/lib/user-preferences-context";
import { useRouter } from "@/shared/router/navigation";

interface UnifiedViewerModalProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	item: Content;
	items?: Content[];
	onEdit?: (id: string) => void;
	onDelete?: (id: string) => void | Promise<void>;
	onContentUpdated?: (content: Content) => void;
	onTagNavigate?: () => void;
	onViewerNavigate?: (item: Content) => void;
}

/** Web transport adapter for the shared, platform-neutral content viewer. */
export function UnifiedViewerModal({
	open,
	onOpenChange,
	item,
	items,
	onEdit,
	onDelete,
	onContentUpdated,
	onTagNavigate,
	onViewerNavigate,
}: UnifiedViewerModalProps) {
	const { t } = useI18n();
	const router = useRouter();
	const utils = api.useUtils();
	const { mediaAutoplayEnabled } = useUserPreferences();
	const [editing, setEditing] = useState<Content | null>(null);
	const { data: tags = [] } = api.content.getTags.useQuery(undefined, { staleTime: 30_000 });
	const update = api.content.update.useMutation();
	const remove = api.content.delete.useMutation();
	const suggest = api.ai.suggestTags.useMutation();
	const suggestions = api.content.getSuggestions.useInfiniteQuery(
		{ contentId: item.id, limit: 12 },
		{ enabled: open && item.tag_ids.length > 0, getNextPageParam: (page) => page.nextCursor, retry: false }
	);
	const tagColors = Object.fromEntries(
		tags.flatMap((tag) => [
			[tag.id, tag.color],
			[tag.title.trim().toLocaleLowerCase(), tag.color],
		])
	);
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
	const suggestionGroups = useMemo<ContentSuggestionGroup[]>(() => {
		const groups = new Map<string, ContentSuggestionGroup>();
		for (const page of suggestions.data?.pages ?? []) {
			for (const group of page.groups) {
				const current = groups.get(group.tag.id) ?? { items: [], tag: group.tag };
				const seen = new Set(current.items.map((entry) => entry.id));
				current.items.push(...group.items.filter((entry) => !seen.has(entry.id)));
				groups.set(group.tag.id, current);
			}
		}
		return [...groups.values()];
	}, [suggestions.data?.pages]);
	const loadMoreSuggestions = useCallback(() => {
		if (suggestions.hasNextPage && !suggestions.isFetchingNextPage) void suggestions.fetchNextPage();
	}, [suggestions.fetchNextPage, suggestions.hasNextPage, suggestions.isFetchingNextPage]);
	return (
		<>
			<ContentViewer
				autoPlay={mediaAutoplayEnabled}
				item={item}
				items={items}
				onDelete={async (content) => {
					if (onDelete) await onDelete(content.id);
					else await remove.mutateAsync({ id: content.id });
					void invalidate();
					onOpenChange(false);
				}}
				onDownload={(content, url) => void download(content, url)}
				onEdit={(content) => {
					if (content.type === "note" || content.type === "todo") {
						setEditing(content);
						return;
					}
					if (onEdit) onEdit(content.id);
					else router.push(`/edit/${content.id}`);
				}}
				onOpenChange={onOpenChange}
				onSelect={onViewerNavigate}
				onSuggestTags={async (content) => {
					const result = await suggest.mutateAsync({ contentId: content.id, mode: "existing" });
					if (!result.success) throw new Error(result.error ?? "Не удалось подобрать теги");
					return [...result.existing.map((tag) => tag.name), ...result.newTags];
				}}
				onTagNavigate={onTagNavigate}
				onUpdate={async (input) => {
					try {
						const updated = await update.mutateAsync(input);
						onContentUpdated?.(updated);
						void invalidate();
					} catch (error) {
						toast.error(error instanceof Error ? error.message : "Не удалось сохранить изменения");
						throw error;
					}
				}}
				open={open}
				resolveMediaUrl={getPresignedMediaUrl}
				suggestionGroups={suggestionGroups}
				suggestionStrings={{
					ariaLabel: "Похожие материалы",
					delete: t("delete"),
					done: t("done"),
					edit: t("edit"),
					emptyNote: t("emptyNote"),
					eyebrow: "Продолжить исследование",
					loadingMore: "Ищем дальше",
					open: t("open"),
					title: "Рядом по смыслу",
					untitled: t("untitled"),
				}}
				suggestionsHasMore={suggestions.hasNextPage}
				suggestionsLoading={suggestions.isLoading}
				suggestionsLoadingMore={suggestions.isFetchingNextPage}
				onLoadMoreSuggestions={loadMoreSuggestions}
				onSuggestionTagNavigate={(tagId) => router.push(`/tags/${tagId}`)}
				strings={{
					addTag: t("viewer.addTag"),
					cancel: t("cancel"),
					close: t("viewer.close"),
					created: (date) => t("viewer.created", { date }),
					delete: t("delete"),
					deleteDescription: t("viewer.deleteDescription"),
					deleteTitle: t("viewer.deleteTitle"),
					details: t("details"),
					download: t("viewer.download"),
					edit: t("edit"),
					emptyTasks: t("viewer.emptyTasks"),
					next: t("viewer.next"),
					previous: t("viewer.previous"),
					suggestTags: t("generateTags"),
					tags: t("tags"),
					types: {
						audio: t("audio"),
						link: t("link"),
						media: t("media"),
						note: t("note"),
						todo: t("todo"),
					},
					untitled: t("untitled"),
					updated: (date) => t("viewer.updated", { date }),
				}}
				tagColors={tagColors}
				tagSuggestions={tags}
			/>
			{editing && (
				<EditContentDialog
					content={editing}
					onContentUpdated={(updated) => {
						setEditing(updated);
						onContentUpdated?.(updated);
					}}
					onOpenChange={(next) => {
						if (!next) setEditing(null);
					}}
					open
				/>
			)}
		</>
	);
}

async function download(item: Content, url: string) {
	try {
		const response = await fetch(url);
		if (!response.ok) throw new Error("Download failed");
		const objectUrl = URL.createObjectURL(await response.blob());
		const extension = url.split("?")[0]?.split(".").pop()?.trim();
		const safeTitle = (item.title || item.id).trim().replace(/[^a-zA-Z0-9-_]+/g, "-");
		const link = document.createElement("a");
		link.download = extension ? `${safeTitle}.${extension}` : safeTitle;
		link.href = objectUrl;
		document.body.append(link);
		link.click();
		link.remove();
		URL.revokeObjectURL(objectUrl);
	} catch {
		toast.error("Не удалось скачать материал");
	}
}
