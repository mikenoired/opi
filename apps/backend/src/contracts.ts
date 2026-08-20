import type {
	createContentSchema,
	deleteContentBatchSchema,
	updateContentSchema,
	updateContentTagsBatchSchema,
} from "@monolyth/shared/schemas";
import { contentTypeSchema } from "@monolyth/shared/schemas";
import type { z } from "zod";

import type AiUsageRepository from "./server/repositories/ai-usage.repository";
import type AiTaggingService from "./server/services/ai-tagging.service";
import type ContentService from "./server/services/content.service";
import type GraphService from "./server/services/graph.service";
import type UploadService from "./server/services/upload.service";
import type UserService from "./server/services/user.service";

export type ContentListInput = {
	search?: string;
	tagIds?: string[];
	types?: z.infer<typeof contentTypeSchema>[];
	cursor?: string;
	limit?: number;
	includeTags?: boolean;
};
export type ContentSuggestionsInput = { contentId: string; cursor?: string; limit?: number };
export type TagsPageInput = { cursor?: string; limit?: number };
export type UpdateTagColorInput = { id: string; color: number };
export type ImportFileInput = {
	title?: string;
	tags?: string[];
	file: { name: string; type: string; size: number; buffer: number[] };
};
export type UploadInput = Parameters<UploadService["handleUpload"]>[0];
export type PreferencesInput = Parameters<UserService["updatePreferences"]>[0];
export type AiTagsInput = Parameters<AiTaggingService["suggestTags"]>[0];

export type ContentList = Awaited<ReturnType<ContentService["getAll"]>>;
export type ContentDetail = Awaited<ReturnType<ContentService["getById"]>>;
export type ContentTags = Awaited<ReturnType<ContentService["getTags"]>>;
export type TagsWithContent = Awaited<ReturnType<ContentService["getTagsWithContent"]>>;
export type TagsPage = Awaited<ReturnType<ContentService["getTagsWithContentPage"]>>;
export type Suggestions = Awaited<ReturnType<ContentService["getSuggestions"]>>;
export type AvailableTypes = Awaited<ReturnType<ContentService["getAvailableTypes"]>>;
export type Graph = Awaited<ReturnType<GraphService["getGraph"]>>;
export type User = Awaited<ReturnType<UserService["getUser"]>>;
export type StorageUsage = Awaited<ReturnType<UserService["getStorageUsage"]>>;
export type Preferences = Awaited<ReturnType<UserService["getPreferences"]>>;
export type AiUsage = Awaited<ReturnType<AiUsageRepository["getOverview"]>>;
export type SyncEntitlement = { eligible: boolean; plan: import("@monolyth/shared/plans").PlanId };
export type CreateContentInput = z.input<typeof createContentSchema>;
export type UpdateContentInput = z.input<typeof updateContentSchema>;
export type CreateContentResult = Awaited<ReturnType<ContentService["create"]>>;
export type UpdateContentResult = Awaited<ReturnType<ContentService["update"]>>;
export type DeleteContentResult = Awaited<ReturnType<ContentService["delete"]>>;
export type DeleteContentBatchInput = z.infer<typeof deleteContentBatchSchema>;
export type DeleteContentBatchResult = { deletedIds: string[] };
export type UpdateContentTagsBatchInput = z.infer<typeof updateContentTagsBatchSchema>;
export type UpdateContentTagsBatchResult = { items: ContentDetail[] };
export type ImportFileResult = Awaited<ReturnType<ContentService["importFile"]>>;
export type UploadResult = Awaited<ReturnType<UploadService["handleUpload"]>>;
export type AiTagsResult = Awaited<ReturnType<AiTaggingService["suggestTags"]>>;
