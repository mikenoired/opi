import type { PlanId, PlanLimits } from "@monolyth/shared/plans";
import type { UserPreferences, UserPreferencesInput } from "@monolyth/shared/preferences";
import type { Content, ContentListItem, CreateContent, UpdateContent } from "@monolyth/shared/schemas";

/**
 * Transport-neutral contract used by the shared product UI.
 *
 * REST, Electron IPC and a future mobile bridge all implement this interface.
 * No method exposes a transport detail such as Request, Response, fetch or IPC
 * channel names.
 */
export interface MonolythClient {
	ai: AiClient;
	account: AccountClient;
	content: ContentClient;
	graph: GraphClient;
	sync: SyncClient;
}

export interface ContentClient {
	create(input: CreateContentInput): Promise<ContentDetail>;
	delete(id: string): Promise<DeleteContentResult>;
	get(id: string): Promise<ContentDetail>;
	getAvailableTypes(): Promise<ContentType[]>;
	getSuggestions(input: ContentSuggestionsInput): Promise<ContentSuggestions>;
	getTag(id: string): Promise<ContentTag | undefined>;
	getTags(): Promise<ContentTag[]>;
	getTagsWithContent(): Promise<TagsWithContent>;
	getTagsWithContentPage(input: TagsPageInput): Promise<TagsPage>;
	importFile(input: ImportFileInput): Promise<ImportFileResult>;
	list(input: ContentListInput): Promise<ContentList>;
	parseLink(input: ParseLinkInput): Promise<ParsedLink>;
	update(input: UpdateContentInput): Promise<ContentDetail>;
	updateTagColor(input: UpdateTagColorInput): Promise<ContentTag>;
	upload(input: UploadInput): Promise<UploadResult>;
}

export interface AccountClient {
	getCurrentUser(): Promise<CurrentUser | null>;
	getPreferences(): Promise<UserPreferences>;
	getStorageUsage(): Promise<StorageUsage>;
	signIn(input: AuthCredentials): Promise<AuthResult>;
	signOut(): Promise<void>;
	signUp(input: AuthCredentials): Promise<AuthResult>;
	updatePreferences(input: UserPreferencesInput): Promise<UserPreferences>;
}

export interface GraphClient {
	get(): Promise<Graph>;
}

/** Local-first synchronization is optional by capability, never by platform check in UI. */
export interface SyncClient {
	getEntitlement(): Promise<SyncEntitlement>;
	getStatus(): Promise<SyncStatus>;
	syncNow(): Promise<SyncRunResult>;
}

export interface AiClient {
	getUsageOverview(): Promise<AiUsage>;
	suggestTags(input: AiTagsInput): Promise<AiTagsResult>;
}

export type ContentType = Content["type"];
export type ContentDetail = Content;
export type CreateContentInput = CreateContent;
export type UpdateContentInput = UpdateContent;

export interface ContentListInput {
	cursor?: string;
	includeTags?: boolean;
	limit?: number;
	search?: string;
	tagIds?: string[];
	types?: ContentType[];
}

export interface ContentList {
	items: ContentListItem[];
	nextCursor?: string;
}

export interface ContentTag {
	color: number;
	id: string;
	title: string;
}

export interface ContentSuggestionsInput {
	contentId: string;
	cursor?: string;
	limit?: number;
}

export interface ContentSuggestions {
	groups: Array<{ items: ContentListItem[]; tag: SuggestedContentTag }>;
	nextCursor?: string;
}

export interface SuggestedContentTag extends ContentTag {
	itemCount: number;
}

export interface TagsPageInput {
	cursor?: string;
	limit?: number;
}

export interface TagsPage {
	items: Array<{ color: number; id: string; items: ContentListItem[]; title: string }>;
	nextCursor?: string;
}

export type TagsWithContent = Array<{ id: string; items: ContentListItem[]; title: string }>;

export interface UpdateTagColorInput {
	color: number;
	id: string;
}

export interface BinaryFile {
	bytes: Uint8Array;
	name: string;
	size: number;
	type: string;
}

export interface ImportFileInput {
	file: BinaryFile;
	tags?: string[];
	title?: string;
}

export interface ImportFileResult {
	content: ContentDetail;
	success: true;
}

export interface UploadInput {
	files: BinaryFile[];
	makeTrack?: boolean;
	tags?: string[];
	title?: string;
}

