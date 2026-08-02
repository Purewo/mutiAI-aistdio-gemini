# D1 incremental Artifact delivery acceptance

Status: D1-A, D1-B, and D1-C backend/real-frontend gates are accepted. D1-D
backend implementation is complete and tracked in
`D1D_RECOVERY_LINEAGE_SCENARIOS.md`; its real-frontend gate is pending.

## D1-A boundary

D1-A proves finite stream contracts and durable read projections only. It does
not start downstream keyed execution. A Task whose plan contains
`stream_output_contracts` or `stream_input_contracts` returns the stable
`INCREMENTAL_EXECUTION_NOT_ENABLED` conflict from `POST /tasks/{task_id}/start`.
This prevents the existing whole-Artifact scheduler from interpreting a stream
as a terminal Artifact.

The acceptance harness is loopback-only. It adds no production test endpoint
and stores each scenario below `var/d1a-acceptance/<scenario>` plus the managed
Runtime root's `d1a-acceptance/<scenario>` subtree.

Start one isolated backend:

```powershell
uv run python scripts/run_d1a_acceptance_backend.py --scenario partial --port 8021
```

Seed it from a second terminal:

```powershell
uv run python scripts/seed_d1a_acceptance_task.py --scenario partial --port 8021
```

Log in with the normal development account and point the frontend proxy at
`http://127.0.0.1:8021`. The seed command prints the Task and stream IDs for
technical evidence; the product UI must enter through the Task page or Graph
projection and must not ask a simulated user to type those IDs.

Available scenarios:

- `empty`: declared finite stream, no Delivery and no open transition;
- `open`: open stream with both declared partitions still empty;
- `partial`: one accepted final partition while the other remains empty;
- `finalized`: both partitions have accepted final Deliveries and an immutable
  finalization watermark;
- `failed`: one accepted partition followed by a persisted stream failure.

## Frontend exit gate

For each applicable state, verify:

- `GET /api/v1/tasks/{task_id}/streams` and the detail endpoint render only
  persisted stream, partition, Delivery, subscription, and finalization facts;
- `TaskExecutionPlan.steps` exposes typed additive
  `stream_output_contracts`/`stream_input_contracts` without changing ordinary
  `input_contracts`/`output_contracts`;
- the Task Graph `1.1` projection uses explicit `artifact_stream`,
  `artifact_delivery`, and `stream_finalization` resources plus
  `incremental_handoff`, `stream_subscription`, and `finalization` relations;
- Task SSE refetch after `artifact_stream.*` and `artifact_delivery.*` events is
  deduplicated across Last-Event-ID reconnect and page refresh;
- another account receives the normal owner-scoped not-found response;
- the Task remains unstarted, and clicking start shows the stable D1-A conflict
  rather than changing Task or PlanStep status;
- desktop and narrow layouts distinguish declared/empty, open, partial,
  finalized, and failed states without inferring readiness from event order,
  timestamps, partition labels, or prose.

Stop the harness after acceptance. Its database and stored delivery bytes are
audit evidence and are not deleted by the scripts.

## Later gates

D1-B adds `PlanStepExecution` and `DeliveryInputBinding` plus real `each`
readiness and bounded early Assignment execution. D1-C enables `all`
convergence and authoritative aggregate/lead review. D1-D adds restart
recovery, bounded out-of-order handling, partition-scoped Retry/cancellation/
usage, and Replay lineage. Each later stage retains its own acceptance gate;
passing D1-A alone never authorizes claiming a later stage.
