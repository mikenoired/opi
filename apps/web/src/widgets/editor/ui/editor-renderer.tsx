import { RichTextRenderer, type RichTextRendererProps } from "@synapse/features";

import { useWebEditorOptions } from "../lib/web-editor-options";

export type EditorRendererProps = RichTextRendererProps;

/** Web adapter: uses the same read-only renderer with the active interface language. */
export function EditorRenderer(props: EditorRendererProps) {
	const { strings } = useWebEditorOptions();
	return <RichTextRenderer {...props} strings={strings} />;
}
