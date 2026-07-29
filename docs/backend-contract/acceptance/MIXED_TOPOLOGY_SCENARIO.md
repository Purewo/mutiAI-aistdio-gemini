# Mixed topology acceptance scenario

Status: Prepared for backend regression and later real frontend business
acceptance.

## Required topology

The persisted plan must contain these dependency waves:

```text
sales_analyst ----\
                   -> metric_joiner -> performance_interpreter --\
cost_analyst -----/                  -> margin_auditor -----------> lead.review
```

The two root specialists must become ready before `metric_joiner` exists.
`metric_joiner` must wait for both root Artifacts. The two terminal specialists
must wait for the joined Artifact and then become ready in the same wave. Lead
review must be created only after both terminal Artifacts are released.

## Business fixture

Use `mixed-store-profit.csv`:

```csv
month,store,sales,cost
2026-01,华东店,120,80
2026-01,华南店,100,60
2026-02,华东店,150,90
2026-02,华南店,130,70
2026-03,华东店,140,85
2026-03,华南店,200,110
```

Role boundaries:

- `sales_analyst` reads the CSV and publishes store sales totals.
- `cost_analyst` reads the same CSV and publishes store cost totals.
- `metric_joiner` consumes only those two Artifacts and publishes joined sales,
  cost, profit, and profit-margin metrics.
- `performance_interpreter` consumes only the joined Artifact and identifies
  the highest-sales and highest-profit store.
- `margin_auditor` consumes only the joined Artifact and compares margins.
- `lead` plans and reviews; it does not calculate or repair specialist output.

Correct values:

- 华东店：销售额 410，成本 255，利润 155，利润率约 37.80%。
- 华南店：销售额 430，成本 240，利润 190，利润率约 44.19%。
- 最高销售额和最高利润均为华南店。
- 华南店利润率比华东店高约 6.38 个百分点。

## Backend gates

- The plan creation event reports `execution_shape=mixed`.
- Persisted dependencies, not array position, reproduce the four waves above.
- Every downstream Assignment materializes only its declared ancestor
  Artifacts; lead review receives only the two terminal Artifacts.
- One waiting root prevents `metric_joiner` from being created. Completing the
  other root alone does not publish the wave or advance the plan.
- A failed terminal branch leaves its completed sibling intact. Technical Retry
  reruns only the failed branch and then resumes lead review.
- `from_step` on one root executes its full descendant closure, pins the other
  root Artifact, and records executed/reused step keys and Artifact lineage.
- Final Task, plan, steps, Assignments, Runtime executions, and Artifacts all
  converge to persisted terminal states.

## Frontend gates

- Submit and start through normal product controls; plan binding must not
  auto-start the Task.
- Render the graph from `dependency_step_ids` as parallel -> serial -> parallel
  -> review, with no inferred edges from array order.
- Show dependency waiting, ready/running, waiting Runtime, Artifact release,
  Retry, replay lineage, and final review without exposing Workspace paths or
  internal LangGraph state.
- Verify desktop usability, SSE reconnect/deduplication, Console, and related
  Network responses against the real backend. Mobile adaptation is outside the
  V1 acceptance gate and is deferred to a separate product pass.
- Compare every displayed business result with the values above.
