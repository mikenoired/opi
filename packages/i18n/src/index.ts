import { createContext, createElement, useContext, useMemo, type ReactNode } from "react";

export type InterfaceLanguage = "en" | "ru";

export const searchPlaceholdersEn = [
	"Search your notes, links, and ideas",
	"What are we looking for today?",
	"Find that thought hiding somewhere",
	"Search the whole Synapse",
	"Where did I put that brilliant idea?",
	"Look for a note, link, or tiny revelation",
	"Try a title, tag, or phrase",
	"Search like you mean it",
	"Hunt down a half-remembered thought",
	"Find the thread worth pulling",
	"What should we bring back to the surface?",
	"Search your second brain",
	"Type a clue. We’ll do the digging.",
	"Find something you saved for later",
	"Browse your memory palace",
	"Looking for a spark?",
	"Search by title, tag, or content",
	"Let’s find that little gem",
	"Which idea is calling?",
	"Start with a word or two",
] as const;

const en = {
	library: {
		drop: {
			title: "Drop files to add content",
			subtitle: "Images, video, audio, and documents are supported",
		},
		add: "Add",
		cancel: "Cancel",
		clearFilters: "Clear filters",
		content: "Content",
		delete: "Delete",
		deleteConfirm: "Delete content?",
		discardChanges: "Discard changes",
		done: "done",
		edit: "Edit",
		emptyDescription: "Add a note, link, or file. It will be saved locally.",
		emptyNote: "Empty note",
		emptyTitle: "Your library is empty",
		graph: "Graph",
		graphEmpty: "Nothing found",
		linkUrl: "URL",
		notFoundDescription: "Change the query or clear filters.",
		notFoundTitle: "Nothing found",
		open: "Open",
		save: "Save",
		searchAria: "Search",
		settings: "Settings",
		tags: "Tags",
		tagsEmpty: "No tags yet",
		tagColor: {
			none: "No color",
			option: "Color {number}",
			picker: "Tag color",
		},
		title: "Home",
		type: "Type",
		unsavedDescription: "You have unsaved changes. Close without saving?",
		unsavedTitle: "Unsaved changes",
		untitled: "Untitled",
		types: {
			audio: "Audio",
			csv: "CSV",
			doc: "Document",
			docx: "DOCX",
			epub: "EPUB",
			link: "Link",
			media: "Media",
			note: "Note",
			pdf: "PDF",
			todo: "Task",
			xlsx: "XLSX",
		},
		viewer: {
			close: "Close viewer",
			created: "Created {date}",
			deleteDescription: "The item will be deleted from the local library.",
			deleteTitle: "Delete content?",
			details: "Details",
			download: "Download",
			emptyTasks: "No tasks yet",
			next: "Next item",
			previous: "Previous item",
			recommendationsAria: "Related content",
			recommendationsEyebrow: "Keep exploring",
			recommendationsLoadingMore: "Looking for more",
			recommendationsTitle: "Related by meaning",
			suggestTags: "AI tags",
			updated: "Updated {date}",
		},
	},
	account: {
		title: "Profile",
		description: "Profile details & sync",
		createdWithUs: "Member since {date}",
		noDate: "Registration date unavailable",
		session: {
			description: "Manage your Synapse Sync connection.",
			signOut: "Sign out",
			signingOut: "Signing out…",
			title: "Synapse session",
		},
	},
	appearance: {
		autoTagColors: { description: "Automatically choose a color for new tags.", title: "Tag colors" },
		description: "Saved locally and applied to the whole interface.",
		language: {
			description: "Interface language for this local library.",
			english: "English",
			russian: "Русский",
			title: "Language",
		},
		noteSparkles: { description: "Add a subtle animation to notes.", title: "Note animation" },
		palette: {
			description: "Choose an accent color for the interface.",
			desert: "Desert",
			twilight: "Twilight",
			arctic: "Arctic",
			noir: "Noir",
			forest: "Forest",
			ember: "Ember",
			slate: "Slate",
			sakura: "Sakura",
			title: "Palette",
		},
		theme: { dark: "Dark", light: "Light", system: "System", title: "Theme" },
		title: "Appearance",
	},
	media: {
		title: "Storage",
		description: "Storage & import settings",
		autoplay: { description: "Automatically play audio and video when opened.", title: "Autoplay" },
		files: "Items",
		import: "Import files",
		storage: { label: "Local storage", used: "Used" },
	},
	ai: {
		title: "AI",
		description: "AI usage & account plan",
		cost: "Cost",
		error: "AI statistics will appear after connecting a compatible Synapse server.",
		failures: "Failures",
		latency: "Latency",
		models: "Models",
		noRequests: "No requests yet",
		planDescription: "Your plan limits",
		requests: "Requests",
		successRate: "Success rate",
		thisMonth: "For {month}",
		tokens: "Tokens",
		tokensShort: "tokens",
	},
	sync: {
		title: "Automatic synchronization",
		apiUrl: "API URL",
		automatic: "Automatically sync new content",
		conflicts: "Local conflict copies",
		email: "Email",
		login: "Sign in to Synapse",
		manual: "Sync manually",
		password: "Password",
		sync: "Sync",
		unavailable: "Sync is unavailable on your current plan",
		withPlan: "Synapse Sync · {plan}",
		syncing: "Syncing...",
		downloadChanges: "Download changes",
		uploadingChanges: "Uploading changes",
		endingSync: "Ending sync",
	},
	navigation: { profile: "Profile" },
	graph: { zoomIn: "Zoom in", zoomOut: "Zoom out" },
	editor: {
		blockquote: "Quote",
		bold: "Bold",
		bulletList: "Bullet list",
		code: "Inline code",
		codeBlock: "Code block",
		commandsNotFound: "No commands found",
		heading2: "Heading 2",
		heading3: "Heading 3",
		heading4: "Heading 4",
		image: "Image",
		imageLoadError: "Could not add image",
		italic: "Italic",
		link: "Link",
		more: "More formatting",
		noteContent: "Note content",
		orderedList: "Ordered list",
		paragraph: "Text",
		placeholder: "Start with a thought, idea, or observation…",
		redo: "Redo",
		reset: "Reset",
		save: "Save",
		separator: "Divider",
		strike: "Strikethrough",
		taskList: "Task list",
		underline: "Underline",
		undo: "Undo",
	},
	content: {
		addItem: "Add item…",
		addTag: "+ Add tag",
		addTodo: "Add",
		changeTypeDescription: "Unsaved changes will be discarded. Choose another content type?",
		changeTypeTitle: "Change content type?",
		contentRequired: "Add note content",
		creating: "Saving…",
		discard: "Discard changes",
		documentFiles: "Documents",
		emptyTodos: "No tasks yet",
		fileRequired: "Select at least one file",
		fullScreen: "Full screen",
		linkParsingFailed: "Could not parse link",
		makeTrack: "Create a playlist track",
		parse: "Parse",
		parsing: "Processing…",
		saving: "Saving…",
		titleOptional: "Title (optional)",
		titlePlaceholder: "Enter a title…",
		todoPlaceholder: "Add item…",
		todoRequired: "Add at least one task",
		todoTitle: "List title…",
		typePickerDescription: "Choose a format — you can open and find it in your library later.",
		typePickerEyebrow: "New content",
		typePickerTitle: "What shall we add?",
		upload: "Upload",
		uploading: "Uploading {count} files…",
		windowed: "Windowed",
		editContent: "Edit content",
		editNote: "Edit note",
		editTodo: "Edit list",
	},
	contentType: {
		audio: { description: "Files, tracks, and voice materials" },
		doc: { description: "PDF, DOCX, EPUB, XLSX, CSV, and other documents" },
		link: { description: "Saved links with previews and metadata" },
		media: { description: "Images and videos for quick browsing" },
		note: { description: "Quick thoughts, notes, and long-form text" },
		todo: { description: "Short todo lists and checkpoints" },
	},
	accountDelete: {
		action: "Delete account",
		confirm: "Delete permanently",
		confirmDescription: "This action cannot be undone.",
		confirmTitle: "Delete account?",
		description: "Deleting your account removes your synced data.",
		title: "Delete account",
	},
	settings: { title: "Settings" },
	tags: { generate: "AI tags", generating: "Generating…", noSuggestions: "Could not suggest tags" },
} as const;

