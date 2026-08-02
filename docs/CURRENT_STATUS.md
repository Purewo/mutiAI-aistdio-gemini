# Nexwork frontend current status

Status date: 2026-08-02

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

## Unified conversational Action input integration

The frontend contract snapshot and generated client were refreshed additively
from backend commit `7878a8c` (`feat/conversational-action-decisions`). The
existing Expert, Channel, Coordination, and D1-A surfaces remain intact. The
platform-assistant composer now submits
`POST /assistant/conversations/{conversation_id}/inputs` through
`submitAssistantInput`:

- `assistant_turn` merges the accepted user message and tracks the returned Turn;
- `action_decision` merges the user message, backend acknowledgement, and the
  updated Action without creating a client-side or Runtime Turn;
- `action_decision_unavailable` renders both persisted messages and the backend
  reason/count without guessing an Action.

The existing Action card continues to use
`POST /assistant/actions/{action_id}/decision`, and successful input responses
trigger persisted message, Action, and conversation reconciliation before the
event stream resumes normal refresh behavior. Historical
`organization.confirm` Actions remain renderable through the existing card.

Real browser acceptance completed on 2026-08-01 with the isolated backend
harness at `http://127.0.0.1:8039` and Vite at
`http://127.0.0.1:3039/`, desktop viewport `1440x1000`:

- exact `确认` with no pending Action returned
  `action_decision_unavailable/no_pending_action`;
- the existing card button returned HTTP 200 and `declined`;
- exact `确认` returned `action_decision` with `decision_source=web.text`,
  rendered the acknowledgement, and did not return a Turn;
- `确认，但先改名称` returned `assistant_turn`;
- exact `取消` with two pending Actions returned
  `action_decision_unavailable/multiple_pending_actions` with count `2`;
- four ordinary submissions produced four persisted Turns, while both text
  decisions produced no additional Turn. All 52 captured API responses during
  the flow were successful; no page errors or post-login console errors were
  observed. Evidence is retained under
  `G:\AI\AI_private\mutiAI-assistant-input-acceptance`.

Chrome DevTools MCP was unavailable in this session because its transport
closed; the same live-page, Network, Console, interaction, and screenshot gate
was completed with the local Chrome executable through Playwright as the
documented fallback. The two standard React Router future-flag warnings were
seen only during the unauthenticated bootstrap and are unrelated to this flow.

## Expert Marketplace multi-Dify catalog integration

The frontend contract snapshot now includes backend `600fc34`
(`feat: validate multiple Dify expert bindings`) and the preceding operator
category/search contract. The Expert Marketplace consumes the read-only
`GET /experts/categories` directory and sends repeated `category` query
parameters to `GET /experts`; selecting multiple categories uses the backend's
OR semantics. The “全部专家” view intentionally omits the category filter so
uncategorized experts remain visible.

Search is server-authoritative and debounced, while Provider, interaction mode,
and eligibility filters remain typed query parameters. Category cards show the
operator-provided display name, description, deterministic count, and selected
state; no category mutation controls were added. Expert detail and trial flows
continue to consume the public `ExpertCapability` contract. Dify `input_mode`
(`assignment_json`, `single_file`, or `instruction_text`) is an operator-owned
Runtime setting and is deliberately not exposed as a user-editable field or
credential/configuration surface.

The backend branch's isolated live acceptance is recorded in
`docs/backend-contract/acceptance/M4_MULTI_DIFY_LIVE_ACCEPTANCE.md`. Frontend
browser acceptance completed on 2026-08-01 against an isolated backend at
`http://127.0.0.1:8040` and Vite at `http://127.0.0.1:3040/`, desktop viewport
`1440x1000` in the product's night mode:

- the read-only directory rendered all four operator categories, including the
  currently empty software-development category;
- the All view showed the uncategorized ExpertVersion and sent no category
  filter;
- one-category filtering worked, and selecting data-analysis plus
  document-extraction sent two repeated `category` keys and rendered their OR
  union;
- `query=image generate` was sent to the backend and returned only the image
  generation expert; Provider, interaction, and eligibility filters also used
  typed backend query parameters;
- the image-generation Dify expert accepted the exact instruction text with no
  attachment, completed with the `instruction_text` binding, and returned a
  generated image URL that answered HTTP 200;
- the business-card Dify expert disabled free-form text, submitted `text: ""`
  with exactly one 79,053-byte JPEG attachment, completed with 1,544 reported
  Tokens, and rendered all seven recognized fields;
- the compact capability sidebar was corrected so contracts, data handling,
  and limits no longer collapse into vertical text, and the Expert semantics
  and disabled attachment-only composer no longer become bright surfaces in
  night mode.

The final capture observed 63 API requests, no unexpected HTTP error, request
failure, or page exception. The only Console noise was the expected
unauthenticated `/auth/me` 401 during login bootstrap and the two existing React
Router future-flag warnings. Chrome DevTools MCP returned `Transport closed`,
so the same live Chrome, Network, Console, interaction, and screenshot gate was
completed through Playwright. Evidence is retained under
`G:\AI\AI_private\mutiAI-frontend-expert-acceptance`.

`npm run typecheck`, `npm run lint`, `npm run build`, and `git diff --check`
all pass. The production build retains the existing non-fatal main-chunk size
warning. The shared listener at port `8000` remains an older service and still
returns 404 for `/api/v1/experts/categories`; it was not changed for this
acceptance.

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

## Mobile portrait responsive pass (2026-07-30)

The mobile pass is now an active frontend delivery scope for portrait iPhone and
Samsung Galaxy straight-screen proportions. It keeps the desktop layout at
`1440x900` and adds the representative viewports `360x800`, `390x844`,
`393x852`, `412x915`, and `430x932`. The shell uses `100dvh`, safe-area-aware
bottom navigation, a compact page header, and a five-item mobile navigation
surface. Primary actions and form controls are at least 44px, with main submit
actions at 48px where practical.

The organization graph now has a mobile vertical hierarchy driven by the same
persisted `reports_to` tree as the desktop graph. Task plan topology still comes
from persisted `plan_step_id` and `dependency_step_ids`; mobile only changes the
presentation to a vertical dependency flow. Token usage uses cards below `sm`
and retains the desktop table above it. Runtime capability details collapse on
mobile, and long IDs/reasons wrap instead of forcing page-level horizontal
scroll.

Browser acceptance ran through the local Vite proxy at
`http://127.0.0.1:3000/` with a real authenticated session. The live
organization, Runtime, Task, Profile, and Login routes had
`document.documentElement.scrollWidth === clientWidth` at all five mobile
viewports; the completed mixed-DAG Task also had no visible off-viewport content
and no sub-44px visible controls. The long Composer case grew to 100px without
overlapping the 57px bottom navigation. Desktop `1440x900` retained the 256px
sidebar, horizontal organization graph, and desktop Task usage table.

Assistant rich-content cards were checked with the explicit development fixture
transport (the fixture route remains clearly separated from live API transport):
the HTML report, Action confirmation controls, composer, and attachment affordance
fit `360x800` with no document overflow. The report iframe expanded from 228px to
276px after hiding redundant mobile avatars while preserving desktop avatars.

Remaining browser risk: the current live backend returns HTTP 500
`INTERNAL_ERROR` for the permanently mounted assistant message history at
`/api/v1/assistant/conversations/80de7f11-cd13-4242-b623-507c66f62752/messages?limit=100`.
Task, organization, Runtime, profile, and auth requests returned 200 in the same
run. This is a backend/data-layer issue, not a mobile layout fallback; the
frontend correctly renders the contracted error state. Physical iOS Safari and
Samsung Internet hardware checks remain a follow-up after the portrait Chrome
emulation gate.

## Known follow-up risks

- Physical iOS Safari and Samsung Internet checks remain pending; the current
  automated gate covers Chromium device emulation at the five agreed portrait
  widths. Foldable, tablet, and landscape layouts remain out of scope for this
  pass.
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
fixes before this 500 can be considered resolved. The mobile portrait results
are recorded in the responsive pass above.

The frontend correction made in this gate removes the obsolete strict-linear
guard from the `from_step` replay control. Mixed DAGs now submit the contracted
downstream-closure replay scope; the backend remains authoritative for the
actual closure and lineage.

## F0 shared coordination frontend acceptance (2026-07-30)

The F0 contract snapshot now includes the additive OpenAPI routes from backend
commit `1bd4cad` (handoff `7d77e27`) and
`contracts/events/coordination-event.v1.json`. The frontend exposes a desktop-
first 协作中心 with Case list, role Inbox, Signal creation, Case detail,
current owner, bounded WorkItem attempts, persisted timeline, read state,
waiting/terminal presentation, and permission-safe detail errors. The detail
view uses the typed client only; it never renders Runtime transcripts, host
paths, prompts, hidden router state, or raw evidence identifiers.

Real browser acceptance used an isolated F0 backend worktree on
`http://127.0.0.1:8017` with a separate SQLite database at
`G:\AI\AI_private\mutiAI-f0-acceptance\mutiai-f0.db`, session cookie name,
Runtime workspace, and attachment root. The database migrated independently to
`20260730_0017`; the existing WeChat/backend database was not reused. The
frontend was served through an isolated Vite proxy at
`http://127.0.0.1:3017`.

The real acceptance flow was:

1. Publish a test organization with a lead and a backend engineer through the
   existing product API setup path.
2. Use the new frontend Signal form with natural product language and no
   internal identifiers. The real `POST /api/v1/coordination/signals` returned
   `201`; the Case was immediately `assigned`, its first WorkItem was
   `delivered`, and one InboxDelivery was created.
3. Open the Case detail, mark the Inbox delivery read (`200`), and move the
   WorkItem through `waiting -> in_progress -> submitted -> completed`. The
   Case then moved to `resolved`; the final page presents the terminal read-only
   boundary.
