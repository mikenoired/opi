CREATE TABLE IF NOT EXISTS "sync_journal_clock" (
	"id" boolean PRIMARY KEY DEFAULT true CHECK ("id"),
	"next_cursor" bigint NOT NULL DEFAULT 0
);

INSERT INTO "sync_journal_clock" ("id", "next_cursor") VALUES (true, 0)
ON CONFLICT ("id") DO NOTHING;

CREATE TABLE IF NOT EXISTS "sync_entity_versions" (
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"entity_version" bigint NOT NULL,
	"deleted" boolean NOT NULL DEFAULT false,
	"updated_at" timestamp with time zone NOT NULL DEFAULT now(),
	"user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
	CONSTRAINT "sync_entity_versions_pk" PRIMARY KEY ("user_id", "entity_type", "entity_id")
);

-- V2 reset builds its snapshot from entity versions. Existing content predates
-- the journal, so seed one immutable baseline version for every owned row.
INSERT INTO "sync_entity_versions" ("entity_type", "entity_id", "entity_version", "deleted", "updated_at", "user_id")
SELECT 'content', "id"::text, 1, false, "updated_at", "user_id"
FROM "content"
WHERE "user_id" IS NOT NULL
ON CONFLICT ("user_id", "entity_type", "entity_id") DO NOTHING;

CREATE TABLE IF NOT EXISTS "sync_journal_entries" (
	"cursor" bigint PRIMARY KEY NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"entity_version" bigint NOT NULL,
	"operation" text NOT NULL,
	"payload" jsonb,
	"mutation_id" text,
	"created_at" timestamp with time zone NOT NULL DEFAULT now(),
	"user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "sync_journal_entries_user_cursor_idx"
	ON "sync_journal_entries" USING btree ("user_id", "cursor");

CREATE TABLE IF NOT EXISTS "sync_mutation_receipts_v2" (
	"mutation_id" text NOT NULL,
	"request_hash" text NOT NULL,
	"status" text NOT NULL DEFAULT 'processing',
	"outcome" jsonb,
	"created_at" timestamp with time zone NOT NULL DEFAULT now(),
	"completed_at" timestamp with time zone,
	"user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
	CONSTRAINT "sync_mutation_receipts_v2_pk" PRIMARY KEY ("user_id", "mutation_id")
);

CREATE TABLE IF NOT EXISTS "sync_retention_watermarks" (
	"oldest_retained_cursor" bigint NOT NULL DEFAULT 0,
	"updated_at" timestamp with time zone NOT NULL DEFAULT now(),
	"user_id" uuid PRIMARY KEY NOT NULL REFERENCES "users"("id") ON DELETE CASCADE
);