type TranslationSchema<T> = { [K in keyof T]: T[K] extends string ? string : TranslationSchema<T[K]> };

export const searchPlaceholdersRu = [
	"Ищите заметки, ссылки и идеи",
	"Что сегодня будем искать?",
	"Найдём мысль, которая где-то прячется",
	"Поиск по всему Synapse",
	"Куда я записал эту гениальную идею?",
	"Ищите заметку, ссылку или маленькое озарение",
	"Попробуйте заголовок, тег или фразу",
	"Ищите смело",
	"Охота за смутно знакомой мыслью начинается",
	"Найдём ту самую ниточку",
	"Что вернуть на поверхность?",
	"Поищем во второй памяти",
	"Дайте подсказку — остальное найдём",
	"Найдём то, что вы отложили на потом",
	"Прогуляемся по дворцу памяти",
	"Ищете искру?",
	"Поиск по заголовку, тегу или содержимому",
	"Давайте найдём этот маленький бриллиант",
	"Какая идея зовёт?",
	"Начните с пары слов",
] as const;

const ru = {
	library: {
		drop: {
			title: "Перетащите файлы, чтобы добавить контент",
			subtitle: "Поддерживаются изображения, видео, аудио и документы",
		},
		add: "Добавить",
		cancel: "Сбросить",
		clearFilters: "Сбросить фильтры",
		content: "Содержание",
		delete: "Удалить",
		deleteConfirm: "Удалить материал?",
		discardChanges: "Удалить изменения",
		done: "готово",
		edit: "Изменить",
		emptyDescription: "Добавьте заметку, ссылку или материал. Он сохранится локально.",
		emptyNote: "Пустая заметка",
		emptyTitle: "Библиотека пока пуста",
		graph: "Граф",
		graphEmpty: "Ничего не найдено",
		linkUrl: "Адрес",
		notFoundDescription: "Измените запрос или сбросьте фильтры.",
		notFoundTitle: "Ничего не найдено",
		open: "Открыть",
		save: "Сохранить",
		searchAria: "Поиск",
		settings: "Настройки",
		tags: "Теги",
		tagsEmpty: "Тегов пока нет",
		tagColor: {
			none: "Без цвета",
			option: "Цвет {number}",
			picker: "Цвет тега",
		},
		title: "Главная",
		type: "Тип",
		unsavedDescription: "Есть несохранённые изменения. Закрыть без сохранения?",
		unsavedTitle: "Несохранённые изменения",
		untitled: "Без названия",
		types: {
			audio: "Аудио",
			csv: "CSV",
			doc: "Документ",
			docx: "DOCX",
			epub: "EPUB",
			link: "Ссылка",
			media: "Медиа",
			note: "Заметка",
			pdf: "PDF",
			todo: "Задача",
			xlsx: "XLSX",
		},
		viewer: {
			close: "Закрыть просмотр",
			created: "Создано {date}",
			deleteDescription: "Материал будет удалён из локальной библиотеки.",
			deleteTitle: "Удалить материал?",
			details: "Подробнее",
			download: "Скачать",
			emptyTasks: "Список задач пока пуст",
			next: "Следующий материал",
			previous: "Предыдущий материал",
			recommendationsAria: "Похожие материалы",
			recommendationsEyebrow: "Продолжить исследование",
			recommendationsLoadingMore: "Ищем дальше",
			recommendationsTitle: "Рядом по смыслу",
			suggestTags: "AI-теги",
			updated: "Обновлено {date}",
		},
	},
	account: {
		title: "Профиль",
		description: "Детали профиля и синхронизация",
		createdWithUs: "С нами с {date}",
		noDate: "Дата регистрации неизвестна",
		session: {
			description: "Управляйте подключением к Synapse Sync.",
			signOut: "Выйти",
			signingOut: "Выходим…",
			title: "Сеанс Synapse",
		},
	},
	appearance: {
		autoTagColors: { description: "Автоматически выбирать цвет для новых тегов.", title: "Цвета тегов" },
		description: "Сохранено локально и применяется ко всему интерфейсу.",
		language: {
			description: "Язык интерфейса для этой локальной библиотеки.",
			english: "English",
			russian: "Русский",
			title: "Язык",
		},
		noteSparkles: { description: "Добавлять деликатную анимацию к заметкам.", title: "Анимация заметок" },
		palette: {
			description: "Выберите акцентный цвет для интерфейса.",
			desert: "Пустыня",
			twilight: "Сумерки",
			arctic: "Арктика",
			noir: "Нуар",
			forest: "Лес",
			ember: "Уголь",
			slate: "Сланец",
			sakura: "Сакура",
			title: "Палитра",
		},
		theme: { dark: "Тёмная", light: "Светлая", system: "Как в системе", title: "Тема" },
		title: "Оформление",
	},
	media: {
		title: "Хранилище",
		description: "Настройки хранения и импорта",
		autoplay: {
			description: "Автоматически запускать аудио и видео при открытии.",
			title: "Автовоспроизведение",
		},
		files: "Материалов",
		import: "Импортировать файлы",
		storage: { label: "Локальное хранилище", used: "Занято" },
	},
	ai: {
		title: "ИИ",
		description: "Использование ИИ и план пользователя",
		cost: "Стоимость",
		error: "AI-статистика появится после подключения совместимого сервера Synapse.",
		failures: "Ошибки",
		latency: "Задержка",
		models: "Модели",
		noRequests: "Запросов пока нет",
		planDescription: "Лимиты вашего плана",
		requests: "Запросы",
		successRate: "Успешность",
		thisMonth: "За {month}",
		tokens: "Токены",
		tokensShort: "ток.",
	},
	sync: {
		title: "Автоматическая синхронизация",
		apiUrl: "Адрес API",
		automatic: "Синхронизировать изменения на устройствах автоматически",
		conflicts: "Локальные конфликтные копии",
		email: "Email",
		login: "Войти в Synapse",
		manual: "Синхронизировать вручную",
		password: "Пароль",
		sync: "Синхронизировать",
		unavailable: "Синхронизация недоступна на текущем плане",
		withPlan: "Synapse Sync · {plan}",
		syncing: "Синхронизация...",
		downloadChanges: "Получаем изменения",
		uploadingChanges: "Передаём материалы",
		endingSync: "Завершаем синхронизацию",
	},
	navigation: { profile: "Профиль" },
	graph: { zoomIn: "Увеличить", zoomOut: "Уменьшить" },
	editor: {
		blockquote: "Цитата",
		bold: "Жирный",
		bulletList: "Маркированный список",
		code: "Строчный код",
		codeBlock: "Блок кода",
		commandsNotFound: "Команды не найдены",
		heading2: "Заголовок 2",
		heading3: "Заголовок 3",
		heading4: "Заголовок 4",
		image: "Изображение",
		imageLoadError: "Не удалось добавить изображение",
		italic: "Курсив",
		link: "Ссылка",
		more: "Дополнительное форматирование",
		noteContent: "Содержимое заметки",
		orderedList: "Нумерованный список",
		paragraph: "Текст",
		placeholder: "Начните с мысли, идеи или наблюдения…",
		redo: "Повторить",
		reset: "Сбросить",
		save: "Сохранить",
		separator: "Разделитель",
		strike: "Зачёркнутый",
		taskList: "Список задач",
		underline: "Подчёркнутый",
		undo: "Отменить",
	},
	content: {
		addItem: "Добавить пункт…",
		addTag: "+ Добавить тег",
		addTodo: "Добавить",
		changeTypeDescription: "Несохранённые изменения будут удалены. Перейти к выбору другого типа?",
		changeTypeTitle: "Сменить тип материала?",
		contentRequired: "Добавьте содержимое заметки",
		creating: "Сохранение…",
		discard: "Удалить изменения",
		documentFiles: "Документы",
		emptyTodos: "Список пока пуст",
		fileRequired: "Выберите хотя бы один файл",
		fullScreen: "На весь экран",
		linkParsingFailed: "Не удалось распознать ссылку",
		makeTrack: "Создать трек в плейлисте",
		parse: "Распознать",
		parsing: "Обработка…",
		saving: "Сохранение…",
		titleOptional: "Заголовок (необязательно)",
		titlePlaceholder: "Введите заголовок…",
		todoPlaceholder: "Добавить пункт…",
		todoRequired: "Добавьте хотя бы одну задачу",
		todoTitle: "Название списка…",
		typePickerDescription: "Выберите формат — в дальнейшем его можно будет открыть и найти в библиотеке.",
		typePickerEyebrow: "Новый материал",
		typePickerTitle: "Что добавим?",
		upload: "Загрузить",
		uploading: "Загрузка {count} файлов…",
		windowed: "Оконный режим",
		editContent: "Редактировать материал",
		editNote: "Редактировать заметку",
		editTodo: "Редактировать список",
	},
	contentType: {
		audio: { description: "Файлы, треки и голосовые материалы" },
		doc: { description: "PDF, DOCX, EPUB, XLSX, CSV и другие документы" },
		link: { description: "Сохранённые ссылки с превью и метаданными" },
		media: { description: "Изображения и видео для быстрой навигации" },
		note: { description: "Быстрые мысли, заметки и длинные тексты" },
		todo: { description: "Короткие списки дел и контрольные пункты" },
	},
	accountDelete: {
		action: "Удалить аккаунт",
		confirm: "Удалить навсегда",
		confirmDescription: "Это действие нельзя отменить.",
		confirmTitle: "Удалить аккаунт?",
		description: "Удаление аккаунта удалит синхронизированные данные.",
		title: "Удаление аккаунта",
	},
	settings: { title: "Настройки" },
	tags: { generate: "AI-теги", generating: "Генерация…", noSuggestions: "Не удалось подобрать теги" },
} satisfies TranslationSchema<typeof en>;

