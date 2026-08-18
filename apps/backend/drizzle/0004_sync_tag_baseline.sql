-- Tags existed before the generic journal. Give every owned tag a canonical
-- baseline version so initial reset snapshots include its metadata.
INSERT INTO "sync_entity_versions" ("entity_type", "entity_id", "entity_version", "deleted", "updated_at", "user_id")
SELECT 'tag', "id"::text, 1, false, now(), "user_id"
FROM "tags"
WHERE "user_id" IS NOT NULL
ON CONFLICT ("user_id", "entity_type", "entity_id") DO NOTHING;
