# Synapse Migration Wiki

## Current architecture

- The repository is a Bun workspace with `apps/*` and `packages/*` workspaces.
- `apps/web` remains the only implemented application and retains all existing product code.
- `apps/desktop` and `apps/backend` are empty workspace placeholders; no platform code has moved into them.
- `packages/ui` and `packages/tsconfig` predate this migration task.
- `packages/features`, `packages/api`, and `packages/sync` have only a package manifest, a platform-neutral TypeScript configuration, and an empty public entry point.
- `packages/core` now owns platform-neutral Content service orchestration: queries, tag-title resolution, Content↔tag graph-relation writes, persistence-deletion ordering, and explicit provider contracts, plus serialized Content payload construction and media/audio/link model parsing.
- `apps/web` provides named Core adapters over its Drizzle repositories/graph persistence and MinIO object storage. Its Content service calls Core operations through those adapters while retaining transactions, cache policy, API validation, parsing, and file policy.
- `packages/shared` owns the platform-neutral domain schemas and types; all Web consumers import them directly.
- `packages/shared/content-types` owns content-type filter normalization; Web retains only icon and translation metadata for its content-type picker.
- `packages/shared/tag-colors` owns the tag-color palette and index lookup; CSS and Pixi adapters remain in Web.
- `packages/shared/preferences` owns platform-neutral user-preference types, defaults, and normalization; browser persistence remains in the Web context.
- `packages/shared/plans` owns plan IDs, limits, metadata, and validation shared by the Web UI and server.
- `packages/shared/formatting` owns platform-neutral value-formatting helpers.
- `packages/shared/animations` owns serializable animation configuration; animation rendering remains in Web.

## Migration progress

