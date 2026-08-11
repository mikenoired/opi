import type { JSONContent } from "@tiptap/core";

import { RichTextEditor, type RichTextEditorStrings } from "./rich-text-editor";

export interface RichTextRendererProps {
	data: JSONContent | null;
	strings?: Partial<RichTextEditorStrings>;
}

export function RichTextRenderer({ data, strings }: RichTextRendererProps) {
	if (!data || !data.content) return null;

	return (
		<div className="synapse-editor-content">
			<RichTextEditor data={data} readOnly strings={strings} />
		</div>
	);
}
