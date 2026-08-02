# Contract snapshot metadata

- Source repository: `Purewo/mutiAI`
- Source commits: `ee519c2` (Dify contract implementation `ee96df9`),
  `3d62810` (external channel framework plus conversation catalog; feature
  implementation `903597a`), and `9c7b2e0` (F1 delivery-quality feedback;
  feature implementation `8be8b5f`, including F0 `1bd4cad`), plus `a955f22`
  (F2 frontend handoff; feature implementation `6db4d20`), plus `e35dfff`
  (Task Graph Projection handoff; feature implementation `632dbba`), and
  `b185640` (integrated Expert Marketplace live-trial acceptance; feature
  implementation `b941f39`, text-input guard baseline `07d541e`), plus
  `777622e` (D1-A finite Artifact Stream contracts and Task Graph Projection
  `1.1`), plus `7878a8c` (unified conversational Action decision inputs), plus
  `600fc34` (multi-Dify bindings, read-only expert categories, and catalog
  search), plus `6a58602` (D1-B keyed `each` execution, exact input bindings, bounded
  concurrency, and Task Graph Projection `1.2`), plus `d02bade` (D1-C final-watermark
  `all` convergence, aggregate Artifact closure, and Task Graph Projection `1.3`),
  plus `0789854` (persistent finalization attempts and Task Graph Projection `1.3.1`),
  plus `7d2ca89` (D1-D incremental recovery, partition Retry/cancel limits,
  Replay Delivery lineage, and Task Graph Projection `1.4`), plus `11e55507`
  (per-role execution limits, backend cost snapshots, and the
  `openai-standard-2026-07-30` pricing catalog), plus `1b85dbb` (durable
  per-role work queues, execution leases, and queued-item cancellation), with
  final semantic verification against integrated backend `main` at `4062643`
  plus its uncommitted D1-E production-activation worktree. D1-E changes start
  behavior but adds no public OpenAPI shape.
- Sync date: `2026-08-02`
- Snapshot method: Mechanically synchronized from the authoritative integrated
  backend `b185640` contract, then additively composed with the D1-A deltas from
  `777622e`, the conversational input delta from `7878a8c`, the Expert catalog
  delta from `600fc34`, the D1-B deltas from `6a58602`, the D1-C convergence
  deltas from `d02bade`, the finalization-attempt delta from `0789854`, and the
  D1-D recovery/lineage delta from `7d2ca89`, so the independent
  Expert, Channel, Coordination, D1-A, and keyed-execution surfaces remain
  intact, then applied the execution-limit schema delta from backend parent
  `c1e9deb` to `11e55507`, followed by the additive Q0 role-queue delta from
  `1b85dbb`. The resulting snapshot was compared structurally with both the
  backend working-tree contract and `http://127.0.0.1:8150/api/openapi.json`:
  all three contain the same 89 paths and 209 schemas and are JSON-semantic
  equals. Byte hashes differ only because the composed snapshot uses different
  JSON formatting.
- Review status: Reviewed against the M2.3 source files, Runtime feasibility,
  account self-service, persisted AssistantAction localization, and the assistant
  rich-content and attachment additions, including product-owned nested
  resource parents and explicit assistant-attachment Task input bindings,
  through `ee519c2`, including bounded Task replay policy, replay runs, immutable
  replay lineage, stable activity phases, normalized organization media
  requirements, public HTTPS feasibility semantics, and assistant content Schema
  `1.1` with product-owned static HTML report blocks, plus the M4 product-owned
  external channel connection, authorization, identity, journal, and outbox APIs,
  plus F1 delivery-quality Retry attempts and immutable rejected Artifact evidence,
  plus F2 restricted semantic routing Runs/Decisions and safe fallback policy from
  `6db4d20`/`a955f22`.

`ApprovalResponse.cwd` was removed upstream and host paths are sanitized. The generated types no
longer expose it and no view reads it.

## Included files

- `openapi.v1.json`: OpenAPI 3.1 contract, API version `0.1.0`.
- `organization-spec.v1.json`: Published organization definition JSON Schema.
- `task-event.v1.json`: Task event envelope JSON Schema.
- `events/assistant-event.v1.json`: Platform-assistant event envelope JSON Schema.
- `events/coordination-event.v1.json`: Coordination Case event envelope JSON Schema.
- `events/expert-event.v1.json`: Private ExpertConversation event envelope JSON Schema.

These files are read-only consumer snapshots. Update them from the core repository instead of editing product types in this repository.

Assistant API fixtures are available under `fixtures/assistant/`. Feasibility
fixtures under `fixtures/feasibility/` include the activity and organization
media captures from this baseline. The 30 main API fixtures under `fixtures/api/`
remain the earlier M3 regression set.

New `organization_spec_version` resource references may carry an optional
backend-resolved `parent` organization locator. Historical references without
`parent` remain valid; consumers must not infer the parent relationship.

Assistant content Schema `1.1` adds `html_report`, whose source identity and
preview/download URLs are generated by the backend from a released, validated
`text/html` Artifact. Schema `1.0` messages remain valid historical records.

The M4 Runtime contract adds the `external_managed` security mode for provider-owned
isolation (for example a Dify Workflow) and allows `/runtime/controls` to select a
registered provider with the optional `provider` query parameter.

The M4 channel contract adds `/channels/providers`, owner-scoped connection lifecycle,
QR authorization polling, explicit sender identities, and inbound/outbound delivery
inspection. Assistant conversation responses also carry `origin`, a safe `title`, the
latest-message preview, and owned `channel_bindings`, allowing the web client to continue
an active channel conversation without changing its outbound route. The first registered
adapter is `weixin-ilink`; its accepted product boundary is personal direct-message text
only. A QR challenge is not proof of a connected account.

