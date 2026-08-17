import { DEFAULT_USER_PREFERENCES, type UserPreferences } from "@synapse/shared/preferences";
import { relations, sql } from "drizzle-orm";
import {
	boolean,
	bigint,
	bigserial,
	check,
	customType,
	index,
	integer,
	jsonb,
	numeric,
	pgTable,
	primaryKey,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";

const tsvector = customType<{ data: string }>({
	dataType() {
		return "tsvector";
	},
});

export const users = pgTable("users", {
	id: uuid("id").primaryKey().defaultRandom(),
	email: text("email").notNull().unique(),
	passwordHash: text("password_hash").notNull(),
	preferences: jsonb("preferences").$type<UserPreferences>().notNull().default(DEFAULT_USER_PREFERENCES),
	plan: text("plan").notNull().default("starter"),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const content = pgTable(
	"content",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		type: text("type").notNull(),
		content: text("content").notNull(),
		searchText: text("search_text").notNull().default(""),
		searchVector: tsvector("search_vector")
			.notNull()
			.default(sql`''::tsvector`),
		title: text("title"),
		thumbnailBase64: text("thumbnail_base64"),
		documentImages: jsonb("document_images"),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
		userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
	},
	(table) => [
		index("content_user_id_idx").on(table.userId),
		index("content_type_idx").on(table.type),
		index("content_created_at_idx").on(table.createdAt),
		index("content_user_id_type_idx").on(table.userId, table.type),
		index("content_user_id_created_at_idx").on(table.userId, table.createdAt),
		index("content_search_vector_idx").using("gin", table.searchVector),
	]
);

export const tags = pgTable(
	"tags",
	{
		color: integer("color").notNull().default(0),
		id: uuid("id").primaryKey().defaultRandom(),
		title: text("title").notNull(),
		userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
	},
	(table) => [
		check("tags_color_range_chk", sql`${table.color} between 0 and 255`),
		index("tags_user_id_idx").on(table.userId),
		index("tags_title_idx").on(table.title),
		index("tags_user_id_title_idx").on(table.userId, table.title),
	]
);

export const contentTags = pgTable(
	"content_tags",
	{
		contentId: uuid("content_id")
			.notNull()
			.references(() => content.id, { onDelete: "cascade" }),
		tagId: uuid("tag_id")
			.notNull()
			.references(() => tags.id, { onDelete: "cascade" }),
		userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
	},
	(table) => [
		index("content_tags_content_id_idx").on(table.contentId),
		index("content_tags_tag_id_idx").on(table.tagId),
		index("content_tags_user_id_idx").on(table.userId),
		index("content_tags_content_id_tag_id_idx").on(table.contentId, table.tagId),
	]
);

export const nodes = pgTable(
	"nodes",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		type: text("type").notNull(),
		content: text("content"),
		metadata: jsonb("metadata"),
		userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
	},
	(table) => [index("nodes_user_id_idx").on(table.userId), index("nodes_type_idx").on(table.type)]
);

export const edges = pgTable(
	"edges",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		fromNode: uuid("from_node").references(() => nodes.id, { onDelete: "cascade" }),
		toNode: uuid("to_node").references(() => nodes.id, { onDelete: "cascade" }),
		relationType: text("relation_type").notNull(),
		userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
	},
	(table) => [
		index("edges_from_node_idx").on(table.fromNode),
		index("edges_to_node_idx").on(table.toNode),
		index("edges_user_id_idx").on(table.userId),
		index("edges_from_node_to_node_idx").on(table.fromNode, table.toNode),
	]
);

export const aiUsage = pgTable(
	"ai_usage",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
		provider: text("provider").notNull(),
		model: text("model").notNull(),
		feature: text("feature").notNull().default("tag_suggestion"),
		inputTokens: integer("input_tokens").notNull().default(0),
		outputTokens: integer("output_tokens").notNull().default(0),
		inputCostUsd: numeric("input_cost_usd", { precision: 12, scale: 8 }).notNull().default("0"),
		outputCostUsd: numeric("output_cost_usd", { precision: 12, scale: 8 }).notNull().default("0"),
		totalCostUsd: numeric("total_cost_usd", { precision: 12, scale: 8 }).notNull().default("0"),
		success: boolean("success").notNull(),
		errorType: text("error_type"),
		errorMessage: text("error_message"),
		latencyMs: integer("latency_ms"),
		// Plain uuid without FK: billing history must survive cascade content deletion
		contentId: uuid("content_id"),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
	},
	(table) => [
		index("ai_usage_user_id_created_at_idx").on(table.userId, table.createdAt),
		index("ai_usage_user_id_feature_created_at_idx").on(table.userId, table.feature, table.createdAt),
		check("ai_usage_success_tokens_chk", sql`success = true OR (input_tokens = 0 AND output_tokens = 0)`),
	]
);

