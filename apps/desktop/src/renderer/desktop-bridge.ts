import type { AiTagsInput, AiTagsResult, AiUsage, BinaryFile, SyncRunResult } from "@synapse/api";
import type { ContentTag } from "@synapse/api";
import type { UserPreferences, UserPreferencesInput } from "@synapse/shared/preferences";
import type { Content, CreateContent } from "@synapse/shared/schemas";

export type DesktopColorScheme = "dark" | "light" | "system";
export type DesktopSyncPolicy = "automatic" | "manual";
export interface DesktopSession {
	email: string;
	eligible: boolean;
	plan: string;
}
export interface DesktopStatistics {
	conflictCount: number;
	itemCount: number;
	localBytes: number;
	pendingSyncCount: number;
	tagCount: number;
}

/** Typed renderer boundary for Electron IPC. No shared UI imports this module. */
export interface DesktopBridge {
	ai: {
		getUsageOverview(): Promise<AiUsage>;
		suggestTags(input: AiTagsInput): Promise<AiTagsResult>;
	};
	library: {
		delete(id: string): Promise<void>;
		deleteAll(): Promise<void>;
		importFiles(input?: {
			files?: BinaryFile[];
			makeTrack?: boolean;
			tags?: string[];
			title?: string;
		}): Promise<Content[]>;
		list(search?: string): Promise<Content[]>;
		tags(): Promise<ContentTag[]>;
		preferences(): Promise<UserPreferences>;
		save(input: CreateContent & { id?: string }): Promise<Content>;
		settings(): Promise<{ colorScheme: DesktopColorScheme; syncPolicy: DesktopSyncPolicy }>;
		statistics(): Promise<DesktopStatistics>;
		updateSettings(
			settings: Partial<{ colorScheme: DesktopColorScheme; syncPolicy: DesktopSyncPolicy }>
		): Promise<{ colorScheme: DesktopColorScheme; syncPolicy: DesktopSyncPolicy }>;
		updatePreferences(preferences: UserPreferencesInput): Promise<UserPreferences>;
		updateTagColor(id: string, color: number): Promise<ContentTag>;
	};
	sync: {
		connectAccount(): Promise<DesktopSession>;
		logout(): Promise<void>;
		session(): Promise<DesktopSession | undefined>;
		syncAll(): Promise<SyncRunResult>;
		onProgress(listener: (progress: SyncProgress) => void): () => void;
	};
	window: {
		onCommand(listener: (command: string) => void): () => void;
		setTheme(dark: boolean): Promise<void>;
	};
	platform: NodeJS.Platform;
}

export interface SyncProgress {
	completed: number;
	phase: "download" | "upload" | "finalizing";
	total: number;
}

declare global {
	interface Window {
		synapseDesktop: DesktopBridge;
	}
}

export function getDesktopBridge(): DesktopBridge {
	return window.synapseDesktop;
}

export function hasAccountConnection(bridge: DesktopBridge): bridge is DesktopBridge & {
	sync: DesktopBridge["sync"] & { connectAccount(): Promise<DesktopSession> };
} {
	return typeof bridge.sync.connectAccount === "function";
}
