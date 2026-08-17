import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join, resolve } from "node:path";

import type { BinaryFile } from "@synapse/api";
import {
	buildAudioContent,
	buildImageMediaContent,
	buildVideoMediaContent,
	parseAudioJson,
} from "@synapse/core";
import type { UserPreferencesInput } from "@synapse/shared/preferences";
import {
	app,
	BaseWindow,
	BrowserWindow,
	dialog,
	Menu,
	nativeImage,
	protocol,
	safeStorage,
	shell,
	type MenuItem,
} from "electron";
import { ipcMain } from "electron";

import { createDesktopObjectResponse } from "./desktop-object-response";
import { DesktopStorageProvider } from "./desktop-storage.provider";
import { DesktopSyncService, type StoredDesktopSession } from "./desktop-sync.service";
import {
	needsPlayableAudioTranscode,
	readLocalAudioMetadata,
	type LocalAudioArtwork,
} from "./local-audio-import";
import { transcodeLocalAudioToAac } from "./local-audio-transcode";
import { LocalLibraryRepository, type LocalItemInput, type LocalSettings } from "./local-library.repository";

// `<audio>` and `<video>` need this before Electron is ready; a bare custom
// protocol handler otherwise buffers media responses as regular resources.
protocol.registerSchemesAsPrivileged([
	{
		privileges: {
			secure: true,
			standard: true,
			stream: true,
			supportFetchAPI: true,
		},
		scheme: "synapse-object",
	},
]);

const objectStorage = new DesktopStorageProvider(join(app.getPath("userData"), "objects"));
const library = new LocalLibraryRepository(join(app.getPath("userData"), "library"));
const sync = new DesktopSyncService(library, objectStorage, undefined, (url) => shell.openExternal(url));
const sessionPath = join(app.getPath("userData"), "desktop-session.bin");
const pendingDeepLinks: string[] = [];

sync.setLibraryChangedListener(() => {
	for (const window of BrowserWindow.getAllWindows()) window.webContents.send("library:changed");
});

if (!app.requestSingleInstanceLock()) app.quit();
if (process.defaultApp) {
	app.setAsDefaultProtocolClient("synapse", process.execPath, [resolve(process.argv[1] || "")]);
} else {
	app.setAsDefaultProtocolClient("synapse");
}
const initialDeepLink = process.argv.find((argument) => argument.startsWith("synapse://"));
if (initialDeepLink) pendingDeepLinks.push(initialDeepLink);
app.on("open-url", (event, url) => {
	event.preventDefault();
	void receiveDesktopAuthCallback(url);
});
app.on("second-instance", (_event, commandLine) => {
	const url = commandLine.find((argument) => argument.startsWith("synapse://"));
	if (url) void receiveDesktopAuthCallback(url);
	BrowserWindow.getAllWindows()[0]?.focus();
});

function createWindow(): void {
	const window = new BrowserWindow({
		width: 1_280,
		height: 800,
		backgroundColor: "#ffffff",
		titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "hidden",
		titleBarOverlay:
			process.platform === "darwin" ? undefined : { color: "#ffffff", symbolColor: "#111827", height: 36 },
		webPreferences: {
			contextIsolation: true,
			preload: join(__dirname, "../preload/index.cjs"),
		},
	});
	window.webContents.on("preload-error", (_event, preloadPath, error) => {
		process.stderr.write(`Desktop preload failed: ${preloadPath}\n${error.stack}\n`);
	});

	if (process.env.ELECTRON_RENDERER_URL) {
		void window.loadURL(process.env.ELECTRON_RENDERER_URL);
	} else {
		void window.loadFile(join(__dirname, "../renderer/index.html"));
	}
}

