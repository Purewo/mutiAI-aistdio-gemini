# Contract snapshot metadata

- Source repository: `Purewo/mutiAI`
- Source commit: `868139c`
- Sync date: `2026-07-29`
- Snapshot method: Mechanically copied from the authoritative core repository.
- Review status: Reviewed against the M2.3 source files, Runtime feasibility,
  account self-service, persisted AssistantAction localization, and the assistant
  rich-content and attachment additions, including product-owned nested
  resource parents and explicit assistant-attachment Task input bindings,
  through `868139c`, including bounded Task replay policy, replay runs, and
  immutable replay lineage.

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

New `organization_spec_version` resource references may carry an optional
backend-resolved `parent` organization locator. Historical references without
`parent` remain valid; consumers must not infer the parent relationship.
