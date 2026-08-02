# Backend documentation snapshot metadata

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
  (per-role execution limits and backend-owned price snapshots), with final
  verification against integrated backend `main` at `4062643` and its
  uncommitted D1-E production-activation worktree
- Sync date: `2026-08-02`
- Snapshot method: Mechanically composed read-only backend boundaries from the
  authoritative additive backend branches, including the D1-B keyed execution
  slice at `6a58602`, the D1-C convergence delta at `d02bade`, and the
  finalization-attempt correction at `0789854`, and the D1-D recovery/lineage
  delta at `7d2ca89`, plus the role-limit/pricing design from `11e55507`. The
  OpenAPI snapshot was checked semantically against the backend worktree and
  live main service at `http://127.0.0.1:8150/api/openapi.json`; all three
  contain the same 89 paths and 209 schemas. D1-E adds no public type shape.

The snapshot includes the implemented platform-assistant conversation contract,
rich-content and attachment boundaries, product-owned nested resource parents,
explicit assistant-attachment Task input binding, Runtime feasibility policy,
and planned Task Artifact handoff, including bounded Task replay and its
immutable plan, Assignment, and Artifact lineage, plus stable activity phases
and normalized organization media requirements, plus public HTTPS feasibility
semantics and assistant content Schema `1.1` static HTML reports. The
`/api/v1/assistant` payloads are part of the OpenAPI snapshot and the event
schema under `contracts/events/`.

The M4 Runtime boundary adds provider-owned `external_managed` security mode and
provider-scoped Runtime controls through the optional `/api/v1/runtime/controls?provider=`
query parameter. The frontend presents these values from the generated contract;
it does not infer provider capabilities or isolation policy.

The M4 external-channel boundary adds product-owned connection, QR authorization,
sender identity, inbound journal, and outbound delivery APIs. The copied architecture
and ADR document the first `weixin-ilink` adapter and its direct-text-only boundary;
media, group chat, cards, reactions, and dynamic plugins remain unsupported.

The assistant conversation catalog now projects `origin`, a safe title, the
latest-message preview, and owner-scoped `channel_bindings`. The web client may
load and submit to any listed active conversation; a web-originated Turn does
not mutate the channel binding or create an outbox delivery.

The coordination snapshot adds durable Signal, Case, WorkItem, InboxDelivery,
and ordered CoordinationEvent records. F1 additionally exposes persisted
`CoordinationRetryAttempt` records, immutable rejected Artifact evidence,
Retry/Replay budget separation, successful-sibling preservation, and the bounded
issue-handler/lead WorkItem produced after Retry exhaustion. The copied model,
phase plan, and acceptance scenarios keep the real-browser F1 gate authoritative.
F2 semantic routing is implemented in backend commit `6db4d20`; F0 through F2,
D1-A through D1-E, and Q0 are accepted. D1-E production activation is recorded
in `architecture/D1E_PRODUCTION_ACTIVATION.md`.

F2 adds persisted `CoordinationRoutingRun` and `CoordinationRoutingDecision`
records plus semantic observation, WorkItem report, and routing-run detail APIs.
The restricted Runtime may use only two Case-bound read tools and has no network,
Shell, multi-agent, plugin, or arbitrary database access. Product validation
enforces stage/role/limit policy and deterministic lead or human fallback; public
responses omit Runtime Thread, Turn, Workspace path, and raw output fields.

The Task Graph Projection adds an owner-scoped read-only operational graph for
each Task. It projects frozen organization roles, persisted execution and
coordination nodes, and six explicit relation types without exposing Runtime
internals or requiring frontend edge inference. Its copied architecture record
is `architecture/TASK_GRAPH_PROJECTION.md`.

D1-A adds finite ArtifactStream, immutable ArtifactDelivery, partition,
StreamSubscription and StreamFinalization read projections, explicit stream
contracts on PlanStep, and Task Graph Projection `1.1`. D1-B at `6a58602` adds
bounded keyed `each` execution, exact DeliveryInputBinding projections, and
  Task Graph Projection `1.2`. D1-C at `d02bade` adds final-watermark `all`
  convergence, exact multi-Delivery materialization, aggregate Artifact publication,
  and final lead review. The `0789854` correction adds immutable
  `StreamFinalizationAttempt` history, structured rejection events, and Task Graph
  Projection `1.3.1` attempt nodes with authoritative `verification` relations.
  Rejected attempts keep the Stream open and do not create a Finalization or `all`
  execution. The copied architecture and acceptance records
are `architecture/INCREMENTAL_ARTIFACT_DELIVERY.md`,
`acceptance/D1_INCREMENTAL_ARTIFACT_SCENARIOS.md`, and the backend's
`acceptance/D1B_KEYED_EACH_SCENARIOS.md` / `acceptance/D1C_ALL_CONVERGENCE_SCENARIOS.md`.
Producer publication and scheduler wake-up remain backend-owned. Supported
finite `each`/`all` plans now start through the explicit Task Start boundary;
a Dify Producer is rejected with `STREAM_PRODUCER_RUNTIME_UNSUPPORTED` rather
than entering a partial run.

D1-D adds immutable Delivery and keyed-execution Attempt history, deterministic
startup recovery without automatic Runtime start, owner-scoped partition
Retry/cancel operations, bounded execution/time/Token/Retry limits, and strongly
typed from-step Replay Artifact/Delivery bindings. Successful sibling partitions
remain immutable, technical Retry remains separate from `Task.replay_count`, and
copied Deliveries retain source Delivery and ReplayRun lineage. Task Graph
Projection `1.4` exposes the authoritative `retry` and Delivery `replay_reuse`
relations. The copied D1-D gate is
`acceptance/D1D_RECOVERY_LINEAGE_SCENARIOS.md`; D1-E is accepted for the finite
production activation slice described above.

The Expert Marketplace boundary adds the owner-scoped catalog and immutable
ExpertVersion capability contracts, private ExpertConversation messages,
attachments, Turns, archive, and finite SSE events. `text_input_mode` is the
backend source of truth for `required`, `optional`, and `unsupported`; the last
mode permits attachment-only submissions with `text: ""` and rejects non-empty
text with `422`. `conversational` and `request_response` explicitly separate
provider continuity semantics, and private trials remain isolated from Tasks,
released Artifacts, formal role Workspaces, and RuntimeExecution records.

The multi-Dify handoff adds read-only operator categories and repeated `category`
query parameters with OR semantics to the Expert catalog. Dify `input_mode`
remains an operator-owned Runtime configuration; the frontend does not expose
credentials, Workflow identifiers, or variable mapping controls.

The backend repository remains authoritative. Update these files from the core repository when the frontend contract baseline changes.
