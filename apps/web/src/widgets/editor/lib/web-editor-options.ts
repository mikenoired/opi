import type { RichTextEditorProps, RichTextEditorStrings } from "@synapse/features";
import { useMemo } from "react";
import toast from "react-hot-toast";

import { useI18n } from "@/shared/lib/i18n";

/** Supplies the Web shell's localization and browser integrations to the shared editor. */
export function useWebEditorOptions(): Pick<RichTextEditorProps, "onError" | "onRequestLink" | "strings"> {
	const { t } = useI18n();
	const strings = useMemo<RichTextEditorStrings>(
		() => ({
			blockquote: t("editor.blockquote"),
			bold: t("editor.bold"),
			bulletList: t("editor.bulletList"),
			code: t("editor.code"),
			codeBlock: t("editor.codeBlock"),
			commandsNotFound: t("editor.commandsNotFound"),
			heading2: t("editor.heading2"),
			heading3: t("editor.heading3"),
			heading4: t("editor.heading4"),
			image: t("editor.image"),
			imageLoadError: t("editor.imageLoadError"),
			italic: t("editor.italic"),
			link: t("editor.link"),
			noteContent: t("editor.noteContent"),
			orderedList: t("editor.orderedList"),
			paragraph: t("editor.paragraph"),
			placeholder: t("editor.placeholder"),
			redo: t("repeat"),
			separator: t("editor.separator"),
			strike: t("editor.strike"),
			taskList: t("editor.taskList"),
			underline: t("editor.underline"),
			undo: t("undo"),
		}),
		[t]
	);

	return {
		onError: (message) => toast.error(message),
		onRequestLink: (currentHref) => window.prompt(t("editor.linkPrompt"), currentHref),
		strings,
	};
}
