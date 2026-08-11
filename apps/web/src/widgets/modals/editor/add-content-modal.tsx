import { ContentCreateDialog, type ContentTypePickerOption } from "@synapse/features";
import type { Content } from "@synapse/shared/schemas";
import { useMemo } from "react";

import { contentTypeOptions } from "@/shared/lib/content-type-options";
import { useI18n } from "@/shared/lib/i18n";
import { inferContentTypeFromFiles } from "@/shared/lib/upload-file-kind";
import { showToast } from "@/widgets/modals/utils";

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
	const { t } = useI18n();
	const inferredContentType = useMemo(() => inferContentTypeFromFiles(preloadedFiles), [preloadedFiles]);
	return (
		<ContentCreateDialog
			initialTags={initialTags}
			onContentAdded={onContentAdded}
			onError={showToast.error}
			onOpenChange={onOpenChange}
			open={open}
			options={options(t)}
			preloadedFiles={preloadedFiles}
			suggestedType={inferredContentType}
		/>
	);
}

function options(t: ReturnType<typeof useI18n>["t"]): ContentTypePickerOption[] {
	return contentTypeOptions.map((option) => ({
		description: t(option.descriptionKey) || option.description,
		icon:
			option.key === "media"
				? "media"
				: option.key === "audio"
					? "audio"
					: option.key === "link"
						? "link"
						: option.key === "todo"
							? "todo"
							: option.key === "doc"
								? "document"
								: "note",
		key: option.key,
		label: t(option.labelKey) || option.label,
	}));
}
