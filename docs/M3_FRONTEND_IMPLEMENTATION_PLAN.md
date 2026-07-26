# M3 frontend implementation plan

Status: In implementation. Owned locally by the frontend owner; see `CLAUDE.md`.

This plan turns the M3 product scope into bounded, reviewable frontend stages. It defines implementation order and acceptance gates, not calendar estimates.

Read these files before implementation:

- `CLAUDE.md`
- `GEMINI.md`
- `docs/M3_FRONTEND_TASK_PACKET.md`
- `docs/LOCAL_INTEGRATION_REVIEW.md`
- `contracts/openapi.v1.json`
- `contracts/organization-spec.v1.json`
- `contracts/task-event.v1.json`
- `fixtures/api/README.md`

The contract baseline is backend commit `356ae35`. Use only repository-visible files and repository-relative paths. Do not invent backend fields, endpoints, or states.

## Real-integration and mock boundary

The frontend is developed locally against the running backend. No remote deployment is required.

- Develop and verify against the real local backend. It is the acceptance target for every stage.
- The captured responses under `fixtures/api/` are an offline regression and visual reference, and are useful for states that are expensive to reproduce against a live Runtime.
- You may create clearly labeled frontend-only mock data when extra records, text lengths, or state combinations are useful for inspecting page composition, spacing, overflow, and responsive behavior.
- Keep UI-only mock data outside `contracts/` and `fixtures/api/`. Do not edit captured fixtures or describe synthetic UI data as a real backend response.
- Reuse only fields, enum values, and resource relationships that exist in the checked-in contracts. Mock data may vary content and quantity for visual review, but it must not expand the backend contract.
- Keep mock/demo mode explicitly separable from the real API client. A real request failure must render an error state and must never trigger a silent fallback to mock data.
- The frontend owner is responsible for the implementation, the repository lint, typecheck, and build checks, and the real-backend browser verification: authentication, network requests, SSE reconnect behavior, Artifact access, Task usage, browser console output, interactions, and responsive layout.
- Contract defects are backend-owned. Fix them in `Purewo/mutiAI` as their own commits, then refresh this repository's snapshots.

## Product flow for M3

M3 must deliver this browser flow:

```text
Login
-> list organizations
-> submit one organization proposal request
-> preview the structured proposal
-> confirm and publish the OrganizationSpec
-> inspect the read-only organization graph and Runtime bindings
-> submit a planned Task
-> generate and inspect the execution plan
-> upload every declared initial input Artifact
-> start execution
-> follow progress and recover after an event-stream reconnect
-> inspect released Artifacts and Task Token usage
```

`POST /api/v1/organizations/proposals` is in the OpenAPI contract and is part of this M3 flow. Implement the contracted one-request proposal lifecycle. Do not simulate multi-turn conversational organization patches because no patch contract exists in this baseline.

## Stage 1: Establish the frontend foundation

Build the shared application shell and transport boundary before feature pages.

Deliverables:

- Derive API types from `contracts/openapi.v1.json` instead of maintaining competing product interfaces by hand.
- Keep view components independent from request construction and response parsing.
- Use relative `/api/v1` requests by default and include browser credentials for the HttpOnly session cookie.
- Keep the API base configurable for later local integration.
- Normalize the contracted error envelope without replacing backend messages with invented fallback data.
- Provide separate handling for JSON responses, Artifact content responses, and the SSE task event stream.
- Add an explicit fixture/mock development boundary for AI Studio. Contract-backed scenarios consume files under `fixtures/api/`; optional UI-only demo data follows the mock policy above.
- Establish the application layout, navigation, status presentation, and reusable loading, empty, error, and reconnect states.

Acceptance gate:

- Views do not call `fetch` directly.
- No authentication token is stored in browser storage.
- Fixture data and contract-shaped UI mocks pass through the same typed view models used by real API responses.
- Available lint and build commands pass.

## Stage 2: Complete authentication and session recovery

Implement the browser-session lifecycle through:

- `POST /api/v1/auth/login`
- `POST /api/v1/auth/logout`
- `GET /api/v1/auth/me`

Deliverables:

- Login loading and invalid-credential feedback.
- Application bootstrap through `/auth/me`, including refresh recovery.
- Protected-route handling for an unauthenticated session.
- Logout that clears frontend session state only after the backend request is handled.
- A global authentication state that represents loading, authenticated, and unauthenticated states explicitly.

Acceptance gate:

- Login, refresh, protected navigation, and logout form one complete flow.
- A 401 response cannot leave protected data visible.
- The frontend does not treat the development credentials as production defaults.

## Stage 3: Complete the organization proposal lifecycle

Implement organization listing and the preview-first creation flow through:

- `GET /api/v1/organizations`
- `POST /api/v1/organizations/proposals`
- `GET /api/v1/organizations/{organization_id}/versions`
- `POST /api/v1/organizations/{organization_id}/versions/{spec_version_id}/confirm`
- `POST /api/v1/organizations/{organization_id}/versions/{spec_version_id}/publish`

Deliverables:

- Organization list with loading, empty, and error states.
- Proposal request input and structured proposal response.
- A program-rendered OrganizationSpec preview, not a generated image or Markdown-only dump.
- Visible proposal, confirmed, published, superseded, and archived version states when returned by the backend.
- Explicit confirm and publish actions with backend conflict and validation feedback.
- Navigation from a published result to the organization detail page.

Acceptance gate:

- The UI never presents a proposal as published before both contracted transitions complete.
- Reloading uses persisted backend resources instead of relying on chat component memory.
- No uncontracted multi-turn patch or autonomous role-creation behavior appears in the interface.

## Stage 4: Render organization details and Runtime bindings

Implement the read-only organization control surface through:

