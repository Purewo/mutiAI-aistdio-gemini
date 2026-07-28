# Nexwork frontend current status

Status date: 2026-07-28

This is the frontend-side handoff for Codex. `AGENTS.md` is the repository
instruction file; `Purewo/mutiAI/docs/CURRENT_STATUS.md` remains authoritative
for backend architecture, product contracts, and the cross-layer M3 gate.

## Formal ownership

Codex now owns this repository's frontend implementation, documentation,
lint/typecheck/build checks, local API integration, real-browser verification,
and corrective commits. Gemini and Fable5 are historical contributors and are
not current implementation owners.

The backend repository remains responsible for backend behavior, persistence,
OpenAPI/JSON Schema and event contracts, generated fixtures, and backend fixes.
Frontend changes must consume refreshed snapshots rather than create a second
contract model.

## Current implementation

The active branch is `feat/m3-frontend-foundation`, currently at `ad9d659`
(`chore: sync assistant rich content contract`) and tracking its remote branch.
The React/Vite/TypeScript application currently exposes:

- `/login`: browser-session login and session recovery.
- `/`: persistent platform-assistant conversation and Action states.
- `/orgs` and `/orgs/:organizationId`: organization list, preview/published
  versions, structured graph, and read-only detail.
- `/tasks/:taskId`: planned Task observation, persisted plan dependencies,
  reconnectable SSE, inputs, Artifacts, timing, usage, approvals, retry, and
  cancellation states.
- `/runtime`: Runtime bindings, capability profile, controls, and admission
  information.
- `/profile`: account self-service.
- `/dev/fixtures`: development-only fixture rendering.

Transport is centralized in `src/api/`, assistant state in
`src/assistant/useAssistantConversation.ts`, Task/SSE state in
`src/task/useLiveTask.ts`, and page-level composition in `src/pages/` with
shared graph, Artifact, status, and state components under `src/components/`.

The platform-assistant frontend now also consumes the versioned assistant
contract directly: `content_schema_version = 1.0`. `content_blocks` is
authoritative, and the legacy `text` field is only a compatibility fallback. The
renderer supports
text, safe Markdown, code with copy affordance, errors, owner-scoped
attachments, product resource references, and product-backed organization and
execution-plan diagrams. Organization diagrams reuse `OrganizationGraph` and
execution-plan diagrams reuse `PlanGraph`; neither accepts model-supplied graph
nodes, URLs, or product state.

Chat attachments use the independent assistant attachment lifecycle: upload
before send, explicit `attachment_refs` on message submission, revocation only
while still unattached, and owner-scoped preview/download routes after send.
The composer enforces the current 10 MiB per-file limit, the backend media
allowlist, and a 20-attachment per-message client limit. It also states that a
chat attachment is never implicitly bound as Task input.

## Verified takeover baseline

- `npm run typecheck` passed on 2026-07-28.
- `npm run lint` passed on 2026-07-28.
- `npm run build` passed on 2026-07-28 (Vite production build completed).
- The local backend health endpoint returned HTTP 200 at
  `http://127.0.0.1:8000/api/v1/health`.
- The Vite server responded through `http://127.0.0.1:3001/` during this
  check because port 3000 was unavailable; the configured development port
  remains 3000 and Vite's fallback is environment-dependent.
- Real-browser checks with the local backend succeeded for login, the platform
  assistant, organization list, Runtime configuration, and a completed pure-
  parallel Task with SSE history, released Artifacts, and usage/timing data.
- No uncaught browser errors or failed authenticated API requests were found.
  The dev console currently reports the two standard React Router v7 future
  flag warnings.

## Rich-content and attachment acceptance

On 2026-07-28, Chrome DevTools browser verification ran against the live local
stack at `http://127.0.0.1:3001/` with the backend at
`http://127.0.0.1:8000/`:

- Uploading `fixtures/assistant/messages-page.json` returned HTTP 201 and
  produced a pending attachment chip.
- Revoking the unattached upload returned HTTP 200 and removed the chip.
- Uploading again and submitting a message returned HTTP 202; the request body
  contained the uploaded ID under `attachment_refs`.
