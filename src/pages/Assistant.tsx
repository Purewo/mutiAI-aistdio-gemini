import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Check,
  CheckCircle2,
  FlaskConical,
  Loader2,
  Send,
  Sparkles,
} from 'lucide-react';
import {
  confirmOrganizationVersion,
  createOrganizationProposal,
  publishOrganizationVersion,
} from '../api/endpoints';
import { apiErrorFromThrown, type ApiError } from '../api/errors';
import type { OrganizationVersion } from '../api/types';
import {
  DEMO_GREETING,
  DEMO_SUGGESTIONS,
  draftOrganization,
  type AssistantDraft,
} from '../demo/assistantDemo';
import OrganizationGraph from '../components/OrganizationGraph';
import PageHeader from '../components/PageHeader';
import { InlineError } from '../components/states';

/**
 * Platform-assistant conversation page.
 *
 * The product design (backend `docs/architecture/PLATFORM_ASSISTANT_CONVERSATION.md`) is chat-first:
 * the assistant drafts an OrganizationSpec through conversation, the draft renders as structured
 * data, and state-changing transitions require explicit confirmation as product actions — chat text
 * alone never publishes anything.
 *
 * The `/api/v1/assistant` conversation contracts are not implemented yet, so the assistant's
 * replies and drafting here come from the clearly-labeled demo engine in `src/demo/assistantDemo.ts`
 * (mock states the design doc explicitly authorizes). The confirm and publish buttons execute the
 * REAL contracted lifecycle — `POST /organizations/proposals`, then the confirm and publish
 * transitions — so a confirmed draft becomes a real published organization. When the conversation
 * API lands, the demo engine is replaced by the real transport and drafts arrive as product
 * records; the card lifecycle below maps onto AssistantAction states.
 */

/** One proposal draft card inside the conversation, with its real-lifecycle progress. */
interface ProposalCard {
  id: number;
  draft: AssistantDraft;
  phase:
    | 'draft'
    | 'confirming'
    | 'confirmed'
    | 'publishing'
    | 'published'
    | 'superseded';
  /** Persisted version, present once the real proposal has been created. */
  version: OrganizationVersion | null;
  error: ApiError | null;
}

type ChatMessage =
  | { kind: 'user'; id: number; text: string }
  | { kind: 'assistant'; id: number; text: string; cardId: number | null }
  | { kind: 'event'; id: number; text: string };

let nextId = 1;
const allocateId = () => nextId++;

/** Demo-only latency so the running-turn state is visible, mirroring a real AssistantTurn. */
const DEMO_TURN_DELAY_MS = 700;

