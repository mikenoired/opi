import type { Content } from "@synapse/shared/schemas";
import { Button, Input } from "@synapse/ui/components";
import { Upload, X } from "lucide-react";
import { useEffect, useState } from "react";

import { api } from "@/shared/api/hooks";
import { fileToScaledDataUrl } from "@/shared/lib/downscale-image";
import { TagEditor } from "@/shared/ui/tag-editor";

import { ModalActions, ModalBody } from "../../layout";
import { showToast } from "../../utils";

interface AddMediaFormProps {
	initialTags?: string[];
	onSuccess: (content?: Content | Content[]) => void;
	preloadedFiles?: File[];
}

export function AddMediaForm({ initialTags = [], onSuccess, preloadedFiles = [] }: AddMediaFormProps) {
	const [title, setTitle] = useState("");
	const [tags, setTags] = useState<string[]>(initialTags);
	const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
	const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
	const [dragActive, setDragActive] = useState(false);

	const utils = api.useUtils();

	const uploadMutation = api.upload.formData.useMutation({
		onSuccess: () => {
			void Promise.all([
				utils.content.getAvailableTypes.invalidate(),
				utils.content.getTags.invalidate(),
				utils.content.getTagsWithContent.invalidate(),
				utils.graph.getGraph.invalidate(),
				utils.user.getStorageUsage.invalidate(),
			]);
		},
	});

	useEffect(() => {
		if (preloadedFiles.length > 0) {
			setSelectedFiles(preloadedFiles);
		}
	}, [preloadedFiles]);

	// Downscale the first picked image so AI tags can be suggested before upload.
	useEffect(() => {
		let cancelled = false;
		const firstImage = selectedFiles.find((f) => f.type.startsWith("image/"));
		if (!firstImage) {
			setImageDataUrl(null);
			return;
		}
		void fileToScaledDataUrl(firstImage).then((url) => {
			if (!cancelled) setImageDataUrl(url);
		});
		return () => {
			cancelled = true;
		};
	}, [selectedFiles]);

	const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
		if (e.target.files) {
			const files = Array.from(e.target.files);
			setSelectedFiles((prev) => [...prev, ...files]);
		}
	};

	const handleDrag = (e: React.DragEvent) => {
		e.preventDefault();
		e.stopPropagation();
		if (e.type === "dragenter" || e.type === "dragover") {
			setDragActive(true);
		} else if (e.type === "dragleave") {
			setDragActive(false);
		}
	};

	const handleDrop = (e: React.DragEvent) => {
		e.preventDefault();
		e.stopPropagation();
		setDragActive(false);

		if (e.dataTransfer.files) {
			const files = Array.from(e.dataTransfer.files).filter(
				(f) => f.type.startsWith("image/") || f.type.startsWith("video/")
			);
			setSelectedFiles((prev) => [...prev, ...files]);
		}
	};

	const handleRemoveFile = (index: number) => {
		setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
	};

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();

		if (selectedFiles.length === 0) {
			showToast.error("Выберите хотя бы один файл");
			return;
		}

		try {
			// Конвертируем файлы в правильный формат для api
			const filesPayload = await Promise.all(
				selectedFiles.map(async (file) => ({
					name: file.name,
					type: file.type,
					size: file.size,
					content: Buffer.from(await file.arrayBuffer()).toString("base64"),
				}))
			);

			const result = await uploadMutation.mutateAsync({
				files: filesPayload,
				title: title || undefined,
				tags: tags && tags.length > 0 ? tags : undefined,
			});

			if (result.errors && result.errors.length > 0) {
				showToast.error(`Ошибки при загрузке: ${result.errors.join(", ")}`);
			} else {
				showToast.success(
					`${selectedFiles.length} ${selectedFiles.length === 1 ? "файл загружен" : "файлов загружено"}`
				);
			}

			onSuccess(result.contents);
		} catch (error) {
			showToast.error(
				`Ошибка при загрузке файлов: ${error instanceof Error ? error.message : "Неизвестная ошибка"}`
			);
		}
	};

	return (
		<form onSubmit={handleSubmit} className="flex h-full flex-col">
			<ModalBody scrollable>
				<div className="space-y-4">
					{/* Title */}
					<div className="space-y-2">
						<label htmlFor="title" className="text-sm font-medium">
							Заголовок (необязательно)
						</label>
						<Input
							id="title"
							placeholder="Введите заголовок..."
							value={title}
							onChange={(e) => setTitle(e.target.value)}
							disabled={uploadMutation.isPending}
						/>
					</div>

					{/* File Upload */}
					<div className="space-y-2">
						<label className="text-sm font-medium">Файлы</label>
						<div
							onDragEnter={handleDrag}
							onDragLeave={handleDrag}
							onDragOver={handleDrag}
							onDrop={handleDrop}
							className={`rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
								dragActive ? "border-primary bg-primary/5" : "border-border"
							}`}>
							<Upload className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
							<p className="mb-2 text-sm text-muted-foreground">Перетащите изображения или видео сюда</p>
							<p className="mb-4 text-xs text-muted-foreground">или</p>
							<label className="cursor-pointer">
								<span className="inline-block rounded-md bg-primary px-4 py-2 text-primary-foreground transition-colors hover:bg-primary/90">
									Выбрать файлы
								</span>
								<input
									type="file"
									multiple
									accept="image/*,video/*"
									onChange={handleFileSelect}
									className="hidden"
									disabled={uploadMutation.isPending}
								/>
							</label>
						</div>

						{/* Selected Files */}
						{selectedFiles.length > 0 && (
							<div className="mt-4 space-y-2">
								{selectedFiles.map((file, index) => (
									<div key={index} className="flex items-center justify-between rounded-lg bg-muted p-3">
										<div className="flex min-w-0 flex-1 items-center gap-3">
											{file.type.startsWith("image/") && (
												<img
													src={URL.createObjectURL(file)}
													alt={file.name}
													className="h-12 w-12 rounded object-cover"
												/>
											)}
											<div className="min-w-0 flex-1">
												<p className="truncate text-sm font-medium">{file.name}</p>
												<p className="text-xs text-muted-foreground">
													{(file.size / 1024 / 1024).toFixed(2)} MB
												</p>
											</div>
										</div>
										<button
											type="button"
											onClick={() => handleRemoveFile(index)}
											className="rounded p-1 transition-colors hover:bg-destructive/20"
											disabled={uploadMutation.isPending}>
											<X className="h-4 w-4" />
										</button>
									</div>
								))}
							</div>
						)}
					</div>

					{/* Tags */}
					<div className="space-y-2">
						<label className="text-sm font-medium">Теги</label>
						<TagEditor
							tags={tags}
							onTagsChange={setTags}
							disabled={uploadMutation.isPending}
							aiGenerate={
								imageDataUrl
									? {
											mode: "draft",
											type: "media",
											title: title || undefined,
											image: imageDataUrl,
											disabled: uploadMutation.isPending,
										}
									: null
							}
						/>
					</div>
				</div>
			</ModalBody>

			<div className="shrink-0 border-t bg-background p-6 pt-4">
				<ModalActions position="right">
					<Button
						type="button"
						variant="tertiary"
						onClick={() => onSuccess()}
						disabled={uploadMutation.isPending}>
						Отмена
					</Button>
					<Button
						type="submit"
						disabled={uploadMutation.isPending || selectedFiles.length === 0}
						loading={uploadMutation.isPending}>
						{uploadMutation.isPending
							? `Загрузка ${selectedFiles.length} файлов...`
							: `Загрузить${selectedFiles.length > 0 ? ` (${selectedFiles.length})` : ""}`}
					</Button>
				</ModalActions>
			</div>
		</form>
	);
}
