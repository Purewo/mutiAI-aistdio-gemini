/**
 * Typed endpoint functions for the Nexwork API.
 *
 * One function per contracted route. Views import from here; they never build URLs or call `fetch`.
 * Response types come from `types.ts`, which aliases the generated OpenAPI schema, so a contract
 * refresh surfaces as a type error rather than a silent runtime mismatch.
 */
import { buildApiUrl, requestBlob, requestJson, requestVoid } from './http';
import type {
  Approval,
  ApprovalDecisionRequest,
  Artifact,
  ArtifactStream,
  ChangePasswordRequest,
  UpdateUserRequest,
  ChannelAuthorization,
  ChannelAuthorizationPollRequest,
  ChannelConnection,
  ChannelConnectionCreateRequest,
  ChannelIdentity,
  ChannelIdentityUpsertRequest,
  ChannelInboundDelivery,
  ChannelOutboundDelivery,
  ChannelProvider,
  CoordinationCase,
  CoordinationCaseStatus,
  CoordinationCaseTransitionRequest,
  CoordinationEvent,
  CoordinationInboxDelivery,
  CoordinationInboxDeliveryStatus,
  CoordinationRoutingRun,
  CoordinationSemanticObservationRequest,
  CoordinationSemanticObservationResponse,
  CoordinationSignalCreateRequest,
  CoordinationSignalCreateResponse,
  CoordinationWorkItem,
  CoordinationWorkItemCreateRequest,
  CoordinationWorkItemReportRequest,
  CoordinationWorkItemReportResponse,
  CoordinationWorkItemTransitionRequest,
  AssistantAction,
  AssistantActionDecisionRequest,
  AssistantAttachment,
  AssistantConversation,
  AssistantInput,
  AssistantMessagePage,
  AssistantSubmission,
  AssistantTurn,
  AssistantUserMessageRequest,
  ExpertAttachment,
  ExpertCatalogItem,
  ExpertCategory,
  ExpertConversation,
  ExpertConversationCreateRequest,
  ExpertDetail,
  ExpertInteractionMode,
  ExpertMessagePage,
  ExpertMessageRequest,
  ExpertSubmission,
  ExpertTurn,
  ExpertVersion,
  FeasibilityCheck,
  LoginRequest,
  LoginResponse,
  OrganizationDetail,
  OrganizationProposalRequest,
  OrganizationSummary,
  OrganizationVersion,
  PlanStepExecution,
  PlanStepExecutionCancelRequest,
  PlanStepExecutionRetryRequest,
  RuntimeBinding,
  RuntimeBindingUpsertRequest,
  RuntimeControl,
  RoleWorkItemCancelRequest,
  Task,
  TaskCreateRequest,
  TaskGraphProjection,
  TaskInputArtifactRequest,
  TaskReplayPolicyRequest,
  TaskReplayRequest,
  TaskReplayRun,
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

/* --------------------------------------------------------- Expert Marketplace */

export function listExperts(
  query: {
    query?: string;
    provider?: string;
    category?: readonly string[];
    interaction_mode?: ExpertInteractionMode;
    input_media_type?: string;
    output_media_type?: string;
    eligible_only?: boolean;
    limit?: number;
  } = {},
  signal?: AbortSignal,
): Promise<ExpertCatalogItem[]> {
  return requestJson<ExpertCatalogItem[]>('/experts', { query, signal });
}

/** Operator-owned read-only marketplace categories, including currently empty categories. */
export function listExpertCategories(signal?: AbortSignal): Promise<ExpertCategory[]> {
  return requestJson<ExpertCategory[]>('/experts/categories', { signal });
}

export function getExpert(expertId: string, signal?: AbortSignal): Promise<ExpertDetail> {
  return requestJson<ExpertDetail>(`/experts/${encode(expertId)}`, { signal });
}

export function getExpertVersion(
  expertVersionId: string,
  signal?: AbortSignal,
): Promise<ExpertVersion> {
  return requestJson<ExpertVersion>(`/experts/versions/${encode(expertVersionId)}`, { signal });
}

export function listExpertConversations(signal?: AbortSignal): Promise<ExpertConversation[]> {
  return requestJson<ExpertConversation[]>('/experts/conversations', { signal });
}

export function createExpertConversation(
  body: ExpertConversationCreateRequest,
  signal?: AbortSignal,
): Promise<ExpertConversation> {
  return requestJson<ExpertConversation>('/experts/conversations', {
    method: 'POST',
    body,
    signal,
  });
}

export function getExpertConversation(
  conversationId: string,
  signal?: AbortSignal,
): Promise<ExpertConversation> {
  return requestJson<ExpertConversation>(
    `/experts/conversations/${encode(conversationId)}`,
    { signal },
  );
}

export function archiveExpertConversation(
  conversationId: string,
  signal?: AbortSignal,
): Promise<ExpertConversation> {
  return requestJson<ExpertConversation>(
    `/experts/conversations/${encode(conversationId)}/archive`,
    { method: 'POST', signal },
  );
}

export function uploadExpertAttachment(
  conversationId: string,
  file: File,
  signal?: AbortSignal,
): Promise<ExpertAttachment> {
  const formData = new FormData();
  formData.append('file', file, file.name);
  return requestJson<ExpertAttachment>(
    `/experts/conversations/${encode(conversationId)}/attachments`,
    { method: 'POST', formData, signal },
  );
}

export function revokeExpertAttachment(
  conversationId: string,
  attachmentId: string,
  signal?: AbortSignal,
): Promise<ExpertAttachment> {
  return requestJson<ExpertAttachment>(
    `/experts/conversations/${encode(conversationId)}/attachments/${encode(attachmentId)}`,
    { method: 'DELETE', signal },
  );
}

export function readExpertAttachmentContent(
  conversationId: string,
  attachmentId: string,
  download = false,
  signal?: AbortSignal,
): Promise<Blob> {
  return requestBlob(
    `/experts/conversations/${encode(conversationId)}/attachments/${encode(attachmentId)}/content`,
    { download: download || undefined },
    signal,
  );
}

export function listExpertMessages(
  conversationId: string,
  signal?: AbortSignal,
): Promise<ExpertMessagePage> {
  return requestJson<ExpertMessagePage>(
    `/experts/conversations/${encode(conversationId)}/messages`,
    { signal },
  );
}

export function submitExpertMessage(
  conversationId: string,
  body: ExpertMessageRequest,
  idempotencyKey: string,
  signal?: AbortSignal,
): Promise<ExpertSubmission> {
  return requestJson<ExpertSubmission>(
    `/experts/conversations/${encode(conversationId)}/messages`,
    { method: 'POST', body, idempotencyKey, signal },
  );
}

export function getExpertTurn(turnId: string, signal?: AbortSignal): Promise<ExpertTurn> {
  return requestJson<ExpertTurn>(`/experts/turns/${encode(turnId)}`, { signal });
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
 * Submit web composer input through the unified conversation boundary.
 *
 * The discriminated response either queues an assistant Turn, records an exact text Action
 * decision, or persists a product acknowledgement explaining why no deterministic decision was
 * possible. Only the `assistant_turn` branch creates Runtime work.
 */
export function submitAssistantInput(
  conversationId: string,
  body: AssistantUserMessageRequest,
  idempotencyKey: string,
  signal?: AbortSignal,
): Promise<AssistantInput> {
  return requestJson<AssistantInput>(
    `/assistant/conversations/${encode(conversationId)}/inputs`,
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

/** Product admission, capacity, and token-budget state for one registered provider. */
export function getRuntimeControls(
  provider?: string,
  signal?: AbortSignal,
): Promise<RuntimeControl> {
  return requestJson<RuntimeControl>('/runtime/controls', {
    query: provider ? { provider } : undefined,
    signal,
  });
}

/* ---------------------------------------------------------- external channels */

export function listChannelProviders(signal?: AbortSignal): Promise<ChannelProvider[]> {
  return requestJson<ChannelProvider[]>('/channels/providers', { signal });
}

export function listChannelConnections(signal?: AbortSignal): Promise<ChannelConnection[]> {
  return requestJson<ChannelConnection[]>('/channels/connections', { signal });
}

export function createChannelConnection(
  body: ChannelConnectionCreateRequest,
  signal?: AbortSignal,
): Promise<ChannelConnection> {
  return requestJson<ChannelConnection>('/channels/connections', {
    method: 'POST',
    body,
    signal,
  });
}

export function getChannelConnection(
  connectionId: string,
  signal?: AbortSignal,
): Promise<ChannelConnection> {
  return requestJson<ChannelConnection>(
    `/channels/connections/${encode(connectionId)}`,
    { signal },
  );
}

export function beginChannelAuthorization(
  connectionId: string,
  signal?: AbortSignal,
): Promise<ChannelAuthorization> {
  return requestJson<ChannelAuthorization>(
    `/channels/connections/${encode(connectionId)}/authorization`,
    { method: 'POST', signal },
  );
}

export function pollChannelAuthorization(
  connectionId: string,
  authSessionId: string,
  body?: ChannelAuthorizationPollRequest,
  signal?: AbortSignal,
): Promise<ChannelAuthorization> {
  return requestJson<ChannelAuthorization>(
    `/channels/connections/${encode(connectionId)}/authorization/${encode(authSessionId)}/poll`,
    { method: 'POST', body, signal },
  );
}

export function disconnectChannelConnection(
  connectionId: string,
  signal?: AbortSignal,
): Promise<ChannelConnection> {
  return requestJson<ChannelConnection>(
    `/channels/connections/${encode(connectionId)}/disconnect`,
    { method: 'POST', signal },
  );
}

export function listChannelIdentities(
  connectionId: string,
  signal?: AbortSignal,
): Promise<ChannelIdentity[]> {
  return requestJson<ChannelIdentity[]>(
    `/channels/connections/${encode(connectionId)}/identities`,
    { signal },
  );
}

export function upsertChannelIdentity(
  connectionId: string,
  body: ChannelIdentityUpsertRequest,
  signal?: AbortSignal,
): Promise<ChannelIdentity> {
  return requestJson<ChannelIdentity>(
    `/channels/connections/${encode(connectionId)}/identities`,
    { method: 'POST', body, signal },
  );
}

export function revokeChannelIdentity(
  connectionId: string,
  identityId: string,
  signal?: AbortSignal,
): Promise<ChannelIdentity> {
  return requestJson<ChannelIdentity>(
    `/channels/connections/${encode(connectionId)}/identities/${encode(identityId)}/revoke`,
    { method: 'POST', signal },
  );
}

export function listChannelInboundDeliveries(
  connectionId: string,
  limit = 50,
  signal?: AbortSignal,
): Promise<ChannelInboundDelivery[]> {
  return requestJson<ChannelInboundDelivery[]>(
    `/channels/connections/${encode(connectionId)}/inbound-deliveries`,
    { query: { limit }, signal },
  );
}

export function listChannelOutboundDeliveries(
  connectionId: string,
  limit = 50,
  signal?: AbortSignal,
): Promise<ChannelOutboundDelivery[]> {
  return requestJson<ChannelOutboundDelivery[]>(
    `/channels/connections/${encode(connectionId)}/outbound-deliveries`,
    { query: { limit }, signal },
  );
}

/* ----------------------------------------------- shared coordination plane */

/**
 * Submit a natural-language product observation to the restricted semantic router. The source
 * role is selected from the published organization; target ownership remains a backend decision.
 */
export function createCoordinationSemanticObservation(
  body: CoordinationSemanticObservationRequest,
  idempotencyKey: string,
  signal?: AbortSignal,
): Promise<CoordinationSemanticObservationResponse> {
  return requestJson<CoordinationSemanticObservationResponse>(
    '/coordination/semantic-observations',
    { method: 'POST', body, idempotencyKey, signal },
  );
}

/** Read one owner-scoped safe routing projection; Runtime Thread, Turn and Workspace stay private. */
export function getCoordinationRoutingRun(
  routingRunId: string,
  signal?: AbortSignal,
): Promise<CoordinationRoutingRun> {
  return requestJson<CoordinationRoutingRun>(
    `/coordination/routing-runs/${encode(routingRunId)}`,
    { signal },
  );
}

/**
 * Report the bounded result of the currently assigned WorkItem. The backend validates the
 * reporting role, closes the WorkItem idempotently and decides whether another routing run starts.
 */
export function reportCoordinationWorkItem(
  workItemId: string,
  body: CoordinationWorkItemReportRequest,
  idempotencyKey: string,
  signal?: AbortSignal,
): Promise<CoordinationWorkItemReportResponse> {
  return requestJson<CoordinationWorkItemReportResponse>(
    `/coordination/work-items/${encode(workItemId)}/reports`,
    { method: 'POST', body, idempotencyKey, signal },
  );
}

/**
 * Record one owner-scoped Signal and open its durable Case. The same stable key returns the
 * original records; a changed payload with that key is a conflict.
 */
export function createCoordinationSignal(
  body: CoordinationSignalCreateRequest,
  idempotencyKey: string,
  signal?: AbortSignal,
): Promise<CoordinationSignalCreateResponse> {
  return requestJson<CoordinationSignalCreateResponse>('/coordination/signals', {
    method: 'POST',
    body,
    idempotencyKey,
    signal,
  });
}

export function listCoordinationCases(
  filters: { organizationId?: string; status?: CoordinationCaseStatus } = {},
  signal?: AbortSignal,
): Promise<CoordinationCase[]> {
  return requestJson<CoordinationCase[]>('/coordination/cases', {
    query: {
      organization_id: filters.organizationId,
      status: filters.status,
    },
    signal,
  });
}

export function getCoordinationCase(
  caseId: string,
  signal?: AbortSignal,
): Promise<CoordinationCase> {
  return requestJson<CoordinationCase>(`/coordination/cases/${encode(caseId)}`, { signal });
}

export function createCoordinationWorkItem(
  caseId: string,
  body: CoordinationWorkItemCreateRequest,
  idempotencyKey: string,
  signal?: AbortSignal,
): Promise<CoordinationWorkItem> {
  return requestJson<CoordinationWorkItem>(
    `/coordination/cases/${encode(caseId)}/work-items`,
    { method: 'POST', body, idempotencyKey, signal },
  );
}

export function transitionCoordinationCase(
  caseId: string,
  body: CoordinationCaseTransitionRequest,
  idempotencyKey?: string,
  signal?: AbortSignal,
): Promise<CoordinationCase> {
  return requestJson<CoordinationCase>(`/coordination/cases/${encode(caseId)}/transition`, {
    method: 'POST',
    body,
    idempotencyKey,
    signal,
  });
}

export function transitionCoordinationWorkItem(
  workItemId: string,
  body: CoordinationWorkItemTransitionRequest,
  idempotencyKey?: string,
  signal?: AbortSignal,
): Promise<CoordinationWorkItem> {
  return requestJson<CoordinationWorkItem>(
    `/coordination/work-items/${encode(workItemId)}/transition`,
    { method: 'POST', body, idempotencyKey, signal },
  );
}

export function listCoordinationInbox(
  filters: {
    organizationId?: string;
    targetRoleKey?: string;
    status?: CoordinationInboxDeliveryStatus;
  } = {},
  signal?: AbortSignal,
): Promise<CoordinationInboxDelivery[]> {
  return requestJson<CoordinationInboxDelivery[]>('/coordination/inbox', {
    query: {
      organization_id: filters.organizationId,
      target_role_key: filters.targetRoleKey,
      status: filters.status,
    },
    signal,
  });
}

export function markCoordinationInboxRead(
  deliveryId: string,
  signal?: AbortSignal,
): Promise<CoordinationInboxDelivery> {
  return requestJson<CoordinationInboxDelivery>(
    `/coordination/inbox/${encode(deliveryId)}/read`,
    { method: 'POST', signal },
  );
}

export function listCoordinationEventHistory(
  caseId: string,
  afterSequence = 0,
  signal?: AbortSignal,
): Promise<CoordinationEvent[]> {
  return requestJson<CoordinationEvent[]>(
    `/coordination/cases/${encode(caseId)}/events/history`,
    { query: { after_sequence: afterSequence }, signal },
  );
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

/** Read the persisted, owner-scoped Task Graph Projection used by the operational blueprint. */
export function getTaskGraph(
  taskId: string,
  signal?: AbortSignal,
): Promise<TaskGraphProjection> {
  return requestJson<TaskGraphProjection>(`/tasks/${encode(taskId)}/graph`, { signal });
}

/** List every persisted finite Artifact stream for a Task. */
export function listTaskArtifactStreams(
  taskId: string,
  signal?: AbortSignal,
): Promise<ArtifactStream[]> {
  return requestJson<ArtifactStream[]>(`/tasks/${encode(taskId)}/streams`, { signal });
}

/** Read one owner-scoped stream projection, including partitions, deliveries and finalization. */
export function getTaskArtifactStream(
  taskId: string,
  streamId: string,
  signal?: AbortSignal,
): Promise<ArtifactStream> {
  return requestJson<ArtifactStream>(
    `/tasks/${encode(taskId)}/streams/${encode(streamId)}`,
    { signal },
  );
}

/** List persisted keyed `each` executions beneath the Task's frozen PlanSteps. */
export function listTaskStreamExecutions(
  taskId: string,
  signal?: AbortSignal,
): Promise<PlanStepExecution[]> {
  return requestJson<PlanStepExecution[]>(`/tasks/${encode(taskId)}/stream-executions`, {
    signal,
  });
}

/** Read one keyed execution together with its exact immutable Delivery input bindings. */
export function getTaskStreamExecution(
  taskId: string,
  planStepExecutionId: string,
  signal?: AbortSignal,
): Promise<PlanStepExecution> {
  return requestJson<PlanStepExecution>(
    `/tasks/${encode(taskId)}/stream-executions/${encode(planStepExecutionId)}`,
    { signal },
  );
}

/**
 * Retry exactly one failed or cancelled keyed execution. The idempotency key belongs to this
 * technical Retry and never consumes or impersonates a business ReplayRun.
 */
export function retryTaskStreamExecution(
  taskId: string,
  planStepExecutionId: string,
  body: PlanStepExecutionRetryRequest,
  idempotencyKey: string,
  signal?: AbortSignal,
): Promise<PlanStepExecution> {
  return requestJson<PlanStepExecution>(
    `/tasks/${encode(taskId)}/stream-executions/${encode(planStepExecutionId)}/retry`,
    { method: 'POST', body, idempotencyKey, signal },
  );
}

/** Cancel one keyed partition without cancelling or rewriting its successful siblings. */
export function cancelTaskStreamExecution(
  taskId: string,
  planStepExecutionId: string,
  body: PlanStepExecutionCancelRequest,
  signal?: AbortSignal,
): Promise<PlanStepExecution> {
  return requestJson<PlanStepExecution>(
    `/tasks/${encode(taskId)}/stream-executions/${encode(planStepExecutionId)}/cancel`,
    { method: 'POST', body, signal },
  );
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

/** Update the persisted business replay policy and limit for a Task. */
export function updateTaskReplayPolicy(
  taskId: string,
  body: TaskReplayPolicyRequest,
  signal?: AbortSignal,
): Promise<Task> {
  return requestJson<Task>(`/tasks/${encode(taskId)}/replay-policy`, {
    method: 'PATCH',
    body,
    signal,
  });
}

/** List immutable replay runs. TaskResponse embeds the same records; this route is useful for a refresh. */
export function listTaskReplays(taskId: string, signal?: AbortSignal): Promise<TaskReplayRun[]> {
  return requestJson<TaskReplayRun[]>(`/tasks/${encode(taskId)}/replays`, { signal });
}

/** Create one bounded business replay. Reusing the key is idempotent and does not consume the limit twice. */
export function createTaskReplay(
  taskId: string,
  body: TaskReplayRequest,
  idempotencyKey: string,
  signal?: AbortSignal,
): Promise<TaskReplayRun> {
  return requestJson<TaskReplayRun>(`/tasks/${encode(taskId)}/replays`, {
    method: 'POST',
    body,
    idempotencyKey,
    signal,
  });
}

/**
 * Request cancellation. `TASK_CANCELLATION_INCOMPLETE` means the Task is cancelled but one or more
 * Runtime owners could not confirm the interrupt; the event stream records those execution IDs.
 */
export function cancelTask(taskId: string, signal?: AbortSignal): Promise<Task> {
  return requestJson<Task>(`/tasks/${encode(taskId)}/cancel`, { method: 'POST', signal });
}

/** Cancel one queued role work item without dispatching Runtime work or touching sibling work. */
export function cancelRoleWorkItem(
  taskId: string,
  roleWorkItemId: string,
  body: RoleWorkItemCancelRequest,
  signal?: AbortSignal,
): Promise<Task> {
  return requestJson<Task>(
    `/tasks/${encode(taskId)}/role-queue/${encode(roleWorkItemId)}/cancel`,
    { method: 'POST', body, signal },
  );
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
