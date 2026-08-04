import type { Content } from "@synapse/shared/schemas";
import type { LinkContent } from "@synapse/shared/schemas";
import { Button, Input } from "@synapse/ui/components";
import { useState } from "react";

import { api } from "@/shared/api/hooks";
import { apiUrl } from "@/shared/config/api";
import { TagEditor } from "@/shared/ui/tag-editor";

import { ModalActions, ModalBody } from "../../layout";
import { showToast } from "../../utils";

interface AddLinkFormProps {
	initialTags?: string[];
	onSuccess: (content?: Content) => void;
}

export function AddLinkForm({ initialTags = [], onSuccess }: AddLinkFormProps) {
	const [url, setUrl] = useState("");
	const [title, setTitle] = useState("");
	const [tags, setTags] = useState<string[]>(initialTags);
	const [parsing, setParsing] = useState(false);
	const [parsedLink, setParsedLink] = useState<LinkContent | null>(null);
	const utils = api.useUtils();

	const createMutation = api.content.create.useMutation();
	const parseLink = async (targetUrl: string): Promise<LinkContent> => {
		const response = await fetch(apiUrl("/parse-link"), {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			credentials: "include",
			body: JSON.stringify({ url: targetUrl }),
		});

		const result = await response.json().catch(() => null);

		if (!response.ok || !result?.data) throw new Error(result?.error || "Не удалось распознать ссылку");

		return result.data as LinkContent;
	};

	const handleParseLink = async () => {
		if (!url.trim()) return;

		setParsing(true);
		try {
			const parsed = await parseLink(url.trim());
			setParsedLink(parsed);
			if (parsed.title && !title) {
				setTitle(parsed.title);
			}
			showToast.success("Ссылка распознана");
		} catch {
			showToast.error("Не удалось распознать ссылку");
		} finally {
			setParsing(false);
		}
	};

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();

		if (!url.trim()) {
			showToast.error("Введите URL");
			return;
		}

		try {
			const content = await createMutation.mutateAsync({
				type: "link",
				title: title || undefined,
				content: url.trim(),
				tags,
			});

			void Promise.all([
				utils.content.getAvailableTypes.invalidate(),
				utils.content.getTags.invalidate(),
				utils.content.getTagsWithContent.invalidate(),
				utils.graph.getGraph.invalidate(),
			]);

			showToast.success("Ссылка сохранена");
			onSuccess(content);
		} catch {
			showToast.error("Ошибка при сохранении ссылки");
		}
	};

	return (
		<form onSubmit={handleSubmit} className="flex h-full flex-col">
			<ModalBody scrollable>
				<div className="space-y-4">
					<div className="space-y-2">
						<label htmlFor="url" className="text-sm font-medium">
							URL *
						</label>
						<div className="flex gap-2">
							<Input
								id="url"
								placeholder="https://example.com"
								value={url}
								onChange={(e) => setUrl(e.target.value)}
								disabled={createMutation.isPending || parsing}
								className="flex-1"
							/>
							<Button
								type="button"
								variant="tertiary"
								onClick={handleParseLink}
								disabled={!url.trim() || parsing || createMutation.isPending}>
								{parsing ? "Обработка..." : "Распознать"}
							</Button>
						</div>
					</div>

					<div className="space-y-2">
						<label htmlFor="title" className="text-sm font-medium">
							Заголовок (необязательно)
						</label>
						<Input
							id="title"
							placeholder="Название ссылки..."
							value={title}
							onChange={(e) => setTitle(e.target.value)}
							disabled={createMutation.isPending}
						/>
					</div>

					<div className="space-y-2">
						<label className="text-sm font-medium">Теги</label>
						<TagEditor
							tags={tags}
							onTagsChange={setTags}
							disabled={createMutation.isPending}
							aiGenerate={{
								mode: "draft",
								type: "link",
								title,
								content: JSON.stringify(parsedLink ?? {}),
								disabled: !parsedLink,
							}}
						/>
					</div>
				</div>
			</ModalBody>

			<div className="shrink-0 border-t bg-background p-6 pt-4">
				<ModalActions position="right">
					<Button variant="tertiary" onClick={() => onSuccess()} disabled={createMutation.isPending}>
						Отмена
					</Button>
					<Button
						type="submit"
						disabled={createMutation.isPending || !url.trim()}
						loading={createMutation.isPending}>
						{createMutation.isPending ? "Сохранение..." : "Сохранить"}
					</Button>
				</ModalActions>
			</div>
		</form>
	);
}
