# mutiAI web frontend rules

This repository owns the mutiAI web frontend only. It is the frontend main workspace.

## Ownership

Since 2026-07-26 the frontend is developed locally by the project's frontend owner, who has direct
access to the backend repository, the running API, and a real browser. This replaces the earlier
Google AI Studio arrangement in which a remote collaborator wrote candidate code against fixtures
and a separate integrator performed acceptance without modifying the implementation. The frontend
owner now writes the implementation, verifies it against the real backend in a browser, and owns
the corrective commits.

`GEMINI.md` and `docs/GEMINI_HANDOFF.md` remain for product background and page-scope intent. Where
they describe the old remote-collaborator workflow, this file takes precedence.

## Contract boundary

- `Purewo/mutiAI` is the single source of truth for OpenAPI, `OrganizationSpec`, event schemas,
  status enums, authentication, and the error envelope.
- Consume the snapshots under `contracts/`. Do not hand-write competing product types.
- Never invent API endpoints, fields, status names, or permissions. If a screen needs a field that
  the snapshot does not define, report the missing contract instead of fabricating one.
- Backend changes belong in the `mutiAI` repository as their own commits. Never move frontend code
  into the backend repository, and never edit backend, Runtime, LangGraph, or product database code
  through a frontend change.
- Refresh `contracts/` mechanically from the backend and record the source commit in
  `contracts/SNAPSHOT.md`.

## Development workflow

Develop against the real backend. It runs locally and is the acceptance target.

```powershell
# backend, in the mutiAI repository
uv run uvicorn mutiai.main:app --reload            # http://127.0.0.1:8000

# frontend, in this repository
npm install
npm run dev                                        # http://localhost:3000, proxies /api to :8000
```

`RUNTIME_PROVIDER` defaults to `fake`, which keeps the backend self-contained for frontend work.
Start the Codex sidecar only when a change needs real Runtime behavior.

- The captured responses under `fixtures/api/` are an offline regression and visual reference. They
  are no longer the primary development input.
- Frontend-only demo data is allowed for inspecting layout and visual states. Keep it outside
  `contracts/` and `fixtures/api/`, reuse only contracted fields and enum values, and never present
  it as a captured backend response.
- Mock mode must stay explicitly separable from the real API transport. A failed real request must
  render its contracted error state and must never silently fall back to mock data.

## Implementation rules

- Views must not call `fetch` directly. Requests go through the typed client layer.
- Store no authentication token in browser storage. The session is an HttpOnly cookie.
- Use relative `/api/v1` requests by default, send browser credentials, and keep the API base
  configurable without embedding local absolute paths.
- Normalize the contracted error envelope (`code`, `message`, `request_id`, `details`) instead of
  replacing backend messages with invented fallback text.
- Always implement loading, empty, error, and reconnect states when the contract supports them.
- Render organization and plan diagrams from structured data. Never use generated images, and never
  infer plan edges from array order — use `plan_step_id` and `dependency_step_ids`.
- Never display or construct host filesystem paths, Codex transcripts, raw tool events, or LangGraph
  checkpoints as product history.

## V1 scope limits

V1 has no drag-and-drop organization editor, infinite canvas, autonomous role creation, organization
membership or invitations, human collaboration nodes, multi-turn organization patching, mixed
serial-parallel plans, WeChat integration, or an in-browser terminal. Do not build placeholder UI
that implies any of them work.

## Delivery standard

- Work on a bounded branch or pull request, one page or one user flow per commit.
- State the contract snapshot the implementation used.
- List known limitations and missing backend fields instead of filling them with invented data.
- Verify in a real browser against the real backend before calling frontend work complete. Lint,
  typecheck, and build passing is not sufficient evidence on its own.
