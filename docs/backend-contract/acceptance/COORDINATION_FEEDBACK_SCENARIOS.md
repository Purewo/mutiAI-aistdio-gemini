# Coordination feedback and incremental dataflow acceptance

Status: Stage plan prepared on 2026-07-30. F0 and F1 passed real-frontend
acceptance. F2 semantic issue routing is the only active stage; D1 remains
blocked on F2 acceptance. No later stage may be called complete from backend
fixtures alone.

## Stage gates

### F0 — Shared coordination plane

Backend must provide durable, owner-scoped Signal/Case/WorkItem/Inbox records,
append-only transitions, stable event identities, idempotent delivery, policy
snapshots, and read APIs. This stage does not require an LLM router.

Frontend gate:

- create a Signal through the supported product path;
- observe the Case and WorkItem state through the real API and SSE;
- reconnect and prove event deduplication plus persisted refresh;
- verify loading, empty, error, waiting, terminal, and permission states;
- confirm no raw prompt, Runtime transcript, Workspace path, or hidden router
  state is rendered.

Accepted evidence: isolated ports `3017/8017`, one resolved Case, one completed
WorkItem, one read InboxDelivery, 13 unique events with continuous sequence,
successful Last-Event-ID deduplication, persisted refresh, permission-safe
error state, Console/Network checks, and `1440x900` plus `390x844` layouts.

### F1 — Simple delivery-quality feedback

Scenario:

```text
specialist Artifact validation fails
-> Case opens
-> bounded technical Retry
-> successful retry closes the Case
```

Failure path:

```text
Retry budget exhausted
-> fixed issue-handler or lead WorkItem
-> explicit decision: retry, replay, escalate, human_required, or abort
```

Backend evidence:

- failure reason and evidence Artifact are persisted;
- technical Retry does not consume business Replay count;
- successful siblings and released Artifacts remain unchanged;
- Case transitions and WorkItem attempts are idempotent;
- escalation stops at the configured maximum.

Current backend regression evidence covers a malformed structured delivery,
invalid JSON media with two persisted `rejected` Artifact records, one default
automatic Retry, a configurable retry limit, repeated Signal append, and
configured-role/lead fallback. The authoritative Case response now includes
`retry_attempts`. The complete backend split passes `100 + 26 + 97 = 223`
tests, contract equality and Ruff pass, and the `0018 -> 0017 -> 0018`
migration round trip succeeds.

Frontend gate:

- show the Case separately from Task `failed` or `needs_revision`;
- show the current responsible role and action waiting for it;
- confirm Retry, escalation, and human handoff controls follow backend policy;
- verify desktop layout, Console, Network, and SSE reconnect behavior.

Accepted evidence: isolated ports `3018/8018`; successful Task
`69fdf4cd-b80c-4ecf-bfd3-a36a3935dc45` and resolved Case
`c747c1f2-ee28-47ca-ac83-12de43b95a9b` with `failed -> succeeded` Retry history;
exhausted Task `45d2a9d9-c307-4cb8-9abc-1132652d9f64` and assigned Case
`e986ceb2-aeef-4354-a74a-a3225fcf8ab1` with `failed -> exhausted` Retry history
and one delivered `issue_handler` WorkItem/Inbox record. Both Tasks retained
`replay_count = 0` and their completed parallel sibling; rejected candidates
remained immutable audit Artifacts. Case event sequences remained unique and
continuous at `1..10` and `1..14`; SSE reconnect used `Last-Event-ID` without
duplicate persisted events. Installed Chrome passed `1440x900` and `390x844`
layout checks with no page exception or unexpected Console/Network failure.
Chrome DevTools MCP closed its transport, so Playwright Core was the disclosed
real-browser fallback. F1 is accepted on 2026-07-30.

### F2 — Semantic issue routing role

Use the frontend/backend contract mismatch scenario:

1. A frontend role submits a natural-language observation with the published
   contract and actual response as evidence.
2. A restricted Codex router creates a validated RoutingDecision.
3. The issue-handler role opens or links an Issue and assigns a backend role.
4. The backend role pulls the WorkItem, publishes a fix, and reports it.
5. The issue-handler performs basic publication/contract checks.
6. The frontend role pulls the latest code, retests, and reports success or
   failure.
7. Failure creates another bounded attempt; threshold exhaustion escalates to
   a higher model, organization lead, or human according to policy.

Backend evidence:

- the router reads product evidence through restricted tools;
- target role, action, and completion condition are structured and validated;
- every handoff has a new WorkItem and correlation identity;
- Cases persist across attempts and never overwrite prior evidence;
- escalation and human handoff are explicit terminal or waiting states;
- an invalid or ambiguous route falls back safely instead of guessing.

Current backend evidence: implementation `6db4d20` and migration
`20260731_0019` persist RoutingRuns and RoutingDecisions; the successful API
scenario routes issue-handler -> backend-
fix -> issue-handler publication-check -> frontend reintegration -> resolved.
Additional scenarios cover an invented role falling back to the frozen lead,
attempt exhaustion entering `human_required`, an explicit higher-tier reroute,
Runtime failure fallback, idempotent resubmission, exactly two Case-bound
read-only tools, disabled network/shell/multi-agent features, continuous event
sequences, and omission of Runtime Thread/Turn/Workspace internals from public
responses. The complete backend split passes `105 + 26 + 85 + 12 = 228`
tests; Ruff and contract equality pass; `head -> 0018 -> head` succeeds.
This is backend handoff evidence, not F2 acceptance.

Frontend gate:

- submit the observation through the real product surface without manually
  entering internal IDs;
- display the Case timeline, current owner, WorkItem attempts, and escalation;
- follow the frontend re-integration handoff and final resolution;
- verify unresolved Cases remain visible after reconnect and reload;
- verify Console, Network, responsive desktop layout, and no leakage of
  Runtime prompts or host paths.

### D1 — Incremental Artifact dataflow

Scenario:

```text
three data specialists in parallel
-> incremental Excel reducer
-> one dashboard worker per ready partition
-> final watermark
-> complete aggregate review
```

Backend evidence:

- stream and partition contracts are explicit;
- `each` deliveries start downstream work without waiting for unrelated
  partitions;
- duplicate and out-of-order deliveries are safe;
- provisional and final artifacts are distinct and immutable;
- `all`/watermark finalization is required before complete Task review;
- partition-level Retry, cancellation, usage, and lineage are persisted.

Frontend gate:

- render partial and final delivery separately;
- show partition progress and downstream starts before all upstream work ends;
- verify no false `Task completed` state before the final watermark;
- reconnect and prove delivery deduplication and persisted progress;
- verify desktop/mobile behavior only when the product scope includes mobile,
  plus Console and Network status.

## Cross-stage completion rules

- A stage is accepted only after its backend tests, contract snapshot, and real
  frontend flow pass together.
- If a browser failure is caused by API shape, persistence, event ordering, or
  policy, record it for the backend owner; do not patch around it in the UI.
- If a backend response is correct but the page renders or reconnects
  incorrectly, record it for the frontend owner; do not change the contract to
  suit an accidental presentation.
- The next stage starts only after the preceding acceptance evidence is added
  to `docs/CURRENT_STATUS.md`.
