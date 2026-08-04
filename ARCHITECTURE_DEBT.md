# Architecture debt

- **Описание проблемы:** Desktop local library currently has a JSON persistence model separate from the full Core `ContentRepository` and `GraphProvider` contracts.
  **Причина:** The prior Desktop implementation was only a placeholder. A complete local Content/graph schema, migration design, and remote synchronization protocol are prerequisites for safely adapting those Core contracts.
  **Предлагаемое решение:** Define a versioned local Content/graph schema and migrations, implement Core provider adapters over it, then migrate the temporary local-library records without data loss.
  **Приоритет:** High.

- **Описание проблемы:** Desktop can queue local changes according to its persisted policy, but Backend does not yet expose a durable outbox/cursor, conflict-resolution API, or object-transfer lifecycle.
  **Причина:** The paid-plan entitlement policy and API now exist, but the rest of the protocol dependencies listed in `docs/plans/desktop-local-sync-followups.md` are still absent.
  **Предлагаемое решение:** Add authenticated Backend remote-sync endpoints, authorization tests, Desktop transfer/retry handling, and a durable Backend outbox using the established entitlement contract.
  **Приоритет:** High.
