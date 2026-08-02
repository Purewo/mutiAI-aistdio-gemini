# Nexwork coordination feedback and semantic routing

Status: Design baseline accepted on 2026-07-30. F0 shared coordination and F1
delivery-quality feedback passed their real frontend gates. F1's public retry
projection and `20260730_0018` persistence migration are authoritative. F2
semantic routing backend implementation is complete at `6db4d20` and awaits
its real-frontend gate. D1 incremental delivery remains blocked until F2
acceptance.

## Purpose

Nexwork needs a durable coordination layer for more than error recovery. A
role may discover an ambiguous problem, ask another role to investigate it,
wait for a human decision, or continue a multi-step verification loop. These
activities must remain traceable without turning every case into a LangGraph
edge or copying Runtime conversation history into orchestration state.

The design therefore separates three concepts:

```text
Signal     = an observation or request with evidence
Case       = the durable unresolved coordination matter
WorkItem   = one bounded action assigned to one existing role or human
```

A Case can produce several WorkItems over time. A WorkItem is an execution
boundary and may create an Assignment and RuntimeExecution. Closing one
WorkItem does not automatically close the Case; the Case policy and a
verifier decide whether the desired outcome has been reached.

## Architectural boundaries

- The product database remains authoritative for Signals, Cases, WorkItems,
  role targets, policies, evidence references, transitions, attempts,
  escalations, and audit events.
- LangGraph may route a bounded coordination run and checkpoint stable product
  IDs. It does not become a persistent inbox, source of truth, or owner of
  Case state.
- Codex remains the Runtime for one bounded Assignment. A natural-language
  router is a Codex Assignment with a restricted tool set and a structured
  `RoutingDecision`; it is not an unrestricted database actor.
- Released Artifacts remain immutable. Feedback may reference, pin, or
  supersede an Artifact through the existing Replay and lineage rules, but it
  never edits an earlier Artifact in place.
- A Case loop creates new attempts or WorkItems. It must not mutate a frozen
  TaskExecutionPlan into a cyclic graph.
- Existing formal roles are the only role targets. The router may select an
  eligible role or escalation destination, but it may not create a persistent
  formal role at runtime.

## Shared coordination vocabulary

### Signal

A Signal records what was observed and why it may require coordination. The
initial implementation should permit a small stable kind set plus a natural
language summary; it must not require every future observation to become a new
hard-coded error code.

Required properties:

- immutable Signal identity and producer;
- owner-scoped related Task, PlanStep, Assignment, Artifact, Conversation, or
  external reference IDs;
- human-readable summary and structured evidence references;
- severity, created time, and deduplication identity;
- optional suggested Case policy, never an unvalidated command.

### Case

A Case is the long-lived product record. Its state is explicit and terminal
states are monotonic:

```text
open
  -> triaging
  -> assigned
  -> in_progress
  -> waiting_verification
  -> resolved

in_progress / waiting_verification
  -> escalated
  -> human_required
  -> abandoned
```

The exact public enum will be frozen with the API contract. `resolved` means
the Case's success condition was verified, not merely that the last WorkItem
returned a completed Runtime status.

Each Case retains an append-only transition history, current policy snapshot,
attempt count, escalation count, and linked evidence. It may remain open when
one attempt fails and a new WorkItem is created.

### WorkItem and inbox delivery

A WorkItem is one bounded request to one target. It contains a concise brief,
success condition, evidence references, allowed actions, timeout/budget policy,
and a stable idempotency key. An InboxDelivery makes the WorkItem queryable by
the target role or human without requiring a continuously running agent.

The normal lifecycle is:

```text
created -> delivered -> acknowledged -> in_progress -> submitted
         -> waiting_verification -> completed | failed | cancelled
```

"Pull" means the target uses its owner-scoped inbox/query tools to retrieve a
delivered WorkItem. The scheduler still creates a bounded Assignment when work
actually starts; no agent is expected to poll forever.

### RoutingDecision

The semantic router may write only a structured decision such as:

