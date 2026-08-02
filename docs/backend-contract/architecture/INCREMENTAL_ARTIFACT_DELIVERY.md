# Incremental Artifact delivery and non-blocking dataflow

Status: Design baseline accepted on 2026-07-30. F0, F1, F2, D1-A, and D1-B are
accepted. The focused D1-C audit correction passed frontend re-acceptance on
2026-08-02. D1-D recovery, bounded Retry/cancellation, usage, and Replay
lineage are implemented in the backend and await the real-frontend gate.

D1-D remains an intentionally explicit product-service boundary: committed
Deliveries and finalization records create the bounded `each`/`all` joins;
startup reconstructs missing joins; and owner-scoped APIs expose finite
partition Retry and cancellation. Producer-side Runtime publication tools and
automatic event dispatch are still deferred. The public stream-plan start path
therefore continues to reject without mutation until that complete boundary is
promoted.

## Why this is separate from feedback

An unresolved interface problem is a coordination Case. A completed portion
of a dataset arriving at a downstream role is normal dataflow. Both need
durable product events and owner-scoped delivery, but they have different
state, retry, and completion semantics.

The current mixed Task scheduler uses dependency-ready waves: all results in a
wave are finalized before the next wave starts. That barrier is correct for
the existing immutable whole-Artifact contract, but it cannot express:

```text
one upstream partition completes
  -> reducer incorporates it
  -> one downstream dashboard starts
while other partitions continue running
```

## Dataflow model

An incremental producer publishes a logical Artifact stream made of immutable
delivery units:

```text
ArtifactStream
  ├── Delivery(partition_key, sequence, payload, checksum)
  ├── Delivery(partition_key, sequence, payload, checksum)
  └── StreamFinal(watermark, expected_partitions, summary)
```

Every Delivery is immutable and idempotent. A later correction creates a new
delivery version or a Replay lineage; it never edits a released unit in place.

The public contract must freeze at least:

- stream and delivery identity;
- partition key and sequence number;
- producer step and consumer contract;
- media/schema version and checksum;
- whether the delivery is partial, provisional, or final;
- final watermark and expected-partition information;
- retention and supersession policy.

## First D1 product boundary

D1 is a finite partitioned workflow, not an arbitrary continuous stream. Every
enabled stream has a persisted upper bound, a declared finite partition policy,
and an explicit finalization record. A Task cannot remain successful while one
of its required streams is permanently open.

The first executable slice supports fixed, known partition keys and enables
only `each` and `all` triggers. The public vocabulary may reserve `any`,
`quorum`, and `window`, but product validation returns a stable unsupported-
policy error until the finite `each`/`all` path passes D1-D acceptance.

Ordinary Artifact contracts remain the default. Incremental behavior requires
an explicit stream output and stream input declaration in the persisted plan;
the compiler never converts a string input contract or whole Artifact into a
stream implicitly.

## Product resources

D1 adds resources alongside the existing whole-Artifact model:

| Resource | Responsibility |
| --- | --- |
| `ArtifactStream` | One finite logical output stream owned by a Task, plan, producer PlanStep, and declared output contract |
| `ArtifactDelivery` | One immutable payload unit with partition key, sequence, kind, checksum, media/schema identity, producer, and idempotency identity |
| `StreamFinalization` | The accepted finite partition set and per-partition final sequence/watermark that closes the stream |
| `StreamSubscription` | One persisted consumer contract and its validated `each` or `all` trigger policy |
| `PlanStepExecution` | One bounded execution instance beneath a frozen PlanStep: `each` carries one partition, while `all` carries one accepted final watermark |
| `DeliveryInputBinding` | Exact Delivery identities materialized for one keyed execution |
| `ArtifactDeliveryAttempt` | Append-only accepted, duplicate, rejected, or conflicting publication evidence, including stable ordering/limit failure facts |
| `PlanStepExecutionAttempt` | Initial/Retry execution audit with finite attempt number, outcome, usage, and safe failure facts |

`PlanStep` remains the frozen plan template. `PlanStepExecution` represents a
bounded partition instance; it does not create a new formal role or mutate the
plan into a runtime-generated graph. An incremental Assignment points to one
`PlanStepExecution`. The existing one-Assignment whole-step relationship stays
unchanged, avoiding a reinterpretation of historical Tasks.

Delivery payload storage is product-owned and immutable. A provisional
Delivery is not a released whole Artifact and cannot satisfy final lead review.
When a reducer or finalizer publishes an authoritative aggregate deliverable,
it creates a normal immutable Artifact with explicit lineage to the streams and
Deliveries that produced it.

