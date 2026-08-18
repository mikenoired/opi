import type { TranslationKey } from "@synapse/i18n";
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

export {
	documentContentTypes,
	getQueryTypesForFilter,
	isContentTypeFilterAvailable,
} from "@synapse/shared/content-types";

interface ContentTypeOption {
	description: string;
	descriptionKey: TranslationKey;
	icon: LucideIcon;
	key: Content["type"];
	label: string;
	labelKey: TranslationKey;
}

export const contentTypeOptions: ContentTypeOption[] = [
	{
		key: "note",
		icon: FileText,
		label: "Заметка",
		labelKey: "library.types.note",
		description: "Быстрые мысли, заметки и длинные тексты",
		descriptionKey: "contentType.note.description",
	},
	{
		key: "media",
		icon: ImageIcon,
		label: "Медиа",
		labelKey: "library.types.media",
		description: "Изображения и видео для быстрой навигации",
		descriptionKey: "contentType.media.description",
	},
	{
		key: "audio",
		icon: Music2,
		label: "Аудио",
		labelKey: "library.types.audio",
		description: "Файлы, треки и голосовые материалы",
		descriptionKey: "contentType.audio.description",
	},
	{
		key: "link",
		icon: Link,
		label: "Ссылка",
		labelKey: "library.types.link",
		description: "Сохранённые ссылки с превью и метаданными",
		descriptionKey: "contentType.link.description",
	},
	{
		key: "todo",
		icon: ListChecks,
		label: "Задачи",
		labelKey: "library.types.todo",
		description: "Короткие списки дел и контрольные пункты",
		descriptionKey: "contentType.todo.description",
	},
	{
		key: "doc",
		icon: FileUp,
		label: "Документ",
		labelKey: "library.types.doc",
		description: "PDF, DOCX, EPUB, XLSX, CSV и другие документы",
		descriptionKey: "contentType.doc.description",
	},
];

export function getContentTypeMeta(type: Content["type"]) {
	return contentTypeOptions.find((option) => option.key === type) ?? contentTypeOptions[0];
}