4. Refresh the terminal page. The product database still contains Case
   `b6a4fccb-df8d-4935-adae-9e738e630bab`, one completed WorkItem, one read
   InboxDelivery, and 13 events with sequences `1..13`, 13 distinct event IDs,
   and no duplicate persisted sequence.
5. The first SSE batch returned `200 text/event-stream`. A subsequent browser
   request carried `Last-Event-ID` and returned an empty `200` replay batch;
   the page's event log kept the event count stable and re-queried the persisted
   Case after material event batches. DevTools also exercised an offline
   reconnect banner and recovery, an offline dashboard error state, the empty
   initial dashboard, and a nonexistent/other-owner-shaped Case URL that
   returned `404` and rendered the permission-safe page.

At `1440x900`, the Case detail and 协作中心 screenshots show the intended
two-column desktop information hierarchy. Chromium mobile emulation at
`390x844` had `scrollWidth === clientWidth === 390`, no off-viewport controls,
and the same persisted Case/work-item semantics. Console inspection on the
final live pages contained only the existing React Router future-flag warnings;
there were no in-scope frontend exceptions. Network inspection showed `200`
for the F0 resources; the only `404` was the deliberate permission-state test.

The frontend also tolerates an older additive backend response that omits the
new channel conversation projection while F0 is tested in isolation; this is a
backward-compatible rendering fallback and does not change the published F0
contract. This evidence was accepted and released the bounded F1 implementation
gate; it did not authorize F2 semantic routing or D1 incremental Artifact work.

## F1 delivery-quality feedback frontend acceptance (2026-07-30)

The additive frontend contract snapshot now includes backend handoff `9c7b2e0`
and feature commit `8be8b5f`. Generated types expose persisted
`CoordinationRetryAttempt` records on each Case. The coordination pages keep
Task state, technical Retry, Case state, WorkItem responsibility, and business
Replay as separate product concepts; SSE remains a notification that triggers
fresh persisted resource reads.

The Case detail now presents Retry attempts and their policy threshold, the
unchanged Task Replay count, rejected and released Artifact versions, preserved
successful sibling output, the related Task route, and the issue-handler/lead
WorkItem created after exhaustion. `ArtifactList` treats non-released Artifacts
as immutable audit evidence and does not offer preview or download actions that
the backend correctly rejects with `409`.

Real browser acceptance used an isolated F1 backend at
`http://127.0.0.1:8018` with database
`G:\AI\AI_private\mutiAI-f1-acceptance\parallel.db`, migrated to
`20260730_0018`. The frontend was served through an isolated Vite proxy at
`http://127.0.0.1:3018`. The backend handoff records `100 + 26 + 97 = 223`
passing tests plus OpenAPI/event-contract equality, migration round-trip, and
Ruff checks.

The successful-recovery flow used Task
`69fdf4cd-b80c-4ecf-bfd3-a36a3935dc45` and stable Case
`c747c1f2-ee28-47ca-ac83-12de43b95a9b`:

- Two BOM-prefixed invalid JSON deliveries produced independent Signals,
  rejected `worker.a.v1` Artifact versions 1 and 2, and Retry attempt states
  `failed -> succeeded`; the third delivery produced released version 3.
- The Task completed with `replay_count = 0`. The successful parallel sibling
  `worker.b.v1` retained its single released version and completed Assignment;
  it was not rerun by either technical Retry.
- The Case resolved with two Signals and 10 events. Persisted event sequences
  were continuous `1..10`, all 10 event IDs were distinct, and refresh did not
  append or duplicate history.

The exhausted flow used Task
`45d2a9d9-c307-4cb8-9abc-1132652d9f64` and stable Case
`e986ceb2-aeef-4354-a74a-a3225fcf8ab1`:

- Three invalid JSON deliveries preserved rejected `worker.a.v1` Artifact
  versions 1, 2, and 3. Retry attempt states ended `failed -> exhausted`; the
  Task failed while `replay_count` remained zero.
- The successful `worker.b.v1` sibling still had exactly one released version
  and its Assignment remained completed.
- Exhaustion left the Case assigned with three Signals, one
  `issue_handler` WorkItem, one InboxDelivery, and 14 unique events with
  continuous sequence `1..14`.

Both Case event streams were disconnected and reconnected with a real
`Last-Event-ID` request header. The deliberate offline interval produced only
the expected `ERR_INTERNET_DISCONNECTED`; recovery reconnected successfully,
and subsequent page refreshes retained the same persisted event counts without
duplicate event IDs or sequences.

The final browser report passed at desktop `1440x900` for both Cases and at
portrait `390x844` for the exhausted path. Desktop and portrait both had
`scrollWidth === clientWidth`; the portrait page had no visible interaction
target below 44 px. No page exception, unexpected HTTP `4xx/5xx`, or unexpected
request failure was recorded. Console output was limited to the two existing
React Router future-flag warnings, the expected first unauthenticated
`/auth/me` response, and the deliberate offline reconnect failure.

Chrome DevTools MCP was unavailable after its dedicated automation profile
closed the current transport, so this F1 gate used Playwright Core with the
installed local Chrome as the disclosed real-browser fallback. The generated
report and desktop/portrait screenshots are retained in the isolated acceptance
directory; this is not represented as a Chrome DevTools MCP run.

Final frontend `npm run typecheck`, `npm run lint`, `npm run build`, and
`git diff --check` all passed. The production build retains the existing
non-fatal main-chunk size warning (710.35 kB minified, 212.10 kB gzip). The
acceptance frontend and backend remained healthy with HTTP `200` on ports
`3018` and `8018`; their listeners were PID `59496` and PID `8916`.

## WeChat mobile adaptation acceptance (2026-07-31)

The WeChat channel page now has a mobile-first operation path while keeping
the full desktop capability boundary. On narrow screens, the capability cards
collapse into an expandable summary, the connection list becomes a horizontal
touch selector, and the QR authorization, verify-code, disconnect, identity,
and delivery controls use at least 44px targets (48px for primary actions).
The mobile navigation keeps WeChat as a direct primary item and moves Runtime,
Profile, and sign-out into a five-item `更多` menu.

Real local-stack browser acceptance used the frontend at
`http://127.0.0.1:3000` and backend at `http://127.0.0.1:8000` with the local
`admin` session:

- Portrait viewports `360x800`, `390x844`, `393x852`, `412x915`, and `430x932`
  all reported `documentScrollWidth === clientWidth` and no out-of-bounds
  visible content. Every visible mobile `button`, `a`, `input`, and `summary`
  measured at least 44px in both dimensions.
- The page rendered the current authenticating connection, generated a data
  URL QR image at `198x198`, and showed the authoritative `等待微信扫码`
  state. The mobile `更多` sheet exposed Runtime, Profile, and sign-out; its
  Runtime link reached `/runtime` and closed the sheet.
- Desktop `1440x900` remained within the viewport and retained the complete
  capability cards, sidebar, connection details, identities, and delivery
  sections. The production browser build reported no application errors or
  failed authenticated requests; only the two existing React Router future
  flag warnings remained.

Chrome DevTools MCP was unavailable in this run because its dedicated
automation transport was closed. The evidence above was collected with the
installed local Chrome through Playwright as the real-browser fallback; this
is explicitly not represented as a Chrome DevTools MCP run.

`npm run typecheck`, `npm run lint`, `npm run build`, and `git diff --check`
passed after the adaptation. The existing non-fatal Vite main-chunk size
warning remains.

## F2 semantic coordination frontend acceptance (2026-07-31)

The additive frontend contract snapshot now includes backend handoff `a955f22`
and feature commit `6db4d20`. The three F2 paths and ten F2 schemas were merged
without dropping the existing F1, channel, or Dify contract surface, generated
TypeScript was refreshed, and `CoordinationCaseResponse.routing_runs` is now a
persisted Case projection. A structural comparison against the authoritative
backend snapshot passed for all three routes, all ten schemas, and the Case
field.

The 协作中心 now defaults to a user-facing semantic observation flow. Users
select a published organization and source role by name, then describe the
published contract, observed behavior, and expected result; they do not enter
organization, role, Case, Signal, or Runtime identifiers. The frontend hashes
the user-visible evidence locally for stable identity and sends only the
contracted semantic observation. The original F0 direct Signal flow remains an
explicit secondary mode.

The Case detail renders persisted RoutingRuns and product-validated Decisions,
including execution tier, model, usage, confidence, source, action, target
role, stage, and safe fallback reasons. F2 WorkItems use a report form bound to
the current WorkItem: `completed` and `failed` require verifiable evidence,
while `waiting` may describe an external wait without invented evidence. The
page never directly mutates a Case and does not render Runtime Thread, Turn,
Workspace path, raw output, prompts, or hidden router identities.

Real browser acceptance used an isolated backend at
`http://127.0.0.1:8019`, frontend proxy at `http://127.0.0.1:3019`, and SQLite
database `G:\AI\AI_private\mutiAI-f2-acceptance\f2.db`, migrated independently
to `20260731_0019`. The isolated published organization contains `lead`,
`issue-handler`, `backend`, and `frontend`; shared development data and the
paused WeChat flow were not modified.

The accepted browser scenarios were:

- Successful Case `3d939fdc-7d72-41ff-8ee3-ddb0bae61a5d` followed
  `issue_investigation -> backend_fix -> publication_check ->
  frontend_reintegration -> resolved`. Its four WorkItems completed, five
  RoutingRuns produced `assign, assign, assign, assign, resolve`, and 51
  persisted events retained unique IDs and continuous sequence `1..51`.
- Invalid-role Case `0fd0787a-4e45-450b-9283-0134e49e3ba4` returned a
  product fallback with `target_role_invalid`, assigned the frozen `lead`, and
  created one `semantic_triage` WorkItem instead of trusting the invented role.
- Higher-tier Case `1d1b888d-0f51-4df0-a4db-d2ffad63ae2a` first recorded an
  explicit `escalate` decision, then ran the second route at `higher_model` and
  safely assigned the issue handler.
