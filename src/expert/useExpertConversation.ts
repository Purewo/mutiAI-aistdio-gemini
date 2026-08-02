import { useCallback, useEffect, useRef, useState } from 'react';
import {
  archiveExpertConversation,
  getExpertConversation,
  getExpertTurn,
  getExpertVersion,
  listExpertMessages,
  submitExpertMessage,
} from '../api/endpoints';
import { ExpertEventLog, streamExpertEvents } from '../api/events';
import { apiErrorFromThrown, type ApiError } from '../api/errors';
import type {
  ExpertConversation,
  ExpertMessage,
  ExpertSubmission,
  ExpertTurn,
  ExpertVersion,
} from '../api/types';
import type { ConnectionStatus } from '../components/states';

const RECONNECT_DELAY_MS = 900;
const MAX_CONSECUTIVE_FAILURES = 4;

export interface ExpertConversationState {
  status: 'loading' | 'ready' | 'error';
  error: ApiError | null;
  conversation: ExpertConversation | null;
  version: ExpertVersion | null;
  messages: ExpertMessage[];
  turns: ExpertTurn[];
  connection: ConnectionStatus;
  submitting: boolean;
  submitError: ApiError | null;
  submit: (
    text: string,
    attachmentIds: string[],
  ) => Promise<ExpertSubmission | null>;
  reconnect: () => void;
  archive: () => Promise<void>;
}

const TERMINAL_TURN_STATUSES = new Set<ExpertTurn['status']>([
  'completed',
  'failed',
  'cancelled',
]);

function isTerminal(status: ExpertTurn['status']): boolean {
  return TERMINAL_TURN_STATUSES.has(status);
}

function turnIdFromPayload(payload: Record<string, unknown>): string | null {
  return typeof payload.turn_id === 'string' && payload.turn_id.length > 0
    ? payload.turn_id
    : null;
}

function mergeMessage(messages: ExpertMessage[], next: ExpertMessage): ExpertMessage[] {
  const without = messages.filter((item) => item.message_id !== next.message_id);
  return [...without, next].sort((a, b) => a.sequence - b.sequence);
}

