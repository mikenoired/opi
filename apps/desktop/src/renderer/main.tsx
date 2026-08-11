import type { AiUsage } from "@synapse/api";
import {
	AccountSettingsPanel,
	AiSettingsPanel,
	AppearanceSettingsPanel,
	LibraryWorkspace,
	LocalSyncSettingsPanel,
	MediaSettingsPanel,
} from "@synapse/features";
import { ConfiguredSettingsNavigation, SettingsModalShell } from "@synapse/features/app-shell";
import { AppRuntimeProvider, useAppServices } from "@synapse/features/runtime";
import { DEFAULT_USER_PREFERENCES, type UserPreferences } from "@synapse/shared/preferences";
import type { Content } from "@synapse/shared/schemas";
import { useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

import "./style.css";
import {
	getDesktopBridge,
	type DesktopColorScheme,
	type DesktopSession,
	type DesktopStatistics,
	type DesktopSyncPolicy,
} from "./desktop-bridge";
import { desktopRuntime } from "./desktop-runtime";

type Page = "dashboard" | "graph" | "tags";
const bridge = getDesktopBridge();

function DesktopApp() {
	const [items, setItems] = useState<Content[]>([]);
	const [loading, setLoading] = useState(true);
	const [page, setPage] = useState<Page>("dashboard");
	const [command, setCommand] = useState<"content.add" | undefined>();
	const [settingsOpen, setSettingsOpen] = useState(false);
	const [settingsTab, setSettingsTab] = useState("general");
	const [settings, setSettings] = useState<{
		colorScheme: DesktopColorScheme;
		syncPolicy: DesktopSyncPolicy;
	}>({
		colorScheme: "system",
		syncPolicy: "manual",
	});
	const [statistics, setStatistics] = useState<DesktopStatistics>();
	const [preferences, setPreferences] = useState<UserPreferences>(DEFAULT_USER_PREFERENCES);
	const [session, setSession] = useState<DesktopSession>();
	const [syncing, setSyncing] = useState(false);
	const refresh = useCallback(async () => {
		const [nextItems, nextSettings, nextStatistics, nextSession, nextPreferences] = await Promise.all([
			bridge.library.list(),
			bridge.library.settings(),
			bridge.library.statistics(),
			bridge.sync.session(),
			bridge.library.preferences(),
		]);
		setItems(nextItems);
		setSettings(nextSettings);
		setStatistics(nextStatistics);
		setSession(nextSession);
		setPreferences(nextPreferences);
		setLoading(false);
	}, []);
	useEffect(() => {
		void refresh();
	}, [refresh]);
	useEffect(() => {
		const dark =
			settings.colorScheme === "dark" ||
			(settings.colorScheme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
		document.documentElement.classList.toggle("dark", dark);
		// A running Electron dev window can retain an older preload bridge until
		// it is recreated. Theme application is progressive, never a reason to
		// prevent the library from rendering.
		void bridge.window?.setTheme(dark).catch(() => undefined);
	}, [settings.colorScheme]);
	useEffect(() => {
		if (!bridge.window) return;
		return bridge.window.onCommand((command) => {
			if (command === "content.add") {
				setCommand(undefined);
				window.setTimeout(() => setCommand("content.add"), 0);
			}
			if (command === "settings.open") setSettingsOpen(true);
		});
	}, []);
	useEffect(() => {
		document.documentElement.dataset.palette = preferences.colorPalette;
		document.documentElement.lang = preferences.interfaceLanguage;
	}, [preferences.colorPalette, preferences.interfaceLanguage]);
	const updatePreferences = useCallback(async (input: Partial<UserPreferences>) => {
		const next = await bridge.library.updatePreferences(input);
		setPreferences(next);
	}, []);
	return (
		<>
			<LibraryWorkspace
				activePage={page}
				command={command}
				isLoading={loading}
				items={items}
				navigation={desktopRuntime.configuration.navigation}
				onContentCreated={() => void refresh()}
				onSelectPage={setPage}
				onOpenSettings={() => setSettingsOpen(true)}
				onDelete={async (item) => {
					await bridge.library.delete(item.id);
					await refresh();
				}}
				onSave={async (input) => {
					await bridge.library.save(input);
					await refresh();
				}}
				strings={desktopStrings}
			/>
			{settingsOpen && (
				<SettingsModalShell
					activeKey={settingsTab}
					open
					onClose={() => setSettingsOpen(false)}
					title="Настройки"
					navigation={
						<ConfiguredSettingsNavigation
							activeId={settingsTab}
							capabilities={desktopRuntime.services.capabilities}
							tabs={desktopRuntime.configuration.settings}
							onSelect={setSettingsTab}
						/>
					}>
					<DesktopSettingsContent
						preferences={preferences}
						settings={settings}
						settingsTab={settingsTab}
						session={session}
						statistics={statistics}
						syncing={syncing}
						onImport={() => {
							void bridge.library.importFiles().then(refresh);
						}}
						onLogin={async (input) => setSession(await bridge.sync.login(input))}
						onSignOut={async () => {
							await bridge.sync.logout();
							setSession(undefined);
						}}
						onSync={async () => {
							setSyncing(true);
							try {
								await bridge.sync.syncAll();
								await refresh();
							} finally {
								setSyncing(false);
							}
						}}
						onSyncPolicyChange={async (syncPolicy) =>
							setSettings(await bridge.library.updateSettings({ syncPolicy }))
						}
						onThemeChange={async (colorScheme) =>
							setSettings(await bridge.library.updateSettings({ colorScheme }))
						}
						onUpdatePreferences={updatePreferences}
					/>
				</SettingsModalShell>
			)}
		</>
	);
}

function DesktopSettingsContent({
	onImport,
	onLogin,
	onSignOut,
	onSync,
	onSyncPolicyChange,
	onThemeChange,
	onUpdatePreferences,
	preferences,
	settings,
	settingsTab,
	session,
	statistics,
	syncing,
}: {
	onImport(): void;
	onLogin(input: { apiUrl: string; email: string; password: string }): Promise<void>;
	onSignOut(): Promise<void>;
	onSync(): Promise<void>;
	onSyncPolicyChange(value: DesktopSyncPolicy): Promise<void>;
	onThemeChange(value: DesktopColorScheme): Promise<void>;
	onUpdatePreferences(input: Partial<UserPreferences>): Promise<void>;
	preferences: UserPreferences;
	settings: { colorScheme: DesktopColorScheme; syncPolicy: DesktopSyncPolicy };
	settingsTab: string;
	session?: DesktopSession;
	statistics?: DesktopStatistics;
	syncing: boolean;
}) {
	if (settingsTab === "general")
		return (
			<AccountSettingsPanel
				locale={preferences.interfaceLanguage}
				onSignOut={() => void onSignOut()}
				strings={accountStrings}
				user={
					session
						? {
								createdAt: null,
								email: session.email,
								id: session.email,
								plan: session.plan as "starter",
								updatedAt: null,
							}
						: null
				}
				synapseSync={
					<LocalSyncSettingsPanel
						isSyncing={syncing}
						onLogin={onLogin}
						onSync={onSync}
						onSyncPolicyChange={onSyncPolicyChange}
						session={session}
						statistics={statistics}
						syncPolicy={settings.syncPolicy}
						strings={syncStrings}
					/>
				}
			/>
		);
	if (settingsTab === "appearance")
		return (
			<AppearanceSettingsPanel
				autoTagColorEnabled={preferences.autoTagColorEnabled}
				colorPalette={preferences.colorPalette}
				interfaceLanguage={preferences.interfaceLanguage}
				isReady
				noteSparklesEnabled={preferences.noteSparklesEnabled}
				onAutoTagColorEnabledChange={(value) => void onUpdatePreferences({ autoTagColorEnabled: value })}
				onColorPaletteChange={(value) => void onUpdatePreferences({ colorPalette: value })}
				onInterfaceLanguageChange={(value) => void onUpdatePreferences({ interfaceLanguage: value })}
				onNoteSparklesEnabledChange={(value) => void onUpdatePreferences({ noteSparklesEnabled: value })}
				onThemeChange={(value) => void onThemeChange(value)}
				theme={settings.colorScheme}
				strings={appearanceStrings}
			/>
		);
	if (settingsTab === "media")
		return (
			<MediaSettingsPanel
				autoplayEnabled={preferences.mediaAutoplayEnabled}
				files={statistics?.itemCount ?? 0}
				locale={preferences.interfaceLanguage}
				onAutoplayChange={(value) => void onUpdatePreferences({ mediaAutoplayEnabled: value })}
				onImport={onImport}
				storageBytes={statistics?.localBytes ?? 0}
				strings={mediaStrings}
			/>
		);
	if (settingsTab === "ai") return <DesktopAiTab locale={preferences.interfaceLanguage} />;
	return null;
}

function DesktopAiTab({ locale }: { locale: string }) {
	const { client } = useAppServices();
	const [data, setData] = useState<AiUsage>();
	const [isError, setIsError] = useState(false);
	const [isLoading, setIsLoading] = useState(true);
	useEffect(() => {
		let disposed = false;
		setIsLoading(true);
		setIsError(false);
		void client.ai
			.getUsageOverview()
			.then((next) => {
				if (!disposed) setData(next);
			})
			.catch(() => {
				if (!disposed) setIsError(true);
			})
			.finally(() => {
				if (!disposed) setIsLoading(false);
			});
		return () => {
			disposed = true;
		};
	}, [client]);
	return (
		<AiSettingsPanel
			data={data}
			isError={isError}
			isLoading={isLoading}
			locale={locale}
			strings={aiStrings}
		/>
	);
}

const desktopStrings = {
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
	searchPlaceholder: "Найдём то, что вы отложили на потом",
	settings: "Настройки",
	tags: "Теги",
	tagsEmpty: "Тегов пока нет",
	title: "Главная",
	type: "Тип",
	unsavedDescription: "Есть несохранённые изменения. Закрыть без сохранения?",
	unsavedTitle: "Несохранённые изменения",
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
	untitled: "Без названия",
	viewerClose: "Закрыть просмотр",
	viewerCreated: (date: string) => `Создано ${date}`,
	viewerDeleteDescription: "Материал будет удалён из локальной библиотеки.",
	viewerDeleteTitle: "Удалить материал?",
	viewerDetails: "Подробнее",
	viewerDownload: "Скачать",
	viewerEmptyTasks: "Список задач пока пуст",
	viewerNext: "Следующий материал",
	viewerPrevious: "Предыдущий материал",
	viewerRecommendationsAria: "Похожие материалы",
	viewerRecommendationsEyebrow: "Продолжить исследование",
	viewerRecommendationsLoadingMore: "Ищем дальше",
	viewerRecommendationsTitle: "Рядом по смыслу",
	viewerSuggestTags: "AI-теги",
	viewerUpdated: (date: string) => `Обновлено ${date}`,
};
const accountStrings = {
	createdWithUs: (date: string) => `С нами с ${date}`,
	noDate: "Дата регистрации неизвестна",
	sessionDescription: "Управляйте подключением к Synapse Sync.",
	sessionSignOut: "Выйти",
	sessionSigningOut: "Выходим…",
	sessionTitle: "Сеанс Synapse",
};
const appearanceStrings = {
	autoTagColorsDescription: "Автоматически выбирать цвет для новых тегов.",
	autoTagColorsTitle: "Цвета тегов",
	description: "Сохранено локально и применяется ко всему интерфейсу.",
	languageDescription: "Язык интерфейса для этой локальной библиотеки.",
	languageEnglish: "English",
	languageRussian: "Русский",
	languageTitle: "Язык",
	noteSparklesDescription: "Добавлять деликатную анимацию к заметкам.",
	noteSparklesTitle: "Анимация заметок",
	paletteDescription: "Выберите акцентный цвет для интерфейса.",
	paletteLabels: {
		arctic: "Арктика",
		desert: "Пустыня",
		ember: "Уголь",
		forest: "Лес",
		noir: "Нуар",
		sakura: "Сакура",
		slate: "Сланец",
		twilight: "Сумерки",
	},
	paletteTitle: "Палитра",
	themeLabels: { dark: "Тёмная", light: "Светлая", system: "Как в системе" },
	themeTitle: "Тема",
	title: "Оформление",
};
const mediaStrings = {
	autoplayDescription: "Автоматически запускать аудио и видео при открытии.",
	autoplayTitle: "Автовоспроизведение",
	files: "Материалов",
	import: "Импортировать файлы",
	storageLabel: "Локальное хранилище",
	storageUsed: "Занято",
};
const aiStrings = {
	cost: "Стоимость",
	error: "AI-статистика появится после подключения совместимого сервера Synapse.",
	failures: "Ошибки",
	latency: "Задержка",
	models: "Модели",
	noRequests: "Запросов пока нет",
	planDescription: "Лимиты вашего плана",
	requests: "Запросы",
	successRate: "Успешность",
	thisMonth: (month: string) => `За ${month}`,
	tokens: "Токены",
	tokensShort: "ток.",
};
const syncStrings = {
	apiUrl: "Адрес API",
	automatic: "Ставить новые материалы в очередь автоматически",
	conflicts: "Локальные конфликтные копии",
	email: "Email",
	login: "Войти в Synapse",
	manual: "Синхронизировать вручную",
	password: "Пароль",
	sync: "Синхронизировать",
	syncUnavailable: "Синхронизация недоступна на текущем плане",
	syncWithPlan: (plan: string) => `Synapse Sync · ${plan}`,
	syncing: "Синхронизация…",
};

createRoot(document.getElementById("app")!).render(
	<AppRuntimeProvider runtime={desktopRuntime}>
		<DesktopApp />
	</AppRuntimeProvider>
);
