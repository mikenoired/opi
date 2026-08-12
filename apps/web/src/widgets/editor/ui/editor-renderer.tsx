import { RichTextRenderer, type RichTextRendererProps } from "@synapse/features";

export type EditorRendererProps = RichTextRendererProps;

/** Web adapter: uses the same read-only renderer with the active interface language. */
export function EditorRenderer(props: EditorRendererProps) {
	return <RichTextRenderer {...props} />;
}
