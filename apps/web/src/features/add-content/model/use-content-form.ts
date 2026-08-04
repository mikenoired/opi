import type { Content } from "@synapse/shared/schemas";
import { useCallback, useState } from "react";

import type { ContentFormState } from "./types";

export function useContentForm() {
	const [state, setState] = useState<ContentFormState>({
		type: "note",
		title: "",
		content: "",
		isFullScreen: false,
	});

	const [editorData, setEditorData] = useState<any>(null);

	const updateType = useCallback((type: Content["type"]) => {
		setState((prev) => ({ ...prev, type }));
	}, []);

	const updateTitle = useCallback((title: string) => {
		setState((prev) => ({ ...prev, title }));
	}, []);

	const updateContent = useCallback((content: string) => {
		setState((prev) => ({ ...prev, content }));
	}, []);

	const toggleFullScreen = useCallback(() => {
		setState((prev) => ({ ...prev, isFullScreen: !prev.isFullScreen }));
	}, []);

	const resetForm = useCallback(() => {
		setState({
			type: "note",
			title: "",
			content: "",
			isFullScreen: false,
		});
		setEditorData(null);
	}, []);

	return {
		state,
		editorData,
		setEditorData,
		updateType,
		updateTitle,
		updateContent,
		toggleFullScreen,
		resetForm,
	};
}