app.whenReady().then(async () => {
	await restoreDesktopSession();
	for (const url of pendingDeepLinks.splice(0)) await sync.completeAccountConnection(url);
	await repairImportedAudioMetadata();
	await repairUnsupportedAudioCodecs();
	Menu.setApplicationMenu(
		Menu.buildFromTemplate([
			{
				label: "Synapse",
				submenu: [
					{
						label: "Настройки",
						accelerator: "CommandOrControl+,",
						click: sendCommand("settings.open"),
					},
				],
			},
			{
				label: "Файл",
				submenu: [
					{
						label: "Добавить материал",
						accelerator: "CommandOrControl+N",
						click: sendCommand("content.add"),
					},
					{
						label: "Удалить все материалы",
						click: sendCommand("content.delete-all"),
					},
					{ type: "separator" },
					{ role: "close" },
				],
			},
			{
				label: "Правка",
				submenu: [
					{ role: "undo" },
					{ role: "redo" },
					{ type: "separator" },
					{ role: "cut" },
					{ role: "copy" },
					{ role: "paste" },
					{ role: "selectAll" },
				],
			},
			{
				label: "Вид",
				submenu: [
					{ role: "reload" },
					{ role: "toggleDevTools" },
					{ type: "separator" },
					{ role: "togglefullscreen" },
				],
			},
		])
	);
	ipcMain.handle("library:list", (_event, search?: string) => library.list(search));
	ipcMain.handle("library:save", async (_event, input: LocalItemInput & { id?: string }) => {
		const item = await library.save(input);
		sync.wake();
		return item;
	});
	ipcMain.handle("library:delete", async (_event, id: string) => {
		await library.delete(id);
		sync.wake();
	});
	ipcMain.handle("library:delete-all", () => library.deleteAll());
	ipcMain.handle("library:settings", () => library.getSettings());
	ipcMain.handle("library:update-settings", (_event, settings: Partial<LocalSettings>) =>
		library.updateSettings(settings)
	);
	ipcMain.handle("library:preferences", () => library.getPreferences());
	ipcMain.handle("library:update-preferences", (_event, preferences: UserPreferencesInput) =>
		library.updatePreferences(preferences)
	);
	ipcMain.handle("library:queue-sync", async (_event, id: string) => {
		const item = await library.queueSync(id);
		sync.wake();
		return item;
	});
	ipcMain.handle("library:statistics", () => library.getStatistics());
	ipcMain.handle("library:tags", () => library.getTags());
	ipcMain.handle("library:update-tag-color", (_event, id: string, color: number) =>
		library.updateTagColor(id, color)
	);
	ipcMain.handle("library:import-files", async (_event, input?: LocalImportInput) => {
		if (input?.files?.length) return Promise.all(input.files.map((file) => importLocalBytes(file, input)));
		const result = await dialog.showOpenDialog({
			properties: ["openFile", "multiSelections"],
			filters: [
				{
					name: "Поддерживаемые файлы",
					extensions: [
						"txt",
						"md",
						"markdown",
						"jpg",
						"jpeg",
						"png",
						"gif",
						"webp",
						"mp4",
						"webm",
						"mov",
						"avi",
						"mp3",
						"m4a",
						"aac",
						"wav",
						"flac",
						"ogg",
						"opus",
						"pdf",
						"docx",
						"epub",
						"xlsx",
						"xls",
						"csv",
					],
				},
			],
		});
		if (result.canceled) return [];
		return Promise.all(result.filePaths.map((filePath) => importLocalFile(filePath, input)));
	});
	ipcMain.handle("ai:get-usage", () => sync.getAiUsage());
	ipcMain.handle("ai:suggest-tags", (_event, input) => sync.suggestTags(input));
	ipcMain.handle("sync:connect-account", async () => {
		const session = await sync.connectAccount();
		await saveDesktopSession();
		return session;
	});
	ipcMain.handle("sync:session", () => sync.getSession());
	ipcMain.handle("sync:logout", async () => {
		sync.logout();
		await rm(sessionPath, { force: true });
	});
	ipcMain.handle("sync:all", (event) => {
		sync.setProgressListener((progress) => event.sender.send("sync:progress", progress));
		return sync.syncAll().finally(() => sync.setProgressListener(undefined));
	});
	ipcMain.handle("window:set-theme", (_event, dark: boolean) => {
		const window = BrowserWindow.getFocusedWindow();
		if (!window) return;
		const color = dark ? "#171717" : "#ffffff";
		window.setBackgroundColor(color);
		if (process.platform !== "darwin")
			window.setTitleBarOverlay({
				color,
				symbolColor: dark ? "#f5f5f5" : "#111827",
			});
	});
	// Retained only for the transitional preload surface. Deletion is journaled
	// locally and reaches the server through the durable sync protocol.
	ipcMain.handle("sync:delete-remote", (_event, id: string) => library.delete(id));
	protocol.handle("synapse-object", async (request) => {
		const objectName = decodeURIComponent(new URL(request.url).pathname.slice(1));
		const objectPath = objectStorage.getObjectPath(objectName);
		return createDesktopObjectResponse(
			objectPath,
			contentTypeFor(extname(objectName).slice(1).toLocaleLowerCase()),
			request.headers.get("range")
		);
	});
	createWindow();

	app.on("activate", () => {
		if (BrowserWindow.getAllWindows().length === 0) createWindow();
	});
});