- The accepted user message persisted `content_schema_version: "1.0"` and
  authoritative text and attachment blocks. The attachment card rendered its
  file name, media type, byte size, SHA-256 preview, and preview/download
  controls.
- Preview and explicit-download requests both returned HTTP 200. Preview served
  `application/json`; download included an attachment content disposition.
- A persisted assistant `error` block rendered as an error card. A frontend bug
  that displayed absent `details` as the literal text `null` was corrected and
  rechecked in the browser.
- Desktop 1440x900 and mobile 390x844 views were checked. The mobile document
  had a 390 px client width and 390 px scroll width, with no horizontal
  overflow in the attachment card or composer.
- Console inspection found no application errors. Only the two already-known
  React Router v7 future-flag warnings remain. Network inspection found no
  failing authenticated API request; initial StrictMode request aborts were
  immediately replaced by successful requests.
- `npm run typecheck`, `npm run lint`, and `npm run build` passed after the
  browser fix. The production build still reports the non-fatal main-chunk
  warning (547.76 kB minified, 165.54 kB gzip).

The backend response-format issue is resolved and deployed in backend commits
`97e4f7d` and `82387a6`. The previous Turn
`a30d7efd-a17d-4feb-9753-061e142f145f` remains as a failed audit record; it is
not overwritten by the successful retry.

The live retry was accepted and verified on 2026-07-28:

- The backend health endpoint returned HTTP `200` at
  `http://127.0.0.1:8000/api/v1/health`; the verified listener was PID `57100`.
- Conversation `80de7f11-cd13-4242-b623-507c66f62752` created Turn
  `0fa4458b-47fc-4d2d-9756-8ef7059dcb82`, which completed with no failure code.
- The assistant message `482a942e-ae27-4d9a-87b9-190be5c13d8a` persisted
  `content_schema_version: "1.0"` and authoritative blocks in this order:
  `markdown`, two `resource_ref` blocks, `organization_chart`, and
  `execution_plan`.
- The Markdown block rendered the heading, project list, and JSON fenced code
  block (`{"message_count": 2}`); this Runtime path does not emit a separate
  `type: "code"` block, so fenced Markdown and an independent code block are
  recorded as distinct acceptance cases.
- The task reference resolved to
  `4e0cc1ae-cce9-4da3-ab48-f6965545137f`; the organization-version reference
  resolved to published version
  `b304bf5e-6996-4057-b596-9ab944d52bcc` of organization
  `f7069e67-9ef1-419c-819f-70a9cf09ddfa`.
- The organization graph loaded from the `200` versions response and the plan
  graph loaded from the `200` task response. Their source IDs matched the
  persisted organization version and Task execution plan; the plan visibly
  showed three dependency-free specialist steps in parallel followed by the
  completed lead review.
- Desktop `1440x900` and mobile `390x844` views were rechecked. Both had
  `scrollWidth === clientWidth` (`1440` and `390` respectively), and the
  Markdown, resource cards, graphs, and composer remained usable. The task
  resource card navigated to the task detail route in the browser.
- The assistant conversation now stays mounted inside the authenticated layout.
  Its route surface is a full-size absolute layer that switches CSS visibility
  without using `hidden` or `display: none`. Navigating to organizations,
  Runtime, Tasks, or profile therefore preserves the same laid-out DOM,
  product-backed diagrams, live event stream, dimensions, and exact scroll
  position. Returning to the assistant only reveals that layer and does not run
  a route-change scroll correction. New message, Action, and Turn state still
  aligns the conversation to the bottom immediately before paint. An in-memory
  snapshot scoped to the authenticated user remains as a fallback for layout
  remounts, is not written to browser storage, and is never shared across user
  IDs.
- Console inspection found only the two known React Router v7 future-flag
  warnings. No authenticated request failed; initial StrictMode aborts were
  immediately replaced by successful requests.
- The frontend contract snapshot, backend conversation boundary document, and
  generated TypeScript were refreshed from backend commit `62521fd`. The
  generated `ResourceRefContentBlock.parent` field is optional and nullable;
  no competing frontend contract was introduced.
