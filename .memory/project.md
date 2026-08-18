# Project

## Purpose

Monolyth is a private personal archive for notes, links, documents, media, audio, and todos. It organizes content with per-user tags, search, a visual relationship graph, and optional AI-generated tag suggestions.

## Stable stack

- Bun workspace monorepo; TypeScript/React Vite web application.
- Hono + Zod + TanStack React Query.
- PostgreSQL/Drizzle, Redis, and MinIO.
- Shared `@monolyth/ui` component package; optional Z.ai LLM provider.

## Stable architecture

- TanStack Router UI → Hono HTTP API → services → repositories → infrastructure.
- Content is a unified typed record with serialized type-specific payloads; files are held in MinIO.
- Tags have relational and graph-projection representations; search text/vector is derived from content/title/tags.

## Major modules

- `apps/web`: product application and server APIs.
- `packages/ui`: shared UI primitives.
- `apps/search-engine`: offline search-quality evaluation harness.
