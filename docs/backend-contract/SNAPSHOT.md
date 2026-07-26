# Backend documentation snapshot metadata

- Source repository: `Purewo/mutiAI`
- Source commit: `356ae35`
- Sync date: `2026-07-25`
- Snapshot method: Mechanically copied read-only backend boundary and acceptance documents.

Additional documents synced after the base snapshot:

- `architecture/PLATFORM_ASSISTANT_CONVERSATION.md`: copied from backend commit `1b78db4`
  (2026-07-26). Design baseline only — its `/api/v1/assistant` payloads are not yet part of the
  OpenAPI contract snapshot, so the frontend consumes it for interaction shape and mock-state
  guidance, not for field names.

The backend repository remains authoritative. Update these files from the core repository when the frontend contract baseline changes.
