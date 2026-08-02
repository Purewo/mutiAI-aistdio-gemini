# D1-E finite Artifact stream production activation

## Scope

D1-E promotes the finite `ArtifactStream` vertical slice to the explicit Task
start boundary for supported `each` and `all` subscriptions. A planned Task
with stream contracts is not started by an event-order heuristic or by a
test-only wake call. `POST /api/v1/tasks/{task_id}/start` enters the persisted
producer checkpoint, then drains the durable keyed executions and the final
watermark `all` execution before ordinary lead review.

The supported topology is:

`producer → each(partition) → all(final watermark) → lead review → completed`

The `each` branches may execute as soon as their final Deliveries are
available. The `all` branch is admitted only after every declared source stream
has an accepted Finalization and the required watermark is persisted.

## Runtime boundary

The producer is one ordinary Assignment backed by the role's persisted
`RuntimeBinding`. Before the real Runtime call, Q0 role admission obtains the
Assignment lease; only then are the Workspace, input materialization, and final
instructions prepared. A producer receives a product-owned developer contract
and two bounded dynamic tools:

- `nexwork_publish_stream_delivery`
- `nexwork_finalize_stream`

The handler validates the active Assignment, lease holder, Task/PlanStep and
stream contract, Workspace path boundary, idempotency, file hash/size, and
declared output relation before calling the product Artifact service. Runtime
output text is never treated as a publication authority. A provider without
this callback port (currently Dify) is rejected at the explicit start boundary
with `STREAM_PRODUCER_RUNTIME_UNSUPPORTED`.

## Checkpoint and recovery

Producer work uses a dedicated LangGraph checkpoint thread derived from the
Task and producer Assignment. Runtime completion, role-queue waits, capacity
waits, and process restart resume that checkpoint with the persisted execution
identity. Startup recovery reattaches a waiting producer only when the external
Runtime supervisor can validate its recorded Thread/Turn/Workspace binding;
otherwise the execution becomes an explicit retryable orphan failure. A
reattached producer renews its Q0 lease before the supervisor watch resumes.

The orchestrator owns a database-driven wake pool. It reconstructs missing
keyed `each` joins from persisted Streams/Deliveries, drains ready executions,
advances watermark convergence, and leaves waiting work queued without a
Runtime call. `Task.start` is idempotent for non-terminal Tasks and never
creates a second producer Assignment for the same plan step.

## Provider and compatibility rules

The shared `RoleExecutionRequest` remains provider-neutral. Dynamic tools and
the server callback are passed only when a producer actually needs them, so
legacy custom Runtime adapters that implement the earlier execute signature
continue to work for ordinary Assignments. Dify remains an opaque bounded role
executor and explicitly rejects producer dynamic tools rather than silently
ignoring them.

## Product evidence

The authoritative implementation is in `TaskOrchestrator`,
`LinearTaskScheduler`, `IncrementalEachScheduler`, `ArtifactStreamManager`,
and `RuntimeProviderRegistry`. Focused regression covers automatic
producer/each/all/lead completion, handler contract rejection, restart wake,
keyed lazy Workspace preparation, finalization-attempt persistence, role FIFO,
linear execution, migrations, OpenAPI, and event-contract equality. The real
frontend gate uses the current main service and verifies the persisted Task,
Stream, Assignment, Artifact, SSE, and refresh states rather than only chat
responses.
