import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  File,
  Globe2,
  Loader2,
  MessageCircle,
  Paperclip,
  Send,
  Sparkles,
  X,
} from 'lucide-react';
import type {
  AssistantAction,
  AssistantAttachment,
  AssistantConversation,
  AssistantMessage,
  Task,
} from '../api/types';
import { useAssistantConversation } from '../assistant/useAssistantConversation';
import { useAuthenticatedUser } from '../auth/context';
import {
  ASSISTANT_ATTACHMENT_ACCEPT,
  MAX_ASSISTANT_ATTACHMENTS_PER_MESSAGE,
  usePendingAssistantAttachments,
} from '../assistant/usePendingAssistantAttachments';
import AssistantActionCard from '../components/AssistantActionCard';
import AssistantMessageContent from '../components/AssistantMessageContent';
import PageHeader from '../components/PageHeader';
import { ErrorState, InlineError, LoadingState, ReconnectBanner } from '../components/states';
import { formatBytes } from '../lib/format';
import { taskIdFromAction } from '../assistant/taskInputBindings';

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

const COMPOSER_MIN_HEIGHT = 44;
const COMPOSER_MAX_HEIGHT = 128;

export default function Assistant() {
  const user = useAuthenticatedUser();
  const conversation = useAssistantConversation(user.user_id);
  const {
    status,
    error,
    conversations,
    messages,
    actions,
    taskBindings,
    activeTurn,
    connection,
    submitting,
    submitError,
    send,
    decide,
    selectConversation,
    reconnect,
    retryBootstrap,
  } = conversation;

  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pendingAttachments = usePendingAssistantAttachments(
    conversation.conversation?.conversation_id ?? null,
  );

  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    element.scrollTop = element.scrollHeight;
  }, [messages, actions, activeTurn]);

  useLayoutEffect(() => {
    const element = composerRef.current;
    if (!element) return;

    if (input.length === 0) {
      element.style.height = `${COMPOSER_MIN_HEIGHT}px`;
      element.style.overflowY = 'hidden';
      return;
    }

    // Reset before measuring so shrinking non-empty text is reflected.
    element.style.height = 'auto';
    const nextHeight = Math.min(Math.max(element.scrollHeight, COMPOSER_MIN_HEIGHT), COMPOSER_MAX_HEIGHT);
    element.style.height = `${nextHeight}px`;
    element.style.overflowY = element.scrollHeight > COMPOSER_MAX_HEIGHT ? 'auto' : 'hidden';
  }, [input]);

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

  const submit = async () => {
    const text = input.trim();
    if (text.length === 0 || submitting || turnRunning || pendingAttachments.busy) return;
    const sent = await send(
      text,
      pendingAttachments.attachments.map((attachment) => ({
        attachment_id: attachment.attachment_id,
      })),
    );
    if (sent) {
      setInput('');
      pendingAttachments.clearAfterSend();
    }
    composerRef.current?.focus();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void submit();
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
      <PageHeader
        title="平台小助理"
        description="通过对话设计并发布您的 AI 组织"
        actions={
          conversation.conversation ? (
            <ConversationCatalog
              conversations={conversations}
              selected={conversation.conversation}
              onSelect={selectConversation}
            />
          ) : undefined
        }
      />

      <div ref={scrollRef} className="mobile-scroll-gutter flex-1 overflow-y-auto px-3 py-4 sm:px-8 sm:py-6">
        <div className="mx-auto flex max-w-3xl flex-col gap-5">
          {conversation.conversation?.origin === 'channel' ? (
            <ChannelContinuationNotice conversation={conversation.conversation} />
          ) : null}
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
              taskBindings={taskBindings}
              onDecide={decide}
            />
          ))}

          {trailingActions.length > 0 ? (
            <div className="flex gap-3">
              <div className="hidden w-9 flex-shrink-0 sm:block" aria-hidden="true" />
              <div className="min-w-0 flex-1 space-y-3">
                {trailingActions.map((action) => (
                    <AssistantActionCard
                      key={action.action_id}
                      action={action}
                      task={taskForAction(action, taskBindings)}
                      onDecide={decide}
                    />
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
                  className="min-h-11 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm text-slate-600 shadow-sm transition-colors hover:border-indigo-200 hover:text-indigo-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-indigo-500/15 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <div className="border-t border-slate-200/60 bg-white/90 p-3 backdrop-blur-md sm:p-5">
        <div className="mx-auto max-w-3xl">
          {submitError ? (
            <div className="mb-3">
              <InlineError error={submitError} />
            </div>
          ) : null}
          {pendingAttachments.error ? (
            <div className="mb-3">
              <InlineError error={pendingAttachments.error} />
            </div>
          ) : null}
          {pendingAttachments.attachments.length > 0 || pendingAttachments.uploadingCount > 0 ? (
            <div className="mb-2 flex flex-wrap gap-2" aria-label="待发送附件">
              {pendingAttachments.attachments.map((attachment) => (
                <PendingAttachmentChip
                  key={attachment.attachment_id}
                  attachment={attachment}
                  revoking={pendingAttachments.revokingIds.has(attachment.attachment_id)}
                  onRevoke={() => void pendingAttachments.revoke(attachment.attachment_id)}
                />
              ))}
              {pendingAttachments.uploadingCount > 0 ? (
                <div className="inline-flex min-w-0 items-center gap-2 rounded-xl border border-indigo-100 bg-indigo-50 px-3 py-2 text-xs font-medium text-indigo-700">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  正在上传 {pendingAttachments.uploadingCount} 个附件
                </div>
              ) : null}
            </div>
          ) : null}
          <form
            className="flex items-end gap-1.5 rounded-2xl border border-slate-300 bg-white p-1.5 shadow-sm transition-all duration-200 focus-within:border-indigo-500 focus-within:ring-4 focus-within:ring-indigo-500/10 sm:gap-2 sm:p-2"
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={ASSISTANT_ATTACHMENT_ACCEPT}
              className="sr-only"
              aria-label="选择要发送给平台小助理的附件"
              onChange={(event) => {
                if (event.currentTarget.files) void pendingAttachments.addFiles(event.currentTarget.files);
                event.currentTarget.value = '';
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={
                turnRunning ||
                pendingAttachments.busy ||
                pendingAttachments.attachments.length >= MAX_ASSISTANT_ATTACHMENTS_PER_MESSAGE
              }
              aria-label="添加附件"
              title="添加 JSON、PDF、XLSX、图片、CSV、Markdown 或文本（单个不超过 20 MiB）"
              className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-slate-100 hover:text-indigo-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-indigo-500/15 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {pendingAttachments.uploadingCount > 0 ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Paperclip className="h-4 w-4" aria-hidden="true" />
              )}
            </button>
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
                turnRunning ? '小助理正在处理上一条消息...' : '描述您想创建或调整的组织...'
              }
              rows={1}
              disabled={turnRunning}
              className="max-h-32 min-h-[44px] flex-1 resize-none overflow-y-hidden bg-transparent px-3 py-2.5 text-sm text-slate-700 placeholder-slate-400 focus:outline-none disabled:cursor-not-allowed"
            />
            <button
              type="submit"
              disabled={
                submitting ||
                turnRunning ||
                pendingAttachments.busy ||
                input.trim().length === 0
              }
              aria-label="发送"
              className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-blue-600 text-white shadow-md shadow-indigo-200 transition-all hover:from-indigo-700 hover:to-blue-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-indigo-500/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting || turnRunning ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Send className="ml-0.5 h-4 w-4" aria-hidden="true" />
              )}
            </button>
          </form>
          {/*
            The keyboard hint lives outside the placeholder because a one-line composer clips it on a
            narrow screen, and it is hidden there anyway: a phone keyboard has no Shift+Enter.
          */}
          <div className="mt-1.5 flex items-center justify-between gap-3 text-[11px] text-slate-400">
            <span className="hidden sm:inline">Enter 发送，Shift+Enter 换行</span>
            <span className="ml-auto">聊天附件不会自动成为 Task 输入</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full flex-col bg-slate-50/50">
      <PageHeader title="平台小助理" description="通过对话设计并发布您的 AI 组织" />
      <div className="mobile-scroll-gutter flex-1 overflow-y-auto px-4 py-5 sm:p-8">{children}</div>
    </div>
  );
}

function ConversationCatalog({
  conversations,
  selected,
  onSelect,
}: {
  conversations: AssistantConversation[];
  selected: AssistantConversation;
  onSelect: (conversationId: string) => void;
}) {
  const selectedBinding = channelBindings(selected)[0] ?? null;
  const selectedTitle = conversationTitle(selected);

  return (
    <details className="group relative w-full sm:w-80">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-left shadow-sm transition-colors hover:border-indigo-200 focus:outline-none focus-visible:ring-4 focus-visible:ring-indigo-500/15 [&::-webkit-details-marker]:hidden">
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
            conversationOrigin(selected) === 'channel'
              ? 'bg-emerald-50 text-emerald-700'
              : 'bg-indigo-50 text-indigo-700'
          }`}
        >
          {conversationOrigin(selected) === 'channel' ? (
            <MessageCircle className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Globe2 className="h-4 w-4" aria-hidden="true" />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-bold text-slate-800">{selectedTitle}</span>
          <span className="mt-0.5 block truncate text-[11px] text-slate-500">
            {selectedBinding
              ? `${providerLabel(selectedBinding.provider_key)} · ${selectedBinding.connection_display_name}`
              : '网页会话'}
          </span>
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>

      <div className="absolute right-0 z-30 mt-2 w-full min-w-[18rem] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-900/10 sm:min-w-[22rem]">
        <div className="border-b border-slate-100 px-4 py-3">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400">会话目录</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">网页会话与渠道会话彼此隔离，选择后继续同一份产品记录。</p>
        </div>
        <div className="max-h-80 space-y-1 overflow-y-auto p-2">
          {conversations.map((item) => {
            const binding = channelBindings(item)[0] ?? null;
            const isSelected = item.conversation_id === selected.conversation_id;
            const archived = item.status === 'archived';
            return (
              <button
                key={item.conversation_id}
                type="button"
                disabled={isSelected || archived}
                onClick={(event) => {
                  onSelect(item.conversation_id);
                  event.currentTarget.closest('details')?.removeAttribute('open');
                }}
                className={`w-full rounded-xl border px-3 py-3 text-left transition-colors focus:outline-none focus-visible:ring-4 focus-visible:ring-indigo-500/15 ${
                  isSelected
                    ? 'border-indigo-200 bg-indigo-50/70'
                    : archived
                      ? 'cursor-not-allowed border-transparent opacity-55'
                      : 'border-transparent hover:border-slate-200 hover:bg-slate-50'
                }`}
              >
                <span className="flex items-start gap-3">
                  <span
                    className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                      conversationOrigin(item) === 'channel'
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'bg-indigo-50 text-indigo-700'
                    }`}
                  >
                    {conversationOrigin(item) === 'channel' ? (
                      <MessageCircle className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <Globe2 className="h-4 w-4" aria-hidden="true" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-sm font-bold text-slate-800">
                        {conversationTitle(item)}
                      </span>
                      <span className="shrink-0 text-[10px] font-bold text-slate-400">
                        {archived ? '已归档' : conversationOrigin(item) === 'channel' ? providerLabel(binding?.provider_key) : '网页'}
                      </span>
                    </span>
                    <span className="mt-1 block truncate text-xs text-slate-500">
                      {item.last_message?.text_preview || (binding ? binding.connection_display_name : '暂无消息')}
                    </span>
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </details>
  );
}

function ChannelContinuationNotice({ conversation }: { conversation: AssistantConversation }) {
  const binding = channelBindings(conversation)[0] ?? null;
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/80 px-4 py-3 text-sm text-emerald-900">
      <MessageCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <p className="leading-6">
        正在网页继续{binding ? `${providerLabel(binding.provider_key)}联系人“${conversationTitle(conversation)}”` : '渠道'}会话。
        从这里发送的消息只在网页获得回复，不会改变渠道绑定，也不会产生渠道 outbox 回复。
      </p>
    </div>
  );
}

