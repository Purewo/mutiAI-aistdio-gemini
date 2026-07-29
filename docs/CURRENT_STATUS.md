# Nexwork frontend current status

Status date: 2026-07-29

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

The active branch is `feat/m3-frontend-foundation`. The committed frontend
baseline before the content Schema `1.1` handoff was `a8cbc0d`
(`feat: consume activity and media semantics`); this branch tracks its remote
feature branch.
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
contract directly: historical `content_schema_version = 1.0` and current
`content_schema_version = 1.1`. `content_blocks` is
authoritative, and the legacy `text` field is only a compatibility fallback. The
renderer supports
text, safe Markdown, code with copy affordance, errors, owner-scoped
attachments, product resource references, product-backed organization and
execution-plan diagrams, and product-owned static HTML report Artifacts.
Organization diagrams reuse `OrganizationGraph` and
execution-plan diagrams reuse `PlanGraph`; neither accepts model-supplied graph
nodes, URLs, or product state.

Chat attachments use the independent assistant attachment lifecycle: upload
before send, explicit `attachment_refs` on message submission, revocation only
while still unattached, and owner-scoped preview/download routes after send.
The composer enforces the current 20 MiB per-file limit, the backend media
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

## Bounded Task replay acceptance

The frontend contract snapshot, generated TypeScript, and bounded replay
architecture document were refreshed from backend commit `868139c`. The Task
detail now consumes the persisted replay policy and immutable ReplayRun
records, supports `full`, strict-linear `from_step`, and candidate `step_only`
requests, and distinguishes business replay from technical retry. Task creation
also sends the initial `manual` or `auto_within_limit` policy and the contracted
0-10 replay limit. Assistant `task.replay` Actions display their requested
scope, reason, feedback, and Task destination before confirmation.

The live desktop acceptance used Task
`d608a67b-0542-4004-bd4f-588b4d4b7f50` and created ReplayRun
`4db6ad7b-c3cf-42d1-b150-2ab81eb8fda5` through the real UI:

- A `step_only` replay targeted
  `currency_translator.convert_cny_to_usd_workbook`; the create request returned
  HTTP `201` and the ReplayRun completed as replay number 1.
- The Task correctly remained `needs_revision` with `candidate_only=true`. The
  replay produced plan version 2 and USD Artifact version 2 while retaining the
  queryable original Plan, Assignments, and Artifacts.
- The persisted history showed the replay reason and feedback, executed and
  reused steps, pinned input Artifacts, effective Artifact bindings, lead
  decision, and immutable parent lineage. The plan graph marked replayed steps
  and fixed reused steps separately, and its expandable baseline view rendered
  all four original steps.
- The event history included `task.replay_created`, `task.replay_started`,
  `plan.step_reused`, and `task.replay_completed`. The replayed Artifact and
  Assignments displayed replay number 1.
- A desktop `1440x900` recheck confirmed the replay form, policy value 3,
  history card, and expanded baseline lineage. The document had no horizontal
  overflow. Current Console output contains only the two known React Router v7
  future-flag warnings; the earlier form-field issue is absent after the
  `id`/`name` corrections. Authenticated API requests returned `200`, with only
  the expected StrictMode aborts immediately replaced by successful requests.
- `npm run typecheck`, `npm run lint`, and `npm run build` passed on
  2026-07-29. Vite retains its existing non-fatal main-chunk size warning.

## Activity and media semantics acceptance

The frontend contract snapshot and generated TypeScript were refreshed from
backend worktree commit `808f996` (feature implementation `1cffbfb`). The new
`activity_phase` field is consumed as the sole product activity wording for
Task, Assignment, PlanStep, and RuntimeExecution resources. The frontend no
longer infers activity from `turn_id`, `wait_reason`, or raw state transitions:

- Task and Assignment badges use backend-derived labels such as `工作中`,
  `工作中 · 等待结果`, `排队中`, `等待审批`, and `正在整理结果`.
- Plan graph cards use each persisted PlanStep activity phase. Assignment
  details show a separate Runtime activity badge while retaining the raw
  Runtime status as a diagnostic field.
- The captured `task-waiting-activity.json` fixture was rendered through the
  real fixture route at desktop `1440x900`. Two records with the same raw
  `waiting` status visibly rendered as `工作中 · 等待结果` and `排队中`.

Organization media requirements are rendered only when the backend supplied
normalized `capability_requirements`:

- Organization role cards display friendly labels for backend MIME values,
  including `Excel / XLSX`, `CSV`, `PDF`, and image formats, with the raw MIME
  retained in the title tooltip.
- Feasibility findings translate media capability names and values without
  inventing support. Unknown or blocked findings remain backend-provided
  preview results.
- Task input binding cards display a friendly media label while retaining the
  authoritative MIME value in the tooltip. Users still do not enter MIME types,
  hashes, or storage paths.
- The refreshed feasibility fixture set includes generic proposals with no
  guessed media requirements, normalized Excel/CSV proposals, unknown-capability
  drafts, blocked proposals, and the activity waiting example. The desktop
  fixture route rendered the Excel/CSV proposal graph and a feasible check.

The desktop browser run had no document horizontal overflow. Console output
contained only the two known React Router v7 future-flag warnings, and related
authenticated requests returned `200` apart from expected StrictMode aborts
immediately replaced by successful requests. Mobile adaptation remains outside
the V1 gate.

## Assistant composer auto-resize acceptance

- Verified on 2026-07-29 at `http://127.0.0.1:3001/` through the authenticated
  platform-assistant page. The composer starts at `44px`, grows with multiline
  input, caps at `128px` (about five lines), and then scrolls internally.
- A real multiline message submission returned `202`; while the Turn was
  running, the cleared and disabled composer immediately returned to `44px`.
