import type { Content } from "@synapse/shared/schemas";
import { Button, Input, Label, Modal } from "@synapse/ui/components";
import type { Transition } from "framer-motion";
import { AnimatePresence, motion } from "framer-motion";
import type { FormEvent, TouchEvent } from "react";
import React, { useEffect, useState } from "react";
import toast from "react-hot-toast";

import { api } from "@/shared/api/hooks";
import { useDashboard } from "@/shared/lib/dashboard-context";
import { fileToScaledDataUrl } from "@/shared/lib/downscale-image";

import { AddContentProvider, useAddContent } from "../model/add-content-context";
import { useDocumentUpload } from "../model/use-document-upload";
import { ContentTypeSelector, DocumentDropZone, LinkPreview, MediaDropZone, TagInput } from "./components";
import AddNoteView from "./note";
import AddTodoView from "./todo";

interface AddContentDialogProps {
	open: boolean; // Used by parent component for conditional rendering
	onOpenChange: (_open: any) => void;
	onContentAdded?: (content?: Content | Content[]) => void;
	initialTags?: string[];
}

const baseTransition: Transition = {
	duration: 0.2,
	ease: [0.4, 0, 0.2, 1],
	opacity: { duration: 0.2 },
	height: { duration: 0.2, ease: [0.4, 0, 0.2, 1] },
};

