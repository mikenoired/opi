# Sync protocol design

## Current-state audit (phase 0)

- `packages/sync` only defines an in-process `SyncSubscriber`; it has no protocol, durable replica, outbox, or engine.
- `packages/api` exposes content-only `SyncMutation`, `SyncRemoteChange`, pull, and push contracts. Its cursor is described as opaque but is currently an integer journal id and is not carried in a change.
- `ContentService` performs correct content/tag/graph/search transactions, then emits a process-local `SyncProvider` event. Create/update/delete, imports and upload paths do not append a canonical journal change in that same transaction.
- `DurableSyncService` calls `reconcileSnapshot()` from pull, then separately applies a domain write, records a journal row, and saves a receipt. This permits a crash between writes, races concurrent duplicate mutations, and makes read-side reconciliation the primary source of changes.
- `SyncJournalService` models only Content, generates entity versions by a non-locking read/increment/write, has no retention/reset marker, and uses an unbounded bigint cursor. `BackendSyncProvider` is process-local, so SSE misses writes from another API process and after restart.
- Desktop has a JSON-backed `LocalLibraryRepository` with durable content outbox, local tombstones, cursor and conflict-copy behavior. `DesktopSyncService` runs pull/push on demand, manually hydrates media and separately reconciles tag colors. It has no lifecycle realtime subscription.
- Web opens an authenticated cookie-based `EventSource` and invalidates React Query caches on a process-local SSE event. It neither persists a replica/outbox nor pulls the journal after a hint; a reload/ordinary refetch is therefore still required for a reliable state transition.
- Binary media is already fetched/uploaded via separate desktop paths. It must remain outside change payloads; only Content media metadata participates in sync.

## Protocol contract

PostgreSQL is the source of truth. A `cursor` is a global, strictly ordered, opaque journal position (encoded as a versioned string and never numerically interpreted by clients). `entityVersion` is a separate monotonically increasing version of one `(user, entityType, entityId)`. `mutationId` is an idempotency key scoped to a user.

```ts
type SyncChange = {
	cursor: string;
	entityType: string;
	entityId: string;
	operation: "upsert" | "delete";
	entityVersion: number;
	mutationId?: string;
	payload?: unknown; // metadata only; no media bytes
};

type SyncMutation = {
	mutationId: string;
	entityType: string;
	entityId?: string;
	operation: "upsert" | "delete";
	baseEntityVersion?: number;
	payload?: unknown;
};

type PullResult =
	| { kind: "changes"; changes: SyncChange[]; cursor: string; hasMore: boolean }
	| { kind: "reset"; snapshot: SyncChange[]; cursor: string; resetReason: "cursor-expired" | "initial" };
```

`POST /sync/mutations` accepts ordered mutation batches and returns one durable receipt per mutation. `GET /sync/pull?afterCursor=` returns canonical changes after the supplied cursor, or an explicit reset. Incremental pages explicitly return `hasMore`; Sync Core drains pages to exhaustion in one run. The SSE endpoint emits only `{ cursor }` (optionally a user-scoped signed short-lived stream ticket if cookie auth cannot be used); the client always runs `pull(afterCursor)` before applying data. It never places a long-lived bearer token in a URL.

## Mutation coordinator and server transaction

The server coordinator owns one transaction per mutation:

1. atomically claim the `(userId, mutationId)` receipt row using a unique key; an existing finalized receipt is returned unchanged, while an in-progress claimant waits/returns a retryable result;
2. lock the entity state row (`FOR UPDATE`) and compare `baseEntityVersion`;
3. invoke the entity adapter's transaction-scoped domain write;
4. increment its entity version and append exactly one canonical journal change, capturing its global cursor;
5. finalize the receipt with the outcome and commit;
6. after commit, notify all API processes. Notification failure cannot roll back the committed change; clients catch up through pull.

This removes `reconcileSnapshot` as a write mechanism. Every Content create/update/delete, including imports and server-side uploads, goes through a Content adapter/coordinator path. Transactions keep Content, tag relations, graph projection, search projection, entity version, journal and receipt atomic. Object cleanup remains post-transaction as today; failure is operationally retried and never changes journal semantics.

## Schema, cursor and retention

Replace the current content-shaped tables with generic `sync_entity_versions`, `sync_journal`, and `sync_mutation_receipts` columns for `entity_type`, `entity_id`, `entity_version`, `operation`, payload, mutation id and timestamps. A `sync_journal_clock` singleton is locked and incremented in the same transaction as append; it produces the externally encoded cursor (`j:<id>`). A database `bigserial` cannot be the protocol cursor because sequence allocation does not establish commit order. Clients store cursors verbatim and never parse or increment them. Add a retention watermark table per user.

Retain journal rows for 30 days and at least the latest 100,000 changes per user (configured server-side). A pull cursor older than the retained watermark, invalid, or absent returns an explicit reset snapshot and cursor. Snapshot rows use each entity's current version and never include deleted entities. Pruning never removes entity-version rows or mutation receipts before their idempotency TTL (30 days); receipts may be retained longer safely.

For cross-process realtime, issue PostgreSQL `pg_notify` inside the committing transaction with only user/cursor data and have a dedicated LISTEN connection in each API process feed local SSE subscribers. It is an optimization, not persistence: loss, restart, duplicate delivery and ordering do not affect correctness because every notification triggers pull.