- Desktop `1440x900` and mobile `390x844` checks passed. The narrow viewport had
  no document-level horizontal overflow, and clearing the composer remains
  `44px` even when the placeholder itself wraps.
- Console output contains only the two known React Router v7 future-flag
  warnings. Related authenticated requests returned `200`, apart from expected
  StrictMode aborts immediately replaced by successful requests.
- `npm run typecheck`, `npm run lint`, and `npm run build` passed. Vite retains
  its existing non-fatal main-chunk size warning.

## Assistant content 1.1 and static HTML report integration

The authoritative OpenAPI, generated TypeScript, backend boundary documents,
and Assistant fixture snapshot were refreshed through backend documentation
commit `aa16233` and contract implementation `68866d8`. The renderer now accepts
both historical content Schema `1.0` and current Schema `1.1`; unknown future
versions still use the message-level plain-text fallback instead of guessing.

- Schema `1.1` adds the product-owned `html_report` block. The frontend reads
  only the backend-generated source identity and preview/download URLs. Available
  reports render in an empty-permission `sandbox` iframe with no raw HTML
  injection, scripts, same-origin permission, forms, popups, or external-resource
  authority. Oversized and failed previews keep an explicit download fallback.
- The assistant attachment upload guard and composer wording now match the
  backend's 20 MiB per-file limit. The media allowlist and 20-file message limit
  remain unchanged.
- Chrome DevTools verification used the real authenticated stack at
  `http://127.0.0.1:3000/` with a desktop `1440x900` viewport. Persisted message
  `526ae79f-e6c9-4c25-b236-7f2920cde5d3` returned
  `content_schema_version: "1.1"` with `markdown`, `resource_ref`, and `diagram`
  blocks. The warning "内容版本 1.1 暂未支持" was absent; the real Task card and
  execution-plan graph rendered, and the Task card navigated to
  `/tasks/b619f191-7595-43f4-ab09-066ba5a466c2`.
- The assistant page and the Task round trip both retained a 1440 px document
  width with no horizontal overflow. All related authenticated requests returned
  `200`; StrictMode aborts were immediately replaced by successful requests.
  After replacing the inactive mounted assistant layer's `aria-hidden` behavior
  with `inert`, the focus/accessibility console warning no longer reproduced and
  the final Console was empty.
- `npm run typecheck`, `npm run lint`, and `npm run build` passed. The production
  build retains its existing non-fatal main-chunk size warning.

No released `text/html` Artifact exists yet on the live stock-analysis Task, so
the real persisted `html_report` iframe and download response remain the next
end-to-end acceptance once that Task produces and the assistant references the
report. The contracted fixture and frontend renderer are in place; no synthetic
product record was created to fake this state.

## Known follow-up risks

- V1 currently targets desktop web browsers. Mobile and narrow-screen UX,
  including the previously observed 390x844 Runtime capacity-card overlap, is
  deferred to a separate product redesign and is not a current delivery gate.
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

## Mixed topology browser acceptance

The mixed-topology contract snapshot is synced from backend commit
`1a30205` under `docs/backend-contract/architecture/MIXED_TASK_TOPOLOGY.md`
and `docs/backend-contract/acceptance/MIXED_TOPOLOGY_SCENARIO.md`. On the live
desktop stack at `http://127.0.0.1:3000/`, Task
`5b218f5a-1b7c-4903-8330-13d058d56667` used the published organization
`87cca41d-7771-4a81-a754-76837cac14e7` and completed the real four-wave DAG:

- `sales_totals` and `cost_totals` were independent ready roots and ran in the
  same wave.
- `join_profit_metrics` was created only after both root Artifacts were
  released.
- `interpret_performance` and `audit_margin_difference` were created in the
  same downstream wave after the join Artifact.
- `final_lead_review` was created only after both terminal Artifacts were
  released and completed the Task.

The UI rendered the graph from `dependency_step_ids`, labelled the topology as
mixed serial-parallel, exposed released input and specialist Artifacts, and
showed the final review. A real technical Retry recovered the failed
`audit_margin_difference` branch after an intentional product validation
failure (`Unexpected UTF-8 BOM`); the completed sibling and all upstream
Artifacts remained unchanged, and `replay_count` stayed zero. The final
Artifact JSON returned HTTP 200 and contained the expected sales, cost, profit,
highest-store values, and margins. The backend's `margin_audit_json` reports
`6.39` percentage points because it subtracts the two rounded margins; the
scenario's unrounded calculation is approximately `6.38`, so this arithmetic
rounding policy remains a backend follow-up rather than a frontend rewrite.

Desktop `1440x900` had no horizontal overflow (`scrollWidth === clientWidth`),
and after reconnect the event log remained 139 unique sequence numbers. The
Console contained only the known React Router future-flag warnings plus one
backend-generated 500 for the permanently mounted Assistant's old Schema 1.1
message history. The mixed worktree is based before backend commits `68866d8`
and `aa16233`; it must be rebased or merged with those Assistant Schema 1.1
fixes before this 500 can be considered resolved. No mobile acceptance was run;
mobile is intentionally outside the V1 target.

The frontend correction made in this gate removes the obsolete strict-linear
guard from the `from_step` replay control. Mixed DAGs now submit the contracted
downstream-closure replay scope; the backend remains authoritative for the
actual closure and lineage.

## Next acceptance gate

Continue from the backend M3 gate: run the deterministic wait/cancel,
needs-revision, and approval scenarios through a desktop browser. Keep SSE
reconnect/deduplication, Artifact access, usage semantics, authentication,
console, network, and desktop layout checks in the acceptance record. Mobile
adaptation remains outside the V1 frontend scope until a separate design pass.