export interface UploadResult {
	contents: ContentDetail[];
	errors: string[];
	files: Array<{ content?: ContentDetail; name: string }>;
}

export interface ParseLinkInput {
	url: string;
}

export interface ParsedLink {
	content: string;
	description?: string;
	image?: string;
	title?: string;
	url: string;
}

/**
 * Safe baseline used where remote metadata extraction is unavailable.
 * It validates and normalizes the URL without making an untrusted server-side
 * request, so every platform can still create a usable link item.
 */
export function createParsedLinkFallback(value: string): ParsedLink {
	const url = value.trim();
	const match = /^(https?):\/\/([^/?#\s]+)(?:[/?#][^\s]*)?$/i.exec(url);
	if (!match) throw new Error("Введите корректный HTTP(S) URL");
	const hostname = match[2].replace(/^.*@/, "").replace(/:\d+$/, "");
	if (!hostname) throw new Error("Введите корректный HTTP(S) URL");
	return {
		content: "",
		title: hostname.replace(/^www\./, ""),
		url,
	};
}

export interface DeleteContentResult {
	success: true;
}

export interface Graph {
	edges: GraphEdge[];
	nodes: GraphNode[];
}

export interface GraphNode {
	color: number;
	content: string | null;
	id: string;
	metadata?: unknown;
	type: string;
}

export interface GraphEdge {
	fromNode: string | null;
	toNode: string | null;
}

export interface CurrentUser {
	createdAt: Date | string | null;
	email: string;
	id: string;
	plan: PlanId;
	updatedAt: Date | string | null;
}

export interface AuthCredentials {
	email: string;
	password: string;
}

export interface AuthResult {
	error: AuthError | null;
	user: CurrentUser | null;
}

export interface AuthError {
	fieldErrors?: Partial<Record<"email" | "password", string>>;
	message: string;
}

export interface StorageUsage {
	fileSize: number;
	files: number;
}

export interface AiUsage {
	latest: { createdAt: Date | string | null; feature: string; model: string; provider: string } | undefined;
	limits: PlanLimits;
	models: Array<{ model: string; provider: string; requests: number; tokens: number }>;
	period: { end: string; start: string };
	plan: PlanId;
	planLabel: string;
	usage: {
		averageLatencyMs: number | null;
		failedRequests: number;
		inputTokens: number;
		outputTokens: number;
		requests: number;
		successfulRequests: number;
		totalCostUsd: number;
		totalTokens: number;
	};
}

export type AiTagsInput =
	| { contentId: string; mode: "existing" }
	| { content?: string; image?: string; mode: "draft"; title?: string; type: ContentType };

export interface AiTagsResult {
	error?: string;
	existing: AiSuggestedTag[];
	newTags: string[];
	success: boolean;
}

export interface AiSuggestedTag {
	id: string;
	name: string;
}

export interface SyncEntitlement {
	eligible: boolean;
	plan: PlanId;
}

export interface SyncStatus {
	conflicts: number;
	failed: number;
	lastSyncedAt: string | null;
	pending: number;
}

export interface SyncRunResult {
	/** Server wins; the Desktop adapter retains the overwritten local edit as a conflict copy. */
	conflicts: SyncConflict[];
	failed: number;
	synced: number;
}

export interface SyncConflict {
	/** The original local record remains available under this new local-only ID. */
	conflictCopyId: string;
	entityId: string;
	localUpdatedAt: string;
	remote: ContentDetail;
	remoteUpdatedAt: string;
	resolution: "server-wins-local-copy";
}

/** A durable mutation created by a local-first adapter and acknowledged by the server exactly once. */
export interface SyncMutation {
	baseRevision?: number;
	clientMutationId: string;
	content?: CreateContentInput;
	kind: "delete" | "upsert";
	remoteId?: string;
}

export interface SyncMutationOutcome {
	clientMutationId: string;
	content?: ContentDetail;
	deleted?: boolean;
	revision: number;
	status: "applied" | "conflict";
}

export interface SyncPushResult {
	outcomes: SyncMutationOutcome[];
}

/** Ordered server journal entry. The cursor is opaque and must be stored verbatim by the adapter. */
export interface SyncRemoteChange {
	content?: ContentDetail;
	entityId: string;
	operation: "delete" | "upsert";
	revision: number;
}

export interface SyncPullResult {
	changes: SyncRemoteChange[];
	cursor: string;
}