## Runtime publication boundary

The current Runtime result is observed only when a bounded Assignment ends, so
it cannot provide early handoff by itself. D1 therefore requires restricted
product tools bound to the current Task, Assignment, PlanStepExecution,
Workspace, and declared stream output:

- publish one ArtifactDelivery from a verified relative Workspace file;
- finalize one owned ArtifactStream with exact partition watermarks;
- read only the current keyed execution and its declared input Deliveries.

The product restores authoritative ownership and contract metadata, validates
the file bytes, copies them into product storage, persists the Delivery, and
only then evaluates downstream readiness. A Runtime-supplied Task ID, producer
identity, storage path, target role, or consumer edge is never trusted.

Publishing uses a stable idempotency identity scoped to stream, partition, and
sequence. An exact duplicate returns the existing Delivery. A conflicting hash
for the same identity is rejected. D1 initially accepts only the next contiguous
sequence for a partition; a gap is a bounded, persisted/reported ordering
failure rather than an invitation to guess or silently reorder.

## Persisted state

The first state vocabulary is intentionally finite:

```text
ArtifactStream:
declared -> open -> finalizing -> finalized
                       |-> failed | cancelled

ArtifactDelivery:
accepted -> superseded
rejected

PlanStepExecution:
pending_input -> ready -> submitted -> running -> waiting -> completed
                                               |-> failed | cancelled
```

`provisional` and `final` are immutable Delivery kinds, not mutable delivery
statuses. A correction publishes a new sequence/version with explicit lineage;
it never turns provisional bytes into final bytes in place.

Finalization records a partition watermark map, not only a scalar counter. For
every required partition it identifies the accepted final sequence/Delivery.
This lets `all` prove exactly which immutable units formed the aggregate.

## Join and trigger policies

Downstream steps must declare how much input is required before work starts:

| Policy | Start condition | Typical use |
| --- | --- | --- |
| `each` | One matching delivery | Render one dashboard per store or partition |
| `any` | First usable delivery | Early preview or speculative work |
| `all` | Final watermark and every required delivery | Final report or lead review |
| `quorum` | A declared number or fraction | Approximate early analysis |
| `window` | A bounded time/count window closes | Streaming batch aggregation |

D1 validation enables `each` and `all` only. The other rows define future
semantics so the data model does not paint itself into a corner; they are not
accepted execution policies in D1.

The policy is part of the persisted plan/contract, not inferred from array
order or Runtime prose. A downstream reducer may emit provisional snapshots,
but the final lead review must consume an explicit final signal.

## Scheduling and runtime behavior

The scheduler will eventually need keyed readiness rather than only step
readiness:

```text
observe Delivery
  -> validate and persist immutable unit
  -> satisfy matching join policy
  -> create or resume keyed WorkItem/Assignment
  -> checkpoint reducer state by stable product IDs
  -> emit downstream Delivery
  -> close on StreamFinal or policy failure
```

Required safeguards include:

- per-partition idempotency and duplicate suppression;
- ordering or explicit out-of-order handling;
- bounded reducer state and checkpoint recovery;
- backpressure and product-owned concurrency admission;
- cancellation of only affected partitions;
- finalization/watermark semantics before aggregate review;
- token, wall-clock, and delivery-count budgets;
- technical Retry and Replay lineage at delivery or partition scope.

Readiness is evaluated from committed Delivery, Subscription, Finalization, and
DeliveryInputBinding records. Events wake the scheduler, but event order is not
the source of truth. On restart the scheduler recomputes unsatisfied joins and
reclaims only idempotent keyed executions.

The read-only Task Graph Projection exposes persisted `artifact_stream`,
`artifact_delivery`, `stream_finalization`, `plan_step_execution`, and
`delivery_input_binding` resources. Projection `1.3` adds explicit
`watermark_convergence` edges from an accepted final watermark to an `all`
execution and `incremental_output` edges from a bounded execution to its stream
Deliveries. The frontend must not derive early edges from timestamps, event
sequence, partition labels, or prose.

Projection `1.3.1` adds the append-only `stream_finalization_attempt` resource
and a persisted `verification` relation from the Stream to each accepted or
rejected decision. A rejected attempt records only safe product facts: stable
failure code and bounded summary, optional failed partition, expected/observed
partition counts, and the verified watermark subset. It never exposes storage
paths, file bytes, Runtime details, or raw exception text. The Stream remains
open after a rejected attempt so an explicit corrected final Delivery can be
published and finalized; the earlier rejection remains immutable audit
history.