async function receiveDesktopAuthCallback(url: string) {
	if (!app.isReady()) {
		pendingDeepLinks.push(url);
		return;
	}
	await sync.completeAccountConnection(url);
}

function sendCommand(command: string) {
	return (_menuItem: MenuItem, window?: BaseWindow) => {
		const browserWindow = window instanceof BrowserWindow ? window : BrowserWindow.getFocusedWindow();
		browserWindow?.webContents.send("app:command", command);
	};
}

app.on("window-all-closed", () => {
	if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
	void sync.stop();
});

interface LocalImportInput {
	files?: BinaryFile[];
	makeTrack?: boolean;
	tags?: string[];
	title?: string;
}

async function importLocalFile(filePath: string, input?: LocalImportInput) {
	const fileName = basename(filePath);
	const file = new Uint8Array(await readFile(filePath));
	return importLocalBytes(
		{
			bytes: file,
			name: fileName,
			size: file.byteLength,
			type: contentTypeFor(extname(fileName).slice(1).toLocaleLowerCase()),
		},
		input
	);
}

async function importLocalBytes(file: BinaryFile, input?: LocalImportInput) {
	const fileName = basename(file.name);
	const extension = extname(fileName).slice(1).toLocaleLowerCase();
	const fallbackTitle = basename(fileName, extname(fileName));
	const title = input?.title?.trim() || fallbackTitle;
	const tags = input?.tags ?? [];
	if (["txt", "md", "markdown"].includes(extension)) {
		return library.save({
			content: new TextDecoder().decode(file.bytes),
			tags,
			title,
			type: "note",
		});
	}

	const isAudio =
		file.type.startsWith("audio/") || ["mp3", "m4a", "wav", "flac", "ogg", "opus", "aac"].includes(extension);
	const sourceAudio = isAudio
		? await readLocalAudioMetadata(file.bytes, fileName, file.type || contentTypeFor(extension))
		: undefined;
	const transcodeForPlayback = needsPlayableAudioTranscode(sourceAudio?.codec);
	const storedFile = transcodeForPlayback
		? {
				bytes: await transcodeLocalAudioToAac(file.bytes, extension),
				fileName: `${fallbackTitle}.m4a`,
				mimeType: "audio/mp4",
			}
		: {
				bytes: file.bytes,
				fileName,
				mimeType: file.type || contentTypeFor(extension),
			};
	const stored = await objectStorage.putObject(storedFile.bytes, {
		contentType: storedFile.mimeType,
		fileName: storedFile.fileName,
		folder: "imports",
		userId: "local",
	});
	const objectUrl = objectStorage.getObjectUrl(stored.objectName);
	if (["jpg", "jpeg", "png", "gif", "webp"].includes(extension)) {
		return library.save({
			content: JSON.stringify(
				buildImageMediaContent({
					objectName: stored.objectName,
					publicUrl: objectUrl,
					thumbnailBase64: "",
				})
			),
			media_type: "image",
			media_url: objectUrl,
			thumbnail_url: objectUrl,
			tags,
			title,
			type: "media",
		});
	}
	if (!isAudio && ["mp4", "webm", "mov", "avi"].includes(extension)) {
		return library.save({
			content: JSON.stringify(
				buildVideoMediaContent({
					objectName: stored.objectName,
					publicUrl: objectUrl,
					thumbnailBase64: "",
					thumbnailUrl: objectUrl,
				})
			),
			media_type: "video",
			media_url: objectUrl,
			thumbnail_url: objectUrl,
			tags,
			title,
			type: "media",
		});
	}
	if (isAudio) {
		const parsedStoredAudio = transcodeForPlayback
			? await readLocalAudioMetadata(storedFile.bytes, storedFile.fileName, storedFile.mimeType)
			: (sourceAudio ?? { metadata: null });
		// FFmpeg does not reliably retain M4A artwork. Keep the cover found in
		// the original tag while using the playable file's technical metadata.
		const audio = transcodeForPlayback
			? {
					...parsedStoredAudio,
					artwork: sourceAudio?.artwork ?? parsedStoredAudio.artwork,
				}
			: parsedStoredAudio;
		let coverObjectName: string | undefined;
		try {
			const cover = audio.artwork ? await storeLocalAudioArtwork(audio.artwork) : undefined;
			coverObjectName = cover?.objectName;
			const coverUrl = coverObjectName ? objectStorage.getObjectUrl(coverObjectName) : undefined;
			const displayTitle = input?.title?.trim() || audio.title || fallbackTitle;
			return await library.save({
				content: JSON.stringify(
					buildAudioContent({
						audioObjectName: stored.objectName,
						audioUrl: objectUrl,
						bufferLength: storedFile.bytes.byteLength,
						coverObject: coverObjectName,
						coverUrl,
						fileType: storedFile.mimeType,
						makeTrack: input?.makeTrack ?? false,
						metadata: audio.metadata,
						title: input?.title?.trim() || fallbackTitle,
					})
				),
				media_url: objectUrl,
				thumbnail_url: coverUrl,
				tags,
				title: displayTitle,
				type: "audio",
			});
		} catch (error) {
			await Promise.allSettled([
				objectStorage.deleteObject(stored.objectName),
				...(coverObjectName ? [objectStorage.deleteObject(coverObjectName)] : []),
			]);
			throw error;
		}
	}

	const documentType = documentTypeFor(extension);
	return library.save({
		content: `Локальный файл: ${fileName}`,
		tags,
		title,
		type: documentType,
		url: objectUrl,
	});
}

