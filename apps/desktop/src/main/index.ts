import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { app, BrowserWindow, net, protocol } from "electron";
import { ipcMain } from "electron";

import { DesktopStorageProvider } from "./desktop-storage.provider";
import { DesktopSyncService } from "./desktop-sync.service";
import { LocalLibraryRepository, type LocalItemInput, type LocalSettings } from "./local-library.repository";

const objectStorage = new DesktopStorageProvider(join(app.getPath("userData"), "objects"));
const library = new LocalLibraryRepository(join(app.getPath("userData"), "library"));
const sync = new DesktopSyncService(library);

function createWindow(): void {
	const window = new BrowserWindow({
		width: 1_280,
		height: 800,
		webPreferences: { contextIsolation: true, preload: join(__dirname, "../preload/index.js") },
	});

	if (process.env.ELECTRON_RENDERER_URL) {
		void window.loadURL(process.env.ELECTRON_RENDERER_URL);
	} else {
		void window.loadFile(join(__dirname, "../renderer/index.html"));
	}
}

app.whenReady().then(() => {
	ipcMain.handle("library:list", (_event, search?: string) => library.list(search));
	ipcMain.handle("library:save", (_event, input: LocalItemInput & { id?: string }) => library.save(input));
	ipcMain.handle("library:delete", (_event, id: string) => library.delete(id));
	ipcMain.handle("library:settings", () => library.getSettings());
	ipcMain.handle("library:update-settings", (_event, settings: Partial<LocalSettings>) =>
		library.updateSettings(settings)
	);
	ipcMain.handle("library:statistics", () => library.getStatistics());
	ipcMain.handle("sync:login", (_event, input: { apiUrl: string; email: string; password: string }) =>
		sync.login(input.apiUrl, input.email, input.password)
	);
	ipcMain.handle("sync:session", () => sync.getSession());
	ipcMain.handle("sync:all", () => sync.syncAll());
	ipcMain.handle("sync:delete-remote", (_event, id: string) => sync.deleteRemote(id));
	protocol.handle("synapse-object", (request) => {
		const objectName = decodeURIComponent(new URL(request.url).pathname.slice(1));
		return net.fetch(pathToFileURL(objectStorage.getObjectPath(objectName)).toString());
	});
	createWindow();

	app.on("activate", () => {
		if (BrowserWindow.getAllWindows().length === 0) createWindow();
	});
});

app.on("window-all-closed", () => {
	if (process.platform !== "darwin") app.quit();
});
