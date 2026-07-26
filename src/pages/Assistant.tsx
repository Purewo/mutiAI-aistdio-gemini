import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Send, Sparkles } from 'lucide-react';
import type { AssistantAction, AssistantMessage } from '../api/types';
import { useAssistantConversation } from '../assistant/useAssistantConversation';
import AssistantActionCard from '../components/AssistantActionCard';
import PageHeader from '../components/PageHeader';
import { ErrorState, InlineError, LoadingState, ReconnectBanner } from '../components/states';

/**
 * Platform-assistant conversation.
 *
 * This is the real product conversation: messages, Turns, and Actions are persisted by the backend
 * and reached through `/api/v1/assistant`, with a resident Codex Thread behind the
 * AssistantRuntimeAdapter. The page renders what the product database holds — it does not keep a
 * second client-side source of truth, and chat text alone never changes product state. Every
 * state-changing operation appears as an explicit Action awaiting confirmation.
 */

const EMPTY_SUGGESTIONS = [
  '列出我当前的组织',
  '我想要一个能写公众号文章的内容团队',
  '帮我建一个把业务数据变成分析报告的组织',
];

export default function Assistant() {
  const conversation = useAssistantConversation();
  const {
    status,
    error,
    messages,
    actions,
    activeTurn,
    connection,
    submitting,
    submitError,
    send,
    decide,
    reconnect,
    retryBootstrap,
  } = conversation;

  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, actions, activeTurn]);

  /**
   * Actions render under the assistant message that produced them, matched by the Turn that
   * created both. Anything unmatched still renders at the end so no pending confirmation is hidden.
   */
  const { actionsByMessage, trailingActions } = useMemo(() => {
    // The message resource carries no turn id, so an action is attached to the latest assistant
    // message proposed at or before it. Anything with no such message renders after the thread so
    // a pending confirmation is never hidden.
    const assistantMessages = messages.filter((message) => message.role === 'assistant');
    const byMessage = new Map<string, AssistantAction[]>();
    const trailing: AssistantAction[] = [];

    for (const action of actions) {
      let host: AssistantMessage | null = null;
      for (const message of assistantMessages) {
        if (message.created_at <= action.proposed_at) host = message;
      }
      if (host) {
        const list = byMessage.get(host.message_id) ?? [];
        list.push(action);
        byMessage.set(host.message_id, list);
      } else {
        trailing.push(action);
      }
    }
    return { actionsByMessage: byMessage, trailingActions: trailing };
  }, [messages, actions]);

  const turnRunning =
    activeTurn !== null &&
    activeTurn.status !== 'completed' &&
    activeTurn.status !== 'failed' &&
    activeTurn.status !== 'cancelled';

  const submit = () => {
    const text = input.trim();
    if (text.length === 0 || submitting || turnRunning) return;
    setInput('');
    void send(text).then(() => composerRef.current?.focus());
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  };

  if (status === 'loading') {
    return (
      <Shell>
        <LoadingState label="正在打开小助理会话..." />
      </Shell>
    );
  }

  if (status === 'error') {
    return (
      <Shell>
        <div className="mx-auto max-w-2xl">
          <ErrorState error={error} title="无法打开小助理会话" onRetry={retryBootstrap} />
        </div>
      </Shell>
    );
  }

  const conversationEmpty = messages.length === 0;

  return (
    <div className="flex h-full flex-col bg-slate-50/50">
      <PageHeader title="平台小助理" description="通过对话设计并发布您的 AI 组织" />

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6 sm:px-8">
        <div className="mx-auto flex max-w-3xl flex-col gap-5">
          {connection !== 'live' ? (
            <ReconnectBanner
              status={connection}
              onReconnect={reconnect}
              closedText="小助理已处理完当前消息。"
            />
          ) : null}

          {conversationEmpty ? (
            <div className="flex gap-3">
              <AssistantAvatar />
              <div className="max-w-[85%] rounded-2xl rounded-tl-sm border border-slate-200/60 bg-white px-4 py-3 text-sm leading-relaxed text-slate-700 shadow-sm">
                您好！我是平台小助理。请描述您想创建的 AI 组织，或询问现有组织与任务的状态。
              </div>
            </div>
          ) : null}

          {messages.map((message) => (
            <MessageRow
              key={message.message_id}
              message={message}
              actions={actionsByMessage.get(message.message_id) ?? []}
              onDecide={decide}
            />
          ))}

          {trailingActions.length > 0 ? (
            <div className="flex gap-3">
              <div className="w-9 flex-shrink-0" aria-hidden="true" />
              <div className="min-w-0 flex-1 space-y-3">
                {trailingActions.map((action) => (
                  <AssistantActionCard key={action.action_id} action={action} onDecide={decide} />
                ))}
              </div>
            </div>
          ) : null}

          {turnRunning ? <TurnIndicator status={activeTurn.status} /> : null}

          {conversationEmpty ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {EMPTY_SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => void send(suggestion)}
                  disabled={submitting || turnRunning}
                  className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm text-slate-600 shadow-sm transition-colors hover:border-indigo-200 hover:text-indigo-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-indigo-500/15 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <div className="border-t border-slate-200/60 bg-white/80 p-4 backdrop-blur-md sm:p-5">
        <div className="mx-auto max-w-3xl">
          {submitError ? (
            <div className="mb-3">
              <InlineError error={submitError} />
            </div>
          ) : null}
          <form
            className="flex items-end gap-2 rounded-2xl border border-slate-300 bg-white p-2 shadow-sm transition-all duration-200 focus-within:border-indigo-500 focus-within:ring-4 focus-within:ring-indigo-500/10"
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            <label htmlFor="assistant-composer" className="sr-only">
              给平台小助理发送消息
            </label>
            <textarea
              id="assistant-composer"
              name="assistant-composer"
              ref={composerRef}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                turnRunning
                  ? '小助理正在处理上一条消息...'
                  : '描述您想创建或调整的组织...（Enter 发送，Shift+Enter 换行）'
              }
              rows={1}
              disabled={turnRunning}
              className="max-h-40 min-h-[44px] flex-1 resize-none bg-transparent px-3 py-2.5 text-sm text-slate-700 placeholder-slate-400 focus:outline-none disabled:cursor-not-allowed"
            />
            <button
              type="submit"
              disabled={submitting || turnRunning || input.trim().length === 0}
              aria-label="发送"
              className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-blue-600 text-white shadow-md shadow-indigo-200 transition-all hover:from-indigo-700 hover:to-blue-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-indigo-500/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting || turnRunning ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Send className="ml-0.5 h-4 w-4" aria-hidden="true" />
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full flex-col bg-slate-50/50">
      <PageHeader title="平台小助理" description="通过对话设计并发布您的 AI 组织" />
      <div className="flex-1 overflow-y-auto p-6 sm:p-8">{children}</div>
    </div>
  );
}

