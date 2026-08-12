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
import { I18nProvider, useI18n } from "@synapse/i18n";
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
import { desktopRuntime, getDesktopNavigation, getDesktopSettings } from "./desktop-runtime";

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
		<I18nProvider language={preferences.interfaceLanguage}>
			<DesktopAppContent
				bridge={bridge}
				command={command}
				items={items}
				loading={loading}
				page={page}
				preferences={preferences}
				settings={settings}
				settingsOpen={settingsOpen}
				settingsTab={settingsTab}
				setPage={setPage}
				setSettingsOpen={setSettingsOpen}
				setSettingsTab={setSettingsTab}
				refresh={refresh}
				session={session}
				statistics={statistics}
				syncing={syncing}
				setSession={setSession}
				setSyncing={setSyncing}
				setSettings={setSettings}
				updatePreferences={updatePreferences}
			/>
		</I18nProvider>
	);
}

function DesktopAppContent({
	bridge,
	command,
	items,
	loading,
	page,
	preferences,
	settings,
	settingsOpen,
	settingsTab,
	setPage,
	setSettingsOpen,
	setSettingsTab,
	refresh,
	session,
	statistics,
	syncing,
	setSession,
	setSyncing,
	setSettings,
	updatePreferences,
}: {
	bridge: typeof getDesktopBridge extends () => infer Result ? Result : never;
	command: "content.add" | undefined;
	items: Content[];
	loading: boolean;
	page: Page;
	preferences: UserPreferences;
	settings: { colorScheme: DesktopColorScheme; syncPolicy: DesktopSyncPolicy };
	settingsOpen: boolean;
	settingsTab: string;
	setPage: (page: Page) => void;
	setSettingsOpen: (open: boolean) => void;
	setSettingsTab: (tab: string) => void;
	refresh: () => Promise<void>;
	session?: DesktopSession;
	statistics?: DesktopStatistics;
	syncing: boolean;
	setSession: (session: DesktopSession | undefined) => void;
	setSyncing: (syncing: boolean) => void;
	setSettings: (settings: { colorScheme: DesktopColorScheme; syncPolicy: DesktopSyncPolicy }) => void;
	updatePreferences: (input: Partial<UserPreferences>) => Promise<void>;
}) {
	const { t } = useI18n();
	return (
		<div
			className={
				bridge.platform === "darwin" ? "desktop-app-shell desktop-app-shell--mac" : "desktop-app-shell"
			}>
			{bridge.platform === "darwin" && <div aria-hidden className="desktop-titlebar-drag-region" />}
			<LibraryWorkspace
				activePage={page}
				command={command}
				isLoading={loading}
				items={items}
				navigation={getDesktopNavigation(preferences.interfaceLanguage)}
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
			/>
			{settingsOpen && (
				<SettingsModalShell
					activeKey={settingsTab}
					open
					onClose={() => setSettingsOpen(false)}
					title={t("library.settings")}
					navigation={
						<ConfiguredSettingsNavigation
							activeId={settingsTab}
							capabilities={desktopRuntime.services.capabilities}
							tabs={getDesktopSettings(preferences.interfaceLanguage)}
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
		</div>
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
				onSignOut={() => void onSignOut()}
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
			/>
		);
	if (settingsTab === "media")
		return (
			<MediaSettingsPanel
				autoplayEnabled={preferences.mediaAutoplayEnabled}
				files={statistics?.itemCount ?? 0}
				onAutoplayChange={(value) => void onUpdatePreferences({ mediaAutoplayEnabled: value })}
				onImport={onImport}
				storageBytes={statistics?.localBytes ?? 0}
			/>
		);
	if (settingsTab === "ai") return <DesktopAiTab />;
	return null;
}

function DesktopAiTab() {
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
	return <AiSettingsPanel data={data} isError={isError} isLoading={isLoading} />;
}

createRoot(document.getElementById("app")!).render(
	<AppRuntimeProvider runtime={desktopRuntime}>
		<DesktopApp />
	</AppRuntimeProvider>
);
