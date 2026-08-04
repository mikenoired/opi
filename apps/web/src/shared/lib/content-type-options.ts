import type { Content } from "@synapse/shared/schemas";
import {
	FileText,
	FileUp,
	Image as ImageIcon,
	Link,
	ListChecks,
	type LucideIcon,
	Music2,
} from "lucide-react";

import type { KeysWithoutParams } from "@/shared/lib/i18n";

export {
	documentContentTypes,
	getQueryTypesForFilter,
	isContentTypeFilterAvailable,
} from "@synapse/shared/content-types";

interface ContentTypeOption {
	description: string;
	descriptionKey: KeysWithoutParams;
	icon: LucideIcon;
	key: Content["type"];
	label: string;
	labelKey: KeysWithoutParams;
}

export const contentTypeOptions: ContentTypeOption[] = [
	{
		key: "note",
		icon: FileText,
		label: "Заметка",
		labelKey: "note",
		description: "Быстрые мысли, заметки и длинные тексты",
		descriptionKey: "contentType.note.description",
	},
	{
		key: "media",
		icon: ImageIcon,
		label: "Медиа",
		labelKey: "media",
		description: "Изображения и видео для быстрой навигации",
		descriptionKey: "contentType.media.description",
	},
	{
		key: "audio",
		icon: Music2,
		label: "Аудио",
		labelKey: "audio",
		description: "Файлы, треки и голосовые материалы",
		descriptionKey: "contentType.audio.description",
	},
	{
		key: "link",
		icon: Link,
		label: "Ссылка",
		labelKey: "link",
		description: "Сохранённые ссылки с превью и метаданными",
		descriptionKey: "contentType.link.description",
	},
	{
		key: "todo",
		icon: ListChecks,
		label: "Задачи",
		labelKey: "todo",
		description: "Короткие списки дел и контрольные пункты",
		descriptionKey: "contentType.todo.description",
	},
	{
		key: "doc",
		icon: FileUp,
		label: "Документ",
		labelKey: "documents",
		description: "PDF, DOCX, EPUB, XLSX, CSV и другие документы",
		descriptionKey: "contentType.doc.description",
	},
];

export function getContentTypeMeta(type: Content["type"]) {
	return contentTypeOptions.find((option) => option.key === type) ?? contentTypeOptions[0];
}