function MessageRow({
  message,
  actions,
  onDecide,
}: {
  message: AssistantMessage;
  actions: AssistantAction[];
  onDecide: (actionId: string, decision: 'confirm' | 'decline') => Promise<void>;
}) {
  if (message.role === 'event') {
    return (
      <p className="text-center text-xs font-medium text-slate-400">{message.text}</p>
    );
  }

  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-gradient-to-r from-indigo-600 to-blue-600 px-4 py-3 text-sm leading-relaxed text-white shadow-md shadow-indigo-200/60">
          {message.text}
          {message.status === 'failed' ? (
            <span className="mt-1 block text-xs text-indigo-100">这条消息未能送达</span>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3">
      <AssistantAvatar />
      <div className="min-w-0 flex-1 space-y-3">
        <div className="max-w-[85%] rounded-2xl rounded-tl-sm border border-slate-200/60 bg-white px-4 py-3 text-sm leading-relaxed text-slate-700 shadow-sm">
          <AssistantText text={message.text} />
        </div>
        {actions.map((action) => (
          <AssistantActionCard key={action.action_id} action={action} onDecide={onDecide} />
        ))}
      </div>
    </div>
  );
}

/**
 * Present assistant message text.
 *
 * `text` is meant to be user-visible prose. The current backend sometimes stores a serialized tool
 * envelope there instead (reported upstream). Rather than parsing an uncontracted shape and
 * guessing which field is the human message, JSON-looking text is pretty-printed in a monospace
 * block so it is at least readable. Nothing is rewritten or hidden.
 */
function AssistantText({ text }: { text: string }) {
  const trimmed = text.trim();
  const structured = trimmed.startsWith('{') && trimmed.endsWith('}');

  if (!structured) return <span className="whitespace-pre-wrap">{trimmed}</span>;

  let pretty = trimmed;
  try {
    pretty = JSON.stringify(JSON.parse(trimmed), null, 2);
  } catch {
    // Not valid JSON after all; fall through and show it as text.
    return <span className="whitespace-pre-wrap">{trimmed}</span>;
  }

  return (
    <pre className="max-h-72 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-xs leading-relaxed text-slate-600">
      {pretty}
    </pre>
  );
}

function AssistantAvatar() {
  return (
    <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-indigo-200/50 bg-gradient-to-br from-indigo-100 to-blue-100 shadow-sm">
      <Sparkles className="h-4 w-4 text-indigo-600" aria-hidden="true" />
    </div>
  );
}

/** Turn progress. `waiting` is a resumable Runtime or capacity boundary, not a failure. */
function TurnIndicator({ status }: { status: string }) {
  const label =
    status === 'queued'
      ? '已排队...'
      : status === 'waiting'
        ? '等待 Runtime 响应...'
        : '小助理正在处理...';

  return (
    <div className="flex gap-3" role="status" aria-label={label}>
      <AssistantAvatar />
      <div className="flex items-center gap-2 rounded-2xl rounded-tl-sm border border-slate-200/60 bg-white px-4 py-3 shadow-sm">
        <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" aria-hidden="true" />
        <span className="text-sm text-slate-500">{label}</span>
      </div>
    </div>
  );
}