## Conflict matrix

| Mutation against current entity                   | Result                                                                                                                                          |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Create with a new client entity id                | Applied; server assigns version 1 and canonical cursor.                                                                                         |
| Same `mutationId`, any retry                      | Return stored receipt; no second domain write/change.                                                                                           |
| Update with matching `baseEntityVersion`          | Applied; entity version increments.                                                                                                             |
| Delete with matching `baseEntityVersion`          | Applied; tombstone version increments.                                                                                                          |
| Update with stale version                         | Conflict with canonical current entity/version; replica replaces authoritative entity and keeps optimistic local data as a local conflict copy. |
| Delete with stale version, remote already deleted | Applied idempotently with tombstone version.                                                                                                    |
| Delete with stale version, remote updated         | Conflict; server remains authoritative.                                                                                                         |
| Update after a tombstone                          | Conflict; no implicit resurrection. A user creates a new entity instead.                                                                        |

The order of successful mutations is the PostgreSQL transaction/journal order. There is no CRDT/OT and no last-client-clock-wins policy.

## Sync Core module

`SyncEngine` is the deep module and its interface is deliberately small: `start()`, `stop()`, `mutate(intent)`, and `syncNow()`. It owns pull-before-stream, ordered apply, deduplication, retries, durable outbox acknowledgement and conflict reconciliation.

Internal adapter seams are:

- `JournalApi`: `pull(afterCursor)`, `push(mutations)`;
- `RealtimeTransport`: `connect(onHint)` returning disconnect;
- `ReplicaStore`: atomically load/save cursor, apply canonical changes, and persist local conflict state;
- `Outbox`: enqueue, list, acknowledge and retain retryable mutations;
- `EntityRegistry`: `get(entityType)` maps an adapter without central `if (entityType)` logic.

An entity adapter validates/serializes intents and applies an upsert/delete to a replica. Content is the first real adapter; Tag metadata follows as a second adapter. `TestEntity` and in-memory adapters prove extension without editing `SyncEngine`.

The engine serializes pull/apply/flush work and atomically persists every applied canonical change with its cursor. Repeated cursors are no-ops; a non-monotonic response is a protocol error/reset, not a silent skip. Because cursors are opaque, strict ordering means server-provided monotonic order rather than arithmetic consecutiveness. Receipts are matched by `mutationId`, never by response array position.

## Client migration path

1. Introduce generic shared contracts, adapters, in-memory test seams and `SyncEngine` while retaining old endpoints as compatibility wrappers.
2. Migrate server Content writes to the coordinator and generic journal; expose pull/mutations and cursor-hint SSE.
3. Wrap `LocalLibraryRepository` as desktop `ReplicaStore` + durable `Outbox`; start/stop engine with authenticated desktop lifecycle and retain the independent media download/upload pipeline.
4. Add an IndexedDB web replica/outbox; React Query becomes a projection subscribed to replica changes, rather than the sync source. Web mutations enqueue intent optimistically through the engine.
5. Move tag color metadata to the Tag adapter. Remove snapshot reconciliation and legacy client flows only once protocol, integration and E2E coverage pass.

## Required test matrix

At the public SyncEngine seam: ordered changes, duplicate change, duplicate mutation, reconnect from 100 through 101..103, cursor gap/reset, conflict, and registration of `TestEntity` without core edits. At the HTTP seam: atomic duplicate concurrent push, crash safety (domain write/journal/receipt), restart/catch-up, strict cursor order, retention reset and notifier loss. At platform seams: durable outbox/client restart, API/network failure, update/update and update/delete conflicts, separate interrupted media transfer. E2E covers Desktop→Web without reload, Web→Desktop, reconnect catch-up and multiple clients.

## Design-review decisions

The three independent reviews confirmed the design and added the following integration constraints:

- Receipt claiming, domain mutation, entity lock/version, journal append and receipt finalization must be one transaction. New entity creation additionally takes a deterministic advisory entity-key lock; retries with a different body under the same mutation ID are rejected using a request hash.
- Reset snapshots and their returned high-water cursor are read in one repeatable-read transaction, avoiding a snapshot/cursor race. Pull is paginated and reports the last included cursor.
- Existing Desktop local device IDs versus remote IDs need a v3 persisted mapping. The migration preserves existing mutation IDs, changes timestamp rebase to server-version conflict handling, and introduces repository-level serialized atomic operations for cursor/replica/outbox state.
- Desktop uses a main-process header-capable SSE parser (or a short-lived, audience-scoped stream ticket), never a bearer token URL. Browser EventSource remains cookie-authenticated where same-site cookies are available. React Query is subscribed to the replica projection and is not permitted to advance cursor or apply stream payloads.
- Browser replicas use a user-scoped IndexedDB database with `replica`, `outbox`, `meta`, and `conflicts` stores; quota/open failures are visible rather than silently falling back to memory. Concurrent tabs may duplicate safe mutation delivery but must serialize local cursor writes (BroadcastChannel leadership or store CAS).
- The media metadata cursor is committed even when a binary transfer is interrupted. Binary task state/checksum retries remain in the separate Desktop media pipeline.
