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
  getTask,
  listAssistantActions,
  listAssistantConversations,
  listAssistantMessages,
  submitAssistantInput,
} from '../api/endpoints';
import { apiErrorFromThrown, type ApiError } from '../api/errors';
import {
  AssistantEventLog,
  streamAssistantEvents,
  type AssistantEvent,
} from '../api/events';
import type {
  AssistantAction,
  AssistantAttachmentRef,
  AssistantConversation,
  AssistantMessage,
  AssistantTurn,
  Task,
} from '../api/types';
import { isTerminalTurnStatus } from '../api/types';
import type { ConnectionStatus } from '../components/states';
import {
  actionUsesAttachmentInputs,
  bindingEventIdentity,
  inputBindingFromAction,
  taskIdFromAction,
} from './taskInputBindings';

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
  /** Owner-scoped catalog, including web and channel-bound conversations. */
  conversations: AssistantConversation[];
  conversation: AssistantConversation | null;
  messages: AssistantMessage[];
  actions: AssistantAction[];
  /** Authoritative Task snapshots for attachment-backed task.submit Actions, keyed by Action ID. */
  taskBindings: Record<string, Task>;
  /** The Turn currently being awaited, when one is in flight. */
  activeTurn: AssistantTurn | null;
  connection: ConnectionStatus;
  /** True while a user submission is being accepted by the backend. */
  submitting: boolean;
  submitError: ApiError | null;
}

export interface AssistantConversationApi extends AssistantConversationState {
  send: (text: string, attachmentRefs?: AssistantAttachmentRef[]) => Promise<boolean>;
  decide: (actionId: string, decision: 'confirm' | 'decline') => Promise<void>;
  selectConversation: (conversationId: string) => void;
  reconnect: () => void;
  retryBootstrap: () => void;
}

type AssistantConversationSnapshot = Pick<
  AssistantConversationState,
  'conversations' | 'conversation' | 'messages' | 'actions' | 'taskBindings' | 'activeTurn'
>;

/**
 * Keep the latest product-owned conversation snapshot in memory between route changes.
 *
 * This is deliberately not persisted to browser storage: it only removes the route-return flash
 * for the current SPA session, while the backend remains authoritative and the next bootstrap
 * silently refreshes every cached collection.
 */
const conversationSnapshots = new Map<string, AssistantConversationSnapshot>();