/** Replaces legacy local ALAC files with AAC, without losing their metadata or cover. */
async function repairUnsupportedAudioCodecs(): Promise<void> {
	for (const item of await library.list()) {
		if (item.type !== "audio") continue;
		const current = parseAudioJson(item.content);
		const sourceObject = current?.audio.object;
		if (!sourceObject) continue;

		let replacementObject: string | undefined;
		try {
			const bytes = new Uint8Array(await readFile(objectStorage.getObjectPath(sourceObject)));
			const extracted = await readLocalAudioMetadata(
				bytes,
				basename(sourceObject),
				current.audio.mimeType || contentTypeFor(extname(sourceObject).slice(1))
			);
			if (!needsPlayableAudioTranscode(extracted.codec)) continue;

			const playableBytes = await transcodeLocalAudioToAac(bytes, extname(sourceObject).slice(1));
			const replacement = await objectStorage.putObject(playableBytes, {
				contentType: "audio/mp4",
				fileName: `${basename(sourceObject, extname(sourceObject))}.m4a`,
				folder: "imports",
				userId: "local",
			});
			replacementObject = replacement.objectName;
			const audioUrl = objectStorage.getObjectUrl(replacement.objectName);
			await library.save({
				content: JSON.stringify(
					buildAudioContent({
						audioObjectName: replacement.objectName,
						audioUrl,
						bufferLength: playableBytes.byteLength,
						coverObject: current.cover?.object,
						coverUrl: current.cover?.url,
						fileType: "audio/mp4",
						makeTrack: current.track?.isTrack ?? false,
						metadata: extracted.metadata,
						title: item.title,
					})
				),
				id: item.id,
				media_url: audioUrl,
				tags: item.tags,
				thumbnail_url: current.cover?.url,
				title: item.title,
				type: "audio",
			});
			await objectStorage.deleteObject(sourceObject).catch(() => undefined);
		} catch {
			if (replacementObject) await objectStorage.deleteObject(replacementObject).catch(() => undefined);
		}
	}
}

/** Repairs tracks imported before local metadata and artwork extraction existed. */
async function repairImportedAudioMetadata(): Promise<void> {
	for (const item of await library.list()) {
		if (item.type !== "audio") continue;
		const current = parseAudioJson(item.content);
		const sourceObject = current?.audio.object;
		if (!sourceObject || (audioMetadataIsComplete(current) && !audioMetadataNeedsRefresh(current))) continue;

		let createdCoverObject: string | undefined;
		try {
			const bytes = new Uint8Array(await readFile(objectStorage.getObjectPath(sourceObject)));
			const extracted = await readLocalAudioMetadata(
				bytes,
				basename(sourceObject),
				current.audio.mimeType || contentTypeFor(extname(sourceObject).slice(1))
			);
			if (!extracted.metadata && !extracted.artwork) continue;

			let cover = current.cover?.url
				? { objectName: current.cover.object, url: current.cover.url }
				: undefined;
			if (!cover && extracted.artwork) {
				cover = await storeLocalAudioArtwork(extracted.artwork);
				createdCoverObject = cover.objectName;
			}
			const audioUrl = current.audio.url || item.media_url || objectStorage.getObjectUrl(sourceObject);
			await library.save({
				content: JSON.stringify(
					buildAudioContent({
						audioObjectName: sourceObject,
						audioUrl,
						bufferLength: current.audio.sizeBytes ?? bytes.byteLength,
						coverObject: cover?.objectName,
						coverUrl: cover?.url,
						fileType: current.audio.mimeType || contentTypeFor(extname(sourceObject).slice(1)),
						makeTrack: current.track?.isTrack ?? false,
						metadata: extracted.metadata,
						title: item.title,
					})
				),
				id: item.id,
				media_url: audioUrl,
				tags: item.tags,
				thumbnail_url: cover?.url,
				title: item.title,
				type: "audio",
			});
		} catch {
			if (createdCoverObject) await objectStorage.deleteObject(createdCoverObject).catch(() => undefined);
		}
	}
}

