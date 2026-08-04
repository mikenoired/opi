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
	platform: process.platform,
});