function conversationTitle(conversation: AssistantConversation): string {
  const binding = channelBindings(conversation)[0] ?? null;
  const title = conversation.title?.trim();
  if (conversation.origin === 'channel') {
    if (!title || title === binding?.external_peer_id) return `${providerLabel(binding?.provider_key)}联系人`;
    return title;
  }
  return title || '网页小助理';
}

/** F0 and earlier additive backend branches omit the optional channel catalog projection. */
function channelBindings(
  conversation: AssistantConversation,
): AssistantConversation['channel_bindings'] {
  const value = (conversation as AssistantConversation & { channel_bindings?: unknown }).channel_bindings;
  return Array.isArray(value) ? (value as AssistantConversation['channel_bindings']) : [];
}

function conversationOrigin(conversation: AssistantConversation): 'web' | 'channel' {
  return conversation.origin === 'channel' ? 'channel' : 'web';
}

function providerLabel(providerKey?: string): string {
  return providerKey === 'weixin-ilink' ? '微信' : providerKey || '渠道';
}

function MessageRow({
  message,
  actions,
  taskBindings,
  onDecide,
}: {
  message: AssistantMessage;
  actions: AssistantAction[];
  taskBindings: Record<string, Task>;
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
        {/* `break-words` only kicks in for tokens that cannot fit at all, such as a long MIME type. */}
        <div className="max-w-[90%] rounded-2xl rounded-br-sm bg-gradient-to-r from-indigo-600 to-blue-600 px-4 py-3 text-sm leading-relaxed text-white shadow-md shadow-indigo-200/60">
          <AssistantMessageContent message={message} inverted />
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
        <div
          className={`rounded-2xl rounded-tl-sm border border-slate-200/60 bg-white px-4 py-3 text-sm leading-relaxed text-slate-700 shadow-sm ${
            message.content_blocks.some((block) => block.type === 'diagram' || block.type === 'html_report')
              ? 'max-w-full'
              : 'max-w-[90%]'
          }`}
        >
          <AssistantMessageContent message={message} />
        </div>
        {actions.map((action) => (
          <AssistantActionCard
            key={action.action_id}
            action={action}
            task={taskForAction(action, taskBindings)}
            onDecide={onDecide}
          />
        ))}
      </div>
    </div>
  );
}

