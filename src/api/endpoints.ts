/**
 * Typed endpoint functions for the Nexwork API.
 *
 * One function per contracted route. Views import from here; they never build URLs or call `fetch`.
 * Response types come from `types.ts`, which aliases the generated OpenAPI schema, so a contract
 * refresh surfaces as a type error rather than a silent runtime mismatch.
 */
import { buildApiUrl, requestJson, requestVoid } from './http';
import type {
  Approval,
  ApprovalDecisionRequest,
  Artifact,
  ChangePasswordRequest,
  UpdateUserRequest,
  AssistantAction,
  AssistantActionDecisionRequest,
  AssistantAttachment,
  AssistantConversation,
  AssistantMessagePage,
  AssistantSubmission,
  AssistantTurn,
  AssistantUserMessageRequest,
  FeasibilityCheck,
  LoginRequest,
  LoginResponse,
  OrganizationDetail,
  OrganizationProposalRequest,
  OrganizationSummary,
  OrganizationVersion,
  RuntimeBinding,
  RuntimeBindingUpsertRequest,
  RuntimeControl,
  Task,
  TaskCreateRequest,
  TaskInputArtifactRequest,
  TaskTokenUsage,
  User,
} from './types';

const encode = encodeURIComponent;

/* ------------------------------------------------------------------ account */

/**
 * Establish a browser session. The backend replies with an HttpOnly cookie.
 *
 * A 401 here is an invalid-credential result for a session that never existed, so it must not
 * trigger the global "session lapsed" transition.
 */
export function login(body: LoginRequest, signal?: AbortSignal): Promise<LoginResponse> {
  return requestJson<LoginResponse>('/auth/login', {
    method: 'POST',
    body,
    allowUnauthorized: true,
    signal,
  });
}

/** Revoke the current session server-side. Clear frontend state only after this resolves. */
export function logout(signal?: AbortSignal): Promise<void> {
  return requestVoid('/auth/logout', { method: 'POST', signal });
}

/** Resolve the current session. A 401 here means unauthenticated, not a failure to report. */
export function getCurrentUser(signal?: AbortSignal): Promise<User> {
  return requestJson<User>('/auth/me', { signal });
}

/** Update the current user's profile. Only `display_name` is mutable; `username` is immutable. */
export function updateCurrentUser(
  body: UpdateUserRequest,
  signal?: AbortSignal,
): Promise<User> {
  return requestJson<User>('/auth/me', { method: 'PATCH', body, signal });
}

/**
 * Change the current user's password.
 *
 * The backend keeps this browser's session alive and revokes the user's other active sessions, so
 * the caller must not treat success as a sign-out. A wrong current password returns
 * `AUTH_CURRENT_PASSWORD_INVALID`; reusing the current password returns
 * `AUTH_NEW_PASSWORD_MUST_DIFFER`. Both arrive as localized envelopes and are displayed as-is.
 */
export function changePassword(
  body: ChangePasswordRequest,
  signal?: AbortSignal,
): Promise<void> {
  return requestVoid('/auth/password', {
    method: 'POST',
    body,
    // A 401 here would mean the session lapsed, not a bad current password, so leave the global
    // unauthenticated handling in place.
    signal,
  });
}

/* ------------------------------------------------------- organization design */

export function listOrganizations(signal?: AbortSignal): Promise<OrganizationSummary[]> {
  return requestJson<OrganizationSummary[]>('/organizations', { signal });
}

export function getOrganization(
  organizationId: string,
  signal?: AbortSignal,
): Promise<OrganizationDetail> {
  return requestJson<OrganizationDetail>(`/organizations/${encode(organizationId)}`, { signal });
}

/**
 * Ask the platform assistant for one structured organization proposal.
 *
 * This is a single-request lifecycle. The current contract defines no patch route, so the UI must
 * not simulate multi-turn conversational revision of a returned proposal.
 */
export function createOrganizationProposal(
  body: OrganizationProposalRequest,
  signal?: AbortSignal,
): Promise<OrganizationVersion> {
  return requestJson<OrganizationVersion>('/organizations/proposals', {
    method: 'POST',
    body,
    signal,
  });
}

