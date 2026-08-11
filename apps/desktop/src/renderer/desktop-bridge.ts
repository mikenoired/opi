import type { AiTagsInput, AiTagsResult, AiUsage, BinaryFile, SyncRunResult } from "@synapse/api";
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
		importFiles(input?: {
			files?: BinaryFile[];
			makeTrack?: boolean;
			tags?: string[];
			title?: string;
		}): Promise<Content[]>;
		list(search?: string): Promise<Content[]>;
		preferences(): Promise<UserPreferences>;
		save(input: CreateContent & { id?: string }): Promise<Content>;
		settings(): Promise<{ colorScheme: DesktopColorScheme; syncPolicy: DesktopSyncPolicy }>;
		statistics(): Promise<DesktopStatistics>;
		updateSettings(
			settings: Partial<{ colorScheme: DesktopColorScheme; syncPolicy: DesktopSyncPolicy }>
		): Promise<{ colorScheme: DesktopColorScheme; syncPolicy: DesktopSyncPolicy }>;
		updatePreferences(preferences: UserPreferencesInput): Promise<UserPreferences>;
	};
	sync: {
		login(input: { apiUrl: string; email: string; password: string }): Promise<DesktopSession>;
		logout(): Promise<void>;
		session(): Promise<DesktopSession | undefined>;
		syncAll(): Promise<SyncRunResult>;
	};
	window: {
		onCommand(listener: (command: string) => void): () => void;
		setTheme(dark: boolean): Promise<void>;
	};
}

declare global {
	interface Window {
		synapseDesktop: DesktopBridge;
	}
}

export function getDesktopBridge(): DesktopBridge {
	return window.synapseDesktop;
}