function taskForAction(action: AssistantAction, bindings: Record<string, Task>): Task | null {
  const direct = bindings[action.action_id];
  if (direct) return direct;
  const taskId = taskIdFromAction(action);
  return taskId ? bindings[`task:${taskId}`] ?? null : null;
}

function PendingAttachmentChip({
  attachment,
  revoking,
  onRevoke,
}: {
  attachment: AssistantAttachment;
  revoking: boolean;
  onRevoke: () => void;
}) {
  return (
    <div className="inline-flex min-w-0 max-w-full items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 shadow-sm sm:max-w-xs">
      <File className="h-3.5 w-3.5 flex-shrink-0 text-indigo-500" aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate font-medium" title={attachment.file_name}>
        {attachment.file_name}
      </span>
      <span className="flex-shrink-0 text-[10px] text-slate-400">{formatBytes(attachment.byte_size)}</span>
      <button
        type="button"
        onClick={onRevoke}
        disabled={revoking}
        aria-label={`移除附件 ${attachment.file_name}`}
        className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500/20 disabled:cursor-wait sm:h-8 sm:w-8"
      >
        {revoking ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        ) : (
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        )}
      </button>
    </div>
  );
}

function AssistantAvatar() {
  return (
    <div className="hidden h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-indigo-200/50 bg-gradient-to-br from-indigo-100 to-blue-100 shadow-sm sm:flex">
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