- Completed: Stage 1 — monorepo structure and package export boundaries.
- Completed: Stage 2 (first slice) — moved platform-neutral schemas, types, and parsing helpers into `@synapse/shared`.
- Completed: Stage 2 (second slice) — moved content-type filtering constants and helpers into `@synapse/shared/content-types`.
- Completed: Stage 2 (third slice) — moved tag-color palette and lookup into `@synapse/shared/tag-colors`.
- Completed: Stage 2 (fourth slice) — moved user-preference types, defaults, and normalization into `@synapse/shared/preferences`.
- Completed: Stage 2 (fifth slice) — moved plan definitions, limits, and validation into `@synapse/shared/plans`.
- Completed: Stage 2 (sixth slice) — moved size formatting into `@synapse/shared/formatting`.
- Completed: Stage 2 (seventh slice) — moved shared animation configuration into `@synapse/shared/animations`.
- Completed: Stage 2 (eighth slice) — updated all server-side schema consumers to import from `@synapse/shared/schemas`.
- Completed: Stage 2 (ninth slice) — updated the Web item-rendering cluster to import schemas from `@synapse/shared/schemas`.
- Completed: Stage 2 (tenth slice) — updated Web content-list, filter, and suggestion components to import schemas from `@synapse/shared/schemas`.
- Completed: Stage 2 (eleventh slice) — updated Web dashboard route components to import schemas from `@synapse/shared/schemas`.
- Completed: Stage 2 (twelfth slice) — updated Web viewer modal components to import schemas from `@synapse/shared/schemas`.
- Completed: Stage 2 (thirteenth slice) — updated legacy modal editor forms to import schemas from `@synapse/shared/schemas`.
- Completed: Stage 2 (fourteenth slice) — updated the add-content feature model layer to import schemas from `@synapse/shared/schemas`.
- Completed: Stage 2 (fifteenth slice) — updated the add-content feature UI to import schemas from `@synapse/shared/schemas`.
- Completed: Stage 2 (sixteenth slice) — updated Web foundation modules to import schemas from `@synapse/shared/schemas`.
- Completed: Stage 2 (seventeenth slice) — updated legacy modal orchestration to import schemas from `@synapse/shared/schemas`.
- Completed: Stage 2 (eighteenth slice) — migrated all remaining Web schema consumers and removed the compatibility adapter.
- Completed: Stage 2 (nineteenth slice) — migrated all plan consumers and removed the Web plans compatibility wrapper.
- Completed: Stage 2 (twentieth slice) — migrated the size-formatting consumer and removed the Web utility compatibility wrapper.
- Completed: Stage 2 (twenty-first slice) — migrated animation configuration consumers and removed the Web compatibility wrapper.
- Completed: Stage 2 (twenty-second slice) — migrated user-preference consumers and removed the Web compatibility wrapper.
- Completed: Stage 2 (twenty-third slice) — moved platform-neutral content-search text helpers into `@synapse/shared/content-search`.
- Completed: Stage 2 (twenty-fourth slice) — moved file-type detection constants and helpers into `@synapse/shared/file-types`.
- Completed: Stage 2 — all identified platform-neutral types, constants, schemas, and helper functions have moved into `@synapse/shared`.
- Completed: Stage 3 (first slice) — moved tag-title normalization and deduplication rules into `@synapse/core`.
- Completed: Stage 3 (second slice) — moved image and video content payload construction into `@synapse/core`.
- Completed: Stage 3 (third slice) — moved audio content payload construction into `@synapse/core`.
- Completed: Stage 3 (fourth slice) — migrated editor tag merging to the Core tag invariant.
- Completed: Stage 3 (fifth slice) — moved Content list-preview projection into `@synapse/core`.
- Completed: Stage 3 (sixth slice) — moved storage-record to Content-model mapping into `@synapse/core`.
- Completed: Stage 3 (seventh slice) — moved Content tag-relation attachment into `@synapse/core`.
- Completed: Stage 3 (eighth slice) — moved Content suggestion grouping into `@synapse/core`.
- Completed: Stage 3 (ninth slice) — moved tag-content preview grouping into `@synapse/core`.
- Completed: Stage 3 (tenth slice) — moved Content suggestion cursor rules into `@synapse/core`.
- Completed: Stage 3 (eleventh slice) — moved tag-content page cursor rules into `@synapse/core`.
- Completed: Stage 3 (twelfth slice) — moved current User model mapping into `@synapse/core`.
- Completed: Stage 3 (thirteenth slice) — moved User preference merging into `@synapse/core`.
- Completed: Stage 3 (fourteenth slice) — moved owned Note-image reference extraction into `@synapse/core`.
- Completed: Stage 3 (fifteenth slice) — moved serialized media and audio Content-model parsing into `@synapse/core`.
- Completed: Stage 3 (sixteenth slice) — moved serialized link Content-model parsing into `@synapse/core`.
- Completed: Stage 4 (first slice) — moved Content list-query orchestration behind a Core repository port.
- Completed: Stage 4 (second slice) — moved Content suggestion-query orchestration behind a Core repository port.
- Completed: Stage 4 (third slice) — moved tag Content-preview query orchestration behind a Core repository port.
- Completed: Stage 4 (fourth slice) — moved paginated tag Content-preview query orchestration behind a Core repository port.
- Completed: Stage 4 (fifth slice) — moved available Content-type normalization behind a Core repository port.
- Completed: Stage 4 (sixth slice) — moved normalized tag-title resolution and creation behind a Core repository port.
- Completed: Stage 4 (seventh slice) — moved Content↔tag relation writes, tag-node creation for newly resolved tags, and Content persistence deletion ordering behind Core repository ports.
- Completed: Stage 3 — all existing platform-neutral Content, Note, and User model rules are owned by `@synapse/core`; the product has no Collection model to migrate.
- Completed: Stage 4 — all existing platform-neutral Content service operations have moved to `@synapse/core`. The product has no `SearchService` or `CollectionService` implementation to migrate.
- Completed: Stage 5 — Core provider contracts are explicit and platform-neutral; Web retains the concrete persistence, graph, object-storage, and future-sync implementations.
- Completed: Stage 6 — Web is wired through named Core Content/graph and storage provider adapters without changing transaction, cache, API-validation, or file-policy boundaries.
- Remaining: stages 7–9, in the documented order.

