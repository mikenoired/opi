import type { Content } from "@synapse/shared/schemas";
import { useEffect, useMemo, useRef, useState } from "react";

import { inferContentTypeFromFiles } from "@/shared/lib/upload-file-kind";

import { BaseModal } from "../base";
import { useModalKeyboard } from "../hooks";
import { AddAudioForm } from "./forms/add-audio-form";
import { AddDocumentForm } from "./forms/add-document-form";
import { AddLinkForm } from "./forms/add-link-form";
import { AddMediaForm } from "./forms/add-media-form";
import { AddNoteForm } from "./forms/add-note-form";
import { AddTodoForm } from "./forms/add-todo-form";
import { ContentTypeHeader, ContentTypePicker } from "./forms/content-type-selector";

interface AddContentModalProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	initialTags?: string[];
	onContentAdded?: (content?: Content | Content[]) => void;
	preloadedFiles?: File[];
}

export function AddContentModal({
	open,
	onOpenChange,
	initialTags = [],
	onContentAdded,
	preloadedFiles = [],
}: AddContentModalProps) {
	const [contentType, setContentType] = useState<Content["type"] | null>(null);
	const [isFullScreen, setIsFullScreen] = useState(false);
	const formContainerRef = useRef<HTMLDivElement>(null);
	const inferredContentType = useMemo(() => inferContentTypeFromFiles(preloadedFiles), [preloadedFiles]);
	const preloadedFilesForActiveType = useMemo(() => {
		if (!contentType || contentType !== inferredContentType) {
			return [];
		}

		return preloadedFiles;
	}, [contentType, inferredContentType, preloadedFiles]);

	useModalKeyboard({
		enabled: open,
		onEscape: () => onOpenChange(false),
		shortcuts: [
			{
				key: "Enter",
				handler: (event) => {
					const target = event.target;
					if (
						event.defaultPrevented ||
						event.isComposing ||
						(target instanceof Element && target.closest("textarea, [contenteditable='true']"))
					) {
						return;
					}

					const form = formContainerRef.current?.querySelector("form");
					const submitter = form?.querySelector<HTMLButtonElement>("button[type='submit']:not(:disabled)");
					if (!form || !submitter) return;

					event.preventDefault();
					form.requestSubmit(submitter);
				},
			},
		],
	});

	useEffect(() => {
		if (!open) {
			setContentType(null);
			setIsFullScreen(false);
			return;
		}

		setContentType(inferredContentType);
	}, [inferredContentType, open]);

	const handleSuccess = (content?: Content | Content[]) => {
		if (content !== undefined) {
			onContentAdded?.(content);
		}
		onOpenChange(false);
	};

	const handleBack = () => {
		setContentType(null);
		setIsFullScreen(false);
	};

	const getSize = () => {
		if (!contentType) {
			return "md";
		}

		if (isFullScreen && contentType === "note") return "full";
		if (contentType === "note" || contentType === "todo") return "xl";
		return "lg";
	};

	const renderForm = () => {
		if (!contentType) {
			return <ContentTypePicker onSelect={setContentType} suggestedType={inferredContentType} />;
		}

		switch (contentType) {
			case "note":
				return (
					<AddNoteForm initialTags={initialTags} onSuccess={handleSuccess} isFullScreen={isFullScreen} />
				);
			case "todo":
				return <AddTodoForm initialTags={initialTags} onSuccess={handleSuccess} />;
			case "media":
				return (
					<AddMediaForm
						initialTags={initialTags}
						onSuccess={handleSuccess}
						preloadedFiles={preloadedFilesForActiveType}
					/>
				);
			case "audio":
				return (
					<AddAudioForm
						initialTags={initialTags}
						onSuccess={handleSuccess}
						preloadedFiles={preloadedFilesForActiveType}
					/>
				);
			case "link":
				return <AddLinkForm initialTags={initialTags} onSuccess={handleSuccess} />;
			case "doc":
			case "pdf":
			case "docx":
			case "epub":
			case "xlsx":
			case "csv":
				return (
					<AddDocumentForm
						initialTags={initialTags}
						onSuccess={handleSuccess}
						preloadedFiles={preloadedFilesForActiveType}
					/>
				);
			default:
				return null;
		}
	};

	return (
		<BaseModal
			open={open}
			onOpenChange={onOpenChange}
			size={getSize()}
			variant={isFullScreen ? "fullscreen" : "default"}
			className={contentType === "note" && !isFullScreen ? "h-[min(840px,calc(100vh-2rem))]" : undefined}>
			{contentType && (
				<ContentTypeHeader
					type={contentType}
					onBack={handleBack}
					isFullScreen={isFullScreen}
					onToggleFullScreen={() => setIsFullScreen(!isFullScreen)}
				/>
			)}
			<div ref={formContainerRef} className="contents">
				{renderForm()}
			</div>
		</BaseModal>
	);
}
