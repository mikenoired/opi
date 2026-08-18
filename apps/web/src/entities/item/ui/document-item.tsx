import type { Content } from "@monolyth/shared/schemas";
import { calculateReadingTime } from "@monolyth/shared/schemas";
import { Badge } from "@monolyth/ui/components";
import { motion } from "framer-motion";
import { Calendar, Clock } from "lucide-react";
import { useMemo } from "react";

import { ContentTag } from "@/shared/ui/content-tag";

function ensureDataUri(base64: string): string {
	if (!base64) return "";
	if (base64.startsWith("data:")) return base64;
	return `data:image/jpeg;base64,${base64}`;
}

interface DocumentItemProps {
	item: Content;
	index: number;
	onItemClick?: (item: Content) => void;
}

export default function DocumentItem({ item, index, onItemClick }: DocumentItemProps) {
	void index;

	const getDocumentIcon = (type: string) => {
		switch (type) {
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
			case "doc":
			default:
				return "📄";
		}
	};

	const getDocumentTypeName = (type: string) => {
		switch (type) {
			case "pdf":
				return "PDF Document";
			case "docx":
				return "Word Document";
			case "epub":
				return "EPUB Book";
			case "xlsx":
			case "xls":
				return "Excel Spreadsheet";
			case "csv":
				return "CSV File";
			case "doc":
			default:
				return "Document";
		}
	};

	const formatDate = (dateString: string) => {
		return new Date(dateString).toLocaleDateString("ru-RU", {
			month: "short",
			day: "numeric",
		});
	};

	const getTextPreview = (content: string) => {
		const textContent = content
			.replace(/<[^>]*>/g, " ")
			.replace(/\s+/g, " ")
			.trim();
		return textContent.length > 150 ? textContent.substring(0, 150) + "..." : textContent;
	};

	const readingTime = useMemo(() => calculateReadingTime(item.content), [item.content]);
	const textPreview = useMemo(() => getTextPreview(item.content), [item.content]);

	return (
		<motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
			<div className="relative" onClick={() => onItemClick?.(item)}>
				{item.thumbnail_base64 && (
					<div className="h-32 w-full overflow-hidden">
						<img
							src={ensureDataUri(item.thumbnail_base64)}
							alt="Document thumbnail"
							className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
						/>
					</div>
				)}

				<div className="space-y-3 p-4">
					<div className="flex items-start gap-3">
						<div className="mt-0.5 shrink-0 text-2xl">{getDocumentIcon(item.type)}</div>
						<div className="min-w-0 flex-1">
							<h3 className="line-clamp-2 text-sm leading-tight font-semibold text-foreground">
								{item.title || "Untitled Document"}
							</h3>
							<p className="mt-1 text-xs text-muted-foreground">{getDocumentTypeName(item.type)}</p>
						</div>
					</div>

					<div className="line-clamp-3 text-xs leading-relaxed text-muted-foreground">{textPreview}</div>

					<div className="flex items-center justify-between text-xs text-muted-foreground">
						<div className="flex items-center gap-3">
							<div className="flex items-center gap-1">
								<Calendar className="h-3 w-3" />
								<span>{formatDate(item.created_at)}</span>
							</div>
							<div className="flex items-center gap-1">
								<Clock className="h-3 w-3" />
								<span>{readingTime}</span>
							</div>
						</div>
					</div>

					{item.tags.length > 0 && (
						<div className="flex flex-wrap gap-1 border-t border-border pt-2">
							{item.tags.slice(0, 3).map((tag: string, tagIndex) => (
								<ContentTag
									key={tag}
									tag={tag}
									tagId={item.tag_ids[tagIndex]}
									className="bg-muted px-2 py-1 text-xs hover:bg-hover"
								/>
							))}
							{item.tags.length > 3 && (
								<Badge variant="solid" className="bg-muted px-2 py-1 text-xs">
									+{item.tags.length - 3}
								</Badge>
							)}
						</div>
					)}
				</div>
			</div>
		</motion.div>
	);
}