The F0 coordination contract adds owner-scoped Signal, Case, WorkItem, InboxDelivery,
and persisted CoordinationEvent resources under `/coordination`. SSE is a finite replay
batch: the client reconnects with `Last-Event-ID`, deduplicates by `event_id`, and then
refreshes persisted Case and Inbox resources. F0 does not route with an LLM, modify Tasks,
retry Runtime work, or expose Runtime transcripts.

The F1 coordination contract adds `CoordinationRetryAttempt` records to each Case
projection. Product delivery validation failures may preserve immutable
`status=rejected` Artifact evidence, Retry only the failed Assignment without
incrementing `Task.replay_count`, and append a bounded issue-handler or lead WorkItem
after exhaustion. The UI treats SSE as a refresh signal and continues to read Task,
Case, Retry, WorkItem, and Artifact truth from persisted resources.

The F2 coordination contract adds owner-scoped semantic observation, WorkItem
report, and RoutingRun detail routes. Routing decisions are product-validated
projections of a restricted, Case-bound read-only Runtime; the public contract
omits Runtime Thread/Turn/Workspace identities and raw output. The frontend
consumes `routing_runs`, structured decisions, execution tiers, confidence,
validation errors, and safe fallback states without allowing users to enter
internal IDs or directly edit a Case.

The Task Graph Projection contract adds the owner-scoped read-only
`GET /api/v1/tasks/{task_id}/graph` endpoint. It returns frozen organization
roles and `reports_to` swimlane context, persisted Task/PlanStep/Assignment/
Artifact/Case/WorkItem nodes, and explicit `dependency`, `artifact_handoff`,
`feedback`, `verification`, `retry`, and `replay_reuse` edges. The frontend
must render these relations from their stable resource references and may not
infer edges from event order, text, array position, or Runtime fields. SSE is
only a refresh notification; the graph endpoint remains the display source of
truth. The snapshot was mechanically composed from additive backend branches,
preserving the existing Dify, channel, Schema 1.1, F0-F2, replay, and media
contract surfaces.

The D1-A contract adds owner-scoped ArtifactStream list/detail routes, immutable
ArtifactDelivery, finite partition, `each`/`all` StreamSubscription and
StreamFinalization watermark projections. `PlanStepResponse` carries explicit
`stream_output_contracts` and `stream_input_contracts`; ordinary Artifact
contracts remain unchanged. D1-B adds owner-scoped keyed execution list/detail
routes for `PlanStepExecution` and `DeliveryInputBinding`, bounded
`max_concurrent_executions` admission, and Task Graph Projection `1.2` nodes and
relations for keyed execution and exact Delivery binding. D1-C adds final-watermark
  `all` convergence, exact multi-Delivery binding/materialization, aggregate Artifact
  publication, final lead review, and immutable accepted/rejected
  `StreamFinalizationAttempt` evidence. Task Graph Projection `1.3.1` includes
  attempt nodes and authoritative `verification` relations in addition to the
  `watermark_convergence` / `incremental_output` relations. A rejected checksum
  attempt keeps the Stream open and creates neither a Finalization nor an `all`
  execution; a later accepted attempt does not erase the rejected history.
D1-E enables the explicit Task Start boundary for supported finite `each`/`all`
plans. Producer Delivery/finalization tools and post-commit scheduler wake-up
remain backend-owned; a Dify Producer is rejected with
`STREAM_PRODUCER_RUNTIME_UNSUPPORTED` instead of entering a partial run.

D1-D adds immutable ArtifactDelivery and PlanStepExecution Attempt history,
startup reconstruction of missing keyed joins without automatic Runtime start,
owner-scoped partition Retry/cancel operations, bounded execution/time/Token/
Retry limits, and strongly typed from-step Replay Artifact/Delivery bindings.
Successful sibling partitions remain intact, technical Retry does not increment
`Task.replay_count`, and copied Deliveries retain their source Delivery and
ReplayRun lineage. Task Graph Projection `1.4` is the sole display source for
authoritative `retry` and Delivery `replay_reuse` relations. D1-E adds no new
public type: the existing Task Start, Stream, keyed execution, queue, graph, and
SSE contracts now drive the production activation path.

Q0 adds the owner-scoped `TaskResponse.role_queue` projection and the
`POST /api/v1/tasks/{task_id}/role-queue/{role_work_item_id}/cancel` control.
Queue records expose safe role, source, status, FIFO position, capacity,
active-work, wait-reason, and lease timestamps. Internal lease holder identity,
Runtime Thread/Turn, Workspace paths, and model prose remain outside the
product queue contract. A queued item may be cancelled with an explicit reason;
the endpoint returns the refreshed Task resource.

The Expert Marketplace contract adds owner-scoped catalog, immutable
ExpertVersion capability, private ExpertConversation, attachment, message,
Turn, archive, and finite SSE event resources. `capability.text_input_mode`
is authoritative: `required` needs text, `optional` accepts text and/or
attachments, and `unsupported` disables text while allowing attachment-only
submission with `text: ""`. `conversational` and `request_response` remain
distinct provider-continuity semantics; a request-response Expert must not be
presented as having provider multi-turn memory. Expert trials are isolated from
Tasks, released Artifacts, formal role Workspaces, and RuntimeExecution
records.

The multi-Dify catalog delta adds read-only operator categories, the
`ExpertCategoryResponse` fixture, and repeated `category` query parameters with
OR semantics. Dify `input_mode` remains an operator-owned Runtime setting; the
frontend consumes the resulting public capability contract and never edits
provider credentials, Workflow identifiers, or variable mappings.
