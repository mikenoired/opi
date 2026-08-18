import { Button } from "@synapse/ui/components";
import { Plus, Upload, X } from "lucide-react";
import type { DragEvent } from "react";

export interface MediaDropZoneProps {
	dragActive: boolean;
	isLoading: boolean;
	kind?: "audio" | "media";
	selectedFiles: File[];
	previewUrls: string[];
	onFileSelect: (files: FileList) => void;
	onDrag: (e: DragEvent) => void;
	onDrop: (e: DragEvent) => void;
	onRemoveFile: (index: number) => void;
	onMoveFile: (fromIndex: number, toIndex: number) => void;
}

export function MediaDropZone({
	dragActive,
	isLoading,
	kind = "media",
	selectedFiles,
	previewUrls,
	onFileSelect,
	onDrag,
	onDrop,
	onRemoveFile,
	onMoveFile,
}: MediaDropZoneProps) {
	const isAudio = kind === "audio";
	return (
		<div className="space-y-4">
			<div
				className={`rounded-xl border-2 border-dashed p-8 text-center transition-all duration-200 ${
					dragActive
						? "scale-[1.02] border-primary bg-primary/10"
						: "border-muted-foreground/25 hover:border-muted-foreground/50 hover:bg-muted/20"
				}`}
				onDragEnter={onDrag}
				onDragLeave={onDrag}
				onDragOver={onDrag}
				onDrop={onDrop}>
				<div className="space-y-4">
					<div className={`transition-transform duration-200 ${dragActive ? "scale-110" : ""}`}>
						<Upload className="mx-auto h-12 w-12 text-muted-foreground" />
					</div>
					<div className="space-y-2">
						<p className="text-sm font-medium text-foreground">Drag files there</p>
						<p className="text-xs text-muted-foreground">or click to choose</p>
						<p className="text-xs text-muted-foreground/70">
							{isAudio
								? "Max 50MB • MP3, M4A, AAC, FLAC, WAV, OGG, Opus"
								: "Max 10MB • JPG, PNG, GIF, WebP, MP4, MOV, AVI, WebM"}
						</p>
					</div>
					<input
						type="file"
						accept={isAudio ? "audio/*" : "image/*,video/*"}
						multiple
						className="hidden"
						id="file-upload"
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
						onClick={() => document.getElementById("file-upload")?.click()}
						className="mt-3 transition-colors hover:bg-primary hover:text-primary-foreground">
						<Plus className="mr-2 h-4 w-4" />
						Select files
					</Button>
				</div>
			</div>

			{selectedFiles.length > 0 && (
				<div>
					{selectedFiles.length > 1 && (
						<p className="mb-2 text-xs text-muted-foreground">Drag images to change placing</p>
					)}
					<div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
						{previewUrls.map((url, index) => (
							<div
								key={index}
								className="group relative cursor-move"
								draggable={selectedFiles.length > 1}
								onDragStart={(e) => {
									e.dataTransfer.setData("text/plain", index.toString());
									e.dataTransfer.effectAllowed = "move";
								}}
								onDragOver={(e) => {
									e.preventDefault();
									e.dataTransfer.dropEffect = "move";
								}}
								onDrop={(e) => {
									e.preventDefault();
									const fromIndex = Number.parseInt(e.dataTransfer.getData("text/plain"));
									const toIndex = index;
									onMoveFile(fromIndex, toIndex);
								}}>
								{selectedFiles[index].type.startsWith("audio/") ? (
									<div className="flex aspect-square w-full items-center justify-center rounded-lg border text-xs text-muted-foreground">
										{selectedFiles[index].name}
									</div>
								) : (
									<img
										src={url}
										alt={`Preview ${index + 1}`}
										className="aspect-square w-full rounded-lg border object-cover"
									/>
								)}
								{selectedFiles.length > 1 && (
									<div className="absolute top-1 left-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/70 text-xs font-medium text-white">
										{index + 1}
									</div>
								)}
								<button
									type="button"
									onClick={() => onRemoveFile(index)}
									disabled={isLoading}
									className="absolute top-1 right-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-white opacity-0 transition-opacity group-hover:opacity-100 hover:bg-black/90">
									<X className="h-3 w-3" />
								</button>
								<div className="absolute right-1 bottom-1 left-1">
									<div className="truncate rounded bg-black/70 px-1 py-0.5 text-xs text-white">
										{selectedFiles[index].name}
									</div>
								</div>
							</div>
						))}
					</div>
				</div>
			)}
		</div>
	);
}
