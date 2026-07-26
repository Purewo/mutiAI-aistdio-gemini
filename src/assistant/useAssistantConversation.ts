/**
 * Owns the live platform-assistant conversation.
 *
 * The product database is authoritative for messages, Turns, and Actions. The event stream is a
 * change-notification channel only: every material event triggers a refetch of the affected
 * resource rather than being applied as if the payload were the resource. Duplicate delivery is
 * expected, so events are deduplicated by `event_id` and the highest one drives the `Last-Event-ID`
 * reconnect cursor.
 *
 * The stream is a finite ordered batch, so a normal close is not an error; the hook reconnects
 * after a backoff while a Turn is still in flight, and idles once everything is terminal.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createAssistantConversation,
  decideAssistantAction,
  getAssistantConversation,
  getAssistantTurn,
  listAssistantActions,
  listAssistantConversations,
  listAssistantMessages,
  submitAssistantMessage,
} from '../api/endpoints';
import { apiErrorFromThrown, type ApiError } from '../api/errors';
import {
  AssistantEventLog,
  streamAssistantEvents,
  type AssistantEvent,
} from '../api/events';
import type {
  AssistantAction,
  AssistantConversation,
  AssistantMessage,
  AssistantTurn,
} from '../api/types';
import { isTerminalTurnStatus } from '../api/types';
import type { ConnectionStatus } from '../components/states';

/** Page size for history. The backend paginates with an opaque cursor. */
const MESSAGE_PAGE_LIMIT = 100;

/**
 * Reconnect backoff.
 *
 * A stream that closes normally while work is in flight reconnects quickly. A stream that *fails*
 * backs off exponentially and eventually gives up, so an unreachable backend cannot turn into an
 * unbounded request storm; the user reconnects manually from the banner instead.
 */
const RECONNECT_DELAY_MS = 1500;
const MAX_RECONNECT_DELAY_MS = 30_000;
const MAX_CONSECUTIVE_FAILURES = 5;

function failureBackoffMs(consecutiveFailures: number): number {
  return Math.min(RECONNECT_DELAY_MS * 2 ** (consecutiveFailures - 1), MAX_RECONNECT_DELAY_MS);
}

export interface AssistantConversationState {
  /** Bootstrap state for the conversation itself. */
  status: 'loading' | 'ready' | 'error';
  error: ApiError | null;
  conversation: AssistantConversation | null;
  messages: AssistantMessage[];
  actions: AssistantAction[];
  /** The Turn currently being awaited, when one is in flight. */
  activeTurn: AssistantTurn | null;
  connection: ConnectionStatus;
  /** True while a user submission is being accepted by the backend. */
  submitting: boolean;
  submitError: ApiError | null;
}

export interface AssistantConversationApi extends AssistantConversationState {
  send: (text: string) => Promise<void>;
  decide: (actionId: string, decision: 'confirm' | 'decline') => Promise<void>;
  reconnect: () => void;
  retryBootstrap: () => void;
}

/** Event types that mean a specific resource must be refetched. */
const MESSAGE_EVENTS = new Set([
  'assistant.message.accepted',
  'assistant.message.completed',
  'assistant.message.failed',
]);
const ACTION_EVENTS = new Set([
  'assistant.action.proposed',
  'assistant.action.confirmed',
  'assistant.action.declined',
  'assistant.action.executing',
  'assistant.action.completed',
  'assistant.action.failed',
  'assistant.action.cancelled',
  'assistant.action.expired',
  'assistant.action.superseded',
]);
const TURN_EVENTS = new Set([
  'assistant.turn.queued',
  'assistant.turn.started',
  'assistant.turn.waiting',
  'assistant.turn.completed',
  'assistant.turn.failed',
  'assistant.turn.cancelled',
]);