type LeafPath<T> = { [K in keyof T & string]: T[K] extends string ? K : `${K}.${LeafPath<T[K]>}` }[keyof T &
	string];
type TranslationKey = LeafPath<typeof en>;

type ExtractParams<
	S extends string,
	Acc extends string = never,
> = S extends `${string}{${infer Name}}${infer Rest}` ? ExtractParams<Rest, Acc | Name> : Acc;

type ValueAtPath<T, Path extends string> = Path extends `${infer Head}.${infer Tail}`
	? Head extends keyof T
		? ValueAtPath<T[Head], Tail>
		: never
	: Path extends keyof T
		? T[Path]
		: never;

type TranslationParams<Key extends TranslationKey> = ExtractParams<ValueAtPath<typeof en, Key> & string>;
type Translator = <Key extends TranslationKey>(
	key: Key,
	params?: [TranslationParams<Key>] extends [never]
		? Record<string, string | number>
		: Record<TranslationParams<Key>, string | number>
) => string;

const translations = { en, ru };

export const localizedSearchPlaceholders = {
	ru: searchPlaceholdersRu,
	en: searchPlaceholdersEn,
};

export type SearchPlaceholders = (typeof localizedSearchPlaceholders)[InterfaceLanguage];

export function getRandomSearchPlaceholder(language: InterfaceLanguage): string {
	const placeholders = localizedSearchPlaceholders[language];
	return placeholders[Math.floor(Math.random() * placeholders.length)];
}

