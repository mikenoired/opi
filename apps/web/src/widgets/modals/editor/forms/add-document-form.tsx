import type { Content } from "@synapse/shared/schemas";
import { Badge, Button } from "@synapse/ui/components";
import { Upload, X } from "lucide-react";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";

import { api } from "@/shared/api/hooks";

import { ModalActions, ModalBody } from "../../layout";

interface AddDocumentFormProps {
	initialTags?: string[];
	onSuccess: (content?: Content | Content[]) => void;
	preloadedFiles?: File[];
}

const SUPPORTED_FORMATS = {
	"application/pdf": { ext: "PDF", icon: "📄" },
	"application/vnd.openxmlformats-officedocument.wordprocessingml.document": { ext: "DOCX", icon: "📝" },
	"application/epub+zip": { ext: "EPUB", icon: "📖" },
	"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": { ext: "XLSX", icon: "📊" },
	"application/vnd.ms-excel": { ext: "XLS", icon: "📊" },
	"text/csv": { ext: "CSV", icon: "📈" },
};

export function AddDocumentForm({ initialTags = [], onSuccess, preloadedFiles = [] }: AddDocumentFormProps) {
	const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
	const [dragActive, setDragActive] = useState(false);
	const [isLoading, setIsLoading] = useState(false);

	const utils = api.useUtils();

	const importFileMutation = api.content.importFile.useMutation({
		onSuccess: () => {
			void Promise.all([
				utils.content.getAvailableTypes.invalidate(),
				utils.content.getTags.invalidate(),
				utils.content.getTagsWithContent.invalidate(),
				utils.graph.getGraph.invalidate(),
				utils.user.getStorageUsage.invalidate(),
			]);
		},
		onError: (error) => {
			toast.error(`Ошибка: ${error.message}`);
		},
	});

	useEffect(() => {
		if (preloadedFiles.length > 0) {
			setSelectedFiles(preloadedFiles);
		}
	}, [preloadedFiles]);

	const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
		if (e.target.files) {
			const files = Array.from(e.target.files);
			const validFiles = files.filter((file) => {
				const extension = file.name.toLowerCase().split(".").pop();
				const validExtensions = ["pdf", "docx", "epub", "xlsx", "xls", "csv"];
				return validExtensions.includes(extension || "");
			});

			if (validFiles.length !== files.length) {
				toast.error("Некоторые файлы имеют неподдерживаемый формат");
			}

			setSelectedFiles((prev) => [...prev, ...validFiles]);
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
			const files = Array.from(e.dataTransfer.files);
			const validFiles = files.filter((file) => {
				const extension = file.name.toLowerCase().split(".").pop();
				const validExtensions = ["pdf", "docx", "epub", "xlsx", "xls", "csv"];
				return validExtensions.includes(extension || "");
			});

			if (validFiles.length !== files.length) {
				toast.error("Некоторые файлы имеют неподдерживаемый формат");
			}

			setSelectedFiles((prev) => [...prev, ...validFiles]);
		}
	};

	const handleRemoveFile = (index: number) => {
		setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
	};

	const getFileInfo = (file: File) => {
		const format = SUPPORTED_FORMATS[file.type as keyof typeof SUPPORTED_FORMATS];
		return format || { ext: file.name.split(".").pop()?.toUpperCase() || "FILE", icon: "📄" };
	};

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();

		if (selectedFiles.length === 0) {
			toast.error("Выберите файлы для загрузки");
			return;
		}

		setIsLoading(true);

		try {
			const createdContents: Content[] = [];

			for (const file of selectedFiles) {
				const buffer = await file.arrayBuffer();

				const result = await importFileMutation.mutateAsync({
					tags: initialTags.length > 0 ? initialTags : undefined,
					file: {
						name: file.name,
						type: file.type,
						size: file.size,
						buffer: Array.from(new Uint8Array(buffer)),
					},
				});

				createdContents.push(result.content);
			}

			toast.success(
				`${selectedFiles.length} ${selectedFiles.length === 1 ? "документ импортирован" : "документов импортировано"}`
			);
			onSuccess(createdContents);
		} catch (error) {
			toast.error(`Ошибка при загрузке: ${error instanceof Error ? error.message : "Неизвестная ошибка"}`);
		} finally {
			setIsLoading(false);
		}
	};

	return (
		<form onSubmit={handleSubmit} className="flex h-full flex-col">
			<ModalBody scrollable>
				<div className="space-y-4">
					<div className="rounded-lg border border-border bg-muted/50 p-4">
						<h3 className="mb-2 text-sm font-medium">Поддерживаемые форматы</h3>
						<div className="flex flex-wrap gap-2">
							{Object.values(SUPPORTED_FORMATS).map((format, idx) => (
								<Badge key={idx} variant="solid" className="text-xs">
									{format.icon} {format.ext}
								</Badge>
							))}
						</div>
					</div>

					<div className="space-y-2">
						<label className="text-sm font-medium">Документы</label>
						<div
							onDragEnter={handleDrag}
							onDragLeave={handleDrag}
							onDragOver={handleDrag}
							onDrop={handleDrop}
							className={`rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
								dragActive ? "border-primary bg-primary/5" : "border-border"
							}`}>
							<Upload className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
							<p className="mb-2 text-sm text-muted-foreground">Перетащите документы сюда</p>
							<p className="mb-4 text-xs text-muted-foreground">или</p>
							<label className="cursor-pointer">
								<span className="inline-block rounded-md bg-primary px-4 py-2 text-primary-foreground transition-colors hover:bg-primary/90">
									Выбрать файлы
								</span>
								<input
									type="file"
									multiple
									accept=".pdf,.docx,.epub,.xlsx,.xls,.csv"
									onChange={handleFileSelect}
									className="hidden"
									disabled={isLoading}
								/>
							</label>
						</div>

						{selectedFiles.length > 0 && (
							<div className="mt-4 space-y-2">
								{selectedFiles.map((file, index) => {
									const fileInfo = getFileInfo(file);
									return (
										<div key={index} className="flex items-center justify-between rounded-lg bg-muted p-3">
											<div className="flex min-w-0 flex-1 items-center gap-3">
												<div className="text-2xl">{fileInfo.icon}</div>
												<div className="min-w-0 flex-1">
													<p className="truncate text-sm font-medium">{file.name}</p>
													<div className="flex items-center gap-2 text-xs text-muted-foreground">
														<span>{fileInfo.ext}</span>
														<span>•</span>
														<span>{(file.size / 1024 / 1024).toFixed(2)} MB</span>
													</div>
												</div>
											</div>
											<button
												type="button"
												onClick={() => handleRemoveFile(index)}
												className="rounded p-1 transition-colors hover:bg-destructive/20"
												disabled={isLoading}>
												<X className="h-4 w-4" />
											</button>
										</div>
									);
								})}
							</div>
						)}
					</div>
				</div>
			</ModalBody>

			<div className="shrink-0 border-t bg-background p-6 pt-4">
				<ModalActions position="right">
					<Button type="button" variant="tertiary" onClick={() => onSuccess()} disabled={isLoading}>
						Отмена
					</Button>
					<Button type="submit" disabled={isLoading || selectedFiles.length === 0} loading={isLoading}>
						{isLoading
							? `Импорт ${selectedFiles.length} файлов...`
							: `Импортировать${selectedFiles.length > 0 ? ` (${selectedFiles.length})` : ""}`}
					</Button>
				</ModalActions>
			</div>
		</form>
	);
}