function mergeTurn(turns: ExpertTurn[], next: ExpertTurn): ExpertTurn[] {
  const without = turns.filter((item) => item.turn_id !== next.turn_id);
  return [...without, next].sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export function useExpertConversation(conversationId: string): ExpertConversationState {
  const [status, setStatus] = useState<ExpertConversationState['status']>('loading');
  const [error, setError] = useState<ApiError | null>(null);
  const [conversation, setConversation] = useState<ExpertConversation | null>(null);
  const [version, setVersion] = useState<ExpertVersion | null>(null);
  const [messages, setMessages] = useState<ExpertMessage[]>([]);
  const [turns, setTurns] = useState<ExpertTurn[]>([]);
  const [connection, setConnection] = useState<ConnectionStatus>('connecting');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<ApiError | null>(null);
  const [resourceToken, setResourceToken] = useState(0);
  const [streamToken, setStreamToken] = useState(0);
  const mounted = useRef(false);
  const turnsRef = useRef<ExpertTurn[]>([]);

  useEffect(() => {
    turnsRef.current = turns;
  }, [turns]);

  const reloadResources = useCallback(async (signal?: AbortSignal) => {
    const [nextConversation, messagePage] = await Promise.all([
      getExpertConversation(conversationId, signal),
      listExpertMessages(conversationId, signal),
    ]);
    setConversation(nextConversation);
    setMessages(messagePage.items);
    const nextVersion = await getExpertVersion(nextConversation.expert_version_id, signal);
    setVersion(nextVersion);
    return nextConversation;
  }, [conversationId]);

  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    setStatus('loading');
    setError(null);
    setSubmitError(null);
    setConversation(null);
    setVersion(null);
    setMessages([]);
    setTurns([]);
    setConnection('connecting');
    turnsRef.current = [];
    void reloadResources(controller.signal)
      .then(() => {
        if (mounted.current) setStatus('ready');
      })
      .catch((cause: unknown) => {
        const nextError = apiErrorFromThrown(cause);
        if (mounted.current && nextError.kind !== 'aborted') {
          setStatus('error');
          setError(nextError);
        }
      });

    return () => {
      mounted.current = false;
      controller.abort();
    };
  }, [conversationId, reloadResources, resourceToken]);

  useEffect(() => {
    const activeConversationId = conversation?.conversation_id;
    if (!activeConversationId || status !== 'ready') return undefined;

    const controller = new AbortController();
    const eventLog = new ExpertEventLog();
    let reconnectTimer: number | null = null;
    let failureCount = 0;
    let active = true;
    const discoveredTurnIds = new Set(turnsRef.current.map((item) => item.turn_id));

    const refreshDiscoveredTurns = async (signal?: AbortSignal): Promise<ExpertTurn[]> => {
      const nextTurns = await Promise.all(
        [...discoveredTurnIds].map(async (turnId) => {
          try {
            return await getExpertTurn(turnId, signal);
          } catch {
            return null;
          }
        }),
      );
      const availableTurns = nextTurns.filter((item): item is ExpertTurn => item !== null);
      if (active) setTurns(availableTurns);
      return availableTurns;
    };

    const connect = () => {
      if (!active) return;
      setConnection(eventLog.size > 0 ? 'reconnecting' : 'connecting');
      void streamExpertEvents(activeConversationId, {
        lastEventId: eventLog.lastEventId(),
        signal: controller.signal,
        onOpen: () => {
          failureCount = 0;
          if (active) setConnection('live');
        },
        onEvent: (event) => {
          if (!eventLog.add(event)) return;
          failureCount = 0;
          const turnId = turnIdFromPayload(event.payload);
          if (turnId) {
            discoveredTurnIds.add(turnId);
            void getExpertTurn(turnId)
              .then((nextTurn) => {
                if (active) setTurns((current) => mergeTurn(current, nextTurn));
              })
              .catch(() => undefined);
          }
          if (active) setConnection('live');
        },
        onClose: () => {
          if (!active || controller.signal.aborted) return;
          void (async () => {
            try {
              await reloadResources(controller.signal);
              const refreshedTurns = await refreshDiscoveredTurns(controller.signal);
              if (!active) return;
              const hasPendingTurn = refreshedTurns.some((item) => !isTerminal(item.status));
              if (hasPendingTurn && failureCount <= MAX_CONSECUTIVE_FAILURES) {
                setConnection('reconnecting');
                reconnectTimer = window.setTimeout(connect, RECONNECT_DELAY_MS);
              } else if (failureCount > MAX_CONSECUTIVE_FAILURES) {
                setConnection('unreachable');
              } else {
                setConnection('closed');
              }
            } catch (cause: unknown) {
              if (apiErrorFromThrown(cause).kind !== 'aborted') {
                failureCount += 1;
              }
              if (!active) return;
              if (failureCount > MAX_CONSECUTIVE_FAILURES) {
                setConnection('unreachable');
              } else {
                setConnection('reconnecting');
                reconnectTimer = window.setTimeout(connect, RECONNECT_DELAY_MS * failureCount);
              }
            }
          })();
        },
        onError: (streamError) => {
          if (!active || controller.signal.aborted || streamError.kind === 'aborted') return;
          failureCount += 1;
          if (failureCount > MAX_CONSECUTIVE_FAILURES) {
            setConnection('unreachable');
            return;
          }
          setConnection('reconnecting');
          reconnectTimer = window.setTimeout(connect, RECONNECT_DELAY_MS * failureCount);
        },
      });
    };

    connect();
    return () => {
      active = false;
      controller.abort();
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
    };
  }, [conversation?.conversation_id, reloadResources, status, streamToken]);

  const submit = useCallback(async (text: string, attachmentIds: string[]) => {
    if (!conversation || submitting) return null;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const submission = await submitExpertMessage(
        conversation.conversation_id,
        { text, attachment_ids: attachmentIds },
        crypto.randomUUID(),
      );
      setMessages((current) => mergeMessage(current, submission.message));
      setTurns((current) => mergeTurn(current, submission.turn));
      turnsRef.current = mergeTurn(turnsRef.current, submission.turn);
      setStreamToken((token) => token + 1);
      return submission;
    } catch (cause: unknown) {
      const nextError = apiErrorFromThrown(cause);
      setSubmitError(nextError);
      return null;
    } finally {
      setSubmitting(false);
    }
  }, [conversation, submitting]);

  const reconnect = useCallback(() => {
    if (status === 'error') {
      setResourceToken((token) => token + 1);
    } else {
      setStreamToken((token) => token + 1);
    }
  }, [status]);

  const archive = useCallback(async () => {
    if (!conversation || conversation.status === 'archived') return;
    const archived = await archiveExpertConversation(conversation.conversation_id);
    setConversation(archived);
  }, [conversation]);

  return {
    status,
    error,
    conversation,
    version,
    messages,
    turns,
    connection,
    submitting,
    submitError,
    submit,
    reconnect,
    archive,
  };
}
