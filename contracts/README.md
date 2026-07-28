# Frontend contract snapshots

The authoritative product contracts live in `Purewo/mutiAI/contracts`.

Any snapshot copied here must include:

- The source core repository commit.
- The contract version.
- The date of synchronization.
- Whether the snapshot is generated or manually reviewed.

Do not create a second, hand-maintained definition of the same API or product object in the frontend repository.

The current snapshot includes the OpenAPI document, OrganizationSpec schema,
Task event schema, and platform-assistant event schema. Captured responses live
under `fixtures/api/`, `fixtures/assistant/`, and `fixtures/feasibility/`.

Assistant content Schema `1.1` adds the backend-owned `html_report` block. Its
captured example is `fixtures/assistant/message-html-report.json`; the complete
static-report policy is mirrored in
`docs/backend-contract/architecture/HTML_REPORT_ARTIFACT.md`.
