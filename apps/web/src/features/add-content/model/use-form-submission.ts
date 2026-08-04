import type { Content } from "@synapse/shared/schemas";
import { useCallback } from "react";
import toast from "react-hot-toast";

import { api } from "@/shared/api/hooks";

interface UploadedFileInfo {
	objectName: string;
	url: string;
	thumbnail?: string;
	content?: Content;
}

import type { ContentFormState, ParsedLinkData, TodoItem } from "./types";

interface UseFormSubmissionProps {
	onSuccess: () => void;
	onContentAdded?: (content?: Content | Content[]) => void;
}

export function useFormSubmission({ onSuccess, onContentAdded }: UseFormSubmissionProps) {
	const utils = api.useUtils();

	const createContentMutation = api.content.create.useMutation({
		onSuccess: (content) => {
			toast.success("Saved");
			utils.content.getTags.invalidate();
			utils.content.getTagsWithContent.invalidate();
			utils.content.getTagsWithContentPage.invalidate();
			utils.content.getSuggestions.invalidate();
			onSuccess();
			onContentAdded?.(content);
		},
		onError: (error) => {
			toast.error(`Error creating content: ${error.message}`);
		},
	});

	const uploadMutation = api.upload.formData.useMutation({
		onSuccess: () => {
			utils.content.getTags.invalidate();
			utils.content.getTagsWithContent.invalidate();
			utils.content.getTagsWithContentPage.invalidate();
			utils.content.getSuggestions.invalidate();
		},
	});

	const uploadMultipleFiles = useCallback(
		async (
			files: File[],
			title?: string,
			tags?: string[],
			extraFields?: Record<string, string | boolean>
		): Promise<UploadedFileInfo[]> => {
			const filesPayload = await Promise.all(
				files.map(async (file) => ({
					name: file.name,
					type: file.type,
					size: file.size,
					// eslint-disable-next-line node/prefer-global/buffer
					content: Buffer.from(await file.arrayBuffer()).toString("base64"),
				}))
			);

			const result = await uploadMutation.mutateAsync({
				files: filesPayload,
				title: title?.trim(),
				tags: tags && tags.length > 0 ? tags : undefined,
				makeTrack: extraFields?.makeTrack === true || extraFields?.makeTrack === "true",
			});

			return result.files;
		},
		[uploadMutation]
	);

	const submitContent = useCallback(
		async (
			formState: ContentFormState,
			tags: string[],
			options: {
				editorData?: any;
				todoItems?: TodoItem[];
				parsedLinkData?: ParsedLinkData | null;
				selectedFiles?: File[];
			}
		) => {
			const { type, title, content } = formState;
			const { editorData, todoItems, parsedLinkData, selectedFiles } = options;

			// Validation
			if (type === "note" && (!editorData || !editorData.content || editorData.content.length === 0)) {
				return false;
			}
			if (type === "media" && (!selectedFiles || selectedFiles.length === 0)) {
				return false;
			}
			if (
				type === "todo" &&
				(!todoItems || todoItems.length === 0 || todoItems.some((item) => !item.text.trim()))
			) {
				return false;
			}
			if (type === "link" && !content.trim()) {
				return false;
			}

			try {
				if ((type === "media" || type === "audio") && selectedFiles && selectedFiles.length > 0) {
					const uploadedFiles = await uploadMultipleFiles(selectedFiles, title, tags);
					toast.success("Saved");
					onSuccess();
					onContentAdded?.(uploadedFiles.flatMap((file) => (file.content ? [file.content] : [])));
					return true;
				} else {
					let finalContent = content;

					if (type === "note" && editorData) {
						finalContent = JSON.stringify(editorData);
					} else if (type === "todo" && todoItems) {
						finalContent = JSON.stringify(todoItems);
					}

					const finalContentForLink =
						type === "link" && parsedLinkData ? JSON.stringify(parsedLinkData) : finalContent;

					createContentMutation.mutate({
						type,
						title: title.trim() || undefined,
						content: finalContentForLink,
						tags,
						url: type === "link" ? parsedLinkData?.url || content.trim() : undefined,
					});
					return true;
				}
			} catch (error) {
				toast.error(`Error uploading: ${error instanceof Error ? error.message : "Unknown error"}`);
				return false;
			}
		},
		[createContentMutation, uploadMultipleFiles, onSuccess, onContentAdded]
	);

	return {
		submitContent,
		isLoading: createContentMutation.isPending,
		uploadFiles: uploadMultipleFiles,
	};
}