function audioMetadataIsComplete(audio: ReturnType<typeof parseAudioJson>): boolean {
	return Boolean(
		audio?.audio.durationSec &&
		(audio.track?.artist ||
			audio.track?.album ||
			audio.track?.year ||
			audio.track?.genre?.length ||
			audio.cover?.url)
	);
}

function audioMetadataNeedsRefresh(audio: ReturnType<typeof parseAudioJson>): boolean {
	return Boolean(
		(audio?.audio.mimeType === "audio/mp4" && (audio.audio.bitrateKbps ?? 0) > 512) ||
		audio?.track?.lyrics === "[object Object]"
	);
}

async function storeLocalAudioArtwork(artwork: LocalAudioArtwork) {
	const normalized = normalizeLocalAudioArtwork(artwork);
	const stored = await objectStorage.putObject(normalized.bytes, {
		contentType: normalized.mimeType,
		fileName: normalized.fileName,
		folder: "audio-covers",
		userId: "local",
	});
	return {
		objectName: stored.objectName,
		url: objectStorage.getObjectUrl(stored.objectName),
	};
}

/** Match the server upload adapter: persist a Chromium-decodable JPEG, never the tag's raw image payload. */
function normalizeLocalAudioArtwork(artwork: LocalAudioArtwork): LocalAudioArtwork {
	const image = nativeImage.createFromBuffer(Buffer.from(artwork.bytes));
	if (image.isEmpty()) return artwork;
	return {
		bytes: image.toJPEG(85),
		fileName: artwork.fileName.replace(/\.[^.]+$/, ".jpg"),
		mimeType: "image/jpeg",
	};
}

function documentTypeFor(extension: string): "csv" | "docx" | "epub" | "pdf" | "xlsx" {
	if (extension === "pdf") return "pdf";
	if (extension === "docx") return "docx";
	if (extension === "epub") return "epub";
	if (extension === "csv") return "csv";
	return "xlsx";
}

function contentTypeFor(extension: string): string {
	return (
		{
			avi: "video/x-msvideo",
			aac: "audio/aac",
			flac: "audio/flac",
			gif: "image/gif",
			jpg: "image/jpeg",
			jpeg: "image/jpeg",
			m4a: "audio/mp4",
			mov: "video/quicktime",
			mp3: "audio/mpeg",
			mp4: "video/mp4",
			ogg: "audio/ogg",
			opus: "audio/opus",
			png: "image/png",
			wav: "audio/wav",
			webm: "video/webm",
			webp: "image/webp",
		}[extension] ?? "application/octet-stream"
	);
}

async function restoreDesktopSession(): Promise<void> {
	try {
		if (!safeStorage.isEncryptionAvailable()) return;
		const encrypted = await readFile(sessionPath);
		const stored = JSON.parse(safeStorage.decryptString(encrypted)) as StoredDesktopSession;
		if (await sync.restoreSession(stored)) await saveDesktopSession();
		else await rm(sessionPath, { force: true });
	} catch {
		await rm(sessionPath, { force: true });
	}
}

async function saveDesktopSession(): Promise<void> {
	const stored = sync.getStoredSession();
	if (!stored) return;
	if (!safeStorage.isEncryptionAvailable()) throw new Error("Защищённое хранилище ОС недоступно");
	await mkdir(dirname(sessionPath), { recursive: true });
	const temporary = `${sessionPath}.next`;
	await writeFile(temporary, safeStorage.encryptString(JSON.stringify(stored)));
	await rename(temporary, sessionPath);
}
