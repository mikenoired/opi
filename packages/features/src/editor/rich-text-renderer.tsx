import type { JSONContent } from "@tiptap/core";

import { RichTextEditor } from "./rich-text-editor";

export interface RichTextRendererProps {
	data: JSONContent | null;
}
export function RichTextRenderer({ data }: RichTextRendererProps) {
	if (!data || !data.content) return null;

	return (
		<div className="synapse-editor-content">
			<RichTextEditor data={data} readOnly />
		</div>
	);
}
