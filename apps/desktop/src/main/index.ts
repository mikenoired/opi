import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { app, BrowserWindow, net, protocol } from "electron";

import { DesktopStorageProvider } from "./desktop-storage.provider";

const objectStorage = new DesktopStorageProvider(join(app.getPath("userData"), "objects"));

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