/** Durable server-side cursor journal for local-first clients. */
export const syncEntities = pgTable(
	"sync_entities",
	{
		contentId: uuid("content_id").notNull(),
		deleted: boolean("deleted").notNull().default(false),
		revision: integer("revision").notNull().default(1),
		sourceUpdatedAt: timestamp("source_updated_at", { withTimezone: true }),
		updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
	},
	(table) => [
		primaryKey({ columns: [table.userId, table.contentId] }),
		index("sync_entities_user_id_updated_at_idx").on(table.userId, table.updatedAt),
	]
);

export const syncChanges = pgTable(
	"sync_changes",
	{
		id: bigserial("id", { mode: "number" }).primaryKey(),
		contentId: uuid("content_id").notNull(),
		operation: text("operation").notNull(),
		payload: jsonb("payload").$type<unknown>(),
		revision: integer("revision").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
	},
	(table) => [index("sync_changes_user_id_id_idx").on(table.userId, table.id)]
);

/** Idempotency receipts keep an interrupted desktop push safe to retry. */
export const syncMutationReceipts = pgTable(
	"sync_mutation_receipts",
	{
		clientMutationId: text("client_mutation_id").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
		result: jsonb("result").notNull().$type<unknown>(),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
	},
	(table) => [primaryKey({ columns: [table.userId, table.clientMutationId] })]
);

/** Generic protocol tables. Legacy content-shaped tables above remain only for migration compatibility. */
export const syncJournalClock = pgTable("sync_journal_clock", {
	id: boolean("id").primaryKey().default(true),
	nextCursor: bigint("next_cursor", { mode: "number" }).notNull().default(0),
});

export const syncEntityVersions = pgTable(
	"sync_entity_versions",
	{
		entityType: text("entity_type").notNull(),
		entityId: text("entity_id").notNull(),
		entityVersion: bigint("entity_version", { mode: "number" }).notNull(),
		deleted: boolean("deleted").notNull().default(false),
		updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
	},
	(table) => [primaryKey({ columns: [table.userId, table.entityType, table.entityId] })]
);

export const syncJournalEntries = pgTable(
	"sync_journal_entries",
	{
		cursor: bigint("cursor", { mode: "number" }).primaryKey(),
		entityType: text("entity_type").notNull(),
		entityId: text("entity_id").notNull(),
		entityVersion: bigint("entity_version", { mode: "number" }).notNull(),
		operation: text("operation").notNull(),
		payload: jsonb("payload").$type<unknown>(),
		mutationId: text("mutation_id"),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
	},
	(table) => [index("sync_journal_entries_user_cursor_idx").on(table.userId, table.cursor)]
);

export const syncMutationReceiptsV2 = pgTable(
	"sync_mutation_receipts_v2",
	{
		mutationId: text("mutation_id").notNull(),
		requestHash: text("request_hash").notNull(),
		status: text("status").notNull().default("processing"),
		outcome: jsonb("outcome").$type<unknown>(),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
		completedAt: timestamp("completed_at", { withTimezone: true }),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
	},
	(table) => [primaryKey({ columns: [table.userId, table.mutationId] })]
);

export const syncRetentionWatermarks = pgTable("sync_retention_watermarks", {
	oldestRetainedCursor: bigint("oldest_retained_cursor", { mode: "number" }).notNull().default(0),
	updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
	userId: uuid("user_id")
		.primaryKey()
		.notNull()
		.references(() => users.id, { onDelete: "cascade" }),
});

export const usersRelations = relations(users, ({ many }) => ({
	content: many(content),
	tags: many(tags),
	nodes: many(nodes),
	edges: many(edges),
	aiUsage: many(aiUsage),
}));

export const contentRelations = relations(content, ({ one, many }) => ({
	user: one(users, {
		fields: [content.userId],
		references: [users.id],
	}),
	contentTags: many(contentTags),
}));

export const tagsRelations = relations(tags, ({ one, many }) => ({
	user: one(users, {
		fields: [tags.userId],
		references: [users.id],
	}),
	contentTags: many(contentTags),
}));

export const contentTagsRelations = relations(contentTags, ({ one }) => ({
	content: one(content, {
		fields: [contentTags.contentId],
		references: [content.id],
	}),
	tag: one(tags, {
		fields: [contentTags.tagId],
		references: [tags.id],
	}),
	user: one(users, {
		fields: [contentTags.userId],
		references: [users.id],
	}),
}));

export const nodesRelations = relations(nodes, ({ one, many }) => ({
	user: one(users, {
		fields: [nodes.userId],
		references: [users.id],
	}),
	edgesFrom: many(edges, { relationName: "fromNode" }),
	edgesTo: many(edges, { relationName: "toNode" }),
}));

export const edgesRelations = relations(edges, ({ one }) => ({
	user: one(users, {
		fields: [edges.userId],
		references: [users.id],
	}),
	fromNode: one(nodes, {
		fields: [edges.fromNode],
		references: [nodes.id],
		relationName: "fromNode",
	}),
	toNode: one(nodes, {
		fields: [edges.toNode],
		references: [nodes.id],
		relationName: "toNode",
	}),
}));