export function useAssistantConversation(): AssistantConversationApi {
  const [state, setState] = useState<AssistantConversationState>({
    status: 'loading',
    error: null,
    conversation: null,
    messages: [],
    actions: [],
    activeTurn: null,
    connection: 'connecting',
    submitting: false,
    submitError: null,
  });

  const eventLog = useRef(new AssistantEventLog());
  const streamAbort = useRef<AbortController | null>(null);
  const reconnectTimer = useRef<number | null>(null);
  /** Consecutive stream failures, reset by any successful connection. Drives the backoff. */
  const failureCount = useRef(0);
  const mounted = useRef(true);
  const [bootstrapToken, setBootstrapToken] = useState(0);
  /** Mirrors state for callbacks that must not re-subscribe when state changes. */
  const stateRef = useRef(state);
  stateRef.current = state;

  const patch = useCallback((update: Partial<AssistantConversationState>) => {
    if (mounted.current) setState((current) => ({ ...current, ...update }));
  }, []);

  /* ----------------------------------------------------------- reconciliation */

  const refreshMessages = useCallback(
    async (conversationId: string) => {
      const collected: AssistantMessage[] = [];
      let cursor: string | undefined;
      // Walk every page so history is complete after a reload or a long absence.
      for (;;) {
        const page = await listAssistantMessages(conversationId, {
          cursor,
          limit: MESSAGE_PAGE_LIMIT,
        });
        collected.push(...page.items);
        if (!page.next_cursor) break;
        cursor = page.next_cursor;
      }
      collected.sort((a, b) => a.sequence - b.sequence);
      patch({ messages: collected });
    },
    [patch],
  );

  const refreshActions = useCallback(
    async (conversationId: string) => {
      const actions = await listAssistantActions(conversationId);
      actions.sort((a, b) => a.proposed_at.localeCompare(b.proposed_at));
      patch({ actions });
    },
    [patch],
  );

  const refreshConversation = useCallback(
    async (conversationId: string) => {
      patch({ conversation: await getAssistantConversation(conversationId) });
    },
    [patch],
  );

  /**
   * Refetch the Turn the page is waiting on.
   *
   * A Turn event only announces that the Turn changed; its status must come from the Turn resource.
   * Without this the indicator would stay on its submission-time status forever.
   */
  const refreshActiveTurn = useCallback(async () => {
    const turnId = stateRef.current.activeTurn?.turn_id;
    if (!turnId) return;
    patch({ activeTurn: await getAssistantTurn(turnId) });
  }, [patch]);

  /* -------------------------------------------------------------- streaming */

  const scheduleReconnect = useCallback(
    (conversationId: string, delayMs: number, run: (id: string) => void) => {
      if (reconnectTimer.current !== null) window.clearTimeout(reconnectTimer.current);
      reconnectTimer.current = window.setTimeout(() => run(conversationId), delayMs);
    },
    [],
  );

  const connect = useCallback(
    (conversationId: string) => {
      streamAbort.current?.abort();
      if (reconnectTimer.current !== null) window.clearTimeout(reconnectTimer.current);
      const controller = new AbortController();
      streamAbort.current = controller;
      patch({ connection: eventLog.current.size > 0 ? 'reconnecting' : 'connecting' });

      /** Resource kinds a batch touched, so each is refetched once rather than per event. */
      const touched = { messages: false, actions: false, turns: false };

      void streamAssistantEvents(conversationId, {
        lastEventId: eventLog.current.lastEventId(),
        signal: controller.signal,
        onEvent: (event: AssistantEvent) => {
          // A delivered event proves the connection works; clear the failure backoff.
          failureCount.current = 0;
          // Duplicates are expected by contract; ignore anything already applied.
          if (!eventLog.current.add(event)) return;
          if (MESSAGE_EVENTS.has(event.event_type)) touched.messages = true;
          if (ACTION_EVENTS.has(event.event_type)) touched.actions = true;
          if (TURN_EVENTS.has(event.event_type)) touched.turns = true;
          patch({ connection: 'live' });
        },
        onClose: () => {
          if (controller.signal.aborted || !mounted.current) return;
          // Reaching a clean end of stream means the endpoint is healthy.
          failureCount.current = 0;
          void (async () => {
            try {
              if (touched.messages) await refreshMessages(conversationId);
              if (touched.actions) await refreshActions(conversationId);
              if (touched.turns) {
                await refreshActiveTurn();
                await refreshConversation(conversationId);
              }
            } catch {
              // A refetch failure leaves the last persisted view in place; the next batch retries.
            }
            if (!mounted.current) return;

            // A terminal Turn means the assistant finished; stop polling until the user acts again.
            const turn = stateRef.current.activeTurn;
            const stillWorking = turn !== null && !isTerminalTurnStatus(turn.status);
            const pendingWork =
              stillWorking ||
              stateRef.current.actions.some(
                (action) => action.status === 'confirmed' || action.status === 'executing',
              );

            if (pendingWork) {
              patch({ connection: 'reconnecting' });
              scheduleReconnect(conversationId, RECONNECT_DELAY_MS, connect);
            } else {
              patch({ connection: 'closed', activeTurn: null });
            }
          })();
        },
        onError: (error) => {
          if (controller.signal.aborted || !mounted.current) return;
          if (error.kind === 'aborted') return;

          failureCount.current += 1;
          // Give up after repeated failures rather than hammering an unreachable backend. The
          // banner keeps a manual reconnect available, which resets the counter.
          if (failureCount.current > MAX_CONSECUTIVE_FAILURES) {
            // Distinct from a normal end of stream: the backend could not be reached.
            patch({ connection: 'unreachable' });
            return;
          }
          patch({ connection: 'reconnecting' });
          scheduleReconnect(conversationId, failureBackoffMs(failureCount.current), connect);
        },
      });
    },
    [
      patch,
      refreshActions,
      refreshActiveTurn,
      refreshConversation,
      refreshMessages,
      scheduleReconnect,
    ],
  );

  /* -------------------------------------------------------------- bootstrap */

  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();

    void (async () => {
      patch({ status: 'loading', error: null });
      try {
        // V1 presents one active conversation; create it on first use.
        const existing = await listAssistantConversations(controller.signal);
        const active = existing.find((item) => item.status === 'active') ?? null;
        const conversation = active ?? (await createAssistantConversation(controller.signal));
        if (!mounted.current) return;

        patch({ conversation, status: 'ready' });
        await Promise.all([
          refreshMessages(conversation.conversation_id),
          refreshActions(conversation.conversation_id),
        ]);
        if (!mounted.current) return;
        connect(conversation.conversation_id);
      } catch (cause) {
        const error = apiErrorFromThrown(cause);
        if (error.kind === 'aborted' || !mounted.current) return;
        patch({ status: 'error', error });
      }
    })();

    return () => {
      mounted.current = false;
      controller.abort();
      streamAbort.current?.abort();
      if (reconnectTimer.current !== null) window.clearTimeout(reconnectTimer.current);
    };
  }, [bootstrapToken, connect, patch, refreshActions, refreshMessages]);

  /* ----------------------------------------------------------------- actions */

  const send = useCallback(
    async (text: string) => {
      const conversation = stateRef.current.conversation;
      const body = text.trim();
      if (!conversation || body.length === 0 || stateRef.current.submitting) return;

      patch({ submitting: true, submitError: null });
      try {
        const submission = await submitAssistantMessage(
          conversation.conversation_id,
          { text: body },
          crypto.randomUUID(),
        );
        // The backend accepted the message and queued a Turn; the reply arrives by event.
        patch({
          activeTurn: submission.turn,
          messages: mergeMessage(stateRef.current.messages, submission.message),
        });
        connect(conversation.conversation_id);
      } catch (cause) {
        patch({ submitError: apiErrorFromThrown(cause) });
      } finally {
        patch({ submitting: false });
      }
    },
    [connect, patch],
  );

  const decide = useCallback(
    async (actionId: string, decision: 'confirm' | 'decline') => {
      const conversation = stateRef.current.conversation;
      if (!conversation) return;
      // Record the decision, then let events drive the outcome: a recorded confirmation is not
      // proof the product operation finished.
      const updated = await decideAssistantAction(actionId, { decision });
      patch({ actions: mergeAction(stateRef.current.actions, updated) });
      connect(conversation.conversation_id);
    },
    [connect, patch],
  );

  const reconnect = useCallback(() => {
    const conversation = stateRef.current.conversation;
    if (!conversation) return;
    // An explicit user retry clears the give-up state.
    failureCount.current = 0;
    connect(conversation.conversation_id);
  }, [connect]);

  const retryBootstrap = useCallback(() => setBootstrapToken((token) => token + 1), []);

  return { ...state, send, decide, reconnect, retryBootstrap };
}

function mergeMessage(
  messages: readonly AssistantMessage[],
  message: AssistantMessage,
): AssistantMessage[] {
  const next = messages.filter((item) => item.message_id !== message.message_id);
  next.push(message);
  next.sort((a, b) => a.sequence - b.sequence);
  return next;
}

function mergeAction(
  actions: readonly AssistantAction[],
  action: AssistantAction,
): AssistantAction[] {
  const next = actions.filter((item) => item.action_id !== action.action_id);
  next.push(action);
  next.sort((a, b) => a.proposed_at.localeCompare(b.proposed_at));
  return next;
}