## Decisions

### Stage 1 placeholders expose only their package root

Each new package exposes `.` through `src/index.ts`, which is intentionally empty. This establishes stable package names without moving or duplicating implementation before its assigned migration stage. Deep exports were not added because their future module boundaries are not known yet.

### Core TypeScript configuration is platform-neutral

`@synapse/core` extends the shared base config but explicitly targets ES2022 with only the ES2022 library. This prevents DOM, Node, Electron, and browser APIs from becoming available by default. The same minimal configuration is used for the other empty non-UI packages until their responsibilities are introduced.

### Existing web application remains in place

Stage 1 did not move any implementation from `apps/web`; keeping it untouched preserved existing behavior while the workspace boundaries were introduced.

### Domain schemas belong to `@synapse/shared`

The former Web schema module has been moved to `@synapse/shared/schemas`. It only imports Zod and uses no platform APIs, so it can be shared by web, desktop, and backend. All Web consumers now import the package directly, and the temporary re-export has been removed.

### Content-type filter logic is shared; presentation remains Web-specific

The document-type expansion and filter-availability helpers moved to `@synapse/shared/content-types`. The Web module retains its Lucide icons, Russian fallback strings, and i18n keys because those are presentation concerns and must not enter a platform-neutral package.

### Tag-color values are shared; visual adapters remain Web-specific

The palette and numeric index lookup moved to `@synapse/shared/tag-colors`; both are plain data and platform-neutral. The Web module retains React `CSSProperties` creation and Pixi color conversion, which are rendering concerns.

### User-preference normalization is shared; browser persistence remains Web-specific

User-preference types, defaults, and validation moved to `@synapse/shared/preferences`. The React context remains in Web because it applies preferences through `window`, `document`, and `localStorage`.

### Plan definitions are shared across Web and server

Plan identifiers, quota limits, display metadata, and validation moved to `@synapse/shared/plans`. They are plain product data used by both the Web settings UI and server-side authorization and usage code; no platform API is involved.

### Value formatting is platform-neutral

The byte-size formatter moved to `@synapse/shared/formatting`. It uses only standard number formatting and accepts the locale as an argument, so the caller retains control of presentation language without introducing a platform dependency.

### Animation configuration is shared; rendering remains Web-specific

The sidebar transition values moved to `@synapse/shared/animations`. They are serializable data and can be reused by another client, while the Web components continue to choose and execute their rendering library.

### Content-search text extraction is shared

The search-text builder and structured-content text extractor moved to `@synapse/shared/content-search`. They only process strings and JSON, so the server services and future platforms can use them without a platform dependency.

### File-type detection is shared; binary parsing remains server-specific

Supported file-type constants and filename/MIME detection moved to `@synapse/shared/file-types`. The server parser retains `Buffer` handling and third-party document parsers, which are platform-specific implementation details.

### Tag-title rules are the first Core model boundary

Case-insensitive tag identity and preservation of the trimmed display title now live in `@synapse/core`. Content creation, uploads, and the Web tag inputs share the same domain rule, while persistence and UI state remain in Web.

### Content payload construction belongs to Core

Image and video upload handlers now receive their serialized Content payloads from `@synapse/core`. FFmpeg, image analysis, object storage, and audio metadata remain Web/server adapters; audio payload construction stays there until its external metadata dependency is represented by a platform-neutral input.

### Serialized Content models belong to Core

Core now owns the platform-neutral media, audio, and link model interfaces and their safe parsing. Web renderers and server cleanup code consume Core directly; Zod API schemas remain in `@synapse/shared`.

### Audio payload construction accepts a Core-owned metadata projection

The audio Content payload builder now accepts only the metadata fields it needs, expressed as a platform-neutral structural input. The Web upload adapter still reads files with `music-metadata` and processes artwork, while Core owns the resulting Content representation.

### Content list previews are Core projections

