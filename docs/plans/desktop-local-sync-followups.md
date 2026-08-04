# Desktop local mode and Synapse Sync — follow-up plan

## Scope and ordering

This plan starts only after the primary Desktop goal is complete: the Desktop app has feature parity with Web for local Content/graph operations and can synchronize its local repository with the remote Backend, while Web continues to work against the same remote account.

The work is intentionally ordered so policy and user interface are built on a tested local repository and sync protocol, rather than creating settings that do not yet have a stable execution model.

## 1. Subscription-gated synchronization policy

### Goal

For an eligible subscription, let a user choose between automatic upload to Synapse Sync when content is added and deliberate, item-level synchronization through the interface. Let the user remove a synced item from the server without deleting its local copy.

### Deliverables

- A Backend entitlement contract that exposes whether the current account can use Synapse Sync.
- A local sync-state model per item: local-only, queued, synced, failed, and remote-deleted where applicable.
- An explicit conflict and retry policy for local edits, remote edits, deletions, and interrupted transfers.
- UI for the default policy, per-item selection, upload progress/errors, retry, and remote-only deletion confirmation.
- Authorization tests proving that ineligible accounts cannot invoke remote sync operations.

### Acceptance criteria

- Automatic mode uploads eligible newly created items without user interaction.
- Manual mode never uploads until the user selects an item and confirms synchronization.
- “Delete from server” removes only the remote copy and retains the local item and its files.
- A failed or interrupted transfer is visible and retryable; it never silently loses the local item.

## 2. Local and Synapse Sync settings

### Goal

Provide a dedicated settings area for local storage and synchronization behavior.

### Deliverables

- Storage location, local usage, and clear/recoverable cleanup controls where supported by the platform.
- Sync default policy, network/transfer preferences, retry controls, sync status, and account/entitlement visibility.
- Plain-language descriptions of which operation affects local data, remote data, or both.
- Persistence and migration of the settings without coupling Core to Electron or browser APIs.

### Acceptance criteria

- Settings survive app restart and are applied before the next sync operation.
- Destructive actions state their exact scope and require confirmation.
- A user can identify the current local storage usage and pending/failed sync work from settings.

## 3. Local-operation tests, smoke tests, and statistics tab

### Goal

Give local Desktop behavior the same confidence level and observability as the Backend.

### Deliverables

- Unit and integration tests for the Desktop local repository, object storage, migration, sync queue, conflict handling, and recovery after restart.
- A repeatable Desktop smoke-test command that runs against an isolated per-test application-data directory.
- A dedicated local-statistics tab with item/tag counts, local storage use, queue state, latest sync result, transfer volume, and local-operation timing/errors.
- Machine-readable smoke-test output, analogous to the existing server smoke report.

### Acceptance criteria

- CI can run the local test suite without a user profile or production data.
- Smoke tests prove create, edit, delete, restart, and synchronization recovery flows.
- The statistics tab derives values from the actual local repository and sync records rather than UI-only state.

## 4. Download landing page and mobile roadmap

### Goal

Make the Web landing page distribute the correct Desktop build and clearly communicate the mobile roadmap.

### Deliverables

- Release asset metadata for macOS, Windows, and Linux downloads, including version and checksum/signature when releases provide them.
- Platform detection that recommends the matching installer while keeping all platform downloads accessible manually.
- A responsive landing-page download section that handles unsupported platforms and unavailable releases gracefully.
- A visible iOS/Android “in development” block with no implied availability or download action.

### Acceptance criteria

- A visitor receives the correct recommended download on supported desktop platforms.
- Platform detection does not block manual selection or expose browser/device data to the Backend unnecessarily.
- The mobile section is clear, accessible, and does not promise a release date.

## Dependencies and decisions required before implementation

- Define the Desktop local Content/graph schema and migration mechanism.
- Specify the remote sync protocol, cursor/outbox persistence, conflict-resolution rules, and object-transfer lifecycle.
- Define subscription source of truth and product eligibility rules.
- Define release automation, code-signing/notarization requirements, and distribution channels for each Desktop platform.