- Attempt-limited Case `aae38152-f7d0-4690-af2b-73c0a473bbe7` failed its
  first WorkItem at the configured `1/1` threshold and entered
  `human_required` with `attempt_limit_reached`; it did not guess another role
  or continue an unbounded loop.

Refreshes retained the same event counts. Real SSE reconnect requests carried
`Last-Event-ID`; a deliberate offline interval produced the expected
`ERR_INTERNET_DISCONNECTED`, displayed reconnect state, and recovered without
duplicating event IDs or sequences. Public RoutingRun responses were checked
for `runtime_thread_id`, `runtime_turn_id`, `runtime_workspace_path`, and
`raw_output`; none were present.

Installed Chrome passed desktop `1440x900` and portrait `390x844` checks. Both
had `scrollWidth === clientWidth`; the portrait page had no visible control
below 44 px. There were no page exceptions, unexpected HTTP `4xx/5xx`, or
unexpected request failures. Console output was limited to the two existing
React Router future-flag warnings, the expected initial unauthenticated
`/auth/me` response, and the deliberate offline failure.

Chrome DevTools MCP closed its transport on the first call, so the real-browser
gate used Playwright Core with the installed local Chrome as the disclosed
fallback. The JSON report and desktop/portrait screenshots are retained under
`G:\AI\AI_private\mutiAI-f2-acceptance`; this is not represented as a Chrome
DevTools MCP run.

After reconnecting the MCP session, a direct Google Chrome DevTools MCP run
completed the same success path against `http://127.0.0.1:3019` and backend
`8019`. Case `ff2b9db2-658b-43d8-843d-7fd5a0f8fcfb` was created from the
natural-language form and progressed through issue investigation, backend fix,
publication check, frontend reintegration, and final `resolved` status. The
terminal page showed four completed WorkItems, five RoutingRuns, 51 persisted
events, and zero duplicate SSE frames. The semantic-observation request and all
four WorkItem reports returned `202`; subsequent Case, organization, and SSE
reads returned `200`, apart from expected StrictMode/EventSource aborts and the
initial unauthenticated `/auth/me` probe. The final Console contained no
messages. Direct MCP layout checks passed at `1440x900` and `390x844` with no
horizontal overflow; the portrait view had no visible target below 44 px. The
rendered page contained none of `runtime_thread_id`, `runtime_turn_id`,
`runtime_workspace_path`, or `raw_output`.

Final `npm run generate:types`, `npm run typecheck`, `npm run lint`,
`npm run build`, and `git diff --check` passed. The production build retains
the existing non-fatal chunk-size warning (731.48 kB minified, 218.06 kB gzip).
The acceptance frontend and backend remained healthy with HTTP `200` on ports
`3019` and `8019`.

## Read-only Task operational blueprint foundation (2026-07-31)

The execution-plan presentation no longer connects whole dependency layers with
one generic arrow. `PlanGraph` now lays persisted PlanSteps into role swimlanes,
draws every exact `dependency_step_ids` source-to-target edge, separates frozen
OrganizationSpec `reports_to` links into a muted organization layer, and keeps
lead review visually distinct. The graph is still a preview: it offers pan,
zoom, fit-to-view, an activity focus control, a minimap, semantic low-zoom
summaries, and a read-only step inspector, but no node movement, connection, or
plan editing.

The Task page resolves the Task's frozen organization-spec version through the
typed API client and passes its product-owned role names and reporting
relationships into the graph. Assistant and fixture plan diagrams remain valid
without that optional context. Feedback, verification, technical Retry, and
business Replay edges are deliberately not inferred from event order or text;
they are now consumed from the backend's authoritative Task Graph Projection.

Google Chrome DevTools MCP verified the live completed Task
`4e0c83b3-76cc-4399-82c5-22a32cf44982` at
`http://127.0.0.1:3019` against backend `8019`. At desktop `1440x900`, the graph
rendered four frozen organization roles, the hierarchy
`项目负责人 -> 问题处理员 -> 后端修复师 / 前端集成师`, three exact specialist
handoffs into lead review, and a step inspector with the persisted objective,
acceptance criteria, contracts, timing, and reporting parent. The linear and
parallel captured fixtures also rendered different exact DAGs. At portrait
`390x844`, `document.scrollWidth === clientWidth`, the graph stayed inside its
component viewport, and visible canvas controls remained at least `44x44`.

Console output contained only the two existing React Router future-flag
warnings. All real Task, organization-version, usage, approval, feasibility,
and event reads returned `200`; the only aborted requests were the expected
React StrictMode replacements. `npm run typecheck`, `npm run lint`, and
`npm run build` passed; the existing non-fatal main-chunk warning remains.

## M4 assistant organization publish frontend acceptance (2026-07-31)

The assistant Action card now treats `organization.publish` as the single
confirmation for organization creation. Its title and primary button both read
“确认并发布组织”; the normal copy explicitly says that a second click is not
required. The card waits for the Action to reach `completed` or `failed` before
refreshing the typed Organization and version resources. A completed publish is
only reported as successful when the refreshed version is `published` and the
Organization points at that exact `current_published_version_id`. A failed
publish keeps the backend error visible and reports the preserved `proposal`
state when the refresh confirms there was no half-confirmed result. Historical
`organization.confirm` Actions remain renderable for compatibility, while the
legacy two-step Organization page flow was left unchanged.

For older or manually-created Actions whose payload contains only
`spec_version_id`, the card resolves the owning Organization through the typed
organization catalog and version reads before rendering the terminal resource
link and state message. This fallback was exercised with Action
`7b6c6d97-4486-4fa6-8d2c-056efee0369e`; it completed successfully and refreshed
the resolved Organization and version with `200` responses.

Real browser acceptance used the isolated M4 backend at
`http://127.0.0.1:8037` (commit `adf1f9b`, database
`G:\AI\AI_private\mutiAI-m4-org-publish-acceptance\acceptance.db`) and the
frontend Vite proxy at `http://127.0.0.1:3037`. In conversation
`370bb984-a5cb-4b5b-8358-510d78545d41`, the success Action
`037b28a6-a911-4645-97da-fc2da09f0887` completed after one decision POST; its
version `824825db-e57e-46e4-adfa-add713f89420` became `published` and the
Organization pointer matched. The blocked Action
`59f32f36-bd0a-40a8-ab8f-fd7b2efcffc9` failed with `FEASIBILITY_BLOCKED`; its
version `86fb7838-69f7-4a8e-ac62-b52e62a2b029` remained `proposal` with null
confirmation/publication timestamps and no current published version.

The browser emitted exactly two `/assistant/actions/{id}/decision` POSTs for
those two Actions and no direct legacy `/confirm` or `/publish` requests. The
Organization and version refresh GETs all returned `200`. At portrait `390x844`
the document had no horizontal overflow (`scrollWidth === clientWidth === 390`)
and every visible control measured at least `44px`; desktop `1440x900` also had
no horizontal overflow. Screenshots are retained in the isolated acceptance
directory. Chrome DevTools MCP was unavailable because its transport was
closed, so this disclosed real-browser gate used the installed local Chrome
through Playwright as the fallback. Console output contained the two existing
React Router future-flag warnings and the expected initial unauthenticated
`/auth/me` 401 only; there were no application exceptions or unexpected failed
requests.

Final `npm run typecheck`, `npm run lint`, `npm run build`, and
`git diff --check` passed. The production build retains the existing non-fatal
chunk-size warning (786.86 kB minified, 231.41 kB gzip). OpenAPI and generated
types were not regenerated because the backend reported no contract shape
change.

## Read-only Task Graph Projection frontend acceptance (2026-07-31)

The frontend consumed backend handoff `e35dfff` / feature `632dbba` through the
additive OpenAPI snapshot. `GET /api/v1/tasks/{task_id}/graph` is now the source
of truth for a reusable, read-only Operational Blueprint shared with the
organization preview language. The graph renders frozen role swimlanes and
`reports_to` context, every persisted Task/PlanStep/Assignment/Artifact/Case/
WorkItem node, and all six persisted relation types: dependency,
artifact_handoff, feedback, verification, retry, and replay_reuse. Feedback
returns use a dedicated canvas rail so a Case -> WorkItem loop remains legible;
retry and replay stay visually distinct. No node movement, connection, deletion,
or editing controls were added.

The graph keeps the last projection visible during background reconciliation.
Task updates trigger a quiet refetch; a visibility-aware discovery poll finds a
new Task-linked Case even when the Task itself is unchanged; once a Case appears,
its coordination SSE is subscribed with `Last-Event-ID`, deduplicated locally,
and used only to refetch the persisted graph. This avoids a loading flash and
does not promote event payloads into graph state.

Real browser acceptance used the isolated frontend `http://127.0.0.1:3028`
against backend `http://127.0.0.1:8020` and Task
`f066c04f-b3c2-4cfe-a372-8284b3d73248` (Organization
`0375164c-5a0a-40e0-936b-7c2388eb7c47`). The initial projection returned `200`
with 15 nodes and 8 edges: 3 dependency, 3 artifact handoff, 1 feedback, and
1 verification. The existing persisted Case `d372d62b-8322-4962-aa72-a3f2686a885b`
was subscribed through `200 text/event-stream`; a later reconnect carried the
real `Last-Event-ID` header. A live WorkItem transition to `waiting` returned
`200` and the task page updated the WorkItem node to `等待中` without a manual
reload, while retaining the same 15/8 persisted topology.

At desktop `1440x900` and portrait `390x844`, the canvas had no horizontal
overflow (`scrollWidth === clientWidth`), stayed inside its component viewport,
and all visible canvas controls measured at least `44x44`. Chrome DevTools MCP
screenshots showed the organization lanes, artifact handoffs, feedback return
rail, minimap, zoom/fit controls, and read-only inspector. Network inspection
showed `200` graph and Case SSE reads; expected React StrictMode replacement
aborts were the only aborted requests. Console inspection contained no
in-scope application exception (only the existing router warnings where
present).

