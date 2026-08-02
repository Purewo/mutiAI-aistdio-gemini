# D1-D recovery, bounded Retry, and Replay-lineage acceptance

Status: backend implementation and focused verification complete on
2026-08-02. The real-frontend gate is pending. D1-E or another incremental
execution expansion must not start before that gate is accepted.

## Boundary under test

D1-D completes the finite `each`/`all` reliability layer without enabling an
unbounded stream engine. It adds:

- append-only Delivery publication Attempts for accepted, duplicate, rejected,
  and conflicting calls;
- strict contiguous per-partition sequence enforcement;
- restart reconstruction of missing keyed joins from product records without
  automatic Runtime start;
- bounded partition technical Retry/cancellation and immutable attempt usage;
- exact downstream incremental `from_step` Replay with pinned/copied Delivery
  lineage;
- Task Graph Projection `1.4` Retry and Delivery `replay_reuse` relations.

Producer-side Runtime publication tools and automatic event dispatch remain
deferred. `POST /tasks/{task_id}/start` therefore continues to return
`INCREMENTAL_EXECUTION_NOT_ENABLED` without mutating the Task. `any`, `quorum`,
and `window` remain reserved but unsupported. Full incremental Replay and
incremental `step_only` remain unsupported because they would require a
producer or reinterpret one partitioned execution as a whole-step candidate.

## Persisted backend exit checks

- an exact duplicate returns the original Delivery and appends one `duplicate`
  Attempt; conflicting identity reuse appends `conflict` and is rejected;
- an out-of-order sequence appends `rejected` with `STREAM_SEQUENCE_GAP` and
  does not change Stream counters or accepted Deliveries;
- subscription retry, execution-time, token, concurrency, partition, and
  delivery limits are finite and validated in the frozen contract/database;
- startup reconstructs a deliberately missing `PlanStepExecution` from the
  accepted Delivery, leaving it `ready` with no Assignment or Runtime;
- a failed partition Retry appends a new `PlanStepExecutionAttempt`, preserves a
  completed sibling, restores the Plan to `active`, and leaves
  `Task.replay_count = 0`;
- exhaustion is stable at `max_retry_count`, records `exhausted`, and still does
  not consume a business Replay;
- cancelling a ready or waiting partition does not cancel a completed sibling;
  a failed Runtime interrupt remains persisted and can be retried separately;
- token or wall-clock violation fails only the exact keyed execution and marks
  its Task/Plan failed;
- downstream incremental `from_step` pins every omitted partition by Stream,
  Delivery, partition, sequence, and SHA-256, copies it into the replay Stream
  with `replay_run_id` plus `source_delivery_id`, and executes only the selected
  descendant closure through lead review;
- Projection `1.4` emits Retry and Delivery Replay-reuse relations only from
  those persisted records;
- public Stream, execution-attempt, ReplayRun, and Graph schemas contain no
  storage path, Runtime Workspace path, checkpoint, transcript, or raw model
  output.

## Real-frontend exit gate

Consume the generated OpenAPI from the D1-D backend and verify in a real
browser:

- Delivery Attempt history distinguishes accepted, duplicate, rejected, and
  conflict outcomes with safe failure summaries;
- partition execution history shows attempt number, trigger, status, usage,
  retry count/limit, and exact partition without deriving state from SSE order;
- owner-scoped Retry and cancel controls use the generated endpoints, remain
  idempotent, and refresh persisted Task/Stream/Graph state;
- a successful sibling remains completed across another partition's failure,
  Retry, exhaustion, or cancellation;
- the Operational Blueprint renders the persisted partition Retry loop and
  copied-Delivery Replay lineage from Projection `1.4`;
- refresh and a real `Last-Event-ID` reconnect do not duplicate Attempt or
  relation evidence;
- a second owner receives the normal hidden `404 TASK_NOT_FOUND` boundary;
- the still-disabled Task start returns the stable 409 and does not mutate the
  Task;
- desktop and narrow layouts remain usable with no horizontal overflow,
  application Console error, or unexpected Network failure.

The frontend must not fabricate Retry/Replay records or infer a relation from
event order, status combinations, filenames, or prose. Backend acceptance data
must be retained as audit evidence after the gate.

## Focused backend verification

The staged D1-D set collected 20 directly affected tests across Stream API,
Delivery lifecycle, keyed `each`, `all` convergence/Replay, Graph projection,
and migration schema. Nineteen passed on the first focused run; the one inherited
D1-C assertion was updated from Projection `1.3.1` to the intentional D1-D
`1.4` and then passed individually. After the final semantic audit, 8 directly
affected Retry/limit/API/reserved-policy cases passed, and all 5 authoritative
OpenAPI/event/OrganizationSpec equality checks passed.

Ruff passes for every changed Python file and `git diff --check` passes. The
migration succeeds through `0023 -> 0024 -> 0023 -> 0024`; both new audit tables
and `input_delivery_bindings` are present at the final revision. Alembic
autogenerate reports only the historical Assignment `plan_step_id`
constraint/index mismatch and missing ReplayRun trigger index; no D1-D table,
column, constraint, or index drift is reported. Per user direction, the
unrelated full backend suite was intentionally not rerun.
