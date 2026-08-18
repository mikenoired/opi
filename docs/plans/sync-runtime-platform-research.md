# Sync runtime: platform constraints for bug triage

Research date: 2026-08-18. Sources below are specifications or official
platform documentation. This note constrains the implementation described in
`sync-protocol-design.md`; it does not change the protocol's source of truth:
the durable server journal.

## Browser EventSource / SSE

- The native [`EventSource` interface](https://html.spec.whatwg.org/multipage/server-sent-events.html#the-eventsource-interface)
  accepts a URL and only `withCredentials`; it has no arbitrary-header option.
  `withCredentials: true` uses Fetch credentials mode `include`. Browser SSE
  may therefore use same-site cookie authentication, but cannot use a bearer
  header. A desktop/browser flow needing header auth must use a fetch-stream
  adapter or a short-lived, audience-scoped stream ticket—never a long-lived
  token in the URL.
- The [processing model](https://html.spec.whatwg.org/multipage/server-sent-events.html#processing-model)
  reconnects normal network/end-of-body failures; `retry:` can set the delay
  and user agents may apply further backoff. A non-200 response or wrong
  content type is fatal. A client must surface the `CLOSED` state and renew a
  ticket/session rather than assuming retries are infinite.
- A server-emitted `id:` causes reconnect requests to include
  [`Last-Event-ID`](https://html.spec.whatwg.org/multipage/server-sent-events.html#the-last-event-id-header).
  It is useful observability only here: every hint must still lead to
  `pull(afterCursor)`, because an SSE connection can be opened late, broken,
  duplicated, or unavailable. Emit regular SSE comments/heartbeats for
  intermediary timeout resilience, as the [authoring guidance](https://html.spec.whatwg.org/multipage/server-sent-events.html#authoring-notes)
  recommends.

## Electron / Node transport

- Electron renderer code has browser APIs, while the privileged main process
  has Node APIs; Electron documents this split in its
  [process model](https://www.electronjs.org/docs/latest/tutorial/process-model).
  A renderer can use browser/cookie EventSource. The current Desktop sync path
  lives in the main process, so it needs a header-capable streaming adapter.
- Node's official [`EventSource`](https://nodejs.org/api/globals.html#class-eventsource)
  was introduced in Node 20.18/22.3 and is Stability 1 behind
  `--experimental-eventsource`; do not depend on it as the Desktop main-process
  transport. Electron's [`net`](https://www.electronjs.org/docs/latest/api/net)
  module is available in the main process after `app.ready`, uses Chromium's
  networking stack, and supports HTTP requests. A fetch/readable-stream parser
  backed by that capability (or an explicitly supported SSE client) is the
  suitable adapter seam.

## IndexedDB replica and outbox

- A single `readwrite` transaction covering `replica`, `outbox`, `conflicts`,
  and `meta` makes applying entity changes and advancing the applied cursor
  atomic. The [IndexedDB transaction scheduling rules](https://www.w3.org/TR/IndexedDB-3/#transaction-scheduling)
  serialize overlapping read/write transactions, and a transaction's
  [`complete`](https://www.w3.org/TR/IndexedDB-3/#transaction-commit) event
  fires only after it committed. Do not update React state or acknowledge an
  outbox item as durable before that event.
- Transactions are short-lived and can become inactive after returning to the
  event loop. Do not perform network I/O or arbitrary `await`s inside one;
  fetch first, then synchronously queue all IDB requests in one transaction.
- The [durability option](https://www.w3.org/TR/IndexedDB-3/#transaction-durability)
  offers `strict`, `relaxed`, and default modes. `strict` is an availability-
  dependent _hint_ that improves confidence after power loss, not a distributed
  commit guarantee. Prefer it for cursor/outbox commits when supported; handle
  quota, blocked upgrade, and transaction-abort errors visibly. Never silently
  fall back to in-memory state, which would turn a restart into data loss.

## PostgreSQL LISTEN / NOTIFY

- [`LISTEN`](https://www.postgresql.org/docs/current/sql-listen.html) is
  session-bound: registrations clear at session end and take effect only at
  transaction commit. Every lifecycle reconnect therefore needs a dedicated
  connection, a committed `LISTEN`, and explicit cleanup.
- PostgreSQL documents a first-subscription race: commit `LISTEN`, then read
  the durable state, then rely on notifications. Sync runtime must implement
  `subscribe → pull to a stable watermark → process buffered/new hints`; a
  duplicate hint is harmless, but relying on notification history is wrong.
- [`NOTIFY`](https://www.postgresql.org/docs/current/sql-notify.html) inside a
  transaction is delivered only after commit. Identical channel/payload pairs
  in one transaction may be folded, while different transactions are delivered
  in commit order. It is consequently correct only as a cursor hint, never as
  an entity-change transport. Keep transactions short and payloads bounded;
  the docs specify a default payload limit below 8000 bytes.

## Triage implications and required probes

Classify a reported sync failure before patching it:

1. **Hint-only failure:** disconnect, reconnect, duplicate or missing SSE / PG
   notification. Reproduce with the transport disabled; a subsequent pull must
   converge, and the UI needs status/retry feedback instead of permanent stale
   data.
2. **Durability failure:** refresh/crash during apply or queued mutation. Assert
   one IndexedDB transaction changes replica + cursor and one durable outbox
   record survives until the server receipt is acknowledged.
3. **Subscription-race failure:** change occurs while client/listener starts.
   Assert subscribe-first then pull catches it; do not attempt to repair it with
   `Last-Event-ID` alone.
4. **Auth/lifecycle failure:** cookie EventSource works only where credentials
   and CORS/session policy allow it; Desktop main-process streaming must use
   its header-capable adapter and must stop/restart on login, logout, sleep and
   wake.
5. **Notifier failure:** an instance restart loses its LISTEN registration, not
   journal data. Reconnect the listener and pull; never retry the committed
   mutation merely because `pg_notify` or SSE fan-out failed.

These probes should be deterministic integration/E2E tests before fixing UX
symptoms, so each defect is recorded as a reproducible lifecycle boundary.