Final `npm run generate:types`, `npm run typecheck`, `npm run lint`, `npm run
build`, and `git diff --check` passed after the graph refresh patch. The
production build retains the existing non-fatal Vite chunk-size warning
(787.43 kB minified, 231.48 kB gzip). No technical Retry or ReplayRun fixture
was fabricated in the frontend; those paths remain pending real backend data.

## Web day/night theme acceptance (2026-07-31)

The web console now defaults to a light blue-white theme and exposes a
persisted day/night switch. The first-paint initializer in `index.html` applies
`localStorage[nexwork:theme]` before React loads, so a refresh does not briefly
render the opposite theme. `ThemeProvider` owns the tab state and updates the
document color scheme and browser theme color. Desktop users get the switch in
the sidebar; portrait users get the same 44px control in the mobile “更多”
sheet.

OrganizationGraph and TaskGraphProjectionCanvas share the same read-only
blueprint tokens. Light mode uses blue-white lanes, white cards and indigo /
cyan relationship accents; dark mode retains the deep-blue canvas while
preserving all node, lane, relationship and inspector semantics. No editing,
dragging or backend contract behavior was added.

Browser evidence:

- Desktop organization route `http://127.0.0.1:3019/orgs/5ba4856a-a115-4205-be1d-cc3c24812a3f` rendered the organization blueprint at `1440px` width. DOM-computed light values were `#edf5ff` for the blueprint shell and `#f4f8ff` for the app surface; after clicking the switch, the shell became `#07111e` and the page became `#0a1727`. A real dark-mode screenshot showed the sidebar, role cards, connectors, minimap and footer using the same deep-blue theme.
- Reloading that route preserved `data-theme="dark"`, `colorScheme="dark"` and `localStorage[nexwork:theme] = "dark"`; the switch label changed to “切换到日间模式”.
- At portrait `390x844`, the mobile “更多” sheet exposed the switch. The visible control measured `340x44px` and the document had no horizontal overflow (`scrollWidth - innerWidth = 0`). Clicking it changed the document theme and persisted the value.
- Console inspection found only the existing React Router future-flag warnings; no application exception was emitted. Auth and organization requests returned `200` after the expected StrictMode replacement aborts.

Checks after the theme work: `npm run typecheck`, `npm run lint`,
`npm run build`, and `git diff --check` all passed. The production build keeps
the existing non-fatal Vite chunk-size warning (838.45 kB minified, 243.78 kB
gzip).

## Next acceptance gate

This note is superseded by the accepted F2 backend baseline and the explicitly
authorized D1-A handoff recorded below. WeChat testing remains paused as
requested. The existing M3 wait/cancel, needs-revision, approval, Artifact,
usage, and physical-browser follow-ups remain independent regression work.

## M4 Expert Marketplace frontend acceptance (2026-07-31)

The frontend now consumes the integrated backend `b185640` OpenAPI and the
`expert-event.v1` envelope without removing the existing Channel, F0-F2, or
Task Graph Projection surfaces. The typed API layer covers catalog and version
discovery, private conversation creation/list/archive, attachment
upload/revoke/content, persisted messages, Turn reads, and reconnectable finite
SSE. Views do not call the transport directly and a real API failure does not
fall back to fixture data.

The catalog, detail, and private trial pages expose eligibility, deployment
availability, immutable ExpertVersion provenance, interaction mode, input and
output contracts, data handling, and trial isolation. The composer follows
`capability.text_input_mode`: `required` needs text, `optional` accepts either
text or attachments, and `unsupported` renders a disabled empty textarea and
sends attachment-only requests with `text: ""`. Request-response copy states
that each call is independent and does not imply Provider multi-turn memory;
conversational copy states that continuity belongs only to that private
conversation. Trial UI never represents an ExpertConversation as a Task,
released Artifact, RuntimeExecution, or formal role Workspace.

Real-browser acceptance used the frontend at `http://127.0.0.1:3028` and an
isolated `b185640` backend at `http://127.0.0.1:8028`. The backend read a copy
of the accepted live-provider database, leaving the source acceptance database
unchanged. The integrated registration normalized the historical Dify
ExpertVersion to the current `text_input_mode: "unsupported"` semantics. Dify
credentials were deliberately not injected into this browser-only server, so
the catalog correctly showed the Dify deployment as unavailable for a new
trial while keeping its persisted real-provider history readable.

The Dify conversation restored four messages, two independent Turns, both
business-card results, and `2,397` / `2,310` Token totals. Its textarea was
disabled with an empty value. A real non-empty-text POST returned contracted
`422 EXPERT_TEXT_INPUT_UNSUPPORTED` without invoking a provider. A UI-driven
attachment submission was inspected in Network and carried exactly
`{"text":"","attachment_ids":[...]}`. The harness then returned a contracted
422 for that UI request; the frontend kept the backend message visible instead
of clearing the attachment or replacing the error. The Codex conversation
restored its two completed Turns with `13,990` / `14,124` Tokens and presented
the conversational-continuity boundary.

Installed Chrome passed desktop `1440x900` catalog and conversation captures.
Portrait `390x844` reported `scrollWidth === clientWidth === 390`, with no
visible interaction target below 44 px. There were no page exceptions. Network
and Console contained only the expected initial unauthenticated `/auth/me`
probe, the two deliberate 422 guard/error-state checks, React StrictMode
replacement aborts during route changes, and the existing React Router future
flag warnings. Chrome DevTools MCP had a closed transport, so this gate used
Playwright Core with the installed Chrome as the explicitly disclosed fallback.
Screenshots and the JSON report are retained in the isolated acceptance
directory.

`npm run generate:types`, `npm run typecheck`, `npm run lint`, `npm run build`,
and `git diff --check` passed. The production build retains the existing
non-fatal main-chunk size warning.

### Live Dify provider browser follow-up (2026-08-01)

The live-provider browser gate is now complete. Dify API access was injected
into an isolated backend process through the local encrypted vault; no
credential value was printed, persisted in this repository, or included in the
browser report. The frontend ran at `http://127.0.0.1:3038` against the isolated
backend at `http://127.0.0.1:8038`, using a copy of the accepted live-provider
database and attachment store.

The catalog returned the Dify deployment as `available` and `eligible`, with
`interaction_mode=request_response` and
`capability.text_input_mode=unsupported`. In the final browser conversation
`bbc08933-2855-436f-a3c8-9a304368f55c`, the expert textarea was disabled and
empty. The UI uploaded one real `image/jpeg` business-card attachment and the
captured message POST carried exactly `text: ""` with that one persisted
`attachment_id`. Turn `6abe8fca-e4bf-44a9-9381-7fd180e330a3` reached
`completed` with `1,698` Provider-observed Tokens.

A fresh resource read restored the active Conversation, its two persisted
messages, the completed Turn, and the attached image. The expert response
rendered the seven structured fields `company`, `name`, `title`, `phone`,
`email`, `address`, and `website`. Ten finite expert SSE requests were observed
across submission and explicit desktop/mobile reloads; six reconnects carried
the persisted `Last-Event-ID` cursor. The only HTTP failure was the expected
initial unauthenticated `/auth/me` probe, and there were no page exceptions or
unexpected Console errors.

Installed Chrome passed the completed conversation at desktop `1440x900` and
portrait `390x844`. Both reported zero document horizontal overflow; the
portrait page had no visible interaction target below `44px`. Chrome DevTools
MCP still returned `Transport closed`, so this gate used Playwright Core with
the installed local Chrome as the explicitly disclosed fallback. The JSON
report and screenshots are retained under
`G:\AI\AI_private\mutiAI-expert-live-frontend-acceptance`.

The final read-only isolation audit reported `tasks=0`, `artifacts=0`,
`runtime_executions=0`, and `workspaces=0`; the expert trial did not create
formal organization Runtime resources.

## D1-A finite Artifact Stream frontend acceptance (2026-08-01)

The frontend additively consumed backend commit `777622e` without removing the
integrated Expert, Channel, F0-F2, replay, activity/media, or Assistant Schema
`1.1` surfaces. The typed API layer now reads owner-scoped ArtifactStream
list/detail projections; the Task page renders persisted partitions, immutable
ArtifactDelivery records, `each`/`all` subscriptions, finalization watermarks,
failure evidence, and the plan's explicit `stream_output_contracts` /
`stream_input_contracts`. There is no direct view-layer `fetch`, fixture
fallback, timestamp/label inference, or D1-B keyed execution behavior.

Task Graph Projection `1.1` now renders the backend's `artifact_stream`,
`artifact_delivery`, and `stream_finalization` nodes plus
`incremental_handoff`, `stream_subscription`, and `finalization` relations.
The canvas inspector exposes only safe partition, sequence, delivery-kind and
trigger-policy facts already present in the projection. Existing dependency,
whole-Artifact, feedback, verification, Retry and Replay relations remain
unchanged.

Real browser acceptance used five isolated backends and matching Vite proxies:

- `empty`: frontend `http://127.0.0.1:3031`, backend `8021`, Task
  `f8091252-7def-41b1-b444-909c39a80207`, stream
  `0201617b-46dd-5504-8664-0e16e87e75b9`. The UI showed `declared`, zero
  Deliveries, `0/2` final partitions and no finalization.
- `open`: frontend `http://127.0.0.1:3032`, backend `8022`, Task
  `da41579e-a330-4f28-ad0a-2dcebd96e7bc`, stream
  `0ce7c2fb-e01a-5632-b6c1-771061ea1925`. The UI showed `open`, both declared
  partitions waiting, and no invented readiness.