List-preview normalization for notes, links, media, and document content now lives in `@synapse/core`. The Web service still selects database rows and supplies user context, but it no longer owns the platform-neutral transformation into preview content.

### Content record mapping is Core-owned

The pure mapping from a storage record to the Content model now lives in `@synapse/core`. Web continues to fetch records and attach relation data, while Core supplies the common model shape and preview transformation.

### Content tag attachment is Core-owned

Web repositories still load tag relations, but Core now deterministically merges those relations into Content models. This keeps relation retrieval platform-specific while preserving one domain representation for consumers.

### Note image ownership recognition is Core-owned

Core now traverses serialized Note documents to identify only image object paths under the current user's namespace. Uploading, deletion, object metadata, and URL creation remain Web storage-adapter responsibilities.

### Content list queries use a Core repository port

The search, tag-filter, list-preview, relation-attachment, and cursor orchestration for Content lists now runs in Core through a structural repository port. The Web service supplies the existing Drizzle repository methods and retains API response validation.

### Content suggestions use a Core repository port

Core now prioritizes tags, paginates matching Content, attaches tag relations, and groups the suggestions. Web supplies the existing query implementations and validates the response shape at its API boundary.

### Tag Content previews use a Core repository port

Core now deduplicates preview rows, attaches tag relations, and builds per-tag preview groups. Web retains cache ownership and adapts the existing SQL query.

### Paginated tag Content previews use a Core repository port

Core now combines tag-page cursor handling with the existing per-tag preview orchestration. Web still supplies the SQL queries, and no cache policy or API shape changed.

### Available Content types use a Core repository port

Core now validates the values returned by the available-type query. Web retains cache ownership and supplies the existing SQL query result.

### Tag-title resolution uses a Core repository port

Core now deduplicates normalized tag titles, resolves existing tag IDs, and determines missing titles through a repository port. Web retains tag color policy, SQL conflict handling, and graph-node creation, while both the Content and upload services share the same domain workflow.

### Content tag-relation mutations and deletion ordering use Core repository ports

Core now owns the ordering for appending or replacing Content↔tag relations, including graph-edge management, and for removing those relations, the Content graph node, and persistence records. It also creates graph nodes only for tags newly created during title resolution. Web supplies transactional Drizzle operations, authorization, tag-color policy, cache invalidation, and file cleanup. This preserves the existing transaction and side-effect boundaries while making the domain sequence reusable by desktop and backend adapters.

### Provider contracts are explicit Core boundaries

`ContentRepository` now composes the existing focused Content-query ports with Content relation and deletion persistence. `GraphProvider` owns graph-node and graph-edge persistence, while `StorageProvider` represents object put/read-metadata/delete/URL operations without prescribing validation or naming policy. `SyncProvider` defines publication of serializable entity changes for the later synchronization stage. Existing Stage 4 ports are retained as narrow compositions of these contracts, so Core operations stay minimally dependent and Web implementation code remains in `apps/web`.

### Web uses named adapters for Core workflows

`WebCoreContentProvider` maps the existing Web Content repository to the Core Content, graph, and tag-title ports. It is constructed with a transaction-scoped repository for mutations, preserving the original transaction boundary. `WebStorageProvider` maps Core's storage port to MinIO and is used for Content media/audio cleanup; MinIO's validation, naming, and public URL policy stay in the adapter. Core workflows no longer receive anonymous Web adapter objects from `ContentService`.

### Content suggestion grouping is Core-owned

Web still retrieves and paginates suggestion candidates, while Core groups the resulting Content models by their prioritized tags. This keeps ranking queries in Web and the returned model shape platform-neutral.

### Server code imports schemas from the shared package directly

All existing server-side schema consumers now import `@synapse/shared/schemas` directly. The Web compatibility adapter remains only for client-side and shared Web callers; removing it requires migrating those consumers in smaller cohesive groups.

### Item renderers import schemas from the shared package directly

The Web item renderer components now import their content types and parsing helpers from `@synapse/shared/schemas`. Other client callers still use the compatibility adapter and will be migrated by feature cluster.

