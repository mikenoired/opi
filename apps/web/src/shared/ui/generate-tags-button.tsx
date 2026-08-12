import type { Content } from "@synapse/shared/schemas";
import { Button } from "@synapse/ui/components";
import { Sparkles } from "lucide-react";
import toast from "react-hot-toast";

import { api } from "@/shared/api/hooks";
import { useI18n } from "@/shared/lib/i18n";

export interface SuggestedTag {
	id: string;
	name: string;
}

interface DraftInput {
	mode: "draft";
	type: Content["type"];
	title?: string;
	content?: string;
	image?: string;
}

interface ExistingInput {
	mode: "existing";
	contentId: string;
}

type GenerateTagsButtonProps = (DraftInput | ExistingInput) & {
	disabled?: boolean;
	onResult: (existing: SuggestedTag[], newTags: string[]) => void;
};

export function GenerateTagsButton({ disabled, onResult, ...input }: GenerateTagsButtonProps) {
	const { t } = useI18n();
	const mutation = api.ai.suggestTags.useMutation({
		onSuccess: (res) => {
			if (res.success) {
				const total = res.existing.length + res.newTags.length;
				if (total === 0) {
					toast("No tags suggested for this content");
				} else {
					toast.success(`Added ${total} tag${total > 1 ? "s" : ""}`);
				}
				onResult(res.existing, res.newTags);
			} else {
				toast.error(res.error ?? "Couldn't generate tags");
			}
		},
		onError: (error) => {
			toast.error(error.message || "Couldn't generate tags");
		},
	});

	return (
		<Button
			type="button"
			variant="primary"
			size="md"
			leadingIcon={Sparkles}
			disabled={disabled || mutation.isPending}
			onClick={() => mutation.mutate(input)}
			title={t("generateTags")}>
			{mutation.isPending ? t("generatingTags") : t("generateTags")}
		</Button>
	);
}
