# Synapse Migration Wiki

## Current architecture

- The repository is a Bun workspace with `apps/*` and `packages/*` workspaces.
- `apps/web` remains the only implemented application and retains all existing product code.
- `apps/desktop` and `apps/backend` are empty workspace placeholders; no platform code has moved into them.
- `packages/ui` and `packages/tsconfig` predate this migration task.
- `packages/core`, `packages/features`, `packages/api`, and `packages/sync` have only a package manifest, a platform-neutral TypeScript configuration, and an empty public entry point.
- `packages/shared` owns the platform-neutral domain schemas and types; Web retains a compatibility re-export at `src/shared/lib/schemas.ts`.
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
- In progress: none.
- Remaining: stages 2–9, in the documented order.

## Decisions

### Stage 1 placeholders expose only their package root

Each new package exposes `.` through `src/index.ts`, which is intentionally empty. This establishes stable package names without moving or duplicating implementation before its assigned migration stage. Deep exports were not added because their future module boundaries are not known yet.

### Core TypeScript configuration is platform-neutral

`@synapse/core` extends the shared base config but explicitly targets ES2022 with only the ES2022 library. This prevents DOM, Node, Electron, and browser APIs from becoming available by default. The same minimal configuration is used for the other empty non-UI packages until their responsibilities are introduced.

### Existing web application remains in place

Stage 1 did not move any implementation from `apps/web`; keeping it untouched preserved existing behavior while the workspace boundaries were introduced.

### Domain schemas belong to `@synapse/shared`

The former Web schema module has been moved to `@synapse/shared/schemas`. It only imports Zod and uses no platform APIs, so it can be shared by web, desktop, and backend. A Web re-export remains temporarily to avoid a mass import rewrite; future slices should replace callers incrementally with the package import and remove the adapter once none remain.

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

### Server code imports schemas from the shared package directly

All existing server-side schema consumers now import `@synapse/shared/schemas` directly. The Web compatibility adapter remains only for client-side and shared Web callers; removing it requires migrating those consumers in smaller cohesive groups.

## Known limitations

- `apps/desktop` and `apps/backend` are directory placeholders, not runnable applications. Their setup belongs to stages 7 and 8.
- The web server is still co-located with the web application. It must remain there until the migration order reaches the backend stage.
- Existing UI and TypeScript packages were already present and have not been reorganized as part of this task.

## Next recommended tasks

1. Replace a cohesive client-side group of Web schema imports with `@synapse/shared/schemas`, then remove the compatibility adapter once all callers have migrated.
2. Inventory another pure Stage 2 utility for migration; retain code using browser APIs or rendering libraries in Web.

## Platform boundaries

| Module              | Boundary | Current contents                                                                                                                          |
| ------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web`          | Web      | Existing browser and co-located server implementation                                                                                     |
| `apps/desktop`      | Desktop  | Empty placeholder                                                                                                                         |
| `apps/backend`      | Backend  | Empty placeholder                                                                                                                         |
| `packages/core`     | Core     | Empty public entry point; platform-neutral TypeScript config                                                                              |
| `packages/ui`       | Shared   | Existing React UI library                                                                                                                 |
| `packages/features` | Shared   | Empty public entry point                                                                                                                  |
| `packages/api`      | Shared   | Empty public entry point                                                                                                                  |
| `packages/shared`   | Shared   | Domain schemas, preferences, plans, formatting, animation config, content-type filtering, tag colors, parsing helpers, and public exports |
| `packages/sync`     | Shared   | Empty public entry point                                                                                                                  |