- `partial`: frontend `http://127.0.0.1:3033`, backend `8023`, Task
  `6f7732b7-5886-4ad1-9689-70f7675dc29e`, stream
  `74a33440-a10c-56be-bcc9-12e9d3177000`. The UI showed one immutable accepted
  final `east` Delivery, `final_partition_count=1`, and `1/2`, while `south`
  remained empty.
- `finalized`: frontend `http://127.0.0.1:3034`, backend `8024`, Task
  `8f6d5976-aa7d-4fcf-9a95-ba0da47686c4`, stream
  `d5805bdc-11d6-5d05-9a90-93dd575bbcf1`. The UI showed two accepted final
  Deliveries, `2/2`, the accepted StreamFinalization, and both exact partition
  watermark records. The graph returned eight nodes and seven relations,
  including three incremental handoffs, one subscription, and one finalization.
- `failed`: frontend `http://127.0.0.1:3035`, backend `8025`, Task
  `6a6eb517-deb7-4969-ad20-51c39a59b5ba`, stream
  `23758de5-cf90-530d-8e82-9c2417c1061a`. The UI kept the accepted `east`
  Delivery visible beside the persisted deterministic failure summary.

For every scenario, Network showed `200` for both
`GET /api/v1/tasks/{task_id}/streams` and its stream-detail route. The empty
Task's UI-driven start request returned `409
INCREMENTAL_EXECUTION_NOT_ENABLED` (request
`cdc8b74e-40f8-432c-b8a6-adb91306c146`); a subsequent persisted Task read
still showed `created`, plan `validated`, and the producer step `ready`. A
second account received the normal owner-scoped `404 TASK_NOT_FOUND` response
(request `ec12fe15-d1ef-4eb8-97a6-dc00e7dae73b`).

The finite Task SSE replay reconnected with a real `Last-Event-ID` header and
deduplicated by event ID. On the finalized Task, a hard reload restored exactly
two `artifact_delivery.accepted` rows, one `artifact_stream.finalized` row, and
one stream card; no duplicate view state appeared. A normal finite SSE batch
close now stays visually live while the next replay read is scheduled; only a
transport error is presented as reconnecting.

Chrome DevTools MCP verified the finalized page at desktop `1440x900` and
portrait `390x844`. Both had zero document and content-scroller horizontal
overflow. The portrait stream viewport had no visible interaction target below
`44px` after excluding the intentionally hidden native file input. Screenshots
show the blue-white desktop stream panel and the vertically ordered mobile
partition/finalization flow. Console contained no application exception or
unexpected error; only the two existing React Router future-flag warnings
remained.

Final `npm run generate:types`, `npm run typecheck`, `npm run lint`, `npm run
build`, and `git diff --check` passed. The additive OpenAPI audit confirmed the
new stream routes alongside the existing Expert, Channel, and Coordination
routes. The production build retains the non-fatal chunk-size warning
(`859.86 kB` minified, `248.80 kB` gzip). At the time of this D1-A capture,
D1-B had not started; its later frontend acceptance is recorded below. After
acceptance capture, all isolated listeners on `8021-8025` and `3031-3035` were
stopped; the five scenario databases and stored delivery bytes were retained as
audit evidence.

## D1-B keyed `each` frontend acceptance (2026-08-01)

The frontend now consumes backend commit `6a58602` from the isolated clean
worktree `G:\AI\AI_private\Codex_projects\mutiAI-wt-d1b-frontend-acceptance`
(`HEAD=6a58602`, no D1-C migration). The generated client includes
`PlanStepExecution`, `DeliveryInputBinding`, their status enums, and the
owner-scoped `stream-executions` list/detail routes. `useLiveTaskStreams`
refreshes both finite stream projections and keyed executions after Task SSE
notifications; views never infer an execution, Assignment, or binding from
event order.

The Task page and read-only Graph Projection canvas now show:

- per-partition `ready`, `submitted`, `running`, `waiting`, `completed`, and
  terminal states;
- exact Assignment and trigger Delivery identities;
- declared/materialized DeliveryInputBinding state and SHA-256 equality;
- bounded `max_concurrent_executions` occupancy and persisted backpressure;
- Graph Projection `1.2` keyed-execution/binding nodes and
  `delivery_binding`/`keyed_execution` relations;
- the explicit boundary that keyed D1-B does not complete the frozen consumer
  PlanStep, create lead review, or complete the Task.

Real browser acceptance used three isolated services (backend/frontend):

| Scenario | Backend / frontend | Task | Result |
| --- | --- | --- | --- |
| ready | `8126` / `3136` | `579a7b58-12a7-48c0-b0ca-ca668c7849d7` | `ready → submitted → running → completed`; Assignment created and binding materialized after the persisted Delivery scheduler wake |
| completed | `8127` / `3137` | `5429ed15-92bd-4cd6-84a2-b297b15d1cd0` | keyed `east` execution completed; frozen consumer and lead review remain unfinished |
| backpressure | `8128` / `3138` | `a5413fdc-9c83-4909-902e-7912e5522f2a` | `east=waiting`, `south=ready` with no Assignment, occupancy `1/1`, binding materialized only for `east` |

The backpressure stream is
`471260d2-61c9-5132-8914-7cd964c0a35d`; its keyed executions are
`2b2bf74d-9513-51dc-8eae-613bf795f9d3` (`east`) and
`8f675ba1-5332-5405-86f7-c171f673c1ec` (`south`). The browser showed Graph
Projection `1.2` with 12 nodes and 11 persisted relations, including exact
binding and keyed-execution edges. The page's start action returned
`409 INCREMENTAL_EXECUTION_NOT_ENABLED` and the Task stayed unchanged.

After hard reload, the page restored the same persisted counts with no duplicate
Deliveries or executions. A subsequent Task SSE request carried
`Last-Event-ID: f1011843-ad28-4cc0-89cc-f8818e999718`; the API then returned
`200` and the UI remained live while projections were refreshed. Owner isolation
was verified in a second browser context: the same Task and
`GET /tasks/{task_id}/stream-executions` both returned `404 TASK_NOT_FOUND`.

Chrome DevTools MCP verified the real pages at desktop `1440x900` and portrait
`390x844`. Desktop showed the blue-white keyed execution panel; portrait had
`clientWidth=scrollWidth=390`, no horizontal overflow, no visible interactive
control below 44px, and the same east/south/backpressure semantics. Console had
no application exceptions; only the two existing React Router v7 future-flag
warnings remained. Network showed successful authenticated graph, streams,
stream-executions, detail, usage, approvals, and SSE requests; initial
StrictMode replacement aborts were immediately followed by successful 200s.

Automated checks after the D1-B delta: `npm run typecheck`, `npm run lint`,
`npm run build`, and `git diff --check` all passed. The production build keeps
the existing non-fatal Vite chunk-size warning (`872.39 kB` minified,
`251.66 kB` gzip). The temporary listeners on `8126-8128` and `3136-3138`
were stopped after evidence capture; their scenario databases and stored bytes
remain intact. D1-C was still frozen at that capture; its later frontend gate is
recorded below, and D1-D is the current frozen boundary.

## Theme surface follow-up (2026-08-01)

The dark theme gap reported on the Expert Marketplace is fixed. Several page
roots still used hard-coded light backgrounds (`#f4f6f8`, `#f5f8f6`, and
`#fbfaf7`), so the dark shell was surrounded by bright content gutters and
error states. Expert catalog/detail/conversation, Coordination, Coordination
Case Detail, and Channels now use the shared `--nexwork-page` and
`--nexwork-surface` tokens. The sidebar brand gradient and active navigation
state also have explicit dark-theme treatments.

Real browser acceptance used the frontend at `http://127.0.0.1:3038` and the
isolated backend at `http://127.0.0.1:8038` with the installed local Chrome via
Playwright Core. Chrome DevTools MCP again returned `Transport closed`, so this
was the explicitly disclosed fallback. The gate covered the successful Expert
catalog, Expert detail, completed Expert conversation, Coordination, Channels,
and the exact `专家目录加载失败 / Failed to fetch` state from the report. In
dark mode every affected page resolved its root to `#07111f`; the simulated
catalog error state contained no large bright surface. The brand remained
readable and the active navigation no longer used a light gradient.

The same browser run toggled back to light mode after the theme transition and
verified the catalog root as `#f4f8ff` with white cards and dark text. At
`390x844`, the dark catalog had zero horizontal overflow and no visible control
below `44px`. Console had no page exceptions; the only failed response was the
expected initial unauthenticated `/auth/me` probe, and the only deliberate
request failure was the simulated catalog error.

Evidence is retained under
`G:\AI\AI_private\mutiAI-theme-dark-surface-acceptance`, including
`theme-dark-surface-report.json`, dark/light catalog screenshots, and the dark
error-state screenshot.

## D1-C final-watermark `all` convergence frontend acceptance (2026-08-01)

The frontend additively consumes backend commit `d02bade` from the isolated,
detached acceptance worktree
`G:\AI\AI_private\Codex_projects\mutiAI-wt-d1c-frontend-acceptance`
(`HEAD=d02bade`, migration head `20260801_0022`). The active backend development
worktree had already advanced into uncommitted D1-D work and was not touched.
The composed OpenAPI snapshot and generated client now include `all`,
`trigger_finalization_id`, and Task Graph Projection `1.3` relations
`watermark_convergence` and `incremental_output` without removing the independent
Expert, Channel, Coordination, Assistant, replay, or D1-A/B surfaces.

The Task page now distinguishes partition `each` executions from the one
final-watermark `all` execution. It renders the exact accepted Finalization,
every declared/materialized DeliveryInputBinding with SHA-256 equality, the
released aggregate Artifact, and the final lead review. The canvas labels
`incremental_output` as “增量产出”; it does not misrepresent a partial delivery
as an aggregate result. Task/SSE events remain refresh notifications only.

Real Chrome DevTools MCP acceptance used four isolated persisted scenarios:

