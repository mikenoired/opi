import { Button, Input } from "@synapse/ui/components";
import { FileText, Upload, X } from "lucide-react";
import type { DragEvent } from "react";
import { useRef, useState } from "react";

export interface DocumentDropZoneProps {
	dragActive: boolean;
	isLoading: boolean;
	selectedFiles: File[];
	onFileSelect: (files: FileList) => void;
	onDrag: (e: DragEvent) => void;
	onDrop: (e: DragEvent) => void;
	onRemoveFile: (index: number) => void;
}

export function DocumentDropZone({
	dragActive,
	isLoading,
	selectedFiles,
	onFileSelect,
	onDrag,
	onDrop,
	onRemoveFile,
}: DocumentDropZoneProps) {
	const [dragCounter, setDragCounter] = useState(0);
	const inputRef = useRef<HTMLInputElement>(null);

	const handleDrag = (e: DragEvent) => {
		e.preventDefault();
		e.stopPropagation();

		if (e.type === "dragenter" || e.type === "dragover") {
			setDragCounter((prev) => prev + 1);
			onDrag(e);
		} else if (e.type === "dragleave") {
			setDragCounter((prev) => prev - 1);
			if (dragCounter <= 1) {
				onDrag(e);
			}
		}
	};

	const handleDrop = (e: DragEvent) => {
		e.preventDefault();
		e.stopPropagation();
		setDragCounter(0);
		onDrop(e);
	};

	const getFileIcon = (fileName: string) => {
		const extension = fileName.toLowerCase().split(".").pop();
		switch (extension) {
			case "pdf":
				return "📄";
			case "docx":
				return "📝";
			case "epub":
				return "📚";
			case "xlsx":
			case "xls":
				return "📊";
			case "csv":
				return "📈";
			default:
				return "📄";
		}
	};

	const formatFileSize = (bytes: number) => {
		if (bytes === 0) return "0 Bytes";
		const k = 1024;
		const sizes = ["Bytes", "KB", "MB", "GB"];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
	};

	return (
		<div className="space-y-4">
			<div
				className={`rounded-xl border-2 border-dashed p-8 text-center transition-all duration-200 ${
					dragActive
						? "scale-[1.02] border-primary bg-primary/10"
						: "border-muted-foreground/25 hover:border-muted-foreground/50 hover:bg-muted/20"
				}`}
				onDragEnter={handleDrag}
				onDragLeave={handleDrag}
				onDragOver={handleDrag}
				onDrop={handleDrop}>
				<div className="space-y-4">
					<div className={`transition-transform duration-200 ${dragActive ? "scale-110" : ""}`}>
						<FileText className="mx-auto h-12 w-12 text-muted-foreground" />
					</div>
					<div className="space-y-2">
						<p className="text-sm font-medium text-foreground">Перетащите документы сюда</p>
						<p className="text-xs text-muted-foreground">или нажмите для выбора</p>
						<p className="text-xs text-muted-foreground/70">Макс. 50MB • PDF, DOCX, EPUB, XLSX, CSV</p>
					</div>
					<Input
						ref={inputRef}
						type="file"
						accept=".pdf,.docx,.epub,.xlsx,.xls,.csv"
						multiple
						className="hidden"
						id="document-upload"
						disabled={isLoading}
						onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
							e.target.files && onFileSelect(e.target.files)
						}
					/>
					<Button
						type="button"
						variant="tertiary"
						size="sm"
						disabled={isLoading}
						onClick={() => inputRef.current?.click()}
						className="mt-3 transition-colors hover:bg-primary hover:text-primary-foreground">
						<Upload className="mr-2 h-4 w-4" />
						Выбрать документы
					</Button>
				</div>
			</div>

			{selectedFiles.length > 0 && (
				<div className="space-y-2">
					<p className="text-sm font-medium text-foreground">Выбранные документы ({selectedFiles.length})</p>
					<div className="space-y-2">
						{selectedFiles.map((file, index) => (
							<div
								key={index}
								className="flex items-center justify-between rounded-lg border bg-muted/50 p-3">
								<div className="flex items-center space-x-3">
									<span className="text-2xl">{getFileIcon(file.name)}</span>
									<div className="min-w-0 flex-1">
										<p className="truncate text-sm font-medium text-foreground">{file.name}</p>
										<p className="text-xs text-muted-foreground">{formatFileSize(file.size)}</p>
									</div>
								</div>
								<Button
									type="button"
									variant="ghost"
									size="sm"
									onClick={() => onRemoveFile(index)}
									disabled={isLoading}
									className="h-8 w-8 p-0 hover:bg-destructive hover:text-destructive-foreground">
									<X className="h-4 w-4" />
								</Button>
							</div>
						))}
					</div>
				</div>
			)}
		</div>
	);
}
