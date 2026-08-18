import { RichTextEditor, type RichTextEditorProps } from "@synapse/features";

import { useWebEditorOptions } from "../lib/web-editor-options";

export type EditorProps = RichTextEditorProps;

/** Web adapter: supplies localization, toast notifications and browser link input. */
export function Editor(props: EditorProps) {
	const options = useWebEditorOptions();
	return <RichTextEditor {...options} {...props} />;
}
