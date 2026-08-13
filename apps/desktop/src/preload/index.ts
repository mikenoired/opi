import { contextBridge, type IpcRendererEvent } from "electron";
import { ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("synapseDesktop", {
	ai: {
		getUsageOverview: () => ipcRenderer.invoke("ai:get-usage"),
		suggestTags: (input: unknown) => ipcRenderer.invoke("ai:suggest-tags", input),
	},
	library: {
		delete: (id: string) => ipcRenderer.invoke("library:delete", id),
		list: (search?: string) => ipcRenderer.invoke("library:list", search),
		settings: () => ipcRenderer.invoke("library:settings"),
		preferences: () => ipcRenderer.invoke("library:preferences"),
		queueSync: (id: string) => ipcRenderer.invoke("library:queue-sync", id),
		statistics: () => ipcRenderer.invoke("library:statistics"),
		importFiles: (input?: {
			files?: Array<{ bytes: Uint8Array; name: string; size: number; type: string }>;
			makeTrack?: boolean;
			tags?: string[];
			title?: string;
		}) => ipcRenderer.invoke("library:import-files", input),
		updateSettings: (settings: {
			colorScheme?: "dark" | "light" | "system";
			syncPolicy?: "manual" | "automatic";
		}) => ipcRenderer.invoke("library:update-settings", settings),
		updatePreferences: (preferences: {
			autoTagColorEnabled?: boolean;
			colorPalette?: "desert" | "twilight" | "arctic" | "noir" | "forest" | "ember" | "slate" | "sakura";
			interfaceLanguage?: "ru" | "en";
			mediaAutoplayEnabled?: boolean;
			noteSparklesEnabled?: boolean;
		}) => ipcRenderer.invoke("library:update-preferences", preferences),
		save: (input: {
			content: string;
			id?: string;
			tags: string[];
			title: string;
			type: "note" | "link" | "todo";
			url?: string;
		}) => ipcRenderer.invoke("library:save", input),
	},
	sync: {
		deleteRemote: (id: string) => ipcRenderer.invoke("sync:delete-remote", id),
		connectAccount: () => ipcRenderer.invoke("sync:connect-account"),
		session: () => ipcRenderer.invoke("sync:session"),
		logout: () => ipcRenderer.invoke("sync:logout"),
		syncAll: () => ipcRenderer.invoke("sync:all"),
		onProgress: (
			listener: (progress: {
				completed: number;
				phase: "download" | "upload" | "finalizing";
				total: number;
			}) => void
		) => {
			const callback = (
				_event: IpcRendererEvent,
				progress: { completed: number; phase: "download" | "upload" | "finalizing"; total: number }
			) => listener(progress);
			ipcRenderer.on("sync:progress", callback);
			return () => ipcRenderer.removeListener("sync:progress", callback);
		},
	},
	window: {
		onCommand: (listener: (command: string) => void) => {
			const callback = (_event: IpcRendererEvent, command: string) => listener(command);
			ipcRenderer.on("app:command", callback);
			return () => ipcRenderer.removeListener("app:command", callback);
		},
		setTheme: (dark: boolean) => ipcRenderer.invoke("window:set-theme", dark),
	},
	platform: process.platform,
});
