CREATE TABLE IF NOT EXISTS "sync_entities" (
	"content_id" uuid NOT NULL,
	"deleted" boolean NOT NULL DEFAULT false,
	"revision" integer NOT NULL DEFAULT 1,
	"source_updated_at" timestamp with time zone,
	"updated_at" timestamp with time zone NOT NULL DEFAULT now(),
	"user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
	CONSTRAINT "sync_entities_user_id_content_id_pk" PRIMARY KEY("user_id", "content_id")
);

CREATE INDEX IF NOT EXISTS "sync_entities_user_id_updated_at_idx"
	ON "sync_entities" USING btree ("user_id", "updated_at");

CREATE TABLE IF NOT EXISTS "sync_changes" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"content_id" uuid NOT NULL,
	"operation" text NOT NULL,
	"payload" jsonb,
	"revision" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL DEFAULT now(),
	"user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "sync_changes_user_id_id_idx"
	ON "sync_changes" USING btree ("user_id", "id");

CREATE TABLE IF NOT EXISTS "sync_mutation_receipts" (
	"client_mutation_id" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL DEFAULT now(),
	"result" jsonb NOT NULL,
	"user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
	CONSTRAINT "sync_mutation_receipts_user_id_client_mutation_id_pk"
		PRIMARY KEY("user_id", "client_mutation_id")
);
