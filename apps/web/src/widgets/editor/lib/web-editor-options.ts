import type { RichTextEditorProps } from "@monolyth/features";
import { useI18n } from "@monolyth/i18n";
import toast from "react-hot-toast";

/** Supplies the Web shell's localization and browser integrations to the shared editor. */
export function useWebEditorOptions(): Pick<RichTextEditorProps, "onError" | "onRequestLink"> {
	const { t } = useI18n();
	return {
		onError: (message) => toast.error(message),
		onRequestLink: (currentHref) => window.prompt(t("editor.link"), currentHref),
	};
}