| Scenario | Backend / frontend | Task | Persisted result shown in the UI |
| --- | --- | --- | --- |
| partial | `8129` / `3149` | `353c3503-4dbc-4857-8ca4-6da77f274b98` | downstream stream `1/2`; `east` each execution completed; no Finalization or `all` execution; Task remains `running` |
| finalized | `8130` / `3150` | `c8ae4d61-0e40-4f64-bf4e-6ce3070995db` | accepted Finalization; `all` execution `38b6b588-e951-53ac-93b6-d86419278410` is `ready`; two exact bindings are `declared`; no Assignment, aggregate Artifact, or lead review |
| completed | `8131` / `3151` | `6b39bf77-d492-45f1-af6a-ca2d6afa6e53` | `all` execution `a606c6f5-b450-5525-9d5c-52f0b0c301b2` completed; its two bindings are materialized; released aggregate Artifact `dc636464-bc5c-520a-ae2c-53dbe5faa20a`; lead review Assignment `e8d087cd-957b-5572-b7ca-8e1478888c53`; Task completed |
| corrupt | `8132` / `3153` | `23c07491-7acf-4668-8d5f-03fd90fc7d10` | Task remains `created`; both public streams remain `open`; there is no Finalization and no `all` execution |

The completed event log places aggregate completion and released Artifact before
`lead.review_completed`, with `task.completed` last. A finalized-task SSE replay
reconnected with
`Last-Event-ID: b147098c-cb65-4194-90c2-2c5a57987f8e`; repeated finite reads
did not duplicate Deliveries, executions, or cards. The stream-plan start control
returned the expected `409 INCREMENTAL_EXECUTION_NOT_ENABLED`; the subsequent
Task read remained `created` with a validated plan. A second browser account
received owner-scoped `404` responses for the Task, graph, stream list, and
stream-execution list.

Desktop `1440x900` and portrait `390x844` were verified with Chrome DevTools MCP.
Both had zero document horizontal overflow. The portrait page had no visible
interaction target below `44px`; only the intentional stream selector and
diagnostic payload blocks scroll internally. Console had no application
exceptions; the two existing React Router future-flag warnings remain. Network
showed successful authenticated Task, graph, stream, execution, detail, usage,
approval, and SSE reads, apart from the expected `409`, owner-scope `404`, and
StrictMode replacement aborts. Live desktop, portrait, and feature-panel
screenshots were captured through Chrome DevTools MCP during the gate.

### D1-C corrupt finalization-attempt re-acceptance (2026-08-02)

The previously recorded corrupt-finalization contract gap is closed by backend
commit `0789854` on `fix/d1c-finalization-attempt` (`HEAD=0789854`, migration
head `20260801_0023`). The frontend mechanically applied only the OpenAPI delta
from `d02bade` to `0789854`, regenerated the client, and refreshed the copied
D1-C acceptance and incremental-delivery records. D1-D remained frozen and its
worktree was not touched.

The Task stream panel now renders the backend-owned immutable
`finalization_attempts` projection, including attempt number, accepted/rejected
status, stable error code, safe summary, failed partition, observed/expected
watermark counts, and the verified subset. The graph canvas consumes the new
`stream_finalization_attempt` node and its persisted `verification` edge; the
Task event log renders the structured `artifact_stream.finalization_rejected`
payload. None of these states is inferred from Stream status, Delivery order, or
message text.

Real Chrome DevTools MCP re-acceptance used backend `8133`, frontend `3154`, and
Task `0580207b-2553-4913-ba76-7ab3a651dc1d`. The rejected attempt is
`84544c87-b58d-49e4-b809-4154c07e55b4` for Stream
`5da312ce-c16b-560c-8e72-8ffbd1bc783e`, with code
`STREAM_FINALIZATION_DELIVERY_CORRUPT` and failed partition `south`. A hard
refresh restored exactly one attempt card and exactly one rejected event. Both
streams remained `open`; there was no StreamFinalization and no `all` execution.
Graph Projection `1.3.1` returned 15 nodes and 14 edges, including one rejected
`verification` relation from the ArtifactStream to the finalization-attempt node.

The refreshed Task SSE request carried
`Last-Event-ID: 8ef53cc4-b818-476a-936e-de5ad4ac404e`. Desktop `1440x900` and
portrait `390x844` both had zero document horizontal overflow; the portrait page
had no visible interaction target below `44px`. Console contained no application
exception; only the two existing React Router future-flag warnings remained.
Authenticated Task, graph, stream, execution, usage, approval, and SSE reads
completed successfully; the initial replacement aborts were the expected React
StrictMode development behavior.

Final `npm run generate:types`, `npm run typecheck`, `npm run lint`, `npm run
build`, and `git diff --check` passed. The production build retains its existing
non-fatal chunk-size warning (`885.61 kB` minified, `255.08 kB` gzip). D1-D
restart recovery, partition Retry/Replay, usage, and the production automatic
dispatcher remain frozen and were not claimed or implemented.

## D1-D incremental recovery and replay-lineage frontend acceptance (2026-08-02)

The frontend mechanically consumes backend commit `7d2ca89` from
`feat/d1d-recovery-lineage` (`HEAD=7d2ca89`, migration head
`20260801_0024`) without modifying the backend worktree or its retained stash.
The generated client and read-only backend documentation now include immutable
Delivery/Execution Attempts, partition Retry/cancel requests, strongly typed
Replay Artifact/Delivery bindings, and Task Graph Projection `1.4`.

The Task stream panel renders accepted, duplicate, rejected, and conflicting
Delivery publication Attempts; immutable keyed-execution Attempts with trigger,
usage, limits, Assignment and Runtime references; exact input bindings; and
owner-scoped partition controls. Retry uses a stable `Idempotency-Key`, while
Retry and cancel both refresh Task, Stream, Execution and Graph projections and
reconnect the Task SSE feed. The replay panel shows exact fixed Delivery inputs
and SHA-256 values; the graph inspector consumes the persisted RetryAttempt,
ReplayRun, Delivery and PlanStepExecution nodes and never infers lineage from
event order or text.

Real Chrome DevTools MCP acceptance used five isolated persisted scenarios:

| Scenario | Backend / frontend | Task | Persisted result shown in the UI |
| --- | --- | --- | --- |
| retry | `8134` / `3155` | `6bc2f9e6-e066-45fb-b731-7037383da5fd` | `south` changed from failed Attempt 1 to completed Attempt 2 (`trigger=retry`); `east` remained completed; Graph Projection `1.4` added one authoritative `retry` relation; Delivery Attempts remained 5; `Task.replay_count` remained 0 |
| exhaustion | `8135` / `3156` | `e7dd89d9-5dff-4194-bdbf-155483758018` | Retry POST intentionally returned `500` from the fake Runtime failure, but persisted Attempt 2 with `runtime_submission_failed`, Retry `1/1`, and the bounded-exhaustion explanation; hard refresh restored the same three total execution Attempts and preserved completed `east` |
| cancel | `8136` / `3157` | `82fe24bd-705b-414f-a647-781718e2db3d` | ready `south` was cancelled with no Assignment or Runtime Attempt; completed `east` remained unchanged; the Task deterministically became failed with `stream_partition_cancelled`; refresh restored the cancelled reason and exact Delivery binding |
| recovery | `8137` / `3158` | `421593ae-10b5-4bd0-bb25-a4727e6582c9` | startup reconstructed deterministic `east` keyed execution `3bb10930-7187-5a30-9f45-fb94a171b405` as ready with one declared binding, no Assignment and zero Runtime Attempts; refresh did not create another execution; normal Task start returned `409 INCREMENTAL_EXECUTION_NOT_ENABLED` and left the Task unstarted |
| replay | `8138` / `3159` | `6836babe-8444-4b8d-b33f-918d17854595` | completed from-step ReplayRun `e78da6ff-04a5-4464-b7e8-0feba9083a79` displayed two exact fixed source Delivery bindings; copied Deliveries retained source/ReplayRun lineage; Graph Projection `1.4` returned 54 nodes, 64 edges, and two authoritative `replay_reuse` relations; final lead review remained completed |

The successful Retry request carried
`Idempotency-Key: bf241c5c-fcaa-4ff9-8880-2a8bbf53fb1a`; the exhaustion request
also carried a distinct stable key. A post-Retry SSE reconnect carried
`Last-Event-ID: 559fdb19-ea85-4632-a204-645b95c294be`, and repeated refreshes
did not duplicate Attempt cards or graph relations. A second owner received the
hidden `404 TASK_NOT_FOUND` envelope for the Retry task graph (request
`c3c73fdb-e662-4ca2-90fa-4f6fcd4eac69`).

Desktop `1440x900` and portrait `390x844` were verified through Chrome DevTools
MCP. Both had zero document horizontal overflow; the portrait page had no
visible interaction target below `44px`. The normal Retry, cancel, recovery and
replay pages had no application exception; only the two existing React Router
future-flag warnings remained. The exhaustion page logged the expected failed
resource corresponding to its deliberate fake-Runtime `500`. Authenticated
Task, graph, stream, execution, usage, approval and SSE reads otherwise
completed successfully; development-only replacement aborts were React
StrictMode behavior. Screenshots were captured at
`C:\Users\28788\AppData\Local\Temp\nexwork-d1d-retry-desktop.png`,
`nexwork-d1d-retry-mobile.png`, and `nexwork-d1d-replay-mobile.png`.

The isolated SQLite databases and manifests remain under the backend worktree's
`var/d1d-acceptance/` directory as audit evidence. Temporary backend/frontend
listeners are stopped after the gate. The producer Runtime publication tool and
production automatic dispatcher remain unavailable by contract; D1-E remains
frozen and was not implemented or claimed.

### D1-D Cancel/SSE recheck after frontend correction (2026-08-02)