```json
{
  "action": "assign",
  "target_role_key": "backend_contract_owner",
  "work_item_kind": "issue_investigation",
  "reason": "The observed response contradicts the published contract.",
  "required_evidence": ["published_contract", "actual_response"],
  "completion_condition": "A published fix is available and basic consistency checks pass.",
  "confidence": "high"
}
```

The router can use natural language to interpret ambiguity, but product-side
validation must enforce target ownership, permissions, Case state, policy
limits, idempotency, and allowed action transitions. An ambiguous or invalid
decision routes to a safer fallback such as the organization lead or
`human_required`; it does not guess a role or execute an arbitrary tool call.

## Feedback classes

The first contract should distinguish policy, not merely error text:

| Class | Meaning | Default action |
| --- | --- | --- |
| `technical_recovery` | Runtime, capacity, timeout, or transient delivery issue | Bounded technical Retry |
| `delivery_quality` | Artifact or contract validation failed | Retry, then Case escalation |
| `semantic_coordination` | A role discovered a problem or cross-role request | Open Case and route WorkItem |
| `business_revision` | Lead judged a delivered result insufficient | Existing ReplayRun policy |
| `approval_or_external_wait` | Work cannot continue until a person or external event responds | Waiting Case/WorkItem |

These classes share Signal, Case, WorkItem, and audit primitives, but keep
their execution semantics distinct. A technical Retry does not consume a
business Replay budget. A semantic Case does not change the original Task
topology merely because it has several attempts.

## Natural-language issue routing example

For a frontend/backend contract mismatch:

```text
frontend Signal
  -> Case(open)
  -> router Assignment
  -> issue-handler WorkItem
  -> backend-fix WorkItem
  -> issue-handler verification
  -> frontend re-integration WorkItem
  -> Case(resolved | next attempt | escalation)
```

The issue-handler role owns the Case lifecycle and basic publication checks;
the backend role owns the code change; the frontend role owns re-integration
verification. Each handoff is a new bounded WorkItem with a compact brief,
not a shared Runtime Workspace or copied transcript.

The policy may define a maximum attempt count and an escalation ladder:

```text
same-role retry
  -> alternate eligible role
  -> higher reasoning/model tier
  -> organization lead
  -> human_required
```

Escalation is a product policy decision. The router may recommend a level, but
the service validates the threshold and persists the transition.

### F2 semantic routing implementation contract

F2 persists one `CoordinationRoutingRun` for each restricted Codex execution
and one `CoordinationRoutingDecision` for the product-validated result. Runtime
Thread, Turn, job, Workspace path, and raw output remain internal audit fields;
the public projection exposes only run status, safe failure code, model/tier,
usage, structured decision, validation errors, and resulting WorkItem.

The Runtime is bound to exactly two Case-scoped read tools:

- `mutiai_get_current_coordination_case`;
- `mutiai_list_current_coordination_evidence`.

Its Runtime policy is `read-only`, `network_access=false`, approval `never`,
with shell, web search, apps, plugins, and multi-agent execution disabled. The
strict output permits only `assign`, `wait`, `escalate`, `human_required`,
`resolve`, or `abort`. Product validation then enforces frozen role membership,
the allowed issue-investigation/backend-fix/publication-check/frontend-
reintegration sequence, source-role reintegration, issue-handler publication
verification, confidence, Case state, and attempt/escalation limits.

The owner-scoped API boundary is:

```text
POST /coordination/semantic-observations
POST /coordination/work-items/{work_item_id}/reports
GET  /coordination/routing-runs/{routing_run_id}
```

Observation and report idempotency retain the same Signal, Case, RoutingRun,
and WorkItem lineage. Completed or failed WorkItem reports append immutable
Signal evidence and queue the next router run; a waiting report persists the
wait without creating an autonomous polling loop. Low confidence, malformed
output, an unknown role, an invalid stage, Runtime failure, or an exhausted
limit produces a deterministic lead or `human_required` fallback. The first
explicit escalation reruns the router at the configured higher model/reasoning
tier; later policy escalation may route to the frozen lead or a person.

