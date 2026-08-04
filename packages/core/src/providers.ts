import type {
	AvailableContentTypesRepository,
	ContentListRepository,
	ContentSuggestionRepository,
	TagContentPageRepository,
} from "./content";

/**
 * Platform-owned persistence needed by the Core Content workflows. Query
 * capabilities are composed from the focused ports so an adapter only exposes
 * the operations its caller needs.
 */
export interface ContentRepository
	extends
		ContentListRepository,
		ContentSuggestionRepository,
		TagContentPageRepository,
		AvailableContentTypesRepository {
	createContentTags: (tagIds: string[], contentId: string) => Promise<void>;
	deleteContent: (contentId: string) => Promise<void>;
	deleteContentTags: (contentId: string) => Promise<void>;
}

/** Graph persistence is deliberately separate from Content persistence. */
export interface GraphProvider {
	createContentTagEdges: (
		contentNodeId: string,
		tagNodeIdByTagId: Record<string, string>,
		tagIds: string[]
	) => Promise<void>;
	createTagNode: (title: string) => Promise<void>;
	deleteContentNodeGraph: (contentNodeId: string) => Promise<void>;
	deleteContentTagEdges: (contentNodeId: string) => Promise<void>;
	findContentNodeId: (contentId: string) => Promise<string | undefined>;
	getOrCreateTagNodeIds: (tagIds: string[]) => Promise<Record<string, string>>;
}

export interface StoredObjectMetadata {
	size: number;
}

/**
 * Platform storage boundary. Validation, object naming, and URL policy stay
 * in the adapter; Core only relies on object-oriented storage operations.
 */
export interface StorageProvider {
	deleteObject: (objectName: string) => Promise<void>;
	getObjectMetadata: (objectName: string) => Promise<StoredObjectMetadata | null>;
	getObjectUrl: (objectName: string) => string;
	putObject: (
		data: Uint8Array,
		input: { contentType: string; fileName: string; folder: string; userId: string }
	) => Promise<{ objectName: string; size: number }>;
}

export interface SyncChange {
	entityId: string;
	entityType: string;
	operation: "create" | "delete" | "update";
	payload?: unknown;
}

/** A platform adapter will deliver these changes when synchronization is added in Stage 9. */
export interface SyncProvider {
	publish: (change: SyncChange) => Promise<void>;
}