export function listOrganizationVersions(
  organizationId: string,
  signal?: AbortSignal,
): Promise<OrganizationVersion[]> {
  return requestJson<OrganizationVersion[]>(
    `/organizations/${encode(organizationId)}/versions`,
    { signal },
  );
}

/** Confirm a proposal. This does not publish it; publishing is a separate explicit transition. */
export function confirmOrganizationVersion(
  organizationId: string,
  specVersionId: string,
  signal?: AbortSignal,
): Promise<OrganizationVersion> {
  return requestJson<OrganizationVersion>(
    `/organizations/${encode(organizationId)}/versions/${encode(specVersionId)}/confirm`,
    { method: 'POST', signal },
  );
}

/** Publish a confirmed version. Publishing creates no Workspace and no Runtime Thread. */
export function publishOrganizationVersion(
  organizationId: string,
  specVersionId: string,
  signal?: AbortSignal,
): Promise<OrganizationVersion> {
  return requestJson<OrganizationVersion>(
    `/organizations/${encode(organizationId)}/versions/${encode(specVersionId)}/publish`,
    { method: 'POST', signal },
  );
}

/* ------------------------------------------- platform assistant conversation */

/**
 * The platform assistant is a product-owned conversation backed by a persistent Codex Thread.
 * Product-tool results are not a second API: they stay visible through the persisted Organization,
 * Task, Artifact, usage, and feasibility resources, and Codex private history is never exposed.
 */
export function listAssistantConversations(signal?: AbortSignal): Promise<AssistantConversation[]> {
  return requestJson<AssistantConversation[]>('/assistant/conversations', { signal });
}

export function createAssistantConversation(signal?: AbortSignal): Promise<AssistantConversation> {
  return requestJson<AssistantConversation>('/assistant/conversations', {
    method: 'POST',
    signal,
  });
}

export function getAssistantConversation(
  conversationId: string,
  signal?: AbortSignal,
): Promise<AssistantConversation> {
  return requestJson<AssistantConversation>(
    `/assistant/conversations/${encode(conversationId)}`,
    { signal },
  );
}

export function archiveAssistantConversation(
  conversationId: string,
  signal?: AbortSignal,
): Promise<AssistantConversation> {
  return requestJson<AssistantConversation>(
    `/assistant/conversations/${encode(conversationId)}/archive`,
    { method: 'POST', signal },
  );
}

/** One cursor page of conversation history, oldest-first within the page. */
export function listAssistantMessages(
  conversationId: string,
  options: { cursor?: string; limit?: number } = {},
  signal?: AbortSignal,
): Promise<AssistantMessagePage> {
  return requestJson<AssistantMessagePage>(
    `/assistant/conversations/${encode(conversationId)}/messages`,
    { query: { cursor: options.cursor, limit: options.limit }, signal },
  );
}

/**
 * Submit a user message. The backend accepts it (202) and returns the persisted message together
 * with the queued Turn; the assistant's reply arrives later through the event stream. The
 * idempotency key must be stable across retries of the same submission.
 */
export function submitAssistantMessage(
  conversationId: string,
  body: AssistantUserMessageRequest,
  idempotencyKey: string,
  signal?: AbortSignal,
): Promise<AssistantSubmission> {
  return requestJson<AssistantSubmission>(
    `/assistant/conversations/${encode(conversationId)}/messages`,
    { method: 'POST', body, idempotencyKey, signal },
  );
}

/**
 * Upload one product-owned assistant attachment before submitting the message that references it.
 * Uploading never binds the file to a Task; that would require a separate explicit product Action.
 */
export function uploadAssistantAttachment(
  conversationId: string,
  file: File,
  signal?: AbortSignal,
): Promise<AssistantAttachment> {
  const formData = new FormData();
  formData.append('file', file, file.name);
  return requestJson<AssistantAttachment>(
    `/assistant/conversations/${encode(conversationId)}/attachments`,
    { method: 'POST', formData, signal },
  );
}