export default function Assistant() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { kind: 'assistant', id: allocateId(), text: DEMO_GREETING, cardId: null },
  ]);
  const [cards, setCards] = useState<Map<number, ProposalCard>>(new Map());
  const [input, setInput] = useState('');
  const [turnRunning, setTurnRunning] = useState(false);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, cards, turnRunning]);

  const latestDraftCard = (): ProposalCard | null => {
    let latest: ProposalCard | null = null;
    for (const card of cards.values()) {
      if (card.phase === 'draft' && (!latest || card.id > latest.id)) latest = card;
    }
    return latest;
  };

  const updateCard = (cardId: number, patch: Partial<ProposalCard>) => {
    setCards((current) => {
      const next = new Map(current);
      const card = next.get(cardId);
      if (card) next.set(cardId, { ...card, ...patch });
      return next;
    });
  };

  const sendMessage = (raw: string) => {
    const text = raw.trim();
    if (text.length === 0 || turnRunning) return;

    setInput('');
    setMessages((current) => [...current, { kind: 'user', id: allocateId(), text }]);
    setTurnRunning(true);

    const pendingDraft = latestDraftCard();

    // Simulated AssistantTurn: the reply is demo drafting, not backend reasoning.
    window.setTimeout(() => {
      const draft = draftOrganization(text, pendingDraft?.draft ?? null);
      const card: ProposalCard = {
        id: allocateId(),
        draft,
        phase: 'draft',
        version: null,
        error: null,
      };

      setCards((current) => {
        const next = new Map(current);
        // Revision replaces the pending draft; drafts that already hit the backend stay as history.
        if (pendingDraft) {
          const stale = next.get(pendingDraft.id);
          if (stale && stale.phase === 'draft') next.set(stale.id, { ...stale, phase: 'superseded' });
        }
        next.set(card.id, card);
        return next;
      });
      setMessages((current) => [
        ...current,
        { kind: 'assistant', id: allocateId(), text: draft.replyText, cardId: card.id },
      ]);
      setTurnRunning(false);
      composerRef.current?.focus();
    }, DEMO_TURN_DELAY_MS);
  };

  /**
   * Execute the real preview-first lifecycle for a confirmed draft: create the proposal version,
   * then confirm it. Publishing stays a separate explicit action, matching the product rule that a
   * proposal is never presented as published before both transitions complete.
   */
  const confirmDraft = async (cardId: number) => {
    const card = cards.get(cardId);
    if (!card || card.phase !== 'draft') return;
    updateCard(cardId, { phase: 'confirming', error: null });
    try {
      const proposal = await createOrganizationProposal({
        source_request: null,
        spec: card.draft.spec,
      });
      const confirmed = await confirmOrganizationVersion(
        proposal.organization_id,
        proposal.spec_version_id,
      );
      updateCard(cardId, { phase: 'confirmed', version: confirmed });
      setMessages((current) => [
        ...current,
        {
          kind: 'assistant',
          id: allocateId(),
          text: `方案已确认（第 ${confirmed.version_number} 版）。发布后组织会出现在组织管理中；发布本身不会创建工作目录或 Runtime 会话。是否发布？`,
          cardId: null,
        },
      ]);
    } catch (cause) {
      updateCard(cardId, { phase: 'draft', error: apiErrorFromThrown(cause) });
    }
  };

  const publishDraft = async (cardId: number) => {
    const card = cards.get(cardId);
    if (!card || card.phase !== 'confirmed' || !card.version) return;
    updateCard(cardId, { phase: 'publishing', error: null });
    try {
      const published = await publishOrganizationVersion(
        card.version.organization_id,
        card.version.spec_version_id,
      );
      updateCard(cardId, { phase: 'published', version: published });
      setMessages((current) => [
        ...current,
        {
          kind: 'event',
          id: allocateId(),
          text: `组织「${published.spec.name}」已发布`,
        },
      ]);
    } catch (cause) {
      updateCard(cardId, { phase: 'confirmed', error: apiErrorFromThrown(cause) });
    }
  };

  const handleComposerKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      sendMessage(input);
    }
  };

  const conversationEmpty = messages.length <= 1 && cards.size === 0;

  return (
    <div className="flex h-full flex-col bg-slate-50/50">
      <PageHeader title="平台小助理" description="通过对话设计并发布您的 AI 组织" />

      {/* Demo boundary label, required while the conversation API is mock-driven. */}
      <div className="border-b border-amber-200/60 bg-amber-50/80 px-6 py-2 sm:px-8">
        <p className="mx-auto flex max-w-3xl items-center gap-2 text-xs leading-relaxed text-amber-800">
          <FlaskConical className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
          小助理的回复与方案起草目前是前端演示逻辑（会话后端实现中）。「确认方案」与「发布」执行真实后端操作。
        </p>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6 sm:px-8">
        <div className="mx-auto flex max-w-3xl flex-col gap-5">
          {messages.map((message) => (
            <MessageRow
              key={message.id}
              message={message}
              card={
                message.kind === 'assistant' && message.cardId !== null
                  ? cards.get(message.cardId) ?? null
                  : null
              }
              onConfirm={confirmDraft}
              onPublish={publishDraft}
            />
          ))}

          {turnRunning ? <TypingIndicator /> : null}

          {conversationEmpty ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {DEMO_SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => sendMessage(suggestion)}
                  className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm text-slate-600 shadow-sm transition-colors hover:border-indigo-200 hover:text-indigo-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-indigo-500/15"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      {/* ChatGPT-style bottom composer. */}
      <div className="border-t border-slate-200/60 bg-white/80 p-4 backdrop-blur-md sm:p-5">
        <form
          className="mx-auto flex max-w-3xl items-end gap-2 rounded-2xl border border-slate-300 bg-white p-2 shadow-sm transition-all duration-200 focus-within:border-indigo-500 focus-within:ring-4 focus-within:ring-indigo-500/10"
          onSubmit={(event) => {
            event.preventDefault();
            sendMessage(input);
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
            onKeyDown={handleComposerKeyDown}
            placeholder="描述您想创建或调整的组织...（Enter 发送，Shift+Enter 换行）"
            rows={1}
            className="max-h-40 min-h-[44px] flex-1 resize-none bg-transparent px-3 py-2.5 text-sm text-slate-700 placeholder-slate-400 focus:outline-none"
          />
          <button
            type="submit"
            disabled={turnRunning || input.trim().length === 0}
            aria-label="发送"
            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-blue-600 text-white shadow-md shadow-indigo-200 transition-all hover:from-indigo-700 hover:to-blue-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-indigo-500/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {turnRunning ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Send className="ml-0.5 h-4 w-4" aria-hidden="true" />
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

function MessageRow({
  message,
  card,
  onConfirm,
  onPublish,
}: {
  message: ChatMessage;
  card: ProposalCard | null;
  onConfirm: (cardId: number) => void;
  onPublish: (cardId: number) => void;
}) {
  if (message.kind === 'event') {
    return (
      <p className="flex items-center justify-center gap-1.5 text-xs font-medium text-emerald-700">
        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
        {message.text}
      </p>
    );
  }

  if (message.kind === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-gradient-to-r from-indigo-600 to-blue-600 px-4 py-3 text-sm leading-relaxed text-white shadow-md shadow-indigo-200/60">
          {message.text}
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3">
      <AssistantAvatar />
      <div className="min-w-0 flex-1 space-y-3">
        <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-tl-sm border border-slate-200/60 bg-white px-4 py-3 text-sm leading-relaxed text-slate-700 shadow-sm">
          {message.text}
        </div>
        {card ? <ProposalCardView card={card} onConfirm={onConfirm} onPublish={onPublish} /> : null}
      </div>
    </div>
  );
}

function ProposalCardView({
  card,
  onConfirm,
  onPublish,
}: {
  card: ProposalCard;
  onConfirm: (cardId: number) => void;
  onPublish: (cardId: number) => void;
}) {
  const phaseBadge: Record<ProposalCard['phase'], { label: string; tone: string }> = {
    draft: { label: '待确认草稿', tone: 'border-blue-200 bg-blue-50 text-blue-700' },
    confirming: { label: '确认中', tone: 'border-indigo-200 bg-indigo-50 text-indigo-700' },
    confirmed: { label: '已确认', tone: 'border-amber-200 bg-amber-50 text-amber-700' },
    publishing: { label: '发布中', tone: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
    published: { label: '已发布', tone: 'border-emerald-200/50 bg-emerald-50 text-emerald-700' },
    superseded: { label: '已被新方案取代', tone: 'border-slate-200 bg-slate-50 text-slate-500' },
  };
  const badge = phaseBadge[card.phase];
  const busy = card.phase === 'confirming' || card.phase === 'publishing';

  const actionButton =
    'inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white shadow-md transition-all focus:outline-none focus-visible:ring-4 disabled:cursor-not-allowed disabled:opacity-60';

  return (
    <div
      className={`rounded-2xl border bg-white p-4 shadow-sm ${
        card.phase === 'superseded' ? 'border-slate-200 opacity-60' : 'border-slate-200/60'
      }`}
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-bold text-slate-900">{card.draft.spec.name}</h3>
        <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${badge.tone}`}>
          {badge.label}
        </span>
        {card.version ? (
          <span className="text-xs text-slate-400">第 {card.version.version_number} 版</span>
        ) : null}
      </div>

      <OrganizationGraph spec={card.draft.spec} />

      {card.error ? (
        <div className="mt-3">
          <InlineError error={card.error} />
        </div>
      ) : null}

      {card.phase !== 'superseded' ? (
        <div className="mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-3">
          {card.phase === 'draft' || card.phase === 'confirming' ? (
            <>
              <span className="mr-auto text-xs text-slate-400">
                需要调整？直接在下方输入修改意见。
              </span>
              <button
                type="button"
                onClick={() => onConfirm(card.id)}
                disabled={busy}
                className={`${actionButton} bg-gradient-to-r from-indigo-600 to-blue-600 shadow-indigo-200 hover:from-indigo-700 hover:to-blue-700 focus-visible:ring-indigo-500/20`}
              >
                {card.phase === 'confirming' ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Check className="h-4 w-4" aria-hidden="true" />
                )}
                确认方案
              </button>
            </>
          ) : null}

          {card.phase === 'confirmed' || card.phase === 'publishing' ? (
            <button
              type="button"
              onClick={() => onPublish(card.id)}
              disabled={busy}
              className={`${actionButton} bg-gradient-to-r from-emerald-600 to-teal-600 shadow-emerald-200 hover:from-emerald-700 hover:to-teal-700 focus-visible:ring-emerald-500/20`}
            >
              {card.phase === 'publishing' ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              )}
              发布组织
            </button>
          ) : null}

          {card.phase === 'published' && card.version ? (
            <Link
              to={`/orgs/${card.version.organization_id}`}
              className={`${actionButton} bg-gradient-to-r from-indigo-600 to-blue-600 shadow-indigo-200 hover:from-indigo-700 hover:to-blue-700 focus-visible:ring-indigo-500/20`}
            >
              进入组织详情
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function AssistantAvatar() {
  return (
    <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-indigo-200/50 bg-gradient-to-br from-indigo-100 to-blue-100 shadow-sm">
      <Sparkles className="h-4 w-4 text-indigo-600" aria-hidden="true" />
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex gap-3" role="status" aria-label="小助理正在输入">
      <AssistantAvatar />
      <div className="flex items-center gap-1 rounded-2xl rounded-tl-sm border border-slate-200/60 bg-white px-4 py-3.5 shadow-sm">
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:0ms]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:150ms]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:300ms]" />
      </div>
    </div>
  );
}
