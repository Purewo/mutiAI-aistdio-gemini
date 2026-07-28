# Activity and media semantics

This contract gives clients stable activity wording and keeps file-format
requirements behind product-owned normalization and Runtime feasibility checks.

## Client activity phase

`TaskResponse`, `AssignmentResponse`, `PlanStepResponse`, and
`RuntimeExecutionResponse` expose `activity_phase`. The field is derived from
persisted records and does not replace the existing state-machine `status` or
diagnostic `wait_reason` fields.

| `activity_phase` | Product meaning | Suggested Chinese label |
| --- | --- | --- |
| `pending` | Work has not been submitted. | 尚未开始 |
| `submitted` | Work has been submitted but Runtime activity is not established. | 已提交 |
| `queued` | Work is waiting for a Runtime concurrency slot. | 排队中 |
| `working` | Runtime work is active. | 工作中 |
| `waiting_result` | Runtime work started and the product is waiting for its result or next event. | 工作中 · 等待结果 |
| `waiting_approval` | Runtime work is paused at a product-owned approval. | 等待审批 |
| `waiting_external` | Work is waiting at another explicit external boundary. | 等待中 |
| `validating_output` | Runtime work returned and the product is validating or publishing output. | 正在整理结果 |
| `completed` | Work completed. | 已完成 |
| `needs_revision` | The lead rejected final acceptance and requested revision. | 需修订 |
| `blocked` | A plan step cannot proceed. | 已阻断 |
| `failed` | Work failed. | 失败 |
| `cancelled` | Work was cancelled. | 已取消 |

Task activity aggregates its current Assignments and active plan steps. Active
work takes priority over a queued sibling, so a Task does not display as waiting
when another role is already working. Terminal Task state remains authoritative.

Clients use `activity_phase` for activity wording. They do not derive activity
from combinations such as `turn_id != null`, `wait_reason == null`, or raw plan
step state.

## Organization media requirements

Organization proposals accept natural-language format descriptions. The V1
normalizer recognizes explicit Excel or XLSX, CSV, PDF, and common image terms.
It stores canonical MIME types in specialist role capability requirements. A
format mentioned without an output verb is treated as input; explicit output
language creates an output requirement.

The normalizer does not add media requirements to a generic organization request
that names no format. It also does not equate these separate boundaries:

- Platform-assistant attachment content reader support.
- Chat attachment upload acceptance.
- Task input Artifact media and provenance.
- Runtime binding media capabilities for organization roles.

Proposal creation is reversible and always persists the normalized draft.
`capability_unknown` or `blocked` findings remain attached to the proposal and
prevent confirmation or publication without deleting the draft. The finding
identifies the affected role, Runtime binding, capability, required value, and
alternatives.

The default local Runtime profile explicitly supports common text, JSON, CSV,
XLSX, PDF, JPEG, and PNG inputs and common text, JSON, CSV, and XLSX outputs. Its
media inventory remains incomplete. An unlisted required format is therefore
`capability_unknown`, not fabricated support or a fabricated hard mismatch.
User-declared complete profiles remain authoritative and can produce a hard
unsupported-media finding.

## Attachment-backed Task inputs

When a user explicitly maps a current-Turn chat attachment to a planned Task, the
assistant feasibility preview receives the internal attachment ID. The backend
restores the media type, byte size, and SHA-256 from the product database. The
confirmed action performs a fresh feasibility check with that media, and each
Runtime start validates the released Artifacts actually bound to the Assignment's
plan-step input contracts.

Users do not provide MIME types, hashes, storage paths, or Runtime capability
profile fields. A chat attachment remains Conversation context unless a confirmed
`task.submit` Action explicitly maps it to a Task input contract.

## Contract fixtures

Generated examples live in `contracts/fixtures/feasibility/`:

- `task-waiting-activity.json` contains `waiting_result` and `queued` examples.
- `organization-media-generic-*` contains a generic proposal without guessed media.
- `organization-media-excel-csv-*` contains normalized, feasible Excel and CSV input requirements.
- `organization-media-unknown-*` contains a preserved proposal with incomplete Runtime media evidence.
- `organization-media-blocked-*` contains a preserved proposal and a complete profile that explicitly lacks required PDF support.

Regenerate these examples through `scripts/export_feasibility_fixtures.py`; do not
hand-edit captured IDs, timestamps, findings, or response shapes.