After the final review found that Cancel refreshed persisted projections but did
not explicitly reconnect the Task SSE feed, the control path was unified with
Retry and rechecked against a fresh isolated state. Backend `8136` and Vite
`3157` served Task `86be20ba-6c7c-47a2-8266-871c224bedae`. The browser filled a
real cancellation reason and clicked the south partition control; the cancel
request returned `200`, the next Task event request carried
`Last-Event-ID: d3ed1275-dba8-4880-82e2-03f15299298f`, and the UI refreshed the
Task, stream, execution, graph, usage, and approval projections. The persisted
state became `failed` with `stream_partition_cancelled`; east remained completed
and south remained cancelled without an Assignment or Runtime Attempt.

A hard refresh restored the same cancellation reason, sibling state, and
Projection `1.4` graph without duplicate rows. Desktop and portrait
`390x844` views had `scrollWidth === clientWidth`; the only sub-44px element was
the intentionally hidden native attachment input. Screenshots are retained at
`C:\Users\28788\AppData\Local\Temp\nexwork-d1d-cancel-recheck-desktop.png` and
`nexwork-d1d-cancel-recheck-mobile.png`. Console contained only the two known
React Router future-flag warnings, and all authenticated requests in the flow
completed successfully.

Final `npm run generate:types`, `npm run typecheck`, `npm run lint`, `npm run
build`, and `git diff --check` passed. The generated contract stayed stable.
The production build retains the existing non-fatal chunk-size warning
(`901.90 kB` minified, `257.74 kB` gzip).

## Role execution limits and pricing contract (2026-08-02)

The frontend contract snapshot now includes backend commit `11e55507`
(`feat: add per-role execution limits and pricing`) additively. The OpenAPI
delta was applied from its parent `c1e9deb` so the existing Expert, Channel,
Coordination, and D1-A through D1-D surfaces remain intact. The OrganizationSpec
JSON Schema is semantically identical to the backend HEAD and now includes
`RoleExecutionLimits` on each `AgentRoleSpec`.

The generated client exposes the backend-owned `execution_limits`, effective
Token/runtime limits, `cost_usd`, `cost_status`, and
`pricing_catalog_version` fields on Assignment, Runtime execution, and Task
usage responses. `effective_runtime_seconds` is typed as `number` and is
rendered without integer coercion. Task usage now separates observed Tokens,
charged Tokens, backend-estimated USD, limit snapshots, and the price-catalog
version. Organization graph role inspection shows the optional per-attempt
limits. No model unit price is submitted, edited, or calculated in the client.

The backend price catalog version is `openai-standard-2026-07-30`; the browser
only displays its persisted snapshot identifier. Unknown-model feasibility
blocking and pricing-unavailable errors remain backend-owned and are rendered
through the existing typed error/feasibility surfaces.

Real desktop browser acceptance used backend `11e55507` at
`http://127.0.0.1:8041`, Vite at `http://127.0.0.1:3041/`, and viewport
`1440x1000`. The accepted organization is
`bc7ef1f7-e80c-4838-9575-451094ff4f4d`; its role inspector rendered the
persisted `120,000` Token, `$0.500000`, and 15-minute per-attempt limits. Task
`fd0ff9a5-3a3c-4ced-8f78-5075b894b6a5` rendered a persisted backend-shaped
`$0.018320` estimate, `openai-standard-2026-07-30`, and fractional
`effective_runtime_seconds=12.5` without rounding it to an integer. Because the
fake Runtime does not report usage, this estimated snapshot was populated only
inside the isolated acceptance database to exercise the read contract; the
frontend performed no price calculation. A second real fake-Runtime Task,
`88b6f99a-f93f-49e4-bba8-08be38a11229`, naturally produced
`cost_status=unavailable`; the UI showed “费用暂不可用” and never `$0`.

Light and dark organization/Task views had
`documentElement.scrollWidth === clientWidth === 1440`. All authenticated
Organization, version, Task, usage, graph, stream, approval, and SSE requests
completed successfully. Console output contained no page exception or new
application error; only the expected initial `/auth/me` 401 and the two existing
React Router future-flag warnings appeared. Chrome DevTools MCP returned
`Transport closed`, so the equivalent installed-Chrome Network, Console,
interaction, theme, and screenshot gate was completed through Playwright Core.
Evidence is retained under
`G:\AI\AI_private\nexwork-role-limits-acceptance`.

Final `npm run generate:types`, `npm run typecheck`, `npm run lint`, `npm run
build`, and `git diff --check` pass. The production build retains the existing
non-fatal chunk-size warning (`910.51 kB` minified, `259.93 kB` gzip). The
isolated `3041/8041` listeners were stopped after capture; the acceptance
database and screenshots remain as evidence.

The isolated acceptance database's pre-seeded organization and role
name/description values contain `?` placeholders as persisted data. The
execution-limit values and labels are rendered correctly; this seed-data
encoding artifact is not a frontend price/limit formatting issue, and the
shared development database was not modified.

## Feasibility summary UX (2026-08-02)

Repeated Runtime feasibility records are now presented as one product-level
summary instead of one card per backend check. The summary uses the most severe
persisted outcome (`blocked`, `capability_unknown`, `conditional`, then
`feasible`), shows the check and outcome counts, and deduplicates actionable
findings. The individual phase, validator, timestamp, result, and finding count
remain available under a default-collapsed `技术校验记录` disclosure for
diagnostics. No feasibility result is discarded or inferred by the client.

Real browser acceptance used the isolated D1-D Replay scenario at backend
`http://127.0.0.1:8138`, Vite `http://127.0.0.1:3159`, and Task
`e769a703-3f2d-4709-9f92-0fad09392b5c`. The page rendered exactly one
`Runtime 可行性` summary with `可行 · 8 次检查 · 可行 8`; the technical record
was collapsed on entry and expanded to all eight persisted checks on demand.
Desktop `1440px` and portrait `390x844` had no document horizontal overflow.
The mobile view had no visible control below `44px`, excluding the deliberately
hidden native attachment input. Console contained only the two existing React
Router future warnings. Network requests completed successfully; development
replacement aborts were React StrictMode behavior. Screenshots are retained at
`C:\Users\28788\AppData\Local\Temp\nexwork-feasibility-summary-desktop.png`
and `C:\Users\28788\AppData\Local\Temp\nexwork-feasibility-summary-mobile.png`.

`npm run typecheck`, `npm run lint`, `npm run build`, and `git diff --check`
passed. The production build retains the existing non-fatal chunk-size warning
(`912.63 kB` minified, `260.60 kB` gzip). The isolated acceptance database is
retained under the backend worktree's `var/d1d-acceptance/` directory; temporary
listeners were stopped after capture.

## Q0 role queue frontend integration (2026-08-02)

The frontend contract snapshot now includes the additive Q0 delta from backend
commit `1b85dbb`. Generated types expose `TaskResponse.role_queue`, the nested
Assignment queue projection, safe active-lease facts, FIFO position/capacity,
and the queued-item cancellation request. The typed endpoint layer now consumes
`POST /api/v1/tasks/{task_id}/role-queue/{role_work_item_id}/cancel`; views still
make no direct transport calls and do not derive queue truth from events,
Runtime fields, or text.

Task detail renders a compact `岗位调度` summary only while a role item is
`queued`, `leased`, or `running`. It distinguishes `等待岗位空闲`,
`已获得岗位租约`, and `正在执行`, shows position, work ahead, capacity, source,
and whether the role is occupied, and deliberately omits internal holder IDs,
Thread/Turn identities, Workspace paths, and terminal queue history already
available through the persisted Task/graph/event records. A queued item has an
explicit reasoned cancellation control; the response replaces the Task and
reconnects/refetches persisted resources through the existing live-Task path.

Real browser acceptance used backend `http://127.0.0.1:8145` from
`feat/q0-role-work-queue@1b85dbb` and Vite `http://127.0.0.1:3165`. Task
`926ed4fb-5533-48c4-a900-9322f64ef19a` held the `worker` role while Task
`e2fa935a-a795-4e88-83b6-b8d6b0127356` remained FIFO position 1 with capacity
1 and an authoritative active-work projection. The queued Task's lazy
RuntimeExecution existed, but `runtime_job_id`, Thread/Turn, and `workspace_id`
were all null. The UI showed one queue summary and never exposed those internal
fields.

The browser submitted `{"reason":"用户取消排队"}` to the new endpoint and
received HTTP 200. The queue item, Assignment, RuntimeExecution, and plan step
became `cancelled`; the Task converged to `needs_revision`, the role panel left
the active view, and the already-running sibling Task remained unchanged. A
fresh navigation restored the same terminal state and cancellation evidence.
All Task, graph, stream, usage, approval, SSE, and cancellation requests
completed successfully; development-only aborted duplicate reads were React
StrictMode replacement requests. Console contained only the two existing React
Router future warnings.

Desktop `1440x900` and emulated portrait `390x844` had no document horizontal
overflow. The portrait view had no visible interaction target below `44px`.
Final screenshots are retained at
`C:\Users\28788\AppData\Local\Temp\nexwork-q0-role-queue-active-desktop-final.png`,
`nexwork-q0-role-queue-active-mobile-final.png`, and
`nexwork-q0-role-queue-cancelled-mobile-final.png`. The isolated database remains at
`G:\AI\AI_private\Codex_projects\mutiAI-wt-role-work-queue\var\q0-acceptance\frontend-role-queue-20260802-b`.

`npm run generate:types`, `npm run typecheck`, `npm run lint`, `npm run build`,
and `git diff --check` pass. The production build retains the existing
non-fatal chunk-size warning (`919.41 kB` minified, `262.44 kB` gzip). This
frontend pass does not claim the separate production automatic activation
milestone or add queue editing, priority changes, preemption, or lease controls.

## D1-E production incremental activation frontend acceptance (2026-08-02)

