# D1-C `all` convergence acceptance

Status: original backend and real-frontend convergence gate accepted on
2026-08-01. A later corrupt-flow audit gap reopened D1-C. The focused backend
correction passed frontend re-acceptance on 2026-08-02. The D1-D backend has
since been implemented; its separate real-frontend gate
is tracked in `D1D_RECOVERY_LINEAGE_SCENARIOS.md`.

## Boundary under test

D1-C proves that `all` is created only from an accepted final watermark, binds
every required immutable final Delivery, materializes the exact bindings before
aggregate execution, publishes the declared aggregate Artifact, and enters
ordinary lead review only after stream-owned specialist steps converge. An
`all` execution cannot start from a partial stream and neither finalization nor
binding starts the Task automatically.

This gate does not add producer-side Runtime publication tools, an automatic
event-dispatch worker, restart recovery, partition Retry/cancellation, usage, or
Replay lineage. The normal `POST /tasks/{task_id}/start` path therefore retains
the stable `INCREMENTAL_EXECUTION_NOT_ENABLED` conflict. The harness uses the
real Delivery/finalization services and explicitly wakes the orchestrator.

## Isolated harness

Start one loopback backend:

```powershell
uv run python scripts/run_d1c_acceptance_backend.py --scenario finalized --port 8027
```

Seed it from a second terminal:

```powershell
uv run python scripts/seed_d1c_acceptance_task.py --scenario finalized --port 8027
```

Use the normal development login and point the frontend proxy at
`http://127.0.0.1:8027`. The seed command prints Task, organization, stream,
finalization, execution, binding, aggregate Artifact, and review Assignment IDs
as technical evidence. The UI must enter through the Task route and must never
ask a simulated user to type those IDs.

Available scenarios:

- `partial`: east has completed its real `each` execution and published one
  downstream final Delivery; the stream is still open, there is no final
  watermark or `all` execution, and the Task remains nonterminal;
- `finalized`: east/south `each` executions are complete, the downstream stream
  has an accepted final watermark, and one `all` execution is `ready` with two
  declared Delivery bindings and no Assignment;
- `completed`: both bindings are materialized, the `all` Assignment publishes
  the aggregate Artifact, stream steps converge, lead review runs last, and the
  Task is completed;
- `corrupt`: the south stored bytes are changed before finalization, which is
  rejected with `STREAM_FINALIZATION_DELIVERY_CORRUPT`; the Stream remains
  `open`, no successful Finalization or `all` execution is created, and one
  immutable rejected `StreamFinalizationAttempt` plus structured Task event is
  queryable after refresh.

Each scenario keeps its database and checkpoint evidence under
`var/d1c-acceptance/<scenario>` and its Runtime files under the configured
`d1c-acceptance/<scenario>` workspace subtree.

## Persisted exit checks

- `all` accepts only final Deliveries and concurrency one;
- the accepted watermark partition set, sequence, checksum, and Delivery IDs
  match the declared finite stream exactly;
- every finalization decision has an increasing immutable Attempt; rejection
  persists its safe code, summary, failed partition, expected/observed counts,
  and verified watermark subset before the stable error is re-raised;
- a rejected checksum attempt appears in the owner-scoped Stream projection,
  Task SSE, and Graph `verification` relation after refresh without changing
  the Stream from `open` or fabricating a successful Finalization;
- an explicit corrected final Delivery can be finalized later; the accepted
  Attempt links the real Finalization and does not erase the rejected history;
- one finalization produces at most one `all` execution per subscription;
- the `all` execution has `partition_key=null`, no trigger Delivery, the exact
  trigger finalization, and one binding per watermark member;
- binding status changes from `declared` to `materialized` before the aggregate
  Runtime is submitted;
- no lead-review Assignment or Task completion exists at `all=ready` or merely
  after aggregate binding;
- the released aggregate Artifact belongs to the `all` Assignment and frozen
  aggregate PlanStep;
- lead review execution evidence contains safe product-owned stream Delivery
  and binding facts without storage paths or Runtime transcripts;
- Task Graph Projection `1.3.1` contains `watermark_convergence`,
  `incremental_output`, and aggregate `artifact_handoff` relations backed by
  persisted IDs, plus persisted finalization-attempt `verification` evidence;
- the aggregate execution completes before `lead.review_completed`, and
  `task.completed` is last;
- owner isolation, SSE persisted refetch, Console, Network, desktop, and narrow
  responsive behavior remain correct in the frontend gate.

## Verification recorded for the backend gate

The targeted D1-C tests cover invalid `all` configuration, persistent corrupt
watermark rejection, corrected finalization with immutable attempt history,
exact multi-Delivery binding/materialization, aggregate publication,
Projection `1.3.1`, owner isolation, SSE evidence, review ordering, and final
Task completion. Migration `head -> 20260801_0022 -> head` passes. Contract
snapshots are regenerated and their equality tests pass. Alembic autogenerate
still reports only the known historical Assignment/ReplayRun index
differences; it reports no finalization-attempt table, column, constraint, or
index drift. The unrelated full suite was not rerun for this focused fix.

The correction frontend gate consumed
`fix/d1c-finalization-attempt@0789854` on isolated ports `8133/3154`. It
confirmed immutable Attempt history, Projection `1.3.1` attempt nodes and
`verification` edges, structured rejected SSE display, refresh persistence of
exactly one rejected Attempt/event, Stream `open` with no fabricated
Finalization or `all` execution, and a real `Last-Event-ID` reconnect. Desktop
`1440x900` and narrow `390x844` had no horizontal overflow or application
Console error. Generated types, TypeScript, ESLint, build, and diff checks
passed. The services were stopped and persisted acceptance data was retained.
