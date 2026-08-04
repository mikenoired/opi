import type { Content } from "@synapse/shared/schemas";
import { useState } from "react";
import { toast } from "react-hot-toast";

import { api } from "@/shared/api/hooks";

export function useDocumentUpload() {
	const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
	const [dragActive, setDragActive] = useState(false);
	const [isLoading, setIsLoading] = useState(false);

	const utils = api.useUtils();

	const importFileMutation = api.content.importFile.useMutation({
		onSuccess: () => {
			toast.success("Документ успешно импортирован!");
			utils.content.getAll.invalidate();
			setSelectedFiles([]);
		},
		onError: (error) => {
			toast.error(`Ошибка при импорте: ${error.message}`);
		},
		onSettled: () => {
			setIsLoading(false);
		},
	});

	const handleFileSelect = (files: FileList) => {
		const fileArray = Array.from(files);
		const validFiles = fileArray.filter((file) => {
			const extension = file.name.toLowerCase().split(".").pop();
			const validExtensions = ["pdf", "docx", "epub", "xlsx", "xls", "csv"];
			return validExtensions.includes(extension || "");
		});

		if (validFiles.length !== fileArray.length) {
			toast.error("Некоторые файлы имеют неподдерживаемый формат");
		}

		setSelectedFiles((prev) => [...prev, ...validFiles]);
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

		if (e.dataTransfer.files && e.dataTransfer.files[0]) {
			handleFileSelect(e.dataTransfer.files);
		}
	};

	const removeFile = (index: number) => {
		setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
	};

	const uploadFiles = async (): Promise<Content[]> => {
		if (selectedFiles.length === 0) {
			toast.error("Выберите файлы для загрузки");
			return [];
		}

		setIsLoading(true);

		try {
			const createdContents: Content[] = [];

			// Загружаем файлы по одному
			for (const file of selectedFiles) {
				const buffer = await file.arrayBuffer();

				const result = await importFileMutation.mutateAsync({
					file: {
						name: file.name,
						type: file.type,
						size: file.size,
						buffer: Array.from(new Uint8Array(buffer)),
					},
				});

				createdContents.push(result.content);
			}

			return createdContents;
		} catch (error) {
			toast.error(`Ошибка при загрузке: ${error instanceof Error ? error.message : "Неизвестная ошибка"}`);
			return [];
		}
	};

	const resetFiles = () => {
		setSelectedFiles([]);
	};

	return {
		selectedFiles,
		dragActive,
		isLoading,
		handleFileSelect,
		handleDrag,
		handleDrop,
		removeFile,
		uploadFiles,
		resetFiles,
	};
}
