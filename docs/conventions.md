# Conventions

## Code organization

- Follow the existing feature-oriented client layout: `features` for user actions, `entities` for reusable domain presentation, `widgets` for composed UI, and `shared` for cross-cutting code.
- Keep database/infrastructure operations in `apps/backend/src/server`. Use the server layering: **HTTP handler → service → repository**.
- HTTP handlers validate transport input and instantiate services; services coordinate workflows and transactions; repositories contain persistence queries and authorization-scoped lookup logic.
- Put reusable UI primitives in `packages/ui`, export them through its documented public entry points, and use app-local UI only when it is not a shared primitive.
- Use the `@/*` alias for `apps/web/src` imports. Imports are automatically sorted by Oxfmt.

## Type, schema, and naming rules

- TypeScript is strict. Prefer inferred types from Zod and Drizzle instead of duplicating request/persistence shapes.
- Define cross-boundary content contracts in `shared/lib/schemas.ts`; validate data at HTTP boundaries and before returning content DTOs.
- Database columns are snake_case; TypeScript schema fields are camelCase. API content DTOs retain the established snake_case fields (for example, `user_id`, `tag_ids`, `thumbnail_base64`). Do not casually normalize one side without updating contracts.
- Files/classes use kebab-case filenames and PascalCase class names. Services and repositories are default-exported classes.
- The app UI defaults to Russian (`<html lang="ru">`) but supports `ru`/`en` user interface preferences. Keep user-facing wording translatable through the existing locale structure.

## State and rendering

- Use HTTP query hooks + TanStack React Query for remote server state. Query defaults intentionally favor low refetch frequency (one-minute stale time, no focus/mount refetch, one retry).
- Use existing React contexts for auth, user preferences, dashboard/filter state, and modals; do not add a global state library for feature-local state.
- Keep browser-only logic inside client components and preserve route/component boundaries.

## Errors, security, and observability

- Use `ApiError` for expected API errors; preserve its code. Zod validation errors are formatted centrally.
- Authenticated resource access must be ownership-scoped inside repositories or route handlers, not merely by a client-provided ID.
- Use the authenticated HTTP middleware for archive data. Do not bypass the middleware-provided JWT/session path.
- Production console output is removed except `console.warn` and `console.error`; the linter warns on console usage. Use the AI logger where structured AI diagnostics are needed.
- Maintain rate limits and CSRF origin checks when adding endpoints, especially token- or cost-consuming mutations.

## Persistence and side effects

- Use a database transaction when a change spans content, tags, graph records, or search-text derivation.
- Content payload is type-dependent serialized data. Use `parseMediaJson`, `parseAudioJson`, link schemas, and content search helpers rather than ad hoc JSON assumptions.
- Object storage side effects must stay aligned with content lifecycle: clean up owned MinIO assets after deletion and clean newly uploaded note assets on failed writes.
- Redis storage counters are derived operational data. Do not treat them as the canonical source for file ownership or content existence.

## Formatting, quality, and tests

- Formatting: Oxfmt, tabs, 110-character width, double quotes, semicolons, trailing ES5 commas.
- Lint: Oxlint with TypeScript, React, Unicorn, and OXC plugins; warnings are denied by scripts.
- Run the root `bun run check` before handoff when practical. It runs lint, format check, typecheck, and web tests.
- Tests use Bun and currently concentrate on server services/libraries plus editor input. Add focused tests adjacent to server behavior changes (`*.test.ts`).