export function createTranslator(language: InterfaceLanguage): Translator {
	return (key, ...args) => {
		const params = args[0];
		let value: string | TranslationSchema<typeof en> = translations[language];
		for (const segment of key.split(".")) value = value[segment as never] as typeof value;
		for (const [name, replacement] of Object.entries(params ?? {}))
			value = (value as string).replaceAll(`{${name}}`, String(replacement));
		return value as string;
	};
}

interface I18nContextValue {
	language: InterfaceLanguage;
	locale: string;
	t: Translator;
	searchPlaceholder: string;
}

const I18nContext = createContext<I18nContextValue | undefined>(undefined);

export function I18nProvider({ children, language }: { children: ReactNode; language: InterfaceLanguage }) {
	const t = useMemo(() => createTranslator(language), [language]);
	const searchPlaceholder = useMemo(() => getRandomSearchPlaceholder(language), [language]);
	const locale = language === "ru" ? "ru-RU" : "en-US";
	const value = useMemo(
		() => ({ language, locale, t, searchPlaceholder }),
		[language, locale, t, searchPlaceholder]
	);
	return createElement(I18nContext.Provider, { value }, children);
}

export function useI18n() {
	const value = useContext(I18nContext);
	if (!value) throw new Error("useI18n must be used within I18nProvider");
	return value;
}

export type { TranslationKey };
