import type {
  AssistantAction,
  TaskInputBindingReport,
} from '../api/types';

export interface AssistantAttachmentInput {
  attachment_id: string;
  contract_key: string;
  schema_version: string;
  file_name: string | null;
  media_type: string | null;
  sha256: string | null;
  byte_size: number | null;
  source_message_id: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

/**
 * Read the normalized attachment mapping from the deliberately open-ended Action payload.
 *
 * The backend restores file metadata before persisting a proposed Action. These guards keep an old
 * or unknown Action payload renderable without treating it as a typed product resource.
 */
export function attachmentInputsFromAction(action: AssistantAction): AssistantAttachmentInput[] {
  if (action.action_type !== 'task.submit') return [];
  const raw = action.payload.attachment_inputs;
  if (!Array.isArray(raw)) return [];

  return raw.flatMap((value) => {
    if (!isRecord(value)) return [];
    const attachmentId = readString(value.attachment_id);
    const contractKey = readString(value.contract_key);
    if (!attachmentId || !contractKey) return [];
    return [
      {
        attachment_id: attachmentId,
        contract_key: contractKey,
        schema_version: readString(value.schema_version) ?? '1.0',
        file_name: readString(value.file_name),
        media_type: readString(value.media_type),
        sha256: readString(value.sha256),
        byte_size: typeof value.byte_size === 'number' ? value.byte_size : null,
        source_message_id: readString(value.source_message_id),
      },
    ];
  });
}

export function parseTaskInputBindingReport(
  value: unknown,
  fallbackTaskId: string | null = null,
): TaskInputBindingReport | null {
  if (!isRecord(value)) return null;
  const status = value.status;
  if (
    status !== 'waiting_for_plan' &&
    status !== 'bound' &&
    status !== 'partial' &&
    status !== 'failed'
  ) {
    return null;
  }

  const taskId = readString(value.task_id) ?? fallbackTaskId;
  if (!taskId) return null;

  const failures = Array.isArray(value.failures)
    ? value.failures.flatMap((failure) => {
        if (!isRecord(failure)) return [];
        const contractKey = readString(failure.contract_key);
        const code = readString(failure.code);
        const message = readString(failure.message);
        return contractKey && code && message ? [{ contract_key: contractKey, code, message }] : [];
      })
    : [];

  return {
    task_id: taskId,
    status,
    bound_artifact_ids: readStringArray(value.bound_artifact_ids),
    remaining_contract_keys: readStringArray(value.remaining_contract_keys),
    failures,
  };
}

export function taskIdFromAction(action: AssistantAction): string | null {
  if (action.action_type !== 'task.submit') return null;
  const result = isRecord(action.result) ? action.result : null;
  const resultTaskId = result ? readString(result.task_id) : null;
  if (resultTaskId) return resultTaskId;

  const resultBinding = result ? parseTaskInputBindingReport(result.input_binding) : null;
  if (resultBinding) return resultBinding.task_id;

  const payloadTaskId = readString(action.payload.task_id);
  if (payloadTaskId) return payloadTaskId;
  return action.target_type === 'task' ? action.target_id : null;
}

export function inputBindingFromAction(action: AssistantAction): TaskInputBindingReport | null {
  if (!isRecord(action.result)) return null;
  return parseTaskInputBindingReport(action.result.input_binding, taskIdFromAction(action));
}

export function actionUsesAttachmentInputs(action: AssistantAction): boolean {
  return attachmentInputsFromAction(action).length > 0 || inputBindingFromAction(action) !== null;
}

export function bindingEventIdentity(payload: Record<string, unknown>, aggregateId: string): {
  taskId: string;
  actionId: string | null;
} | null {
  const taskId = readString(payload.task_id) ?? readString(aggregateId);
  if (!taskId) return null;
  return { taskId, actionId: readString(payload.action_id) };
}
