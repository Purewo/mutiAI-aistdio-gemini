# Contract snapshot metadata

- Source repository: `Purewo/mutiAI`
- Source commit: `205a845`
- Sync date: `2026-07-27`
- Snapshot method: Mechanically copied from the authoritative core repository.
- Review status: Reviewed against the M2.3 source files, the localized error, Runtime feasibility,
  platform-assistant, and account self-service additions (`b585c93`, `5e88dd8`, `99724d0`,
  `a4bced0`, `1e2f969`, `94edeeb`, `205a845`), OpenAPI routes, persisted
  AssistantAction localization, and the updated M3 frontend task packet.

`ApprovalResponse.cwd` was removed upstream and host paths are sanitized. The generated types no
longer expose it and no view reads it.

## Included files

- `openapi.v1.json`: OpenAPI 3.1 contract, API version `0.1.0`.
- `organization-spec.v1.json`: Published organization definition JSON Schema.
- `task-event.v1.json`: Task event envelope JSON Schema.
- `events/assistant-event.v1.json`: Platform-assistant event envelope JSON Schema.

These files are read-only consumer snapshots. Update them from the core repository instead of editing product types in this repository.

Assistant API fixtures are available under `fixtures/assistant/`. Feasibility
fixtures under `fixtures/feasibility/` and the 30 main API fixtures under
`fixtures/api/` were refreshed from the same backend contract line.