Projection `1.4` adds persisted partition technical-Retry loops and exact
Delivery Replay reuse. A Retry relation comes from a
`PlanStepExecutionAttempt` after the initial attempt and carries its attempt
number, partition identity, status, and safe reason. A Delivery
`replay_reuse` relation is emitted only when a `TaskReplayRun` pins one source
Delivery and the replay stream contains the immutable copied Delivery with
matching lineage. Neither relation is inferred from event order or text.

## D1-C convergence boundary

An `all` subscription is valid only with `delivery_kind=final` and
`max_concurrent_executions=1`. Finalization re-reads every required Delivery
from product storage, verifies its SHA-256/byte-size facts, and persists one
idempotent `PlanStepExecution` keyed by the finalization identity. That
execution has no partition key or trigger Delivery; it owns one immutable
`DeliveryInputBinding` per watermark member. The bindings are materialized into
the aggregate Workspace before the aggregate Assignment is submitted.

The aggregate Assignment may publish only the declared whole Artifact outputs.
It completes its own PlanStep, but it cannot start lead review by itself. The
orchestrator marks stream-owned specialist steps converged only after their
required final streams close; only then does the ordinary dependency DAG create
the lead review Assignment. Lead review evidence includes stream Delivery and
binding facts without exposing storage paths or Runtime transcripts. A Task is
not completed before the aggregate execution and final review both complete.

The first implementation should not silently turn every existing whole-file
Artifact into a stream. A plan must opt into incremental contracts explicitly.

## D1-D recovery, Retry, and lineage boundary

Each partition uses `strict_contiguous` ordering. An exact idempotent repeat
returns the original Delivery and appends a duplicate Attempt; reuse with
different identity facts appends a conflict Attempt and is rejected. A gap
appends a rejected Attempt with `STREAM_SEQUENCE_GAP`. Accepted state is never
silently reordered or mutated. Partition and delivery counts remain bounded by
the frozen plan contract.

Every submitted keyed execution owns an initial `PlanStepExecutionAttempt`.
A user-requested technical Retry appends one attempt up to the subscription's
`max_retry_count`, reuses the same managed Workspace/Thread boundary, preserves
completed siblings, and does not increment `Task.replay_count`. Attempt records
retain safe failure and token-usage facts even though the current
RuntimeExecution advances to the newest turn. Per-execution wall-clock and
token limits fail only the exact keyed execution. Cancellation converges only
the selected partition and records whether Runtime interruption was confirmed;
an unconfirmed interrupt remains explicitly retryable without cancelling a
successful sibling.

Startup recovery reads accepted Deliveries and accepted finalizations from the
product database and idempotently reconstructs missing `each`/`all` joins. It
does not trust SSE order and does not submit or start Runtime work. Ready work
still requires an explicit scheduler wake/start boundary.

Incremental business Replay is enabled only for downstream `from_step` closure.
At ReplayRun creation, every omitted upstream stream partition is pinned by
exact source Stream ID, Delivery ID, partition, sequence, and SHA-256. Replay
copies those immutable bytes into a new replay-owned stream with
`replay_run_id` and `source_delivery_id`, then executes only the selected
downstream closure and final lead review. `full` incremental Replay remains a
stable unsupported operation because producer-side Runtime publication is not
enabled; stream `step_only` and reserved `any`/`quorum`/`window` policies also
remain unsupported.

## Dashboard scenario

For three parallel data specialists and an Excel reducer:

```text
data specialist A ─┐
data specialist B ─┼─> incremental Excel reducer ─> dashboard A/B/C workers
data specialist C ─┘
```

If the reducer is configured with `each`, it can publish one validated sheet or
partition as soon as its required input arrives. The corresponding dashboard
worker starts immediately. The final Excel/lead review path uses `all` and a
final watermark, so early partial dashboards do not masquerade as a complete
Task result.

## Frontend contract expectations

The frontend must eventually distinguish:

- provisional versus final delivery;
- stream progress and partition progress;
- queued/running/waiting Runtime states;
- duplicate or superseded delivery units;
- partial dashboard availability versus final Task completion;
- per-partition retry and lineage.

No frontend implementation should begin until the backend exports the
partition, join, watermark, and delivery status contract. Existing mixed-DAG
screens remain correct for whole-Artifact wave execution and must not infer
stream behavior from step ordering.

## Deferred boundaries

- Arbitrary continuous streams with no final watermark.
- Unbounded fan-out or unbounded reducer state.
- Cross-Task stream joins without an explicit product owner and policy.
- Automatic conversion of ordinary chat attachments into streams.
- Third-party dataflow/tool adapters; they must use the same product-owned
  delivery and Artifact boundary.