## Failure and recovery example

For an invalid specialist Artifact:

```text
Artifact validation failure
  -> Signal(delivery_quality)
  -> one bounded technical Retry
  -> if still invalid: Case + issue-handler WorkItem
  -> lead / specialist / human decision according to policy
```

The lead is not treated as a continuously listening mailbox. It receives a
bounded WorkItem only when policy routes the Case to it. This preserves the
current mixed-DAG behavior while making escalation explicit and auditable.

### F1 delivery-quality implementation contract

The scheduler records a structured `plan.step_failed` reason for product
delivery validation failures. F1 recognizes `invalid_assignment_delivery` and
`artifact_*` reasons without parsing Runtime prose. A failed media validation
also persists the immutable candidate bytes as a `rejected` Artifact so the
Signal has auditable evidence; a later successful delivery is a new released
Artifact version.

The Case identity is `Task + current PlanStep`, independent of changing error
text. Each failure event has its own idempotent `delivery_quality` Signal, while
the Case keeps a frozen policy and frozen OrganizationSpec version. A bounded
automatic technical Retry is represented by `CoordinationRetryAttempt` with
`requested -> running -> succeeded`, `failed`, or `exhausted` states. It resets
only failed Assignments and never increments `Task.replay_count`.

When the configured retry limit is exhausted, F1 creates one idempotent
`delivery_quality_exhausted` WorkItem. It targets the configured issue-handler
role only when that role exists in the Task's frozen organization; otherwise it
falls back deterministically to the frozen organization lead. The WorkItem's
allowed decision boundary is `retry`, `replay`, `escalate`, `human_required`, or
`abort`, and escalation remains bounded by the Case policy.

## Invariants and safety limits

- Every Case transition and WorkItem delivery is idempotent and append-only.
- Every attempt has a parent Case and a stable correlation identity.
- A Case has bounded retry, escalation, token, and wall-clock budgets.
- Repeated equivalent Signals are deduplicated or linked to the existing Case.
- A router cannot target a role outside the published organization version
  without an explicit reroute policy.
- A WorkItem cannot claim success solely from Runtime completion; its
  completion condition must be checked by the designated verifier.
- The frontend renders persisted Case, WorkItem, Signal, and transition state;
  it never renders raw prompts, hidden reasoning, or arbitrary router output.
- SSE remains a notification channel. Reconnect refreshes persisted Case and
  WorkItem resources and deduplicates event identities.

## Delivery stages

The implementation is intentionally staged:

1. **Shared coordination plane** — durable Signal/Case/WorkItem/Inbox
   primitives, transition validation, event identities, policy snapshots, and
   owner-scoped read APIs. No natural-language router is required for the first
   vertical slice.
2. **Simple feedback vertical slice** — delivery-quality failure creates a
   Case, performs bounded technical Retry, then routes an exhausted Case to a
   fixed issue-handler or lead destination.
3. **Semantic routing role** — the Codex router uses restricted tools and
   emits validated RoutingDecisions for the contract-mismatch lifecycle,
   including verification, repeated attempts, escalation, and human handoff.
4. **Incremental Artifact dataflow** — designed in parallel at the contract
   boundary, implemented as a separate execution milestone after the
   coordination primitives stabilize. See
   [INCREMENTAL_ARTIFACT_DELIVERY.md](INCREMENTAL_ARTIFACT_DELIVERY.md).

Each stage has a real frontend integration gate recorded in
[COORDINATION_FEEDBACK_SCENARIOS.md](../acceptance/COORDINATION_FEEDBACK_SCENARIOS.md).

## Explicitly deferred

- Unbounded autonomous loops.
- A universal agent that can mutate any Case, organization, or repository.
- Sharing Runtime transcripts or Workspaces across roles.
- Arbitrary model-generated graph edges.
- Streaming semantics without explicit partition, join, watermark, and
  backpressure contracts.
- External issue-provider implementation; adapters consume this boundary in a
  separate change.
