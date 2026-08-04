# Synapse Migration Wiki

## Current architecture

- The repository is a Bun workspace with `apps/*` and `packages/*` workspaces.
- `apps/web` remains the only implemented application and retains all existing product code.
- `apps/desktop` and `apps/backend` are empty workspace placeholders; no platform code has moved into them.
- `packages/ui` and `packages/tsconfig` predate this migration task.
- `packages/core`, `packages/features`, `packages/api`, and `packages/sync` have only a package manifest, a platform-neutral TypeScript configuration, and an empty public entry point.
- `packages/shared` owns the platform-neutral domain schemas and types; Web retains a compatibility re-export at `src/shared/lib/schemas.ts`.

## Migration progress

- Completed: Stage 1 — monorepo structure and package export boundaries.
- Completed: Stage 2 (first slice) — moved platform-neutral schemas, types, and parsing helpers into `@synapse/shared`.
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

## Known limitations

- `apps/desktop` and `apps/backend` are directory placeholders, not runnable applications. Their setup belongs to stages 7 and 8.
- The web server is still co-located with the web application. It must remain there until the migration order reaches the backend stage.
- Existing UI and TypeScript packages were already present and have not been reorganized as part of this task.

## Next recommended tasks

1. Move another small, pure Stage 2 module (for example content-type constants after separating UI icon metadata from its data) into `@synapse/shared`.
2. Replace a cohesive set of Web schema imports with `@synapse/shared/schemas`, then remove the compatibility adapter once all callers have migrated.

## Platform boundaries

| Module              | Boundary | Current contents                                             |
| ------------------- | -------- | ------------------------------------------------------------ |
| `apps/web`          | Web      | Existing browser and co-located server implementation        |
| `apps/desktop`      | Desktop  | Empty placeholder                                            |
| `apps/backend`      | Backend  | Empty placeholder                                            |
| `packages/core`     | Core     | Empty public entry point; platform-neutral TypeScript config |
| `packages/ui`       | Shared   | Existing React UI library                                    |
| `packages/features` | Shared   | Empty public entry point                                     |
| `packages/api`      | Shared   | Empty public entry point                                     |
| `packages/shared`   | Shared   | Domain schemas, types, parsing helpers, and public exports   |
| `packages/sync`     | Shared   | Empty public entry point                                     |