The D1-E real-frontend gate passes against the uncommitted backend implementation
on `feat/d1e-production-activation`, based on Q0 commit `1b85dbb`. D1-E adds no
public API shape, so the frontend did not invent or regenerate a different
contract. The Task start control now describes the enabled product behavior as
`开始增量执行`; the Artifact Stream and Replay surfaces no longer claim that
the production dispatcher is unavailable. Incremental Replay retains the real
backend boundary that only `from_step` is supported.

The normal automatic path used Task
`91492f52-c22e-4e7c-bbce-c9a4c933de98` and completed the persisted sequence
`Producer -> east/south each -> all -> Lead Review -> Task Completed`. The UI
observed 105 continuous, unique Task events. No acceptance harness manually
woke the keyed scheduler after start.

The combined D1-E/Q0 path used Organization
`300975ab-4dce-4e4a-9f08-a7db97fce541` and Task
`55076e1c-6fd0-46c8-8793-614cb9a48aec`. While the `transformer` role had
capacity one, one partition was running and the sibling remained authoritative
FIFO position one. The queued item already had its Assignment and RoleWorkItem,
but `runtime_job_id`, `workspace_id`, Thread ID, and Turn ID were all absent.
After the first item completed, persisted events appeared in the expected order:
`role.work_item_dispatching`, `runtime.execution_role_available`,
`role.work_item_leased`, and `role.work_item_started`. The queued partition then
woke automatically, followed by the `all` convergence, aggregate Artifact,
Lead Review, and terminal Task completion. The UI observed 113 continuous,
unique events and exposed none of the internal Runtime or Workspace details.

An explicit SSE reconnect carried `Last-Event-ID`; the empty replay response
added no duplicate event. Refresh restored the same completed Task, stream,
queue, execution, graph, usage, and review facts from product records.

Chrome DevTools MCP verified the completed flow at
`http://127.0.0.1:3167/tasks/55076e1c-6fd0-46c8-8793-614cb9a48aec` on desktop
`1440x900` and portrait `390x844`. Both views had zero document horizontal
overflow; every visible portrait interaction target was at least `44px` high.
Console contained no application exception and only the two existing React
Router future-flag warnings. Authenticated Task, graph, stream, execution,
usage, approval, and SSE traffic completed successfully. Initial
`ERR_ABORTED` reads were React StrictMode replacement requests followed by
successful HTTP 200 responses.

Acceptance evidence remains in
`G:\AI\AI_private\Codex_projects\mutiAI-wt-d1e-production-activation\var\d1e-acceptance\frontend-production-20260802-q0`
and the screenshots
`C:\Users\28788\AppData\Local\Temp\nexwork-d1e-q0-mobile-queued.png`,
`nexwork-d1e-q0-390x844-completed.png`,
`nexwork-d1e-q0-1440x900-completed.png`, and
`nexwork-d1e-desktop-completed.png`. The cancelled rehearsal Task
`29035093-d95f-412a-bd38-51c8cd9a0fe8` is retained only as audit history and is
not D1-E acceptance evidence.

`npm run lint`, `npm run typecheck`, `npm run build`, and `git diff --check`
pass. The D1-E/Q0 temporary backend and Vite listeners are stopped after the
gate; the database and screenshots are retained. Frontend changes remain
intentionally uncommitted for the later combined review.

The backend-owned validation-summary defect found during this gate is resolved.
New stream plans now persist `Validated as a finite D1-E Artifact stream plan;
incremental execution is enabled through the explicit Task start boundary for
supported each/all policies.` Internal failures likewise require the explicit
Task Start boundary instead of claiming that incremental execution is disabled.
Historical acceptance plans remain immutable and retain their original summary
as audit evidence; the frontend continues to render the authoritative persisted
value without rewriting it.

No public API shape changed with this correction, so no frontend type
regeneration or additional browser gate is required. F0 through F2, D1-A
through D1-E, and Q0 are accepted. Feature work is frozen while the frontend
and backend enter combined review, semantic merge, and release-candidate
closure.

## Integrated main candidate audit (2026-08-02)

The complete `feat/m3-frontend-foundation` history was reviewed and
fast-forwarded into local `main`; both local branches pointed to candidate
commit `aaa7387` at the merge gate. The repository had one frontend worktree,
no stash, and no additional local or remote frontend feature branch. The
candidate includes the accepted Assistant rich-content/input flow,
organization preview, mixed-DAG Replay, Task Graph Projection, D1 Artifact
Streams, Q0 role queue, F0-F2 Coordination, Expert Marketplace, Channel,
theme, and responsive surfaces.

The frontend OpenAPI snapshot, backend main snapshot, and live
`http://127.0.0.1:8150/api/openapi.json` were semantically identical at 89
paths and 209 schemas. Regenerating `src/api/schema.d.ts` produced no diff.
`npm run typecheck`, `npm run lint`, `npm run build`, and `git diff --check`
passed on `main`; the build retained only the existing non-fatal 919.39 kB
main-chunk warning.

Chrome DevTools MCP completed the post-merge browser gate through
`http://127.0.0.1:3168` with its proxy targeting backend main at
`http://127.0.0.1:8150`. The published organization
`7d7c9c5b-4e00-4e46-86a6-ffdd2f8528a4` rendered the read-only organization
blueprint, and completed Task `4e0cc1ae-cce9-4da3-ab48-f6965545137f`
rendered Projection `1.4`, the feedback-loop canvas, persisted Artifacts,
execution details, usage, approvals, and terminal event stream. Desktop
`1440x900` and portrait `390x844` had no document horizontal overflow; the
portrait gate found no visible interaction target below 44px. Theme switching
worked in both directions. Console contained only the two existing React
Router v7 future-flag warnings. Authenticated Task, graph, stream, execution,
usage, approval, organization, Assistant, and SSE requests completed with HTTP
200; initial aborted duplicate reads were React StrictMode replacements.

Post-merge screenshots are retained at
`C:\Users\28788\AppData\Local\Temp\nexwork-main-final-desktop.png`,
`nexwork-main-final-mobile-390x844.png`,
`nexwork-main-task-desktop-1440x900.png`, and
`nexwork-main-task-mobile-390x844.png`. The frontend remains served on port
3168 against backend main on 8150 for the next deep-integration pressure pass.

## Expert Marketplace theme and category selection correction (2026-08-02)

The Expert Marketplace light theme no longer renders its introductory Hero as
a hard-coded dark panel. It now uses the product's blue-white daytime palette,
while the explicit night theme retains the navy treatment. Category browsing
is a strict single-selection radio group: choosing a new operator category
replaces the previous category and sends exactly one `category` query parameter;
“全部专家” clears the category filter. The explanatory, empty-state, and result
summary copy now describe the single-category behavior. Search and filter form
controls also expose stable `id` and `name` attributes.

Chrome DevTools MCP verified the real page at `http://127.0.0.1:3168/experts`
against backend `8150`. Selecting 数据分析 and then 文档提取 produced separate
successful requests ending in `category=data-analysis` and
`category=document-extraction`; the second request did not retain the first
category, and exactly one category remained checked. Desktop `1440x900` and
portrait `390x844` had no horizontal overflow; the portrait view had no visible
control below 44px. Light and dark Hero computed styles switched correctly.
Console contained only the two existing React Router future-flag warnings, and
the prior missing form-field identifier issue was cleared. Screenshots are
retained at
`C:\Users\28788\AppData\Local\Temp\nexwork-experts-single-category-light.png`
and `nexwork-experts-single-category-mobile.png`.

`npm run typecheck`, `npm run lint`, `npm run build`, and `git diff --check`
pass. The production build retains the existing non-fatal main-chunk warning
(`919.55 kB` minified, `262.51 kB` gzip). Backend commit `0129303` changes the
web-conversation persistence rule without changing the public OpenAPI shape;
the frontend, backend snapshot, and current 8150 OpenAPI remain semantically
identical at 89 paths and 209 schemas. The singleton migration is not yet live
on 8150 because that service has not been restarted.

## Expert Marketplace customer-facing copy reduction (2026-08-02)

The Expert Marketplace now keeps its visual Hero as a concise first-use guide:
one product headline plus the three steps “选择能力 / 开始试用 / 添加到组织”.
The duplicate page subtitle, zero-value metric cards, English operator labels,
implementation nouns, contract disclaimers, and demo-data statement were
removed from the catalog surface. Classification, version pinning, trial
isolation, and typed API behavior remain unchanged.

Category browsing now starts with “选择能力类型”. Search and filter copy uses
the customer-facing terms “搜索专家或能力”, “服务来源”, “使用方式”, and “可用状态”.
The empty state distinguishes a genuinely empty directory from an active search
or filter with no match. Catalog cards no longer repeat both the short
description and capability purpose, repeat the Provider as a tag, or show a
disabled trial button beside an unavailable badge and reason.

Backend eligibility reason codes remain authoritative but are no longer exposed
as customer prose. The observed `runtime_provider_not_configured` state is
presented as “服务暂未配置完成，当前无法试用”; unknown codes use a generic
unavailable message. The same presentation helper is used by the catalog and
Expert detail pages.

Chrome DevTools MCP verified `http://127.0.0.1:3168/experts` against backend
`8150`. The real directory returned two Dify Experts and four operator
categories. The catalog, category, search, conversation, and authentication
reads completed with HTTP 200 after expected React StrictMode replacement
aborts. Search rendered the distinct filtered-empty copy, and clearing it
restored both real cards. Desktop `1440x900` and portrait `360x800`, `390x844`,
`393x852`, `412x915`, and `430x932` all had
`scrollWidth === clientWidth`, no off-viewport control, and no visible target
below 44px. MCP captured the final desktop and `390x844` mobile views; light and
dark Hero styles were both inspected. Console output contained only the two
existing React Router future-flag warnings.

Final `npm run typecheck`, `npm run lint`, `npm run build`, and
`git diff --check` pass. The production build retains the existing non-fatal
main-chunk warning (`918.49 kB` minified, `262.16 kB` gzip).
