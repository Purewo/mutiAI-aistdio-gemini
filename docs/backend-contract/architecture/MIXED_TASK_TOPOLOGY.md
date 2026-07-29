# Mixed serial-parallel Task topology

Status: Implemented on 2026-07-29; backend regression and real frontend business
acceptance remain the delivery gates.

## Decision

A planned Nexwork Task uses one immutable `TaskExecutionPlan` whose specialist
steps form a directed acyclic graph. Strict-linear and pure-parallel plans are
special cases of the same persisted dependency model. A mixed plan may contain
any number of serial and parallel stages without introducing nested workflow
objects.

For example:

```text
worker A --\
            -> join --+-> branch C --\
worker B --/          \-> branch D ---> lead.review
```

The database remains authoritative for every step, dependency, Assignment,
Runtime execution, input binding, Artifact, status, and event. LangGraph only
executes dependency-ready waves and checkpoints their stable product IDs.

Conditional business feedback is not part of this change. The frozen plan
remains acyclic. A later feedback design must create bounded, lineage-bearing
iterations rather than mutate this DAG or overwrite released Artifacts.

## Plan validation

A valid mixed plan must satisfy all existing graph and contract laws plus these
terminal-review rules:

- The plan contains at least one specialist and exactly one final
  `lead_review` step.
- Every specialist uses one existing non-lead role from the frozen published
  `OrganizationSpec`; one role still appears at most once in one plan.
- Dependencies reference existing steps, contain no duplicates, and form an
  acyclic graph.
- Every input Artifact contract is declared as an initial Task input or is
  produced by a dependency ancestor. Each output contract has one producer.
- `lead_review` depends directly on every terminal specialist step and on no
  non-terminal specialist step.
- Every terminal specialist declares at least one output Artifact.
- `lead_review` consumes every terminal specialist output. Additional review
  inputs are allowed only when they are explicit initial Task inputs, including
  pinned inputs of a replay plan.
- `lead_review` declares no output Artifact and returns only its structured
  review decision.

The persisted creation event classifies the accepted graph as `linear`,
`parallel`, or `mixed`. This classification selects a compatible checkpoint
graph; it does not replace the persisted dependency edges as product truth.

## Dependency-ready wave scheduler

Mixed execution repeats the following bounded loop:

```text
load current plan
-> select every unfinished step whose dependencies are completed
-> create or restore all Assignments in that ready wave
-> dispatch the wave through LangGraph Send
-> checkpoint and wait for outstanding Runtime executions
-> validate every completed delivery in the wave
-> publish immutable Artifacts and materialize the next wave's inputs
-> repeat until lead.review or a terminal failure
```

A downstream Assignment is never created before every dependency completes.
All sibling results in a wave are finalized before the graph advances. If one
delivery fails product validation, successful siblings remain completed and
their Artifacts remain released; unreachable unfinished steps converge to
`cancelled`.

Technical Retry resets only failed Assignments and unstarted cancelled steps.
Completed siblings are reused, after which dependency-ready execution resumes.
Runtime waiting, external completion events, checkpoint resume, cancellation,
idempotent completion, capacity admission, and token accounting retain their
existing product boundaries.

## Replay semantics

- `full` replays the complete mixed DAG.
- `from_step` executes the selected specialist plus its complete downstream
  descendant closure through `lead_review`.
- Dependencies from omitted predecessors are removed from the replay DAG, and
  their exact effective Artifacts become pinned immutable replay inputs.
- `step_only` remains a bounded candidate replay of one specialist plus lead
  review and does not supersede the authoritative delivery by itself.

Every replay still creates a new plan, ReplayRun, Assignments, Runtime
executions, Artifacts, and lineage records. It never resets an earlier run.

## Frontend contract

No nested topology field is introduced. The frontend renders the existing
persisted contract:

- `execution_plan.steps[*].plan_step_id`
- `execution_plan.steps[*].dependency_step_ids`
- role and step kind
- input and output Artifact contracts
- step, Assignment, Runtime, and replay status

Array order is presentation order only. Edges, parallel width, dependency wait,
and critical-path presentation must be derived from the explicit dependency
IDs. The first real business acceptance should cover the same four waves used
by the backend regression: parallel roots, serial join, parallel terminal
branches, then lead review.

## Explicitly deferred

- Conditional or cyclic business feedback.
- Arbitrary simultaneous replay subsets that are not a descendant closure.
- Multiple active ReplayRuns for one Task.
- Autonomous role creation or repeated formal-role steps in one plan.
- Third-party Runtime/tool adapters; those integrations consume this same
  Assignment and Artifact boundary in a separate change.
