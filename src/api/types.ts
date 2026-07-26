/**
 * Product types for the Nexwork API.
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
export type RuntimeCapabilityProfile = Schemas['RuntimeCapabilityProfileResponse'];
export type RuntimeCapabilityProfileSpec = Schemas['RuntimeCapabilityProfileSpec'];

/* Feasibility */
export type FeasibilityCheck = Schemas['FeasibilityCheckResponse'];
export type FeasibilityFinding = Schemas['FeasibilityFindingResponse'];
export type FeasibilityOutcome = Schemas['FeasibilityOutcome'];
export type WorkloadRequirements = Schemas['WorkloadRequirements'];

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

/* Platform assistant conversation */
export type AssistantConversation = Schemas['AssistantConversationResponse'];
export type AssistantConversationStatus = Schemas['AssistantConversationStatus'];
export type AssistantMessage = Schemas['AssistantMessageResponse'];
export type AssistantMessagePage = Schemas['AssistantMessagePage'];
export type AssistantMessageRole = Schemas['AssistantMessageRole'];
export type AssistantMessageStatus = Schemas['AssistantMessageStatus'];
export type AssistantUserMessageRequest = Schemas['AssistantUserMessageRequest'];
export type AssistantSubmission = Schemas['AssistantSubmissionResponse'];
export type AssistantTurn = Schemas['AssistantTurnResponse'];
export type AssistantTurnStatus = Schemas['AssistantTurnStatus'];
export type AssistantAction = Schemas['AssistantActionResponse'];
export type AssistantActionStatus = Schemas['AssistantActionStatus'];
export type AssistantActionDecisionRequest = Schemas['AssistantActionDecisionRequest'];

/**
 * Turn states that admit no further transition. `waiting` is excluded: it is a resumable Runtime or
 * capacity boundary, not an end state.
 */
export const TERMINAL_TURN_STATUSES: readonly AssistantTurnStatus[] = [
  'completed',
  'failed',
  'cancelled',
];

export function isTerminalTurnStatus(status: AssistantTurnStatus): boolean {
  return TERMINAL_TURN_STATUSES.includes(status);
}

/**
 * Action states still awaiting a product outcome. Confirmation is asynchronous, so `confirmed` and
 * `executing` are pending — never success — until the backend reports completion or failure.
 */
export const PENDING_ACTION_STATUSES: readonly AssistantActionStatus[] = [
  'proposed',
  'confirmed',
  'executing',
];

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