- A new live browser acceptance message created Turn
  `4e09174a-60c9-428e-ad09-fda76028f651` and assistant message
  `b7dc1992-9580-4ff9-b8e5-d1158e9882a7`. Its standalone
  `organization_spec_version` block carried the backend-resolved parent
  organization `f7069e67-9ef1-419c-819f-70a9cf09ddfa`. The rendered card
  navigated to `/orgs/f7069e67-9ef1-419c-819f-70a9cf09ddfa`; the organization
  and version requests both returned `200` and the destination rendered the
  published organization. The run used desktop `1440x900`; the target route
  had no console messages, and the only prior console output was the two known
  React Router future-flag warnings.

## Assistant attachment to Task input acceptance

The frontend contract snapshot and generated TypeScript were refreshed from
backend source commit `d8d6c11`. The UI now consumes
`TaskResponse.requested_input_contracts`, `TaskResponse.input_binding`,
`task.submit.payload.attachment_inputs`, and the
`assistant.task_input_bindings.updated` notification. The event is only a
refetch signal: the rendered binding state always comes from a fresh Task
resource. Ordinary chat attachments remain conversation context unless the
user explicitly confirms the planned `task.submit`, and binding never starts
the Task automatically.

The live local-stack acceptance used conversation
`80de7f11-cd13-4242-b623-507c66f62752`, Turn
`5d59ff22-2ebc-480d-a813-724dbbb4d3aa`, Action
`e410c5a6-ec32-4af4-a9bf-cae702536b72`, and Task
`8e78e2d1-ccd1-4b4b-8b99-b2f854e7ba49`:

- Attachment `a86de67e-91ec-483b-9510-6bfa9f1123f6`
  (`task-binding-acceptance.json`, 176 bytes) was proposed for contract key
  `source_json` and remained chat-only until the Action was confirmed.
- The persisted Task first reported `input_binding.status = waiting_for_plan`.
  After asynchronous planning, a Task refetch reported `status = bound`, no
  remaining contract keys, and immutable `origin=task_input` Artifact
  `1c7e97b9-fb28-570f-8c07-d06bc777e8fc`.
- The Artifact preserved the attachment file name, size, media type, and
  SHA-256
  `0b8a16992aeb46f4d445d665e30e329cb0c5d124d2d7a947114302ef4502d430`.
- The Action card and Task detail both showed the authoritative attachment to
  contract to Artifact chain. The Task accepted the bound input without a
  duplicate upload, enabled `开始执行`, and did not start automatically.
- Chrome DevTools verification passed at desktop `1440x900` and mobile
  `390x844`; both had `scrollWidth === clientWidth`, with no horizontal
  overflow. Console inspection found no application errors, and related
  authenticated network requests returned `200` (StrictMode aborts were
  replaced by successful requests).
- Final `npm run lint` and `npm run build` passed. Vite retains its existing
  non-fatal main-chunk size warning.

## Known follow-up risks

- At a 390x844 mobile viewport, the Runtime capacity card visibly overlaps the
  capacity timestamp/value. This is a real frontend layout defect to fix in a
  subsequent Codex UI change.
- Existing assistant history contains older malformed/placeholder-looking
  text in some records. The transport renders the persisted backend response;
  investigate the data/encoding layer before changing the renderer.
- Standalone `organization_spec_version` references are now navigable when the
  backend supplies `parent.resource_type === "organization"`; historical
  messages with a missing or `null` parent remain valid and intentionally
  non-navigable. The frontend does not infer a parent organization.
- The old Gemini/Fable5 handoff documents and fixture wording are retained as
  historical references but now point to Codex ownership; do not use them as
  current assignment instructions.

## Next acceptance gate

Continue from the backend M3 gate: run the deterministic wait/cancel,
needs-revision, and approval scenarios through the real browser; then resolve
the mobile Runtime layout defect and React Router warnings as scoped frontend
work. Keep SSE reconnect/deduplication, Artifact access, usage semantics,
authentication, console, network, and responsive checks in the acceptance
record.
