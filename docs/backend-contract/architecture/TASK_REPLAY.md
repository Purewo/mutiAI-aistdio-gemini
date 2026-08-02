# Task replay architecture

## Purpose

Task replay is a business-level revision after organization-lead review. It is
not Runtime resume and it is not a technical retry. A replay creates a new,
traceable execution attempt without resetting or overwriting the original
plan, Assignments, RuntimeExecutions, or Artifacts.

V1 supports replay only for planned Tasks whose persisted state is
`needs_revision`. Strict-linear, pure-parallel, mixed serial-parallel, and the
bounded D1-D downstream incremental `from_step` path share the same immutable
replay boundary.

## Distinguish recovery operations

| Operation | Meaning | Counts against replay limit |
| --- | --- | --- |
| Resume | Continue one interrupted Runtime execution | No |
| Retry | Repeat one failed technical execution boundary | No |
| Replay | Perform new business work because delivery quality was rejected | Yes |

`max_replay_count=3` means one initial execution plus at most three business
replays. The Task stores the configured limit and the number of ReplayRuns that
have been created. Reusing an idempotency key returns the existing ReplayRun and
does not consume the limit twice.

## Replay scopes

V1 exposes three fixed scopes:

- `full`: Clone and execute every step from the base plan.
- `from_step`: Execute the selected specialist step and its complete downstream
  descendant closure through lead review. Pin every required output from an
  omitted predecessor as an immutable replay input.
- `step_only`: Execute one selected specialist step and a bounded lead review.
  The result is a candidate delivery and cannot complete the Task or silently
  replace downstream output.

For a pure-parallel plan, `from_step` on one branch executes that branch plus
lead review while pinning the other terminal branch outputs. `step_only`
remains the narrower candidate-only operation.

The public request identifies the selected base `plan_step_id`, not only a role
key. A role may own more than one step in future plan versions.

## Persistent ownership

The product database owns every replay fact. `TaskReplayRun` records:

- Task, parent ReplayRun, base plan, and replay plan identities.
- Monotonic replay number and request idempotency key.
- Scope, target base PlanStep, trigger, reason, feedback, and context policy.
- Executed and reused base step keys.
- Exact external input Artifact bindings.
- Exact external input Delivery bindings for an incremental downstream Replay.
- Effective Artifact set after the run.
- Status, lead decision, issues, result summary, and timestamps.

Assignments and Artifacts produced by replay carry `replay_run_id`. A replay
plan is a new immutable `TaskExecutionPlan` version. The original plan and every
earlier version remain queryable.

The Task stores `replay_policy`, `max_replay_count`, and `replay_count`.
`manual` requires an explicit replay request. `auto_within_limit` permits a
validated organization-lead replay recommendation to start while the persisted
count and product budget remain within their limits.

## Artifact lineage and reuse

Replay never selects an input by filename, Workspace contents, or "latest"
guessing. At ReplayRun creation, the product resolves every external contract
to one immutable Artifact ID and stores that mapping. Materialization uses the
stored ID even when the Artifact was later superseded.

For an incremental downstream `from_step` Replay, the product resolves every
omitted upstream stream partition to one accepted final Delivery and persists
its Stream ID, Delivery ID, partition key, sequence, and SHA-256. Starting the
Replay copies those exact immutable bytes into a replay-owned Stream Delivery
with `replay_run_id` and `source_delivery_id`. It never asks Runtime to discover
an upstream file or substitutes a newer Delivery after the ReplayRun exists.

For `full`, the external inputs are the original Task input Artifacts. For
`from_step` and `step_only`, external inputs may also include outputs from an
earlier run. New replay Artifacts record the ReplayRun, producing Assignment,
PlanStep, Artifact version, and superseded Artifact identity.

`step_only` output remains a candidate. It can be inspected by the lead and
used as the explicit parent of a later propagated replay, but it does not make
stale downstream Artifacts authoritative.

## Runtime context

V1 uses `continue_context`: create a new Assignment and Runtime Turn in the
existing managed role Workspace and Thread. Include the replay reason,
feedback, parent run, and pinned Artifact inputs in the Assignment packet.

Reserve `fresh_context` in the contract but do not enable it until the product
can provision a clean Workspace from an explicit source snapshot. Creating a
new Thread against a dirty Workspace is not a clean replay.

## State transitions

An authoritative replay (`full` or `from_step`) follows:

```text
Task needs_revision
-> ReplayRun created
-> Task running / ReplayRun running
-> lead review
-> Task completed + ReplayRun completed
   or Task needs_revision + ReplayRun needs_revision
```

A `step_only` replay always returns the Task to `needs_revision`, even when the
lead accepts the candidate step output. The ReplayRun itself may be
`completed`.

When the configured maximum is exhausted, the Task remains
`needs_revision`. The API returns a stable replay-limit error and the user may
raise the limit, change the replay scope, change Runtime bindings, accept the
current delivery through a future explicit action, or cancel the Task.

Only one ReplayRun may be active for a Task. Cancellation converges the active
ReplayRun, replay plan, unfinished steps, Assignments, and Runtime executions.

## API surface

The authoritative backend exposes:

- Task creation fields `replay_policy` and `max_replay_count`.
- `PATCH /api/v1/tasks/{task_id}/replay-policy`.
- `POST /api/v1/tasks/{task_id}/replays` with `Idempotency-Key`.
- `GET /api/v1/tasks/{task_id}/replays`.
- ReplayRun summaries inside `TaskResponse`.

Replay creation requires a reason. `from_step` and `step_only` require a target
base PlanStep. The backend expands the actual execution set, validates the
topology, pins external Artifacts or Deliveries, checks the limit and active-run
lock, and then starts the replay plan. The OpenAPI response uses typed Artifact
and Delivery binding models rather than unstructured dictionaries.

## Events and visualization

The product event stream adds:

- `task.replay_created`
- `task.replay_started`
- `plan.step_reused`
- `task.replay_completed`
- `task.replay_needs_revision`
- `task.replay_failed`
- `task.replay_cancelled`
- `task.replay_limit_reached`

Every event carries `replay_run_id`, replay number, and scope when applicable.
The frontend can render the replay plan with reused base steps in a distinct
style and display `replay_count / max_replay_count`, reason, feedback, timing,
usage, and Artifact lineage. SSE remains a change notification; the persisted
Task and ReplayRun resources remain authoritative.

## Deferred boundaries

V1 does not include arbitrary subsets that are not a descendant closure,
multiple active ReplayRuns inside one Task, clean Workspace snapshot replay,
or autonomous changes to formal organization roles. Full incremental Replay,
incremental `step_only`, and any Replay that would require a producer Runtime to
publish a stream remain disabled until the restricted producer tool boundary is
implemented.
