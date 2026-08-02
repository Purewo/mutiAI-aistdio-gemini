# Coordination feedback phased delivery plan

Status: Active plan from 2026-07-30. F0 and F1 passed real-frontend acceptance;
F2 semantic issue routing is the only active stage. D1 remains blocked on F2.
This file is the durable stage checklist for coordination feedback and
incremental Artifact delivery.

## Working rule

Only one stage is active at a time. Backend implementation and contract checks
must pass first, then the frontend consumes the authoritative snapshot and runs
the real-browser gate. The following stage does not start until acceptance
evidence is added to `docs/CURRENT_STATUS.md`.

The backend repository owns semantics, persistence, policies, event ordering,
OpenAPI/JSON Schema, fixtures, migrations, and backend tests. The frontend
repository owns generated-client consumption, page behavior, SSE refresh,
Console/Network checks, and real-browser acceptance. Third-party issue/tool
adapters remain a separate integration and must consume, not redefine, these
contracts.

## Stage F0 — Shared coordination plane

Goal: prove durable coordination records without relying on an LLM router.

Backend status: complete at `1bd4cad`. The migration, typed contracts,
owner-scoped API, finite state transitions, idempotency, Inbox delivery, event
history, and Last-Event-ID SSE replay pass the full `219`-test backend suite.
Frontend status: accepted on 2026-07-30 with a resolved persisted Case, one
completed/read WorkItem delivery, 13 unique continuous events, SSE reconnect
deduplication, permission and state coverage, and desktop/mobile browser checks.

Backend deliverables:

- Signal, Case, WorkItem, InboxDelivery, transition, policy snapshot, and
  attempt persistence;
- owner-scoped create/read/list boundaries required by the vertical slice;
- transition validation, idempotency, event sequence, and SSE notification;
- migrations, typed API schemas, fixtures, and targeted tests;
- no automatic Task mutation or Runtime transcript storage.

Frontend deliverables after contract handoff:

- Case and inbox list/detail states from generated types;
- persisted timeline and current owner/action presentation;
- loading, empty, error, waiting, terminal, reconnect, and permission states;
- real browser desktop acceptance with Console, Network, and SSE evidence.

Exit gate: F0 in
`docs/acceptance/COORDINATION_FEEDBACK_SCENARIOS.md` passes end to end.

## Stage F1 — Simple delivery-quality feedback

Goal: connect a real Artifact validation failure to the coordination plane.

Status: accepted on 2026-07-30. Backend implementation `8be8b5f`, handoff
`9c7b2e0`, generated frontend contract consumption, and the real-browser exit
gate all passed. The accepted paths cover successful technical recovery and
retry exhaustion without consuming business Replay.

Backend deliverables:

- delivery-quality Signal creation from product validation failure;
- bounded automatic technical Retry policy;
- Case closure after successful Retry;
- exhausted-Retry WorkItem to a configured issue-handler or lead;
- successful sibling preservation, Retry/Replay budget separation, and
  escalation-limit tests.

Frontend deliverables after contract handoff:

- clear separation among Task failure, technical Retry, Case state, and
  business Replay;
- current responsible role, attempts, threshold, and escalation action;
- real BOM/invalid-Artifact browser scenario and reconnect verification.

Exit gate: F1 passes; no code for F2 is merged before this browser evidence.

## Stage F2 — Semantic issue routing role

Goal: complete the natural-language contract-mismatch collaboration loop.

Status: backend implementation `6db4d20` and authoritative contract are
complete on the active `feat/semantic-issue-routing` branch. Backend
verification passes all `228` collected tests, Ruff, OpenAPI/event contract
equality, and migration `head -> 20260730_0018 -> head`. F2 is not accepted
until the frontend consumes the handoff and passes the real-browser exit gate.
D1 remains blocked.

Backend deliverables:

- restricted router Assignment and tool allowlist;
- structured RoutingDecision validation and safe ambiguity fallback;
- issue-handler, backend-fix, publication-check, and frontend-reintegration
  WorkItem transitions;
- repeated-attempt, higher-model, lead, and human escalation policies;
- immutable evidence and complete audit lineage.

Frontend deliverables after contract handoff:

- natural-language observation submission without internal IDs;
- Case timeline, routing, WorkItem ownership, attempts, and escalation UI;
- frontend reintegration confirmation and unresolved-loop presentation;
- real browser completion plus failure-to-threshold scenario.

Exit gate: F2 passes before semantic feedback is described as stable.

## Stage D1 — Incremental Artifact delivery

Goal: remove the whole-wave barrier only for plans that explicitly opt into
partitioned delivery.

Status: blocked until F2 passes its real-frontend exit gate.

Backend deliverables:

- ArtifactStream/Delivery identity, partition, sequence, and watermark model;
- explicit `each`, `any`, `all`, `quorum`, and `window` trigger contracts;
- keyed readiness, idempotency, backpressure, ordering, finalization, Retry,
  cancellation, usage, and lineage;
- compatibility tests proving ordinary whole-Artifact mixed DAGs are unchanged.

Frontend deliverables after contract handoff:

- stream and partition progress;
- provisional/final differentiation;
- early downstream execution without false aggregate completion;
- partition Retry/lineage and reconnect/deduplication acceptance.

Exit gate: the three-producer, incremental-Excel, three-dashboard scenario
passes against the real backend.

## Stop conditions

Pause the current stage instead of broadening scope when:

- an authoritative contract decision is missing;
- the frontend would have to guess a field, status, or relationship;
- a Case loop lacks a finite retry/escalation bound;
- a router would require arbitrary database or host-filesystem access;
- incremental execution lacks explicit partition or final-watermark semantics;
- a failing real-browser scenario has not been isolated to its owning layer.

F2 is the only active stage. D1 starts only after the user accepts the F2
real-frontend result.
