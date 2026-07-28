# API response fixtures

These files are captured from the real FastAPI application at backend contract commit `a4bced0`. Generation used FastAPI `TestClient`, the product database, LangGraph checkpoints, the real plan and Artifact services, and a deterministic fake external Runtime. No remote server was required.

Use these fixtures for offline regression and visual review when the local
backend is unavailable or a state is expensive to reproduce. OpenAPI and the
JSON Schemas under `contracts/` remain authoritative. IDs, timestamps,
summaries, model labels, and token counts are fixture values, not product
defaults.

The responses were captured in one isolated execution session so every scenario uses the same published organization. No fields, statuses, dependencies, event positions, usage values, or response shapes were added or changed. Every JSON response was validated against the current backend Pydantic response model after capture.

## Organization and authentication

- `auth-login.json`: Successful browser-session login response.
- `organizations-empty.json`: Authenticated empty organization list.
- `organization-proposal.json`: New proposal response.
- `organization-confirmed.json`: Confirmed organization version.
- `organization-published.json`: Published organization version.
- `organizations-list.json`: Non-empty organization list.
- `organization-detail.json`: Published organization detail.

## Task topology and states

- `task-linear-planned.json`: Validated strict-linear plan before execution.
- `task-linear-completed.json`: Completed strict-linear Artifact chain and lead review.
- `task-parallel-planned.json`: Validated pure-parallel plan before execution.
- `task-parallel-completed.json`: Completed parallel fan-out, Artifact join, and lead review.
- `task-waiting-planned.json`: Validated plan before a Runtime wait.
- `task-waiting-waiting.json`: Persisted waiting Task and Runtime execution.
- `task-failed-planned.json`: Validated plan before a Runtime failure.
- `task-failed-failed.json`: Persisted failed Task fetched after `/start` reported the Runtime failure.

Render plan edges from each step's `plan_step_id` and `dependency_step_ids`. The linear fixture has dependency counts `[0, 1, 1]`. The parallel fixture has dependency counts `[0, 0, 2]`. Do not infer topology from array order.

## Artifact, usage, approvals, and events

- `artifact-linear-content.json` and `artifact-parallel-*-content.json`: Actual JSON bodies returned by Artifact `content_url`.
- `task-*-usage.json`: Product-owned Task usage aggregation.
- `task-linear-approvals.json`: Actual empty approval list for a completed Task.
- `task-*-events.json`: Parsed `data:` envelopes from the real SSE endpoint, with contiguous sequence numbers starting at 1.
- `runtime-bindings.json` and `runtime-controls.json`: Runtime configuration and control responses.
- `error-task-not-found.json`: Actual owner-scoped API error envelope.

Do not add fields to these files by hand. Refresh them from the backend when the contract baseline changes.
