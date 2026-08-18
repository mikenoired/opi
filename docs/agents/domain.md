# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`CONTEXT-MAP.md`** at the repo root if it exists — it points at one `CONTEXT.md` per relevant app or package.
- **`docs/domain.md`** — the current shared domain glossary.
- **`docs/adr/`** — read ADRs that touch the area you're about to work in.
- Any context-scoped ADRs for the relevant app or package, such as `apps/<context>/docs/adr/` or `packages/<context>/docs/adr/`.

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The `/domain-modeling` skill (reached via `/grill-with-docs` and `/improve-codebase-architecture`) creates them lazily when terms or decisions actually get resolved.

## File structure

This is a multi-context repository. `CONTEXT-MAP.md`, when present, is the index of per-context documentation. The root `docs/adr/` holds system-wide decisions.

```
/
├── CONTEXT-MAP.md
├── docs/
│   ├── domain.md                       ← shared domain glossary
│   └── adr/                            ← system-wide decisions
├── apps/
│   ├── backend/
│   │   ├── CONTEXT.md
│   │   └── docs/adr/                   ← backend-specific decisions
│   └── web/
│       ├── CONTEXT.md
│       └── docs/adr/                   ← web-specific decisions
└── packages/
    └── <context>/
        ├── CONTEXT.md
        └── docs/adr/                   ← package-specific decisions
```

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, or a test name), use the term as defined in `docs/domain.md` or the relevant `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal — either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0007 (event-sourced orders) — but worth reopening because…_
