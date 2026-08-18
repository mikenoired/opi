# Architecture

## System shape

- **Monolyth** is a private, multi-user personal archive for notes, links, documents, media, audio, and todos. It adds tag-based organization, a content/tag graph, full-text search, and optional AI tag suggestions.
- Bun workspace monorepo:
  - `apps/web`: browser application.
  - `apps/backend`: Bun/Hono API application.
  - `packages/ui`: reusable React UI primitives.
  - `packages/tsconfig`: shared TypeScript configurations.
  - `apps/search-engine`: standalone Python evaluation harness; it is not part of the runtime application.
- Runtime infrastructure: PostgreSQL 15, Redis 7, and MinIO. Docker Compose defines the local infrastructure; no production deployment definition is committed.

## Technology stack

- TypeScript, Bun 1.3.14+, React 19, Vite, and TanStack Router.
- Hono with Zod validation and Hono RPC type contracts.
- Drizzle ORM over `postgres` for PostgreSQL.
- TanStack React Query for client server-state; Next Themes and dedicated React contexts for client UI state.
- Tailwind CSS, Base UI, Framer Motion, Tiptap editor.
- MinIO/S3-compatible object storage for uploaded binary assets; Sharp and FFmpeg-dependent handlers create media derivatives.
- Redis provides cache, storage-usage counters, and rate limiting.
- Optional Z.ai-compatible LLM integration for tag suggestions.

## Project layout and dependency flow

```text
apps/web/src/client    TanStack Router entry and route composition
apps/web/src/app       Reusable page/view components during the SPA transition
apps/web/src/features  User-facing use cases and feature-local state/UI
apps/web/src/entities  Reusable domain presentation components
apps/web/src/widgets   Composite UI blocks (sidebar, dialogs, viewers, editor)
apps/web/src/shared    Cross-cutting client code, schemas, config, design tokens
apps/backend/src       Hono API, services, repositories, DB, integrations, parsers
packages/ui            Framework-agnostic shared component library
```

- Client UI depends on `features`, `entities`, `widgets`, `shared`, and `@monolyth/ui`.
- Client-to-server calls use typed Hono contracts and TanStack Query.
- Server flow is **Hono route → service → repository → database/infrastructure**. Routes own transport validation; services own workflows; repositories own persistence and enforce ownership queries.
- Shared Zod schemas in `@monolyth/shared/schemas` define the principal client/server content contracts.
- Do not introduce Backend imports into client components except the type-only public API contracts. Keep infrastructure access inside `apps/backend`.

## Request and rendering lifecycle

1. Vite serves the React SPA and TanStack Router renders the landing page and `/dashboard` route tree.
2. The router root composes auth, React Query, theme, modal, and toast providers.
3. Browser requests go to Hono under `/api`; request context resolves the authenticated user from bearer tokens or cookies.
4. Hono applies CSRF origin checking for production mutations and Redis-backed query/mutation limits. Protected routes require an authenticated context.
5. Bun serves Hono from the Backend application; Vite serves the SPA separately and proxies `/api` during local development.
6. Services execute domain work, including database transactions where content, tags, and graph records must remain aligned. Repositories scope persisted records by `userId`.
7. React Query caches results client-side; its default query stale time is one minute.

## Storage and deployment model

- PostgreSQL holds users, archive metadata/content payloads, tags, graph data, and AI usage records.
- MinIO holds user-namespaced uploaded media, document images, and note images. `/api/files/[...path]` authorizes the requester then redirects to a one-hour presigned MinIO URL.
- Redis is an operational store, not the source of truth for archive records. It stores cache values, rate-limit windows, and derived user storage counters.
- Local startup uses `docker compose up -d`, then runs the Backend Drizzle schema push plus the tag-merge and search-backfill scripts. Backend and Web run independently via their workspace `dev` commands.

## Boundaries worth preserving

- Content's `content` field is a type-dependent serialized payload; parsers/format-specific helpers interpret it rather than adding per-type database tables.
- Content-to-tag relationships are mirrored into the graph projection. Preserve both representations together in content-service transactions.
- Binary file delivery is gated through the application route; do not expose unrestricted MinIO object URLs.

## Frontend and API runtime

- The application is a Vite-built React SPA. TanStack Router owns `/`, `/dashboard`, `/dashboard/tags`, `/dashboard/tag/:id`, and `/dashboard/graph`.
- TanStack Query owns asynchronous server state; it talks to the Hono API at `/api` with cookie credentials.
- Bun starts the Backend API. Deploy `apps/web/dist` through a separate static host and configure its `VITE_API_URL` to the Backend API origin.
- Hono `Api` is the type authority for HTTP RPC. Zod validates inputs at the boundary; client code derives its contracts through the Hono client and query hooks.