- `GET /api/v1/organizations/{organization_id}`
- `GET /api/v1/runtime/bindings`
- `PUT /api/v1/runtime/bindings/{binding_key}`
- `GET /api/v1/runtime/controls`

Deliverables:

- A code-rendered organization graph driven by the published OrganizationSpec.
- Role and organization-lead details without assuming a fixed number of specialist roles.
- Runtime binding display and editing for contracted model, reasoning effort, and security mode values.
- Allowed control values read from the Runtime controls response instead of hard-coded frontend lists.
- Conflict feedback for rejected binding changes without inventing fallback values.
- Clear localhost-demo labeling for `demo_full_access`; no frontend bypass of backend policy validation.

Acceptance gate:

- Every rendered role retains its stable `runtime_binding_key` association.
- The graph remains a read-only preview and exposes no drag-and-drop editing.
- Raw Codex history, filesystem paths, LangGraph checkpoints, and tool transcripts remain hidden.

## Stage 5: Prepare and validate a planned Task

Implement the pre-execution flow through:

- `POST /api/v1/organizations/{organization_id}/tasks`
- `POST /api/v1/tasks/{task_id}/plan`
- `POST /api/v1/tasks/{task_id}/inputs`
- `GET /api/v1/tasks/{task_id}`

Deliverables:

- Submit each Task with `orchestration_mode` set to `planned` and a unique `Idempotency-Key`.
- Preserve the same idempotency key when retrying the same submission request.
- Show the persisted execution plan before the user starts execution.
- Render edges from `plan_step_id` and `dependency_step_ids`, never from array order.
- Render only the two supported topologies: a strict-linear specialist chain ending in lead review, or dependency-free parallel specialists joined by lead review.
- Read `execution_plan.initial_input_contracts` and upload every required initial Artifact with its contracted key, schema version, media type, filename, and `content_base64` bytes.
- Prevent start while declared required inputs are missing or the backend has not returned a validated plan.

Acceptance gate:

- Repeating a submission with the same key does not create duplicate work.
- The linear and parallel fixtures render different dependency graphs from persisted IDs.
- The UI does not display or imply mixed serial-parallel execution support.
- Uploaded input metadata and bytes match `TaskInputArtifactRequest`.

## Stage 6: Execute, observe, and recover

Implement execution control and progress through:

- `POST /api/v1/tasks/{task_id}/start`
- `GET /api/v1/tasks/{task_id}/events`
- `GET /api/v1/tasks/{task_id}`
- `GET /api/v1/tasks/{task_id}/approvals`
- `POST /api/v1/tasks/{task_id}/approvals/{approval_id}/decision`
- `POST /api/v1/tasks/{task_id}/retry`
- `POST /api/v1/tasks/{task_id}/cancel`

Deliverables:

- SSE reconnection using `Last-Event-ID` and deduplication by `event_id` or `sequence`.
- Reconcile the Task resource after connecting, reconnecting, receiving material events, and reaching the end of the stream.
- Treat SSE as a change notification channel, not the sole source of persisted Task truth.
- Distinct Task, Assignment, Runtime execution, plan, plan-step, and approval state presentations.
- Treat `waiting` as a resumable or approval-related state, not as an error.
- Approval controls only for approval records returned by the backend.
- Retry and cancel controls that follow the backend's accepted state transitions.
- If `/start` reports a Runtime failure, fetch the Task again and render its persisted failed state instead of stopping at a transient error message.

Acceptance gate:

- Replaying or reconnecting the event stream does not duplicate progress rows.
- Completed, failed, cancelled, waiting, and needs-revision states remain visually distinct.
- Parallel lead review does not appear ready before all required specialist results and Artifacts are released.
- A terminal Task remains inspectable after the SSE connection ends.

## Stage 7: Deliver results, usage, and final quality checks

Implement final result access through:

- `GET /api/v1/tasks/{task_id}/artifacts/{artifact_id}/content`
- `GET /api/v1/tasks/{task_id}/usage`

Deliverables:

- Artifact preview through `content_url` when the browser supports the declared media type.
- Explicit download through `download_url` or the contracted `download=true` behavior.
- No display or construction of host paths from `storage_relative_path`.
- Unavailable-result feedback for Artifact integrity or release-state errors, including 409 responses.
- Task Token totals and per-Assignment usage rows.
- Separate labels for Provider-observed counters and conservative `charged_tokens` budget values.
- Assignment and execution details required by the task packet, including Runtime IDs, requested and actual model, security snapshot, delivery summaries, and context-compaction count when returned.
- Responsive layout and accessible interaction states for the core desktop and narrow-screen flows.

Acceptance gate:

- Usage totals and Assignment rows match the contracted response without frontend recomputation that changes their meaning.
- Artifact access uses only backend-controlled URLs.
- All fixture scenarios render: empty, planned linear, planned parallel, waiting, failed, completed, Artifact, usage, approval, event replay, and 404.
- Available lint and build commands pass without uncaught runtime errors in the candidate implementation.

## Commit and review policy

- Keep each stage in a bounded commit or pull request checkpoint.
- State which contract snapshot and fixtures the implementation used.
- List known limitations or missing backend fields instead of filling them with invented data.
- Do not mark a stage complete when code has only passed fixture or mock checks.
- Each stage is verified against the real backend with browser, console, network, SSE, Artifact, and responsive-layout checks before it is called done.

## Explicit non-goals

- Calendar estimates for the stages.
- Drag-and-drop organization editing.
- Mixed serial-parallel plan execution.
- Multi-user membership, invitations, or human collaboration nodes.
- Multi-turn organization Patch behavior without a backend contract.
- WeChat integration.
- Raw Runtime transcripts or an in-browser terminal.
- Remote deployment as a prerequisite for M3 validation.
