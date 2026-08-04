import { contextBridge } from "electron";
import { ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("synapseDesktop", {
	library: {
		delete: (id: string) => ipcRenderer.invoke("library:delete", id),
		list: (search?: string) => ipcRenderer.invoke("library:list", search),
		settings: () => ipcRenderer.invoke("library:settings"),
		statistics: () => ipcRenderer.invoke("library:statistics"),
		updateSettings: (settings: { syncPolicy?: "manual" | "automatic" }) =>
			ipcRenderer.invoke("library:update-settings", settings),
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
		login: (input: { apiUrl: string; email: string; password: string }) =>
			ipcRenderer.invoke("sync:login", input),
		session: () => ipcRenderer.invoke("sync:session"),
		syncAll: () => ipcRenderer.invoke("sync:all"),
	},
	platform: process.platform,
});
