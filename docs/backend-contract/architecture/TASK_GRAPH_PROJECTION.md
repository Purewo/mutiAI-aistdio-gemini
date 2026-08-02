# Task Graph Projection

Status: backend Projection `1.4` is implemented for frontend Operational
Blueprint integration. F2, D1-A, D1-B, and D1-C are accepted; D1-D awaits its
real-frontend gate.

## Purpose

The Task Graph Projection is the product-owned, owner-scoped, read-only graph
used by the frontend to render an Operational Blueprint. It combines the
frozen organization context with persisted Task execution and coordination
facts without exposing Runtime internals or asking the frontend to infer
relations.

The canonical API is:

```text
GET /api/v1/tasks/{task_id}/graph
```

The response contract is `TaskGraphProjection` version `1.4`. It contains:

- the Task, organization, frozen OrganizationSpec version, and current plan
  identities;
- frozen organization roles with `reports_to` for swimlane background;
- every persisted execution-plan version represented by the graph;
- safe PlanStep, Assignment, Artifact, Case, and WorkItem nodes;
- stable edges with typed source and target resource references;
- explicit relation, status, iteration number, reason summary, and applicable
  Artifact, Case, WorkItem, RetryAttempt, or ReplayRun identity.

The endpoint returns the same owner-hidden `404 TASK_NOT_FOUND` boundary as the
Task API. It is a projection over existing records and requires no migration.

## Authoritative relation provenance

Only the following persisted facts create edges:

| Relation | Persisted source | Projection direction |
| --- | --- | --- |
| `dependency` | `PlanStepDependency` | prerequisite PlanStep -> dependent PlanStep |
| `artifact_handoff` | `ArtifactInputBinding` plus immutable `Artifact` producer identity | producer PlanStep or Task-input Artifact -> consumer PlanStep |
| `feedback` | Task-linked `CoordinationSignal`, `CoordinationCase`, WorkItem, or validated RoutingDecision | affected Task resource/WorkItem/Case -> Case or next WorkItem |
| `verification` | persisted verification WorkItem/RoutingDecision or immutable `StreamFinalizationAttempt` | Case/preceding WorkItem -> verification WorkItem; Stream -> accepted/rejected attempt |
| `incremental_handoff` | persisted `ArtifactStream` and immutable `ArtifactDelivery` | stream -> Delivery |
| `stream_subscription` | persisted `StreamSubscription` | producer stream -> consumer PlanStep |
| `finalization` | accepted `StreamFinalization` | Stream -> accepted finalization |
| `keyed_execution` / `delivery_binding` | `PlanStepExecution` and exact `DeliveryInputBinding` | consumer PlanStep/Delivery -> bounded execution/binding |
| `watermark_convergence` / `incremental_output` | accepted final watermark, keyed execution, and immutable output records | finalization -> `all` execution; execution -> output |
| `retry` | `CoordinationRetryAttempt` or a non-initial `PlanStepExecutionAttempt` | Assignment -> the same Assignment as an explicit bounded loop |
| `replay_reuse` | exact ReplayRun Artifact bindings or copied Delivery `source_delivery_id` lineage | reused base PlanStep/Artifact/Delivery -> replay consumer or copied Delivery |

`artifact_handoff` is emitted only after an `ArtifactInputBinding` exists.
Before materialization, a declared contract or dependency does not become a
guessed Artifact edge. Artifact Replay reuse requires an exact pinned Artifact
and an explicit replay-plan input. Delivery Replay reuse requires both the
pinned source Delivery and a persisted copied Delivery carrying the same
ReplayRun/source lineage.

Task-linked coordination is selected through structured Task foreign keys on
Signals or RetryAttempts. Evidence-reference text and event order never attach
an otherwise unrelated Case to a Task.

## Status and iteration semantics

Every edge status is copied from the persisted record that currently owns the
relation state:

- dependency: dependent PlanStep status;
- Artifact handoff: `ArtifactInputBinding.status`;
- feedback: Case or target WorkItem status;
- verification: target WorkItem status;
- Retry: `CoordinationRetryAttempt.status` or
  `PlanStepExecutionAttempt.status`;
- replay reuse: `TaskReplayRun.status`.

Iteration numbers have relation-specific, non-overloaded meaning:

- initial Task execution and its plan use `0`;
- Replay plan nodes and replay-reuse edges use `replay_number`;
- coordination Retry edges use `retry_number`; partition Retry edges use the
  `PlanStepExecutionAttempt.attempt_number`;
- WorkItem nodes and WorkItem-targeting edges use `attempt_number`;
- an initial Signal-to-Case edge uses `0`, while a WorkItem report uses the
  reporting WorkItem's attempt number.

The frontend may group, filter, and style these values. It must not reinterpret
one counter as another or derive a loop from Task replay count, event sequence,
timestamps, text, or array position.

## Stable resource model

Every node and edge endpoint uses:

```json
{
  "resource_type": "plan_step",
  "resource_id": "persisted-resource-id",
  "label": "safe product label"
}
```

`node_id` and `edge_id` are stable projection identities. A PlanStep node
retains the real `plan_step_id`, plan version, step key, role key, and optional
Assignment ID. Assignment nodes retain the real Assignment ID and linked
PlanStep ID. The frontend may therefore render persisted topology directly and
does not have to synthesize node identity from a role or position.

## Explicit exclusions

The public projection does not expose or derive:

- Runtime Thread, Turn, job, execution-event cursor, or Workspace identity;
- Workspace or Artifact storage paths;
- LangGraph checkpoints or state objects;
- Runtime transcript, raw router/model output, tool events, or raw-decision
  hashes;
- graph edges inferred from event order, timestamps, generated prose, retry
  fields on another resource, filenames, or array order;
- arbitrary model-generated cycles.

Validated RoutingDecision reasons and persisted Signal/Case/WorkItem summaries
are product records and may appear as bounded `reason_summary`. They are not raw
Runtime output.

## Frontend gate

The frontend should consume the generated OpenAPI contract, render the
projection as a read-only Operational Blueprint, and verify at least:

- mixed parallel -> serial -> parallel -> lead-review dependencies;
- materialized Artifact handoffs;
- one delivery-quality feedback and technical Retry loop;
- one verification WorkItem transition;
- one partial ReplayRun with a pinned reused Artifact;
- one partition Retry loop and one incremental Replay with exact pinned/copied
  Delivery lineage;
- owner-hidden access, refresh persistence, responsive layout, Console,
  Network, and reconnect-driven refetch behavior.

SSE remains a change notification. The frontend refreshes this endpoint after
relevant Task or coordination events; it never treats the event stream as the
graph source of truth.
