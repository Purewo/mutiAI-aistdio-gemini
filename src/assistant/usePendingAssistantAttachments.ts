import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  revokeAssistantAttachment,
  uploadAssistantAttachment,
} from '../api/endpoints';
import { apiErrorFromThrown } from '../api/errors';
import type { AssistantAttachment } from '../api/types';

export const MAX_ASSISTANT_ATTACHMENT_BYTES = 20 * 1024 * 1024;
export const MAX_ASSISTANT_ATTACHMENTS_PER_MESSAGE = 20;

export const ASSISTANT_ATTACHMENT_ACCEPT = [
  'application/json',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/jpeg',
  'image/png',
  'image/webp',
  'text/csv',
  'text/markdown',
  'text/plain',
  'text/tab-separated-values',
  '.json',
  '.pdf',
  '.xlsx',
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.csv',
  '.md',
  '.txt',
  '.tsv',
].join(',');

const SUPPORTED_MEDIA_TYPES = new Set([
  'application/json',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/jpeg',
  'image/png',
  'image/webp',
  'text/csv',
  'text/markdown',
  'text/plain',
  'text/tab-separated-values',
]);

const MEDIA_BY_EXTENSION: Record<string, string> = {
  json: 'application/json',
  pdf: 'application/pdf',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  csv: 'text/csv',
  md: 'text/markdown',
  txt: 'text/plain',
  tsv: 'text/tab-separated-values',
};

export interface PendingAssistantAttachments {
  attachments: AssistantAttachment[];
  uploadingCount: number;
  revokingIds: ReadonlySet<string>;
  busy: boolean;
  error: unknown | null;
  addFiles: (files: FileList | readonly File[]) => Promise<void>;
  revoke: (attachmentId: string) => Promise<void>;
  clearAfterSend: () => void;
  clearError: () => void;
}

/**
 * Own uploads that have not yet been attached to a persisted user message.
 *
 * Only these `uploaded` resources expose a revoke control. A successful message submission changes
 * them to `attached` in the backend transaction, after which the composer simply clears its local
 * staging list and never attempts to remove the persisted resource.
 */
export function usePendingAssistantAttachments(
  conversationId: string | null,
): PendingAssistantAttachments {
  const [attachments, setAttachments] = useState<AssistantAttachment[]>([]);
  const [uploadingCount, setUploadingCount] = useState(0);
  const [revokingIds, setRevokingIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<unknown | null>(null);

  useEffect(() => {
    setAttachments([]);
    setUploadingCount(0);
    setRevokingIds(new Set());
    setError(null);
  }, [conversationId]);

  const addFiles = useCallback(
    async (input: FileList | readonly File[]) => {
      if (!conversationId) return;
      setError(null);

      const files = Array.from(input);
      const available = MAX_ASSISTANT_ATTACHMENTS_PER_MESSAGE - attachments.length - uploadingCount;
      if (available <= 0) {
        setError(new Error(`每条消息最多添加 ${MAX_ASSISTANT_ATTACHMENTS_PER_MESSAGE} 个附件。`));
        return;
      }

      const selected = files.slice(0, available);
      if (files.length > available) {
        setError(new Error(`只上传了前 ${available} 个文件；每条消息最多 ${MAX_ASSISTANT_ATTACHMENTS_PER_MESSAGE} 个附件。`));
      }

      const normalized: File[] = [];
      for (const file of selected) {
        if (file.size > MAX_ASSISTANT_ATTACHMENT_BYTES) {
          setError(new Error(`${file.name} 超过 20 MiB 上传限制。`));
          continue;
        }
        const mediaType = file.type || inferMediaType(file.name);
        if (!mediaType || !SUPPORTED_MEDIA_TYPES.has(mediaType)) {
          setError(new Error(`${file.name} 的文件类型不在附件白名单中。`));
          continue;
        }
        normalized.push(
          file.type
            ? file
            : new File([file], file.name, { type: mediaType, lastModified: file.lastModified }),
        );
      }

      if (normalized.length === 0) return;
      setUploadingCount((count) => count + normalized.length);
      const results = await Promise.allSettled(
        normalized.map((file) => uploadAssistantAttachment(conversationId, file)),
      );

      const uploaded: AssistantAttachment[] = [];
      let firstFailure: unknown = null;
      for (const result of results) {
        if (result.status === 'fulfilled') uploaded.push(result.value);
        else if (firstFailure === null) firstFailure = result.reason;
      }
      if (uploaded.length > 0) {
        setAttachments((current) => {
          const byId = new Map(current.map((attachment) => [attachment.attachment_id, attachment]));
          for (const attachment of uploaded) byId.set(attachment.attachment_id, attachment);
          return [...byId.values()];
        });
      }
      if (firstFailure !== null) setError(apiErrorFromThrown(firstFailure));
      setUploadingCount((count) => Math.max(0, count - normalized.length));
    },
    [attachments.length, conversationId, uploadingCount],
  );

  const revoke = useCallback(
    async (attachmentId: string) => {
      if (!conversationId || revokingIds.has(attachmentId)) return;
      setError(null);
      setRevokingIds((current) => new Set(current).add(attachmentId));
      try {
        await revokeAssistantAttachment(conversationId, attachmentId);
        setAttachments((current) =>
          current.filter((attachment) => attachment.attachment_id !== attachmentId),
        );
      } catch (cause) {
        setError(apiErrorFromThrown(cause));
      } finally {
        setRevokingIds((current) => {
          const next = new Set(current);
          next.delete(attachmentId);
          return next;
        });
      }
    },
    [conversationId, revokingIds],
  );

  const clearAfterSend = useCallback(() => setAttachments([]), []);
  const clearError = useCallback(() => setError(null), []);
  const busy = useMemo(
    () => uploadingCount > 0 || revokingIds.size > 0,
    [revokingIds, uploadingCount],
  );

  return {
    attachments,
    uploadingCount,
    revokingIds,
    busy,
    error,
    addFiles,
    revoke,
    clearAfterSend,
    clearError,
  };
}

function inferMediaType(fileName: string): string | null {
  const extension = fileName.split('.').pop()?.toLowerCase();
  return extension ? MEDIA_BY_EXTENSION[extension] ?? null : null;
}