function AddContentDialogContent({ onOpenChange, onContentAdded, open }: AddContentDialogProps) {
	const { preloadedFiles, setPreloadedFiles } = useDashboard();
	const [uploading, setUploading] = useState(false);
	const { data: tagSuggestions = [] } = api.content.getTags.useQuery(undefined, {
		refetchOnMount: false,
	});

	const context = useAddContent();
	const documentUpload = useDocumentUpload();

	const { type, title, content, isFullScreen } = context.formState;
	const [makeTrack, setMakeTrack] = useState(false);
	const [mediaImageDataUrl, setMediaImageDataUrl] = useState<string | null>(null);

	const [startY, setStartY] = useState<number | null>(null);

	const handleTouchStart = (e: TouchEvent) => {
		setStartY(e.touches[0].clientY);
	};
	const handleTouchMove = (e: TouchEvent) => {
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
		if (preloadedFiles.length > 0) {
			context.updateType("media");
			context.handleFileSelect(preloadedFiles);
			setPreloadedFiles([]);
		}
	}, [preloadedFiles, context.updateType, context.handleFileSelect, setPreloadedFiles]);

	// Prepare a downscaled data URL of the first picked image so AI tags can be
	// generated during media creation (before the item is uploaded).
	useEffect(() => {
		let cancelled = false;
		const firstImage =
			type === "media" ? context.selectedFiles.find((f) => f.type.startsWith("image/")) : undefined;
		if (!firstImage) {
			setMediaImageDataUrl(null);
			return;
		}
		void fileToScaledDataUrl(firstImage).then((url) => {
			if (!cancelled) setMediaImageDataUrl(url);
		});
		return () => {
			cancelled = true;
		};
	}, [type, context.selectedFiles]);

	const handleSubmit = async (e: FormEvent) => {
		e.preventDefault();

		if (
			(type === "media" && context.selectedFiles.length > 0) ||
			(type === "doc" && documentUpload.selectedFiles.length > 0)
		)
			setUploading(true);

		try {
			let success = false;
			let createdContent: Content | Content[] | undefined;

			if (type === "doc" && documentUpload.selectedFiles.length > 0) {
				createdContent = await documentUpload.uploadFiles();
				success = true;
			} else if (type === "media" && context.selectedFiles.length > 0) {
				const files = await context.uploadFiles(context.selectedFiles, title, context.tags);
				createdContent = files.flatMap((file) => (file.content ? [file.content] : []));
				if (files && files.length > 0) {
					toast.success("Media files saved");
					success = true;
				} else {
					toast.error("Media files failed to load");
					success = false;
				}
			} else if (type === "audio" && context.selectedFiles.length > 0) {
				setUploading(true);
				const files = await context.uploadFiles(context.selectedFiles, title, context.tags, { makeTrack });
				createdContent = files.flatMap((file) => (file.content ? [file.content] : []));
				if (files && files.length > 0) {
					toast.success("Audio saved");
					success = true;
				} else {
					toast.error("Audio file isn't loaded");
					success = false;
				}
			} else {
				success = await context.submitContent();
			}

			if (success) {
				context.resetForm();
				documentUpload.resetFiles();
				onOpenChange(false);
				onContentAdded?.(createdContent);
			}
		} finally {
			setUploading(false);
		}
	};

	const isLoading = context.isSubmitting || uploading;
	const tagSuggestionTitles = tagSuggestions.map((tag) => tag.title);

	const getDialogSize = () => {
		if (isFullScreen && type === "note") {
			return "w-full h-full max-w-none rounded-none";
		}

		const base = "max-w-3xl w-[95vw]";
		switch (type) {
			case "note":
			case "todo":
				return `${base} h-[90vh]`;
			case "media":
			case "link":
			case "doc":
			default:
				return `${base} max-h-[80vh] h-auto`;
		}
	};

	const handleTypeChange = (newType: typeof type) => {
		// TODO: Add confirmation dialogs for unsaved changes
		context.updateType(newType);
	};

	const getSubmitButtonText = () => {
		if (uploading) {
			if (type === "doc") {
				return `Importing ${documentUpload.selectedFiles.length} document...`;
			} else if (type === "media") {
				return `Loading ${context.selectedFiles.length} file...`;
			} else if (type === "audio") {
				return `Loading ${context.selectedFiles.length} file...`;
			}
		}
		if (documentUpload.isLoading) {
			return `Importing ${documentUpload.selectedFiles.length} document...`;
		}
		if (context.isSubmitting) {
			return "Saving...";
		}
		return "Save";
	};

	const isSubmitDisabled = () => {
		if (isLoading || context.linkParsing || documentUpload.isLoading) return true;

		if (type === "doc") {
			return documentUpload.selectedFiles.length === 0;
		}

		if (type === "media") {
			return context.selectedFiles.length === 0;
		}

		if (type === "audio") {
			return context.selectedFiles.length === 0;
		}

		if (type === "link") {
			return !content.trim() || !context.parsedLinkData;
		}

		if (type === "note" || type === "todo") {
			return false;
		}

		return !content.trim();
	};

	return (
		<Modal open={open} onOpenChange={onOpenChange} className={getDialogSize()}>
			<div
				className="h-full"
				onTouchStart={handleTouchStart}
				onTouchMove={handleTouchMove}
				onTouchEnd={handleTouchEnd}>
				<ContentTypeSelector
					type={type}
					onTypeChange={handleTypeChange}
					isFullScreen={isFullScreen}
					onToggleFullScreen={context.toggleFullScreen}
				/>

				<form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
					<AnimatePresence mode="wait" initial={false}>
						{type === "note" ? (
							<motion.div
								key="note-view"
								initial={{ opacity: 0, height: 0 }}
								animate={{ opacity: 1, height: "auto" }}
								exit={{ opacity: 0, height: 0 }}
								transition={baseTransition}
								style={{ overflow: "hidden" }}
								className="flex-1">
								<AddNoteView />
							</motion.div>
						) : type === "todo" ? (
							<motion.div
								key="todo-view"
								initial={{ opacity: 0, height: 0 }}
								animate={{ opacity: 1, height: "auto" }}
								exit={{ opacity: 0, height: 0 }}
								transition={baseTransition}
								style={{ overflow: "hidden" }}
								className="flex-1">
								<AddTodoView />
							</motion.div>
						) : type === "doc" ? (
							<motion.div
								key="doc-view"
								initial={{ opacity: 0, height: 0 }}
								animate={{ opacity: 1, height: "auto" }}
								exit={{ opacity: 0, height: 0 }}
								transition={baseTransition}
								style={{ overflow: "hidden" }}
								className="flex-1 space-y-4 overflow-y-auto p-6">
								<div className="space-y-2">
									<Label htmlFor="title">Title (optional)</Label>
									<Input
										id="title"
										placeholder="Enter title..."
										value={title}
										onChange={(e: React.ChangeEvent<HTMLInputElement>) => context.updateTitle(e.target.value)}
										disabled={isLoading}
									/>
								</div>

								<div className="space-y-2">
									<Label htmlFor="content">Documents</Label>
									<DocumentDropZone
										dragActive={documentUpload.dragActive}
										isLoading={documentUpload.isLoading}
										selectedFiles={documentUpload.selectedFiles}
										onFileSelect={documentUpload.handleFileSelect}
										onDrag={documentUpload.handleDrag}
										onDrop={documentUpload.handleDrop}
										onRemoveFile={documentUpload.removeFile}
									/>
								</div>

								<TagInput
									tags={context.tags}
									currentTag={context.currentTag}
									isLoading={isLoading}
									onCurrentTagChange={context.updateCurrentTag}
									onAddTag={context.addTag}
									onRemoveTag={context.removeTag}
									onKeyDown={context.handleTagKeyDown}
									suggestions={tagSuggestionTitles}
								/>
							</motion.div>
						) : (
							<motion.div
								key="media-audio-link-view"
								initial={{ opacity: 0, height: 0 }}
								animate={{ opacity: 1, height: "auto" }}
								exit={{ opacity: 0, height: 0 }}
								transition={baseTransition}
								style={{ overflow: "hidden" }}
								className="flex-1 space-y-4 overflow-y-auto p-6">
								<div className="space-y-2">
									<Label htmlFor="title">Title (optional)</Label>
									<Input
										id="title"
										placeholder="Enter title..."
										value={title}
										onChange={(e: React.ChangeEvent<HTMLInputElement>) => context.updateTitle(e.target.value)}
										disabled={isLoading}
									/>
								</div>

								<div className="space-y-2">
									<Label htmlFor="content">
										{type === "link"
											? "URL"
											: type === "audio"
												? "Audio"
												: "Media (image, videos, or documents)"}
									</Label>
									<AnimatePresence mode="wait" initial={false}>
										{type === "link" ? (
											<motion.div
												key="link-preview"
												initial={{ opacity: 0, height: 0 }}
												animate={{ opacity: 1, height: "100%" }}
												exit={{ opacity: 0, height: 0 }}
												transition={baseTransition}
												style={{ overflow: "hidden" }}>
												<LinkPreview
													content={content}
													parsedLinkData={context.parsedLinkData}
													linkParsing={context.linkParsing}
													isLoading={isLoading}
													onContentChange={context.updateContent}
													onParseLink={context.parseLink}
													onClearParsedData={context.clearParsedData}
												/>
											</motion.div>
										) : type === "media" ? (
											<motion.div
												key="media-content"
												initial={{ opacity: 0, height: 0 }}
												animate={{ opacity: 1, height: "100%" }}
												exit={{ opacity: 0, height: 0 }}
												transition={baseTransition}
												style={{ overflow: "hidden" }}
												className="space-y-4">
												{/* Document Drop Zone */}
												<div>
													<h3 className="mb-2 text-sm font-medium text-foreground">Documents</h3>
													<DocumentDropZone
														dragActive={documentUpload.dragActive}
														isLoading={documentUpload.isLoading}
														selectedFiles={documentUpload.selectedFiles}
														onFileSelect={documentUpload.handleFileSelect}
														onDrag={documentUpload.handleDrag}
														onDrop={documentUpload.handleDrop}
														onRemoveFile={documentUpload.removeFile}
													/>
												</div>

												{/* Media Drop Zone */}
												<div>
													<h3 className="mb-2 text-sm font-medium text-foreground">Images & Videos</h3>
													<MediaDropZone
														dragActive={context.dragActive}
														isLoading={isLoading}
														selectedFiles={context.selectedFiles}
														previewUrls={context.previewUrls}
														onFileSelect={context.handleFileSelect}
														onDrag={context.handleDrag}
														onDrop={context.handleDrop}
														onRemoveFile={context.removeFile}
														onMoveFile={context.moveFile}
													/>
												</div>
											</motion.div>
										) : (
											<motion.div
												key="media-dropzone"
												initial={{ opacity: 0, height: 0 }}
												animate={{ opacity: 1, height: "100%" }}
												exit={{ opacity: 0, height: 0 }}
												transition={baseTransition}
												style={{ overflow: "hidden" }}>
												<MediaDropZone
													dragActive={context.dragActive}
													isLoading={isLoading}
													selectedFiles={context.selectedFiles}
													previewUrls={context.previewUrls}
													onFileSelect={context.handleFileSelect}
													onDrag={context.handleDrag}
													onDrop={context.handleDrop}
													onRemoveFile={context.removeFile}
													onMoveFile={context.moveFile}
												/>
											</motion.div>
										)}
									</AnimatePresence>
								</div>

								<AnimatePresence mode="wait" initial={false}>
									<motion.div
										key={type === "audio" ? "audio-track-toggle" : "audio-track-toggle-hidden"}
										className="space-y-2"
										initial={{ opacity: 0, height: 0 }}
										animate={type === "audio" ? { opacity: 1, height: "100%" } : { opacity: 0, height: 0 }}
										exit={{ opacity: 0, height: 0 }}
										transition={baseTransition}
										style={{ overflow: "hidden" }}>
										{type === "audio" && (
											<>
												<Label htmlFor="makeTrack">Save as track</Label>
												<div className="flex items-center gap-2">
													<input
														id="makeTrack"
														type="checkbox"
														className="h-4 w-4"
														checked={makeTrack}
														onChange={(e) => setMakeTrack(e.target.checked)}
													/>
													<span className="text-sm text-muted-foreground">
														Use extended player if file contains metadata
													</span>
												</div>
											</>
										)}
									</motion.div>
								</AnimatePresence>

								<TagInput
									tags={context.tags}
									currentTag={context.currentTag}
									isLoading={isLoading}
									onCurrentTagChange={context.updateCurrentTag}
									onAddTag={context.addTag}
									onRemoveTag={context.removeTag}
									onKeyDown={context.handleTagKeyDown}
									suggestions={tagSuggestionTitles}
									aiGenerate={
										type === "link" && context.parsedLinkData
											? { type: "link", title, content: JSON.stringify(context.parsedLinkData) }
											: type === "media" && mediaImageDataUrl
												? { type: "media", title, image: mediaImageDataUrl }
												: null
									}
									onAiTags={(existing, newTags) =>
										context.addTags([...existing.map((t) => t.name), ...newTags])
									}
								/>
							</motion.div>
						)}
					</AnimatePresence>

					<div className="sticky bottom-0 z-10 mt-auto border-t bg-background p-6 pt-4">
						<div className="flex justify-end gap-3">
							<Button
								type="button"
								variant="tertiary"
								onClick={() => onOpenChange(false)}
								disabled={isLoading}>
								Discard
							</Button>
							<Button type="submit" disabled={isSubmitDisabled()}>
								{getSubmitButtonText()}
							</Button>
						</div>
					</div>
				</form>
			</div>
		</Modal>
	);
}

export function AddContentDialog(props: AddContentDialogProps) {
	const { open: isOpen, onOpenChange, onContentAdded, initialTags } = props;

	return (
		<AddContentProvider initialTags={initialTags} onSuccess={() => {}} onContentAdded={onContentAdded}>
			<AddContentDialogContent open={isOpen} onOpenChange={onOpenChange} onContentAdded={onContentAdded} />
		</AddContentProvider>
	);
}
