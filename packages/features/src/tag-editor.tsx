import type { AiTagsInput } from "@synapse/api";
import { uniqueTagTitles } from "@synapse/core";
import type { Content } from "@synapse/shared/schemas";
import { Button } from "@synapse/ui/components";
import { Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useAppServices } from "./runtime";
import { TagInput, type TagInputProps, type TagSuggestion } from "./tag-input";

type AiGenerate =
	| {
			mode: "draft";
			type: Content["type"];
			title?: string;
			content?: string;
			image?: string;
			disabled?: boolean;
	  }
	| { mode: "existing"; contentId: string; disabled?: boolean };

export interface TagEditorStrings {
	generate: string;
	generating: string;
	noSuggestions: string;
}

export interface TagEditorProps extends Omit<TagInputProps, "action" | "suggestions"> {
	aiGenerate?: AiGenerate | null;
	onGenerateTags?(input: AiTagsInput): Promise<string[]>;
	onError?(message: string): void;
	suggestions?: TagSuggestion[];
	strings?: Partial<TagEditorStrings>;
}

const defaultStrings: TagEditorStrings = {
	generate: "AI-теги",
	generating: "Генерация…",
	noSuggestions: "Не удалось подобрать теги",
};

/**
 * Canonical tag form for every platform. The runtime supplies REST on Web and
 * IPC on Desktop; this component owns neither transport nor platform checks.
 */
export function TagEditor({
	aiGenerate,
	disabled = false,
	onError,
	onGenerateTags,
	onTagsChange,
	strings: overrides,
	suggestions,
	tags,
	...input
}: TagEditorProps) {
	const { client } = useAppServices();
	const strings = { ...defaultStrings, ...overrides };
	const [loadedSuggestions, setLoadedSuggestions] = useState<TagSuggestion[]>([]);
	const [suggesting, setSuggesting] = useState(false);
	const [errorMessage, setErrorMessage] = useState("");
	const onErrorRef = useRef(onError);
	useEffect(() => {
		onErrorRef.current = onError;
	}, [onError]);

	useEffect(() => {
		if (suggestions) return;
		let active = true;
		void client.content
			.getTags()
			.then((next) => {
				if (active) setLoadedSuggestions(next);
			})
			.catch((error: unknown) => {
				if (!active) return;
				const message = messageFor(error, "Не удалось загрузить теги");
				setErrorMessage(message);
				onErrorRef.current?.(message);
			});
		return () => {
			active = false;
		};
	}, [client.content, suggestions]);

	const generate = async () => {
		if (!aiGenerate || disabled || aiGenerate.disabled || suggesting) return;
		setSuggesting(true);
		setErrorMessage("");
		try {
			const aiInput = toAiInput(aiGenerate);
			if (onGenerateTags) {
				onTagsChange(uniqueTagTitles([...tags, ...(await onGenerateTags(aiInput))]));
			} else {
				const result = await client.ai.suggestTags(aiInput);
				if (!result.success) throw new Error(result.error ?? strings.noSuggestions);
				onTagsChange(
					uniqueTagTitles([...tags, ...result.existing.map((tag) => tag.name), ...result.newTags])
				);
			}
		} catch (error) {
			const message = messageFor(error, strings.noSuggestions);
			setErrorMessage(message);
			onError?.(message);
		} finally {
			setSuggesting(false);
		}
	};

	return (
		<div>
			<TagInput
				{...input}
				action={
					aiGenerate ? (
						<Button
							disabled={disabled || aiGenerate.disabled || suggesting}
							leadingIcon={Sparkles}
							onClick={() => void generate()}
							size="sm"
							type="button">
							{suggesting ? strings.generating : strings.generate}
						</Button>
					) : undefined
				}
				disabled={disabled}
				onTagsChange={onTagsChange}
				suggestions={suggestions ?? loadedSuggestions}
				tags={tags}
			/>
			{errorMessage && (
				<p className="mt-2 text-sm text-destructive" role="alert">
					{errorMessage}
				</p>
			)}
		</div>
	);
}

function toAiInput(input: AiGenerate): AiTagsInput {
	return input.mode === "existing"
		? { contentId: input.contentId, mode: "existing" }
		: { content: input.content, image: input.image, mode: "draft", title: input.title, type: input.type };
}

function messageFor(error: unknown, fallback: string) {
	return error instanceof Error && error.message ? error.message : fallback;
}
