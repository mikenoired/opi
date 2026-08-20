import { createParsedLinkFallback, type MonolythClient } from "@monolyth/api";
import {
	commonAppConfiguration,
	mergeAppConfiguration,
	type AppRuntime,
	type NavigationItemConfig,
	type SettingsTabConfig,
} from "@monolyth/features/runtime";
import { createTranslator, type InterfaceLanguage } from "@monolyth/i18n";

import { getDesktopBridge } from "./desktop-bridge";

/** IPC implementation of exactly the same port that the Web implements over REST. */
export const desktopRuntime: AppRuntime = {
	configuration: mergeAppConfiguration(commonAppConfiguration, {
		navigation: getDesktopNavigation("ru"),
		settings: getDesktopSettings("ru"),
	}),
	services: {
		capabilities: {
			enabled: ["account", "ai", "local-storage", "media-import", "sync", "system-integration"],
		},
		client: createDesktopMonolythClient(),
		commands: { execute: async () => undefined },
	},
};

export function getDesktopNavigation(language: InterfaceLanguage): NavigationItemConfig[] {
	const t = createTranslator(language);
	return [
		{
			command: "content.add" as const,
			icon: "add",
			id: "add",
			label: t("library.add"),
			variant: "action" as const,
		},
		{ icon: "home", id: "dashboard", label: t("library.title"), route: "dashboard" as const },
		{ icon: "tags", id: "tags", label: t("library.tags"), route: "tags" as const },
		{ icon: "graph", id: "graph", label: t("library.graph"), route: "graph" as const },
		{ command: "settings.open" as const, icon: "settings", id: "settings", label: t("library.settings") },
	];
}

export function getDesktopSettings(language: InterfaceLanguage): SettingsTabConfig[] {
	const t = createTranslator(language);
	return [
		{
			groups: [],
			icon: "settings",
			id: "general",
			label: t("navigation.profile"),
			when: { capability: "account" as const },
		},
		{ groups: [], icon: "appearance", id: "appearance", label: t("appearance.title") },
		{ groups: [], icon: "media", id: "media", label: t("library.types.media") },
		{ groups: [], icon: "ai", id: "ai", label: "AI", when: { capability: "ai" as const } },
	];
}

function createDesktopMonolythClient(): MonolythClient {
	return {
		account: {
			getCurrentUser: async () => {
				const session = await getDesktopBridge().sync.session();
				return session
					? {
							createdAt: null,
							email: session.email,
							id: session.email,
							plan: session.plan as "starter",
							updatedAt: null,
						}
					: null;
			},
			getPreferences: () => getDesktopBridge().library.preferences(),
			getStorageUsage: async () => {
				const stats = await getDesktopBridge().library.statistics();
				return { fileSize: stats.localBytes, files: stats.itemCount };
			},
			signIn: async () => ({
				error: { message: "Use the Monolyth Sync settings to choose a server" },
				user: null,
			}),
			signOut: () => getDesktopBridge().sync.logout(),
			signUp: async () => ({ error: { message: "Use Monolyth Web to create an account" }, user: null }),
			updatePreferences: (input) => getDesktopBridge().library.updatePreferences(input),
		},
		ai: {
			getUsageOverview: () => getDesktopBridge().ai.getUsageOverview(),
			suggestTags: (input) => getDesktopBridge().ai.suggestTags(input),
		},
		content: {
			create: (input) => getDesktopBridge().library.save(input),
			delete: async (id) => {
				await getDesktopBridge().library.delete(id);
				return { success: true };
			},
			deleteMany: async ({ ids }) => {
				await getDesktopBridge().library.deleteMany(ids);
				return { deletedIds: ids };
			},
			get: async (id) => {
				const items = await getDesktopBridge().library.list();
				const item = items.find((candidate) => candidate.id === id);
				if (!item) throw new Error("Content not found");
				return item;
			},
			getAvailableTypes: async () =>
				Array.from(new Set((await getDesktopBridge().library.list()).map((item) => item.type))),
			getSuggestions: async () => ({ groups: [] }),
			getTag: async (id) => (await tags()).find((tag) => tag.id === id),
			getTags: tags,
			getTagsWithContent: async () => {
				const items = await getDesktopBridge().library.list();
				return (await tags()).map((tag) => ({
					id: tag.id,
					items: items.filter((item) => item.tags.includes(tag.title)),
					title: tag.title,
				}));
			},
			getTagsWithContentPage: async () => ({ items: (await tags()).map((tag) => ({ ...tag, items: [] })) }),
			importFile: async ({ file, tags, title }) => {
				const [content] = await getDesktopBridge().library.importFiles({ files: [file], tags, title });
				if (!content) throw new Error("No file selected");
				return { content, success: true };
			},
			list: async (input) => {
				const matches = (await getDesktopBridge().library.list()).filter(
					(item) =>
						(!input.search ||
							[item.title, item.content, item.tags.join(" ")]
								.join(" ")
								.toLocaleLowerCase()
								.includes(input.search.toLocaleLowerCase())) &&
						(!input.types?.length || input.types.includes(item.type)) &&
						(!input.tagIds?.length || input.tagIds.every((id) => item.tag_ids.includes(id)))
				);
				return { items: matches.slice(0, input.limit ?? 50) };
			},
			parseLink: async ({ url }) => createParsedLinkFallback(url),
			update: async (input) => {
				const existing = await getDesktopBridge()
					.library.list()
					.then((items) => items.find((item) => item.id === input.id));
				if (!existing) throw new Error("Content not found");
				return getDesktopBridge().library.save({
					content: input.content ?? existing.content,
					document_images: input.document_images ?? existing.document_images,
					id: existing.id,
					media_type: input.media_type ?? existing.media_type ?? "image",
					media_url: input.media_url ?? existing.media_url,
					tags: input.tags ?? existing.tags,
					thumbnail_base64: input.thumbnail_base64 ?? existing.thumbnail_base64,
					thumbnail_url: input.thumbnail_url ?? existing.thumbnail_url,
					title: input.title ?? existing.title,
					type: input.type ?? existing.type,
					url: input.url ?? existing.url,
				});
			},
			updateTags: async (input) => ({ items: await getDesktopBridge().library.updateTags(input) }),
			updateTagColor: async (input) => {
				return getDesktopBridge().library.updateTagColor(input.id, input.color);
			},
			upload: async ({ files, makeTrack, tags, title }) => {
				const contents = await getDesktopBridge().library.importFiles({ files, makeTrack, tags, title });
				return {
					contents,
					errors: [],
					files: contents.map((content) => ({ content, name: content.title ?? "" })),
				};
			},
		},
		graph: {
			get: async () => ({
				edges: [],
				nodes: (await getDesktopBridge().library.list()).map((item) => ({
					color: 0,
					content: item.content,
					id: item.id,
					type: item.type,
				})),
			}),
		},
		sync: {
			getEntitlement: async () => {
				const session = await getDesktopBridge().sync.session();
				return { eligible: Boolean(session?.eligible), plan: (session?.plan ?? "starter") as "starter" };
			},
			getStatus: async () => {
				const stats = await getDesktopBridge().library.statistics();
				return {
					conflicts: stats.conflictCount,
					failed: 0,
					lastSyncedAt: null,
					pending: stats.pendingSyncCount,
				};
			},
			syncNow: () => getDesktopBridge().sync.syncAll(),
		},
	};
}

async function tags() {
	return getDesktopBridge().library.tags();
}
