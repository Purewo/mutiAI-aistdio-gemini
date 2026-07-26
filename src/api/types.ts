/**
 * Product types for the mutiAI API.
 *
 * Every type here is an alias into `schema.d.ts`, which is generated from the backend's
 * authoritative `contracts/openapi.v1.json` snapshot. Do not hand-write a competing shape for any
 * of these resources. When a screen needs a field that is absent here, report the missing contract
 * to the backend repository instead of inventing one.
 *
 * Regenerate with `npm run generate:types` after refreshing `contracts/`.
 */
import type { components } from './schema';

type Schemas = components['schemas'];

/* Account */
export type User = Schemas['UserResponse'];
export type LoginRequest = Schemas['LoginRequest'];
export type LoginResponse = Schemas['LoginResponse'];

/* Organization design */
export type OrganizationSummary = Schemas['OrganizationSummaryResponse'];
export type OrganizationDetail = Schemas['OrganizationDetailResponse'];
export type OrganizationVersion = Schemas['OrganizationVersionResponse'];
export type OrganizationVersionStatus = Schemas['OrganizationVersionStatus'];
export type OrganizationProposalRequest = Schemas['OrganizationProposalRequest'];
export type OrganizationSpec = Schemas['OrganizationSpec'];
export type AgentRoleSpec = Schemas['AgentRoleSpec'];

/* Runtime configuration */
export type RuntimeBinding = Schemas['RuntimeBindingResponse'];
export type RuntimeBindingUpsertRequest = Schemas['RuntimeBindingUpsertRequest'];
export type RuntimeControl = Schemas['RuntimeControlResponse'];
export type RuntimeExecution = Schemas['RuntimeExecutionResponse'];
export type RuntimeExecutionStatus = Schemas['RuntimeExecutionStatus'];
export type RuntimeSecurityMode = Schemas['RuntimeSecurityMode'];

/* Tasks, plans, and assignments */
export type Task = Schemas['TaskResponse'];
export type TaskStatus = Schemas['TaskStatus'];
export type TaskOrchestrationMode = Schemas['TaskOrchestrationMode'];
export type TaskCreateRequest = Schemas['TaskCreateRequest'];
export type TaskExecutionPlan = Schemas['TaskExecutionPlanResponse'];
export type TaskExecutionPlanStatus = Schemas['TaskExecutionPlanStatus'];
export type PlanStep = Schemas['PlanStepResponse'];
export type PlanStepStatus = Schemas['PlanStepStatus'];
export type Assignment = Schemas['AssignmentResponse'];
export type AssignmentStatus = Schemas['AssignmentStatus'];

/* Artifacts */
export type Artifact = Schemas['ArtifactResponse'];
export type ArtifactStatus = Schemas['ArtifactStatus'];
export type ArtifactInputBinding = Schemas['ArtifactInputBindingResponse'];
export type ArtifactInputBindingStatus = Schemas['ArtifactInputBindingStatus'];
export type TaskInputArtifactRequest = Schemas['TaskInputArtifactRequest'];

/* Approvals */
export type Approval = Schemas['ApprovalResponse'];
export type ApprovalStatus = Schemas['ApprovalStatus'];
export type ApprovalKind = Schemas['ApprovalKind'];
export type ApprovalDecisionRequest = Schemas['ApprovalDecisionRequest'];

/* Usage */
export type TaskTokenUsage = Schemas['TaskTokenUsageResponse'];
export type AssignmentTokenUsage = Schemas['AssignmentTokenUsageResponse'];

/* Errors */
export type ErrorEnvelope = Schemas['ErrorEnvelope'];

/**
 * Task states that admit no further transition. `waiting` and `needs_revision` are deliberately
 * excluded: `waiting` is a resumable Runtime, capacity, or approval boundary, and `needs_revision`
 * is a lead decision awaiting user-directed follow-up. Neither is an error.
 */
export const TERMINAL_TASK_STATUSES: readonly TaskStatus[] = [
  'completed',
  'failed',
  'cancelled',
];

export function isTerminalTaskStatus(status: TaskStatus): boolean {
  return TERMINAL_TASK_STATUSES.includes(status);
}
