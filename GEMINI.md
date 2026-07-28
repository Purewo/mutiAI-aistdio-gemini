# Frontend instructions (historical Gemini entrypoint)

Ownership note: as of 2026-07-28, Codex formally owns frontend implementation,
integration, browser verification, and corrective commits. This file is kept for
historical Gemini context; `AGENTS.md` and `docs/CURRENT_STATUS.md` are the
current instructions and handoff.

Read `AGENTS.md`, `docs/CURRENT_STATUS.md`, `docs/M3_FRONTEND_TASK_PACKET.md`,
`docs/M3_FRONTEND_IMPLEMENTATION_PLAN.md`, and `docs/LOCAL_INTEGRATION_REVIEW.md`
before changing the frontend.

## Rules

- This repository owns the web frontend only.
- Do not invent API endpoints, fields, status names, permissions, or backend behavior.
- Product and transport contracts come from `Purewo/mutiAI`, not from guesses in this repository.
- If a required field is missing, record the question instead of fabricating a field.
- Keep frontend work in a bounded branch or pull request.
- Do not edit backend, Runtime, LangGraph, or product database code in the core repository through frontend changes.
- Organization diagrams are rendered from structured data. Do not replace them with generated images.
- V1 has no drag-and-drop organization editor, autonomous role creation, organization invitations, or member management.
- Always implement loading, empty, error, and reconnect states when their contract is available.
- Keep visual components independent from transport details by using a small typed client layer.
- Develop against the real local backend. The checked-in fixtures under `fixtures/api/` are an offline regression and visual reference, not the primary development input.
- You may create clearly labeled frontend-only mock data to inspect layout and visual states when the checked-in fixtures do not provide enough visual variety. Keep it outside `contracts/` and `fixtures/api/`, reuse only contracted fields and state values, and never present it as a captured backend response.
- Mock mode must never silently replace a failed real API request. Keep the real API transport and mock/demo data source explicitly separable.

## Handoff expectation

A frontend commit is complete only after it has been verified in a real browser against the running backend. Lint, typecheck, build, fixture, and mock checks support construction and visual review; they are not proof of real integration. Codex writes the implementation, performs that browser verification, and owns the corrective commits. Contract defects remain backend-owned and are fixed in `Purewo/mutiAI` before this repository's snapshots are refreshed.
