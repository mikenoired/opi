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
import { createTranslator, I18nProvider, useI18n } from "@synapse/i18n";
import { DEFAULT_USER_PREFERENCES, type UserPreferences } from "@synapse/shared/preferences";
import type { Content } from "@synapse/shared/schemas";
import { AlertCircle, CheckCircle2, LoaderCircle, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";

import "./style.css";
import {
	getDesktopBridge,
	hasAccountConnection,
	type DesktopColorScheme,
	type DesktopSession,
	type DesktopStatistics,
	type DesktopSyncPolicy,
	type SyncProgress,
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
	const [connectingAccount, setConnectingAccount] = useState(false);
	const [connectionNotice, setConnectionNotice] = useState<string>();
	const [syncing, setSyncing] = useState(false);
	const [syncProgress, setSyncProgress] = useState<SyncProgress>();
	const [syncError, setSyncError] = useState<string>();
	const t = useMemo(() => createTranslator(preferences.interfaceLanguage), [preferences.interfaceLanguage]);
	useEffect(() => bridge.sync.onProgress(setSyncProgress), []);
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
	useEffect(() => bridge.library.onChanged(() => void refresh()), [refresh]);
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
			if (command === "content.delete-all" && window.confirm(t("library.deleteAllConfirm"))) {
				void (async () => {
					await bridge.library.deleteAll();
					await refresh();
					if (settings.syncPolicy !== "automatic" || !session) return;
					setSyncError(undefined);
					setSyncing(true);
					try {
						await bridge.sync.syncAll();
						await refresh();
					} catch (cause) {
						setSyncError(cause instanceof Error ? cause.message : t("sync.failed"));
					} finally {
						setSyncing(false);
					}
				})();
			}
		});
	}, [refresh, session, settings.syncPolicy, t]);
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
				connectingAccount={connectingAccount}
				connectionNotice={connectionNotice}
				statistics={statistics}
				syncing={syncing}
				syncProgress={syncProgress}
				setSession={setSession}
				setConnectingAccount={setConnectingAccount}
				setConnectionNotice={setConnectionNotice}
				setSyncing={setSyncing}
				syncError={syncError}
				setSyncError={setSyncError}
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
	connectingAccount,
	connectionNotice,
	statistics,
	syncing,
	syncProgress,
	syncError,
	setSession,
	setConnectingAccount,
	setConnectionNotice,
	setSyncing,
	setSyncError,
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
	connectingAccount: boolean;
	connectionNotice?: string;
	statistics?: DesktopStatistics;
	syncing: boolean;
	syncProgress?: SyncProgress;
	syncError?: string;
	setSession: (session: DesktopSession | undefined) => void;
	setConnectingAccount: (connecting: boolean) => void;
	setConnectionNotice: (notice: string | undefined) => void;
	setSyncing: (syncing: boolean) => void;
	setSyncError: (error: string | undefined) => void;
	setSettings: (settings: { colorScheme: DesktopColorScheme; syncPolicy: DesktopSyncPolicy }) => void;
	updatePreferences: (input: Partial<UserPreferences>) => Promise<void>;
}) {
	const { t } = useI18n();
	const lastQueued = useRef<number | undefined>(undefined);
	const runSync = useCallback(async () => {
		if (syncing) return;
		setSyncError(undefined);
		setSyncing(true);
		try {
			const result = await bridge.sync.syncAll();
			await refresh();
			if (result.failed) throw new Error(t("sync.failedCount", { count: result.failed }));
		} catch (cause) {
			setSyncError(cause instanceof Error ? cause.message : t("sync.failed"));
		} finally {
			setSyncing(false);
		}
	}, [bridge.sync, refresh, setSyncError, setSyncing, syncing, t]);
	useEffect(() => {
		if (settings.syncPolicy !== "automatic" || !session?.eligible || syncing || syncError) return;
		if (lastQueued.current === statistics?.pendingSyncCount) return;
		lastQueued.current = statistics?.pendingSyncCount;
		if (statistics?.pendingSyncCount) void runSync();
	}, [runSync, session?.eligible, settings.syncPolicy, statistics?.pendingSyncCount, syncError, syncing]);
	useEffect(() => {
		if (settings.syncPolicy !== "automatic" || !session?.eligible) return;
		const timer = window.setInterval(() => void runSync(), 30_000);
		return () => window.clearInterval(timer);
	}, [runSync, session?.eligible, settings.syncPolicy]);
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
				sidebarFooter={
					<DesktopSidebarStatus
						error={syncError}
						progress={syncProgress}
						syncing={syncing}
						onRetry={runSync}
					/>
				}
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
			{syncing && (
				<div
					aria-live="assertive"
					aria-modal="true"
					className="fixed inset-0 z-100 flex items-center justify-center bg-background/70 backdrop-blur-sm"
					role="alertdialog">
					<div className="w-full max-w-sm space-y-3 rounded-xl border bg-background p-5 shadow-xl">
						<p className="font-medium">{t("sync.blockingTitle")}</p>
						<p className="text-sm text-muted-foreground">{t("sync.blockingDescription")}</p>
						<div className="h-1.5 overflow-hidden rounded-full bg-muted">
							<div
								className="h-full rounded-full bg-primary transition-[width] duration-300"
								style={{
									width: `${Math.round(((syncProgress?.completed ?? 0) / Math.max(syncProgress?.total ?? 1, 1)) * 100)}%`,
								}}
							/>
						</div>
					</div>
				</div>
			)}
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
						syncProgress={syncProgress}
						connectingAccount={connectingAccount}
						connectionNotice={connectionNotice}
						onImport={() => {
							void bridge.library.importFiles().then(refresh);
						}}
						onConnectAccount={async () => {
							setConnectingAccount(true);
							try {
								if (!hasAccountConnection(bridge)) {
									throw new Error(t("sync.restartToConnect"));
								}
								setSession(await bridge.sync.connectAccount());
								setConnectionNotice(t("sync.connected"));
							} catch (cause) {
								setConnectionNotice(cause instanceof Error ? cause.message : t("sync.connectFailed"));
							} finally {
								setConnectingAccount(false);
							}
						}}
						onSignOut={async () => {
							await bridge.sync.logout();
							setSession(undefined);
						}}
						onSync={runSync}
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

function DesktopSidebarStatus({
	error,
	onRetry,
	progress,
	syncing,
}: {
	error?: string;
	onRetry(): Promise<void>;
	progress?: SyncProgress;
	syncing: boolean;
}) {
	const { t } = useI18n();
	if (error)
		return (
			<div className="space-y-2 rounded-lg bg-destructive/10 p-2 text-xs text-destructive">
				<div className="flex gap-2">
					<AlertCircle className="mt-0.5 size-4 shrink-0" />
					<span>{error}</span>
				</div>
				<button
					className="flex h-8 w-full items-center justify-center gap-1.5 rounded-md bg-background px-2 font-medium text-foreground hover:bg-muted"
					onClick={() => void onRetry()}
					type="button">
					<RefreshCw className="size-3.5" />
					{t("sync.retry")}
				</button>
			</div>
		);
	if (syncing)
		return (
			<div className="rounded-lg bg-muted p-2 text-xs">
				<div className="mb-2 flex items-center gap-2">
					<LoaderCircle className="size-4 animate-spin" />
					{t("sync.syncing")}
				</div>
				<div className="h-1.5 overflow-hidden rounded-full bg-background">
					<div
						className="h-full bg-primary transition-[width]"
						style={{
							width: `${Math.round(((progress?.completed ?? 0) / Math.max(progress?.total ?? 1, 1)) * 100)}%`,
						}}
					/>
				</div>
			</div>
		);
	return (
		<div className="flex items-center gap-2 px-2 py-1 text-xs text-muted-foreground">
			<CheckCircle2 className="size-4 text-emerald-500" />
			{t("sync.synced")}
		</div>
	);
}

function DesktopSettingsContent({
	onImport,
	onConnectAccount,
	connectionNotice,
	onSignOut,
	onSync,
	onSyncPolicyChange,
	onThemeChange,
	onUpdatePreferences,
	preferences,
	settings,
	settingsTab,
	session,
	connectingAccount,
	statistics,
	syncing,
	syncProgress,
}: {
	onImport(): void;
	onConnectAccount(): Promise<void>;
	onSignOut(): Promise<void>;
	onSync(): Promise<void>;
	onSyncPolicyChange(value: DesktopSyncPolicy): Promise<void>;
	onThemeChange(value: DesktopColorScheme): Promise<void>;
	onUpdatePreferences(input: Partial<UserPreferences>): Promise<void>;
	preferences: UserPreferences;
	settings: { colorScheme: DesktopColorScheme; syncPolicy: DesktopSyncPolicy };
	settingsTab: string;
	session?: DesktopSession;
	connectingAccount: boolean;
	connectionNotice?: string;
	statistics?: DesktopStatistics;
	syncing: boolean;
	syncProgress?: SyncProgress;
}) {
	if (settingsTab === "general")
		return (
			<AccountSettingsPanel
				connectionNotice={connectionNotice}
				isConnectingAccount={connectingAccount}
				onConnectAccount={() => void onConnectAccount()}
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
					session ? (
						<LocalSyncSettingsPanel
							isSyncing={syncing}
							progress={syncProgress}
							onSync={onSync}
							onSyncPolicyChange={onSyncPolicyChange}
							session={session}
							statistics={statistics}
							syncPolicy={settings.syncPolicy}
						/>
					) : undefined
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