function initialStateFor(cacheKey: string): AssistantConversationState {
  const snapshot = conversationSnapshots.get(cacheKey);
  return {
    status: snapshot ? 'ready' : 'loading',
    error: null,
    conversations: snapshot?.conversations ?? [],
    conversation: snapshot?.conversation ?? null,
    messages: snapshot?.messages ?? [],
    actions: snapshot?.actions ?? [],
    taskBindings: snapshot?.taskBindings ?? {},
    activeTurn: snapshot?.activeTurn ?? null,
    // Cached content is already usable while the background stream reconnects.
    connection: snapshot ? 'live' : 'connecting',
    submitting: false,
    submitError: null,
  };
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
const TASK_INPUT_BINDING_EVENT = 'assistant.task_input_bindings.updated';

export function useAssistantConversation(cacheKey: string): AssistantConversationApi {
  const [state, setState] = useState<AssistantConversationState>(() => initialStateFor(cacheKey));
  const [requestedConversationId, setRequestedConversationId] = useState<string | null>(
    () => conversationSnapshots.get(cacheKey)?.conversation?.conversation_id ?? null,
  );

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
  /** Updated synchronously by patch so fast bootstrap responses cannot race a React render. */
  const activeConversationId = useRef(state.conversation?.conversation_id ?? null);

  const patch = useCallback(
    (update: Partial<AssistantConversationState>) => {
      if (!mounted.current) return;
      if (Object.prototype.hasOwnProperty.call(update, 'conversation')) {
        activeConversationId.current = update.conversation?.conversation_id ?? null;
      }
      setState((current) => {
        const next = { ...current, ...update };
        if (next.conversation) {
          conversationSnapshots.set(cacheKey, {
            conversations: next.conversations,
            conversation: next.conversation,
            messages: next.messages,
            actions: next.actions,
            taskBindings: next.taskBindings,
            activeTurn: next.activeTurn,
          });
        }
        return next;
      });
    },
    [cacheKey],
  );

  /* ----------------------------------------------------------- reconciliation */

  const refreshMessages = useCallback(
    async (conversationId: string, signal?: AbortSignal) => {
      const collected: AssistantMessage[] = [];
      let cursor: string | undefined;
      // Walk every page so history is complete after a reload or a long absence.
      for (;;) {
        const page = await listAssistantMessages(
          conversationId,
          {
            cursor,
            limit: MESSAGE_PAGE_LIMIT,
          },
          signal,
        );
        collected.push(...page.items);
        if (!page.next_cursor) break;
        cursor = page.next_cursor;
      }
      collected.sort((a, b) => a.sequence - b.sequence);
      if (activeConversationId.current !== conversationId) return;
      patch({ messages: collected });
    },
    [patch],
  );

  /** Reconcile attachment-backed Actions against the authoritative Task resource. */
  const refreshTaskBindingsForActions = useCallback(
    async (
      actions: readonly AssistantAction[],
      conversationId?: string,
      signal?: AbortSignal,
    ) => {
      const candidates = actions
        .filter((action) => actionUsesAttachmentInputs(action))
        .map((action) => ({ actionId: action.action_id, taskId: taskIdFromAction(action) }))
        .filter((candidate): candidate is { actionId: string; taskId: string } => candidate.taskId !== null);
      if (candidates.length === 0) return;

      const results = await Promise.all(
        candidates.map(async ({ actionId, taskId }) => {
          try {
            return { actionId, task: await getTask(taskId, signal) };
          } catch {
            // An Action may be visible before its Task transaction is queryable. The event stream
            // will retry the same reconciliation; keep the Action itself usable in the meantime.
            return null;
          }
        }),
      );
      if (
        conversationId &&
        activeConversationId.current !== conversationId
      ) return;
      const next = { ...stateRef.current.taskBindings };
      for (const result of results) {
        if (result) next[result.actionId] = result.task;
      }
      if (Object.keys(next).length > 0) patch({ taskBindings: next });
    },
    [patch],
  );

  /** Reconcile the Task named by assistant.task_input_bindings.updated notifications. */
  const refreshTaskBindingsForEvents = useCallback(
    async (
      events: readonly { taskId: string; actionId: string | null }[],
    ) => {
      if (events.length === 0) return;
      const results = await Promise.all(
        events.map(async ({ taskId, actionId }) => {
          try {
            return { taskId, actionId, task: await getTask(taskId) };
          } catch {
            return null;
          }
        }),
      );
      const next = { ...stateRef.current.taskBindings };
      for (const result of results) {
        if (!result) continue;
        const key =
          result.actionId ??
          stateRef.current.actions.find((action) => taskIdFromAction(action) === result.taskId)?.action_id ??
          `task:${result.taskId}`;
        next[key] = result.task;
      }
      if (Object.keys(next).length > 0) patch({ taskBindings: next });
    },
    [patch],
  );

  const refreshActions = useCallback(
    async (conversationId: string, signal?: AbortSignal) => {
      const actions = await listAssistantActions(conversationId, signal);
      actions.sort((a, b) => a.proposed_at.localeCompare(b.proposed_at));
      if (activeConversationId.current !== conversationId) return;
      patch({ actions });
      await refreshTaskBindingsForActions(actions, conversationId, signal);
    },
    [patch, refreshTaskBindingsForActions],
  );

  const refreshConversation = useCallback(
    async (conversationId: string) => {
      const conversation = await getAssistantConversation(conversationId);
      if (activeConversationId.current !== conversationId) return;
      patch({
        conversation,
        conversations: replaceConversation(stateRef.current.conversations, conversation),
      });
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
      const bindingEvents: Array<{ taskId: string; actionId: string | null }> = [];

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
          if (event.event_type === TASK_INPUT_BINDING_EVENT) {
            const identity = bindingEventIdentity(event.payload, event.aggregate_id);
            if (
              identity &&
              !bindingEvents.some(
                (item) => item.taskId === identity.taskId && item.actionId === identity.actionId,
              )
            ) {
              bindingEvents.push(identity);
            }
          }
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
              if (bindingEvents.length > 0) await refreshTaskBindingsForEvents(bindingEvents);
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
            const waitingForInputBinding = stateRef.current.actions.some((action) => {
              const taskId = taskIdFromAction(action);
              const task =
                stateRef.current.taskBindings[action.action_id] ??
                (taskId ? stateRef.current.taskBindings[`task:${taskId}`] : undefined);
              // The completed Action keeps its initial waiting_for_plan report as an audit fact.
              // Once the Task can be read, only its current binding state controls reconnecting.
              return task
                ? task.input_binding?.status === 'waiting_for_plan'
                : inputBindingFromAction(action)?.status === 'waiting_for_plan';
            });
            const pendingWork =
              stillWorking ||
              waitingForInputBinding ||
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
      refreshTaskBindingsForEvents,
      scheduleReconnect,
    ],
  );

  /* -------------------------------------------------------------- bootstrap */

  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    const cachedSnapshot = conversationSnapshots.get(cacheKey);
    const cachedSnapshotConversationId = cachedSnapshot?.conversation?.conversation_id ?? null;
    const hasSnapshot = Boolean(
      cachedSnapshotConversationId &&
      (!requestedConversationId ||
        cachedSnapshotConversationId === requestedConversationId),
    );

    void (async () => {
      patch({
        status: hasSnapshot ? 'ready' : 'loading',
        error: null,
      });
      try {
        const existing = await listAssistantConversations(controller.signal);
        const requested = requestedConversationId
          ? existing.find(
              (item) =>
                item.conversation_id === requestedConversationId && item.status === 'active',
            ) ?? null
          : null;
        const cachedConversationId = stateRef.current.conversation?.conversation_id ?? null;
        const cached = cachedConversationId
          ? existing.find(
              (item) => item.conversation_id === cachedConversationId && item.status === 'active',
            ) ?? null
          : null;
        // Preserve the user's explicit/cached selection. On a cold start, prefer the web-native
        // assistant instead of jumping into whichever channel peer happened to message last.
        const active =
          requested ??
          cached ??
          existing.find((item) => item.status === 'active' && item.origin === 'web') ??
          existing.find((item) => item.status === 'active') ??
          null;
        const conversation = active ?? (await createAssistantConversation(controller.signal));
        if (!mounted.current) return;

        if (
          stateRef.current.conversation &&
          stateRef.current.conversation.conversation_id !== conversation.conversation_id
        ) {
          eventLog.current = new AssistantEventLog();
          failureCount.current = 0;
        }
        patch({
          conversations: active ? existing : [conversation, ...existing],
          conversation,
          status: 'ready',
        });
        await Promise.all([
          refreshMessages(conversation.conversation_id, controller.signal),
          refreshActions(conversation.conversation_id, controller.signal),
        ]);
        if (!mounted.current) return;
        connect(conversation.conversation_id);
      } catch (cause) {
        const error = apiErrorFromThrown(cause);
        if (error.kind === 'aborted' || !mounted.current) return;
        if (hasSnapshot) {
          // The cached view remains usable; expose the connectivity problem without blanking it.
          patch({ status: 'ready', error: null, connection: 'unreachable' });
          return;
        }
        patch({ status: 'error', error });
      }
    })();

    return () => {
      mounted.current = false;
      controller.abort();
      streamAbort.current?.abort();
      if (reconnectTimer.current !== null) window.clearTimeout(reconnectTimer.current);
    };
  }, [
    bootstrapToken,
    cacheKey,
    connect,
    patch,
    refreshActions,
    refreshMessages,
    requestedConversationId,
  ]);

  /* ----------------------------------------------------------------- actions */

  const send = useCallback(
    async (text: string, attachmentRefs: AssistantAttachmentRef[] = []) => {
      const conversation = stateRef.current.conversation;
      const body = text.trim();
      if (!conversation || body.length === 0 || stateRef.current.submitting) return false;

      patch({ submitting: true, submitError: null });
      try {
        const submission = await submitAssistantInput(
          conversation.conversation_id,
          {
            text: body,
            attachment_refs: attachmentRefs.length > 0 ? attachmentRefs : undefined,
          },
          crypto.randomUUID(),
        );
        if (submission.kind === 'assistant_turn') {
          // Only ordinary conversation queues Runtime work; its reply arrives through the event
          // stream and the Turn resource remains authoritative for progress.
          patch({
            activeTurn: submission.turn,
            messages: mergeMessage(stateRef.current.messages, submission.message),
          });
        } else {
          // Deterministic decisions and unavailable decisions both persist a product-owned
          // acknowledgement. Render those messages immediately without inventing a Runtime Turn.
          const messages = mergeMessage(
            mergeMessage(stateRef.current.messages, submission.message),
            submission.acknowledgement,
          );
          if (submission.kind === 'action_decision') {
            patch({
              messages,
              actions: mergeAction(stateRef.current.actions, submission.action),
            });
          } else {
            patch({ messages });
          }
        }

        // Refresh persisted projections after the immediate response is visible. A failed follow-up
        // read must not turn an already accepted input into a false submission error; the SSE batch
        // and the next reconnect will retry reconciliation.
        const reconciliation = [
          refreshMessages(conversation.conversation_id),
          refreshConversation(conversation.conversation_id),
        ];
        if (submission.kind === 'action_decision') {
          reconciliation.push(refreshActions(conversation.conversation_id));
        }
        void Promise.allSettled(reconciliation);
        connect(conversation.conversation_id);
        return true;
      } catch (cause) {
        patch({ submitError: apiErrorFromThrown(cause) });
        return false;
      } finally {
        patch({ submitting: false });
      }
    },
    [connect, patch, refreshActions, refreshConversation, refreshMessages],
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

  const selectConversation = useCallback(
    (conversationId: string) => {
      const target = stateRef.current.conversations.find(
        (item) => item.conversation_id === conversationId,
      );
      if (
        !target ||
        target.status !== 'active' ||
        stateRef.current.conversation?.conversation_id === conversationId
      ) return;

      streamAbort.current?.abort();
      if (reconnectTimer.current !== null) window.clearTimeout(reconnectTimer.current);
      eventLog.current = new AssistantEventLog();
      failureCount.current = 0;
      patch({
        status: 'loading',
        error: null,
        conversation: null,
        messages: [],
        actions: [],
        taskBindings: {},
        activeTurn: null,
        connection: 'connecting',
        submitting: false,
        submitError: null,
      });
      setRequestedConversationId(conversationId);
    },
    [patch],
  );

  const reconnect = useCallback(() => {
    const conversation = stateRef.current.conversation;
    if (!conversation) return;
    // An explicit user retry clears the give-up state.
    failureCount.current = 0;
    connect(conversation.conversation_id);
  }, [connect]);

  const retryBootstrap = useCallback(() => setBootstrapToken((token) => token + 1), []);

  return { ...state, send, decide, selectConversation, reconnect, retryBootstrap };
}

function replaceConversation(
  conversations: readonly AssistantConversation[],
  conversation: AssistantConversation,
): AssistantConversation[] {
  const next = conversations.filter(
    (item) => item.conversation_id !== conversation.conversation_id,
  );
  next.push(conversation);
  next.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  return next;
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