### Content-list components import schemas from the shared package directly

The Web filter, grid, masonry, and suggestion components now import their content type from `@synapse/shared/schemas`. The compatibility adapter remains for unrelated feature clusters.

### Dashboard route components import schemas from the shared package directly

The main dashboard, tag, tags, and graph route components now import their content type from `@synapse/shared/schemas`. The remaining compatibility-adapter consumers are isolated to other Web feature and modal clusters.

### Viewer modal components import schemas from the shared package directly

The unified viewer and its detail panel now import their content types and parsing helpers from `@synapse/shared/schemas`. The compatibility adapter remains for editor, add-content, and other independent Web clusters.

### Legacy modal editor forms import schemas from the shared package directly

The legacy modal's audio, document, link, media, note, todo, and content-type forms now import content types directly from `@synapse/shared/schemas`. The modal's orchestration layer and unrelated feature components are intentionally left for later slices.

### Add-content feature model imports schemas from the shared package directly

The add-content context, types, and form/upload/submission hooks now import content types from `@synapse/shared/schemas`. The feature's dialog and UI components remain a separate migration slice.

### Add-content feature UI imports schemas from the shared package directly

The add-content dialog, type selector, and tag input now import content types from `@synapse/shared/schemas`. The feature no longer relies on the Web schema compatibility adapter.

### Web foundation modules import schemas from the shared package directly

The Web API contracts, content-type options, upload normalization, and dashboard context now import schema types and values from `@synapse/shared/schemas`. Their platform-specific behavior remains unchanged.

### Legacy modal orchestration imports schemas from the shared package directly

The legacy modal context and add-content modal now import content types from `@synapse/shared/schemas`. This completes the direct schema-import migration for the legacy modal cluster.

### Plan consumers import from the shared package directly

All Web and server plan consumers now import from `@synapse/shared/plans`. The temporary `apps/web/src/shared/config/plans.ts` re-export has been removed.

## Known limitations

- `apps/desktop` and `apps/backend` are directory placeholders, not runnable applications. Their setup belongs to stages 7 and 8.
- The web server is still co-located with the web application. It must remain there until the migration order reaches the backend stage.
- Content persistence, graph storage, cache ownership, and file cleanup remain implemented by Web adapters. Their Core integration is complete for the existing Content service; other Web services are intentionally out of scope because they do not implement a migrated Core workflow.
- Existing UI and TypeScript packages were already present and have not been reorganized as part of this task.
- No Collection domain model or persistence exists in the current product. Stage 3 therefore migrates the complete set of existing domain models without inventing a feature solely to match the target architecture.

## Next recommended tasks

1. Start Stage 7 by preparing the Desktop application structure and its local persistence adapter without moving Backend responsibilities.
2. Keep Web-specific note-image processing, cache ownership, API validation, and MinIO file policy in `apps/web`.

## Platform boundaries

| Module              | Boundary | Current contents                                                                                                                                                                                                                |
| ------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web`          | Web      | Existing browser and co-located server implementation; Core Content/graph and storage adapters                                                                                                                                  |
| `apps/desktop`      | Desktop  | Empty placeholder                                                                                                                                                                                                               |
| `apps/backend`      | Backend  | Empty placeholder                                                                                                                                                                                                               |
| `packages/core`     | Core     | Content, graph, storage, and sync provider contracts; tag identity/title resolution; Content relation/deletion and query orchestration; serialized Content payloads/projections; User mapping/preferences; Note image ownership |
| `packages/ui`       | Shared   | Existing React UI library                                                                                                                                                                                                       |
| `packages/features` | Shared   | Empty public entry point                                                                                                                                                                                                        |
| `packages/api`      | Shared   | Empty public entry point                                                                                                                                                                                                        |
| `packages/shared`   | Shared   | Domain schemas, preferences, plans, formatting, animation config, content-type filtering, tag colors, parsing helpers, and public exports                                                                                       |
| `packages/sync`     | Shared   | Empty public entry point                                                                                                                                                                                                        |
