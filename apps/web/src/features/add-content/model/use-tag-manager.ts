import { normalizeTagTitle } from "@synapse/core";
import type { KeyboardEvent } from "react";
import { useCallback, useState } from "react";

import type { TagState } from "./types";

export function useTagManager(initialTags: string[] = []) {
	const [state, setState] = useState<TagState>({
		tags: initialTags,
		currentTag: "",
	});

	const updateCurrentTag = useCallback((tag: string) => {
		setState((prev) => ({ ...prev, currentTag: tag }));
	}, []);

	const addTag = useCallback(() => {
		const trimmedTag = state.currentTag.trim();
		const existing = new Set(state.tags.map(normalizeTagTitle));
		if (trimmedTag && !existing.has(normalizeTagTitle(trimmedTag))) {
			setState((prev) => ({
				tags: [...prev.tags, trimmedTag],
				currentTag: "",
			}));
		}
	}, [state.currentTag, state.tags]);

	const addTags = useCallback((names: string[]) => {
		const cleaned = names.map((name) => name.trim()).filter((name) => name.length > 0);
		if (cleaned.length === 0) return;
		setState((prev) => {
			const existing = new Set(prev.tags.map(normalizeTagTitle));
			const merged = [...prev.tags];
			for (const name of cleaned) {
				const key = normalizeTagTitle(name);
				if (!existing.has(key)) {
					existing.add(key);
					merged.push(name);
				}
			}
			return { ...prev, tags: merged };
		});
	}, []);

	const setTags = useCallback((names: string[]) => {
		const cleaned = names.map((name) => name.trim()).filter((name) => name.length > 0);
		setState((prev) => {
			const merged: string[] = [];
			const existing = new Set<string>();
			for (const name of cleaned) {
				const key = normalizeTagTitle(name);
				if (!existing.has(key)) {
					existing.add(key);
					merged.push(name);
				}
			}
			return { ...prev, tags: merged };
		});
	}, []);

	const removeTag = useCallback((tagToRemove: string) => {
		setState((prev) => ({
			...prev,
			tags: prev.tags.filter((tag) => tag !== tagToRemove),
		}));
	}, []);

	const resetTags = useCallback(() => {
		setState({
			tags: initialTags,
			currentTag: "",
		});
	}, [initialTags]);

	const handleKeyDown = useCallback(
		(e: KeyboardEvent<HTMLInputElement>) => {
			if (e.key === "Enter" && !e.shiftKey) {
				e.preventDefault();
				addTag();
			}
			if (e.key === "Backspace" && state.currentTag === "") {
				e.preventDefault();
				removeTag(state.tags[state.tags.length - 1]);
			}
		},
		[addTag, removeTag, state.currentTag, state.tags]
	);

	return {
		tags: state.tags,
		currentTag: state.currentTag,
		updateCurrentTag,
		addTag,
		addTags,
		setTags,
		removeTag,
		resetTags,
		handleKeyDown,
	};
}
