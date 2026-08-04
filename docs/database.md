# Database

## Technologies and access

- PostgreSQL 15 is the authoritative relational store.
- Drizzle ORM schema: `apps/backend/src/server/db/schema.ts`; connection uses `postgres` and env-derived connection settings.
- Redis is separate operational storage for cache, rate-limit windows, and derived per-user storage counters; it is not an ORM-managed database.
- MinIO is object storage, not a database table store. Object references are embedded in type-specific content payloads.

## Main relational entities

| Entity         | Purpose and key relationships                                                                                                                |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `users`        | Identity, password hash, preferences JSON, plan, timestamps. Owns all principal data. Email is unique.                                       |
| `content`      | Unified archive item with type, serialized payload, derived `search_text`/`search_vector`, title, image metadata, timestamps, and `user_id`. |
| `tags`         | User-owned tag label. Many-to-many with content through `content_tags`.                                                                      |
| `content_tags` | Content/tag join with an owner field. Unique content/tag pair is installed by SQL migration.                                                 |
| `nodes`        | User-owned graph projection node; `metadata` identifies backing content/tag records.                                                         |
| `edges`        | Directed, user-owned graph relationship between nodes, with `relation_type`.                                                                 |
| `ai_usage`     | Per-call AI accounting and diagnostics. `content_id` is intentionally not a foreign key.                                                     |

## Indexing and search

- `content`: indexes by owner, type, created time, owner/type, owner/created time; GIN index on `search_vector`.
- `tags`: indexes by owner, title, and owner/title. A partial unique expression index on `user_id, lower(btrim(title))` prevents normalized duplicate non-empty tags.
- `content_tags`: indexes each foreign key and the pair; a unique pair index prevents duplicate assignments.
- `nodes`/`edges`: indexes support user and endpoint traversal.
- `ai_usage`: composite owner/time and owner/feature/time indexes serve usage reports.
- Search uses `plainto_tsquery('russian', query)` transformed to OR terms, `ts_rank_cd` ranking, and the `content_search_vector_idx` GIN index.

## Lifecycle and migrations

- Drizzle config targets PostgreSQL and emits migration artifacts to `apps/backend/drizzle`.
- Local setup currently uses `db:push` for schema synchronization rather than a committed migration chain.
- `0000_merge_duplicate_tags.sql` is an operational migration that installs a statement trigger to merge normalized duplicate user tags, repoint joins/graph nodes/edges, clean duplicates, and create unique indexes.
- After provisioning or significant legacy changes, run the documented tag-merge and search backfill scripts.

## Data ownership rules

- Foreign keys generally cascade from users and content/tag/node parents.
- Repository methods filter ownership using `ctx.user.id`; callers should never rely only on an unscoped record ID.
- The `content` payload and metadata are type-dependent JSON/text values. Consult shared schemas and parsing helpers before modifying or querying them.
