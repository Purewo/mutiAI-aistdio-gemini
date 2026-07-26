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