/** Revoke an uploaded attachment that has not been referenced by a persisted message. */
export function revokeAssistantAttachment(
  conversationId: string,
  attachmentId: string,
  signal?: AbortSignal,
): Promise<AssistantAttachment> {
  return requestJson<AssistantAttachment>(
    `/assistant/conversations/${encode(conversationId)}/attachments/${encode(attachmentId)}`,
    { method: 'DELETE', signal },
  );
}

/** Owner-scoped preview or download URL for a persisted assistant attachment. */
export function getAssistantAttachmentContentUrl(
  conversationId: string,
  attachmentId: string,
  download = false,
): string {
  return buildApiUrl(
    `/assistant/conversations/${encode(conversationId)}/attachments/${encode(attachmentId)}/content`,
    download ? { download: true } : undefined,
  );
}

export function getAssistantTurn(turnId: string, signal?: AbortSignal): Promise<AssistantTurn> {
  return requestJson<AssistantTurn>(`/assistant/turns/${encode(turnId)}`, { signal });
}

export function cancelAssistantTurn(turnId: string, signal?: AbortSignal): Promise<AssistantTurn> {
  return requestJson<AssistantTurn>(`/assistant/turns/${encode(turnId)}/cancel`, {
    method: 'POST',
    signal,
  });
}

export function listAssistantActions(
  conversationId: string,
  signal?: AbortSignal,
): Promise<AssistantAction[]> {
  return requestJson<AssistantAction[]>(
    `/assistant/conversations/${encode(conversationId)}/actions`,
    { signal },
  );
}

export function getAssistantAction(
  actionId: string,
  signal?: AbortSignal,
): Promise<AssistantAction> {
  return requestJson<AssistantAction>(`/assistant/actions/${encode(actionId)}`, { signal });
}

/**
 * Confirm or decline one proposed action.
 *
 * Confirmation is asynchronous: a successful response means the decision was recorded, not that the
 * product operation finished. Treat `confirmed` and `executing` as pending and refresh the action
 * and its referenced resource after `assistant.action.completed` or `assistant.action.failed`.
 */
export function decideAssistantAction(
  actionId: string,
  body: AssistantActionDecisionRequest,
  signal?: AbortSignal,
): Promise<AssistantAction> {
  return requestJson<AssistantAction>(`/assistant/actions/${encode(actionId)}/decision`, {
    method: 'POST',
    body,
    signal,
  });
}

/* ----------------------------------------------------------- feasibility */

/**
 * Feasibility is a product law evaluated by the backend validator; the frontend renders the
 * persisted outcome and findings and never infers feasibility from a model name or an earlier
 * successful execution. Only a `feasible` outcome permits the guarded state transition, and a
 * blocked or capability-unknown result cannot be overridden by user confirmation.
 */
export function getFeasibilityCheck(
  feasibilityCheckId: string,
  signal?: AbortSignal,
): Promise<FeasibilityCheck> {
  return requestJson<FeasibilityCheck>(
    `/feasibility-checks/${encode(feasibilityCheckId)}`,
    { signal },
  );
}

export function listVersionFeasibilityChecks(
  organizationId: string,
  specVersionId: string,
  signal?: AbortSignal,
): Promise<FeasibilityCheck[]> {
  return requestJson<FeasibilityCheck[]>(
    `/organizations/${encode(organizationId)}/versions/${encode(specVersionId)}/feasibility-checks`,
    { signal },
  );
}

export function listTaskFeasibilityChecks(
  taskId: string,
  signal?: AbortSignal,
): Promise<FeasibilityCheck[]> {
  return requestJson<FeasibilityCheck[]>(`/tasks/${encode(taskId)}/feasibility-checks`, { signal });
}

/* ------------------------------------------------- runtime configuration */

export function listRuntimeBindings(signal?: AbortSignal): Promise<RuntimeBinding[]> {
  return requestJson<RuntimeBinding[]>('/runtime/bindings', { signal });
}

/**
 * Create or update one role binding. Rejected changes return a stable conflict code such as
 * `RUNTIME_SECURITY_MODE_INVALID`; never retry automatically with a broader sandbox policy.
 */
