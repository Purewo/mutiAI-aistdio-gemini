# D1-B keyed `each` acceptance

Status: accepted as the D1-B backend/frontend gate on 2026-08-01. D1-C later
reopened and passed its corrupt-flow audit gate. D1-D backend implementation is
now complete and awaits its separate real-frontend gate.

## Boundary under test

D1-B proves that one committed final Delivery creates one persisted keyed
`PlanStepExecution`, one exact `DeliveryInputBinding`, and at most one bounded
Assignment. It proves that `max_concurrent_executions` leaves additional
partitions in `ready`, and that completing one keyed execution does not
complete its frozen PlanStep, create lead review, or complete the Task.

This gate did not enable `all`, aggregate publication, final-watermark
convergence, lead review, Task completion, partition Retry/Replay, or restart
recovery. Producer-side Runtime publication tools and the production
event-dispatch worker are also not enabled in this increment. Therefore
`POST /tasks/{task_id}/start` continues to return the stable
`INCREMENTAL_EXECUTION_NOT_ENABLED` conflict. The isolated harness publishes
committed Delivery records through the same product service and explicitly
wakes the keyed scheduler; it does not add a test-only HTTP endpoint.

## Isolated harness

Start one loopback backend:

```powershell
uv run python scripts/run_d1b_acceptance_backend.py --scenario ready --port 8026
```

Seed it from a second terminal:

```powershell
uv run python scripts/seed_d1b_acceptance_task.py --scenario ready --port 8026
```

Use the normal development login and point the frontend proxy at
`http://127.0.0.1:8026`. The seed command prints Task, stream, execution,
Assignment, and organization IDs for technical evidence. The UI must enter
through the Task route and must not ask a simulated user to type internal IDs.

Available scenarios:

- `ready`: east final Delivery is committed; its keyed execution and binding
  are `ready`/`declared`, with no Assignment yet;
- `completed`: east is materialized and executed to `completed`; the consumer
  PlanStep and lead review remain unfinished, and the Task remains nonterminal;
- `backpressure`: east reaches real fake-Runtime `waiting`, while south remains
  `ready` with no Assignment because the subscription limit is one; west has
  not delivered and therefore has no guessed execution.

Use separate ports and databases when running scenarios concurrently. The
default state is retained under `var/d1b-acceptance/<scenario>` and the managed
Runtime root's `d1b-acceptance/<scenario>` subtree as audit evidence.

## Frontend exit gate

Verify against the persisted API and Projection rather than SSE order:

- list/detail `stream-executions` shows the exact partition, status,
  Assignment identity, trigger Delivery, and binding status;
- Task Graph Projection `1.2` contains `plan_step_execution` and
  `delivery_input_binding` nodes plus explicit `delivery_binding` and
  `keyed_execution` relations;
- the materialized binding preserves the accepted Delivery checksum without
  exposing Workspace or storage paths;
- `ready -> submitted -> running -> waiting/completed` changes are visible
  after Task SSE notifications, Last-Event-ID reconnect, deduplication, and
  persisted refetch;
- with concurrency one, south remains `ready` and has no Assignment while east
  is `waiting`;
- the frozen consumer PlanStep is not falsely completed, no lead-review
  Assignment exists, and the Task is not completed;
- the existing start conflict remains stable and does not mutate the Task;
- owner isolation, Console, Network, desktop, and narrow responsive behavior
  remain correct.

## Recorded real-frontend evidence

The frontend consumed an isolated clean backend at `6a58602` without the D1-C
migration. The persisted scenarios were:

- `ready` on `8126/3136`, Task
  `579a7b58-12a7-48c0-b0ca-ca668c7849d7`;
- `completed` on `8127/3137`, Task
  `5429ed15-92bd-4cd6-84a2-b297b15d1cd0`;
- `backpressure` on `8128/3138`, Task
  `a5413fdc-9c83-4909-902e-7912e5522f2a`.

The backpressure stream was `471260d2-61c9-5132-8914-7cd964c0a35d` with east
execution `2b2bf74d-9513-51dc-8eae-613bf795f9d3` and south execution
`8f675ba1-5332-5405-86f7-c171f673c1ec`. The browser observed east waiting,
south ready with no Assignment, occupancy `1/1`, and Projection `1.2` with 12
nodes and 11 persisted relations. Refresh preserved the same projection; the
next SSE request carried
`Last-Event-ID: f1011843-ad28-4cc0-89cc-f8818e999718`. A second user received
`404 TASK_NOT_FOUND`, while `POST /start` retained
`409 INCREMENTAL_EXECUTION_NOT_ENABLED` without mutating the Task.

Chrome DevTools MCP covered `1440x900` and `390x844`: no horizontal overflow,
no visible control below 44px, and no application Console exception. Frontend
generated types, typecheck, lint, build, and diff checks all passed. The
frontend repository retains the full Network and UI evidence in its
`docs/CURRENT_STATUS.md` D1-B section.

D1-C subsequently passed its original real-frontend gate and was explicitly
accepted by the user on 2026-08-01. Its later corrupt-flow audit correction
passed re-acceptance on 2026-08-02. D1-D backend implementation has since
completed and is tracked separately.
