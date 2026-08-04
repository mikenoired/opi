# API

## Target style and transport

- Primary API: typed Hono RPC at `/api`. `Api` is exported from the server and consumed through `hc<Api>`; request and response types therefore stay synchronized without code generation.
- Inputs are validated by Zod at the HTTP boundary. Errors have a stable `{ error, code, fieldErrors }` shape.
- TanStack Query owns client cache and request lifecycle. Browser requests include cookies.
- `apps/backend/src/index.ts` is a Bun HTTP server; run it locally with `bun --filter @synapse/backend dev`.
- The OpenAPI 3.1 document is available at `/api/openapi.json`; the interactive Scalar reference is at `/api/docs`.
- During local Vite development, `/api` is proxied to `http://localhost:3000` by default. Set `VITE_API_URL=http://localhost:3000/api` when serving Web and Backend from separate origins in another environment.
- Set `CORS_ORIGIN=http://localhost:5173` (or a comma-separated allowlist) for credentialed browser requests to a separate API origin.

## Hono resources

| Resource  | Endpoints                                                                      |
| --------- | ------------------------------------------------------------------------------ |
| `auth`    | `POST /auth/register`, `/login`, `/refresh`, `/logout`                         |
| `content` | `GET/POST /content`, `GET/PATCH/DELETE /content/:id`, tag and import endpoints |
| `upload`  | `POST /upload`                                                                 |
| `graph`   | `GET /graph`                                                                   |
| `user`    | `GET /user`, `/user/storage`, `GET/PATCH /user/preferences`                    |
| `ai`      | `GET /ai/usage`, `POST /ai/tags`                                               |

## Authentication and authorization

- Credentials use bcrypt password hashes. Auth endpoints issue signed access and refresh JWTs.
- Cookies: `synapse_token` access token (one day) and `synapse_refresh_token` refresh token (seven days); both are `httpOnly`, `sameSite=strict`, and secure in production.
- Context accepts bearer token, middleware-forwarded token, or session cookies. Protected Hono routes require a resolved user.
- Repositories enforce the user boundary on data access. The file route additionally verifies the MinIO path's user segment before issuing a presigned redirect.

## Request protection

- All endpoints receive Redis-backed limits: query and mutation limits are independently configurable with `API_RATE_*` environment variables.
- Production mutations reject a supplied `Origin` whose host differs from `Host`.
- AI tag generation has a stricter dedicated per-identity Redis limit (`AI_TAG_RATE_*`).

## REST-like Next route handlers

- `/api/session`: browser session-cookie creation/deletion.
- `/api/user`: current authenticated user.
- `/api/files/[...path]`: authorized MinIO asset retrieval through an HTTP redirect.
- `/api/parse-link`: authenticated remote HTML fetch and metadata/content extraction. It allows only `text/html` responses and has a 10-second fetch timeout.

## External integrations

- **PostgreSQL**: application data and Russian full-text search.
- **Redis**: caching, rate limits, storage accounting.
- **MinIO/S3**: private media/object storage and presigned URL creation.
- **Z.ai API**: current LLM provider for structured tag suggestions and image vision. The provider interface is intentionally extensible.
- **FFmpeg/Sharp and document libraries**: server-side ingestion, metadata extraction, thumbnails, and derivative image processing.