export function upsertRuntimeBinding(
  bindingKey: string,
  body: RuntimeBindingUpsertRequest,
  signal?: AbortSignal,
): Promise<RuntimeBinding> {
  return requestJson<RuntimeBinding>(`/runtime/bindings/${encode(bindingKey)}`, {
    method: 'PUT',
    body,
    signal,
  });
}

/** Product admission, capacity, and token-budget state, including the allowed control values. */
export function getRuntimeControls(signal?: AbortSignal): Promise<RuntimeControl> {
  return requestJson<RuntimeControl>('/runtime/controls', { signal });
}

/* --------------------------------------------------------------- tasks */

/**
 * Submit a Task for a published organization.
 *
 * `idempotencyKey` must be stable across retries of the same logical submission. Reusing it returns
 * the original Task; reusing it with a different payload is a conflict.
 */
export function createTask(
  organizationId: string,
  body: TaskCreateRequest,
  idempotencyKey: string,
  signal?: AbortSignal,
): Promise<Task> {
  return requestJson<Task>(`/organizations/${encode(organizationId)}/tasks`, {
    method: 'POST',
    body,
    idempotencyKey,
    signal,
  });
}

export function getTask(taskId: string, signal?: AbortSignal): Promise<Task> {
  return requestJson<Task>(`/tasks/${encode(taskId)}`, { signal });
}

/** Run the organization lead's planning boundary and persist the execution plan. */
export function planTask(taskId: string, signal?: AbortSignal): Promise<Task> {
  return requestJson<Task>(`/tasks/${encode(taskId)}/plan`, { method: 'POST', signal });
}

/**
 * Upload one declared initial input Artifact.
 *
 * `contract_key` must appear in `execution_plan.initial_input_contracts`. Returns the created
 * Artifact, not the Task, so refetch the Task afterwards to observe the updated plan state.
 */
export function uploadTaskInput(
  taskId: string,
  body: TaskInputArtifactRequest,
  signal?: AbortSignal,
): Promise<Artifact> {
  return requestJson<Artifact>(`/tasks/${encode(taskId)}/inputs`, {
    method: 'POST',
    body,
    signal,
  });
}

/**
 * Start a validated plan.
 *
 * If this reports a Runtime failure, refetch the Task and render its persisted failed state instead
 * of stopping at the transient error message.
 */
export function startTask(taskId: string, signal?: AbortSignal): Promise<Task> {
  return requestJson<Task>(`/tasks/${encode(taskId)}/start`, { method: 'POST', signal });
}

/** Retry failed Assignments without replaying completed siblings. */
export function retryTask(taskId: string, signal?: AbortSignal): Promise<Task> {
  return requestJson<Task>(`/tasks/${encode(taskId)}/retry`, { method: 'POST', signal });
}

/**
 * Request cancellation. `TASK_CANCELLATION_INCOMPLETE` means the Task is cancelled but one or more
 * Runtime owners could not confirm the interrupt; the event stream records those execution IDs.
 */
export function cancelTask(taskId: string, signal?: AbortSignal): Promise<Task> {
  return requestJson<Task>(`/tasks/${encode(taskId)}/cancel`, { method: 'POST', signal });
}

/** Task-level token totals and the per-Assignment breakdown. */
export function getTaskUsage(taskId: string, signal?: AbortSignal): Promise<TaskTokenUsage> {
  return requestJson<TaskTokenUsage>(`/tasks/${encode(taskId)}/usage`, { signal });
}

/* ----------------------------------------------------------- approvals */

export function listTaskApprovals(taskId: string, signal?: AbortSignal): Promise<Approval[]> {
  return requestJson<Approval[]>(`/tasks/${encode(taskId)}/approvals`, { signal });
}

/**
 * Submit one one-time approval decision.
 *
 * Repeating the same decision is idempotent. A different decision after resolution, or a decision
 * the Runtime no longer waits on, returns a conflict.
 */
export function decideTaskApproval(
  taskId: string,
  approvalId: string,
  body: ApprovalDecisionRequest,
  signal?: AbortSignal,
): Promise<Approval> {
  return requestJson<Approval>(
    `/tasks/${encode(taskId)}/approvals/${encode(approvalId)}/decision`,
    { method: 'POST', body, signal },
  );
}
