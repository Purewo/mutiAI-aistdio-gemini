# Nexwork frontend: Codex ownership

This repository is the Nexwork web frontend. Codex formally owns frontend
implementation, repository checks, local integration, browser acceptance, and
frontend corrective commits as of 2026-07-28. The earlier Gemini and Fable5
handoff is historical context only; it is not an active delivery boundary.

Read `docs/CURRENT_STATUS.md` before selecting work. Product background and
the original page-scope document remain in `docs/GEMINI_HANDOFF.md`, but this
file is the current repository instruction and ownership boundary.

## Repository boundaries

- `Purewo/mutiAI` is the authoritative source for product semantics, OpenAPI,
  JSON Schema, event contracts, authentication, status values, and backend
  behavior.
- This repository consumes versioned snapshots under `contracts/` and must not
  invent endpoints, fields, permissions, statuses, or resource relationships.
- Backend, Runtime, LangGraph, and product-database changes belong in
  `Purewo/mutiAI` as separate changes. Report contract defects with evidence,
  then refresh this repository mechanically from the backend source of truth.
- Keep the product name `Nexwork` in user-visible surfaces. `mutiAI` remains a
  historical repository/package identifier.

## Frontend engineering rules

- Use the typed client layer under `src/api/`; views must not call `fetch`
  directly.
- Use relative `/api/v1` requests with browser credentials by default. Never
  store the HttpOnly session token in browser storage.
- Preserve the contracted error envelope and distinguish loading, empty,
  error, reconnecting, waiting, and terminal states.
- Keep fixture/demo data explicitly separate from real API transport. A failed
  real request must never silently fall back to mock data.
- Render organization and task topology from persisted structured IDs and
  dependencies. Do not infer edges from array order or generated images.
- Do not expose host paths, Codex transcripts, raw tool events, LangGraph
  checkpoints, or Runtime workspace internals as product history.

## Target platform

- V1 targets desktop web browsers. Desktop interaction, layout, and browser
  acceptance are the current frontend delivery gate.
- Mobile and narrow-screen UX are explicitly out of scope for V1. Do not spend
  current feature time on mobile adaptation or treat mobile screenshots,
  responsive polish, or mobile-specific defects as release blockers.
- Mobile support will be designed as a separate product pass later instead of
  being inferred from the current desktop information architecture.

## Verification and delivery

Run the relevant checks before delivery:

```powershell
npm run typecheck
npm run lint
npm run build
```

Frontend work is not complete from fixture or static checks alone. Run the
frontend through the local backend proxy and verify the changed flow in a real
desktop browser, including Console, Network, desktop layout, and reconnect
behavior when applicable. Record the verified URL, state, and any remaining
risk in `docs/CURRENT_STATUS.md` or the relevant task document.

The active branch at takeover is `feat/m3-frontend-foundation`, with the current
frontend baseline recorded in `git log` and contract snapshot source recorded in
`contracts/SNAPSHOT.md`. Compare current `HEAD` and the snapshot metadata before
relying on historical hashes.
