import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  Archive,
  ArrowLeft,
  Bot,
  CheckCircle2,
  Clock3,
  Download,
  FileText,
  Loader2,
  MessageSquareText,
  Paperclip,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  UserRound,
  XCircle,
} from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import {
  readExpertAttachmentContent,
  revokeExpertAttachment,
  uploadExpertAttachment,
} from '../api/endpoints';
import { apiErrorFromThrown, type ApiError } from '../api/errors';
import type { ExpertAttachment, ExpertMessage, ExpertTurn } from '../api/types';
import ExpertCapabilityPanel, { ExpertSemantics } from '../components/ExpertCapabilityPanel';
import PageHeader from '../components/PageHeader';
import { ErrorState, InlineError, LoadingState, ReconnectBanner } from '../components/states';
import { useExpertConversation } from '../expert/useExpertConversation';
import { formatBytes, formatDateTime } from '../lib/format';

export default function ExpertConversation() {
  const { conversationId = '' } = useParams();
  const trial = useExpertConversation(conversationId);
  const [draft, setDraft] = useState('');
  const [attachments, setAttachments] = useState<ExpertAttachment[]>([]);
  const [attachmentBusy, setAttachmentBusy] = useState(false);
  const [attachmentError, setAttachmentError] = useState<ApiError | null>(null);
  const [archiveBusy, setArchiveBusy] = useState(false);
  const [archiveError, setArchiveError] = useState<ApiError | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [trial.messages, trial.turns, attachments]);

  const turnByMessageId = useMemo(() => {
    const map = new Map<string, ExpertTurn>();
    for (const turn of trial.turns) map.set(turn.source_message_id, turn);
    return map;
  }, [trial.turns]);

  if (trial.status === 'loading') {
    return (
      <div className="flex h-full flex-col bg-[var(--nexwork-page)]">
        <PageHeader title="私有专家试用" />
        <LoadingState label="正在恢复专家会话…" />
      </div>
    );
  }
  if (trial.status === 'error' || !trial.conversation || !trial.version) {
    return (
      <div className="flex h-full flex-col bg-[var(--nexwork-page)]">
        <PageHeader title="私有专家试用" />
        <div className="mobile-scroll-gutter flex-1 overflow-y-auto p-4 sm:p-8">
          <ErrorState
            error={trial.error ?? new Error('Expert conversation was unavailable.')}
            title="专家会话加载失败"
            onRetry={trial.reconnect}
          />
        </div>
      </div>
    );
  }

  const { conversation, version } = trial;
  const capability = version.capability;
  const textMode = capability.text_input_mode;
  const maxFiles = capability.limits?.max_input_files ?? 1;
  const supportedMedia = [
    ...new Set(capability.input_contracts.flatMap((contract) => contract.media_types)),
  ];
  const acceptsFiles = supportedMedia.length > 0 && maxFiles > 0;
  const active = conversation.status === 'active';
  const textValid = textMode === 'unsupported' ? true : draft.trim().length > 0;
  const contentPresent = draft.trim().length > 0 || attachments.length > 0;
  const canSubmit =
    active &&
    !trial.submitting &&
    !attachmentBusy &&
    textValid &&
    contentPresent &&
    (textMode !== 'unsupported' || attachments.length > 0);

  const selectFiles = async (files: FileList | null) => {
    if (!files || files.length === 0 || !acceptsFiles) return;
    setAttachmentBusy(true);
    setAttachmentError(null);
    try {
      const remainingSlots = Math.max(0, maxFiles - attachments.length);
      const selected = [...files].slice(0, remainingSlots);
      for (const file of selected) {
        if (capability.limits?.max_input_bytes && file.size > capability.limits.max_input_bytes) {
          throw new Error(`${file.name} 超过该专家声明的 ${formatBytes(capability.limits.max_input_bytes)} 限制。`);
        }
        const uploaded = await uploadExpertAttachment(conversation.conversation_id, file);
        setAttachments((current) => [...current, uploaded]);
      }
    } catch (cause: unknown) {
      setAttachmentError(apiErrorFromThrown(cause));
    } finally {
      setAttachmentBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const revoke = async (attachment: ExpertAttachment) => {
    setAttachmentBusy(true);
    setAttachmentError(null);
    try {
      await revokeExpertAttachment(conversation.conversation_id, attachment.attachment_id);
      setAttachments((current) => current.filter((item) => item.attachment_id !== attachment.attachment_id));
    } catch (cause: unknown) {
      setAttachmentError(apiErrorFromThrown(cause));
    } finally {
      setAttachmentBusy(false);
    }
  };

  const submit = async () => {
    if (!canSubmit) return;
    const submission = await trial.submit(
      textMode === 'unsupported' ? '' : draft.trim(),
      attachments.map((item) => item.attachment_id),
    );
    if (submission) {
      setDraft('');
      setAttachments([]);
    }
  };

  const archive = async () => {
    setArchiveBusy(true);
    setArchiveError(null);
    try {
      await trial.archive();
    } catch (cause: unknown) {
      setArchiveError(apiErrorFromThrown(cause));
    } finally {
      setArchiveBusy(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--nexwork-page)]">
      <PageHeader
        title={version.display_name}
        description={`私有试用 · 固定版本 ${version.version_number} · ${providerLabel(version.provider)}`}
        actions={
          <div className="flex w-full gap-2 sm:w-auto">
            <Link
              to="/experts"
              className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-slate-500/15 sm:flex-none"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              专家市场
            </Link>
            {active ? (
              <button
                type="button"
                onClick={() => void archive()}
                disabled={archiveBusy}
                className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-600 shadow-sm transition hover:border-red-200 hover:bg-red-50 hover:text-red-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-red-500/15 disabled:opacity-50 sm:flex-none"
              >
                {archiveBusy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Archive className="h-4 w-4" aria-hidden="true" />}
                归档
              </button>
            ) : null}
          </div>
        }
      />

      <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section className="flex min-h-0 min-w-0 flex-col border-r border-slate-200/70 bg-white/60">
          <div ref={scrollRef} className="mobile-scroll-gutter flex-1 overflow-y-auto px-3 py-4 sm:px-6 sm:py-6">
            <div className="mx-auto max-w-3xl space-y-4">
              <section className="relative overflow-hidden rounded-2xl bg-slate-950 px-4 py-5 text-white shadow-lg shadow-slate-900/10 sm:px-5">
                <div className="absolute -right-10 -top-16 h-40 w-40 rounded-full bg-cyan-400/20 blur-3xl" aria-hidden="true" />
                <div className="relative flex items-start gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.07] text-cyan-300">
                    <Sparkles className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-black">试用边界已锁定到 ExpertVersion {version.version_number}</p>
                    <p className="mt-1 text-xs leading-6 text-slate-300">
                      这里不会创建 Task、正式岗位 Workspace 或发布 Artifact。若要采用该专家，请回到平台小助理，由小助理生成带版本来源的组织方案并等待您确认。
                    </p>
                  </div>
                </div>
              </section>

              <ExpertSemantics interactionMode={version.interaction_mode} capability={capability} />
              <ReconnectBanner
                status={trial.connection}
                onReconnect={trial.reconnect}
                closedText="当前专家事件已同步，等待下一次试用提交。"
              />
              {archiveError ? <InlineError error={archiveError} /> : null}

              {trial.messages.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-5 py-10 text-center shadow-sm">
                  <Bot className="mx-auto h-9 w-9 text-cyan-700" aria-hidden="true" />
                  <h2 className="mt-3 text-base font-black text-slate-900">准备好验证这个专家</h2>
                  <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
                    {textMode === 'unsupported'
                      ? `请上传 ${supportedMedia.join('、') || '声明支持的'} 文件。该专家不会读取附带文字。`
                      : textMode === 'required'
                        ? '请输入一个边界明确的问题；附件只有在能力 Contract 支持时才可发送。'
                        : '可以输入问题、上传附件，或两者一起提交。'}
                  </p>
                </div>
              ) : null}

              {trial.messages.map((message) => (
                <MessageRow
                  key={message.message_id}
                  message={message}
                  turn={turnByMessageId.get(message.message_id) ?? null}
                  conversationId={conversation.conversation_id}
                />
              ))}
            </div>
          </div>

          <div className="shrink-0 border-t border-slate-200/80 bg-white/95 px-3 py-3 backdrop-blur sm:px-6 sm:py-4">
            <div className="mx-auto max-w-3xl space-y-2.5">
              {conversation.status === 'archived' ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-center text-sm text-slate-600">
                  此私有试用已归档，可继续查看历史，但不能发送新请求。
                </div>
              ) : (
                <>
                  {attachments.length > 0 ? (
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {attachments.map((attachment) => (
                        <div key={attachment.attachment_id} className="flex min-h-11 min-w-0 shrink-0 items-center gap-2 rounded-xl border border-cyan-200 bg-cyan-50 px-3 text-xs text-cyan-900">
                          <FileText className="h-4 w-4 shrink-0" aria-hidden="true" />
                          <span className="max-w-44 truncate font-semibold">{attachment.file_name}</span>
                          <span className="text-cyan-700/70">{formatBytes(attachment.byte_size)}</span>
                          <button
                            type="button"
                            onClick={() => void revoke(attachment)}
                            disabled={attachmentBusy}
                            aria-label={`移除 ${attachment.file_name}`}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-cyan-800 transition hover:bg-cyan-100 focus:outline-none focus-visible:ring-4 focus-visible:ring-cyan-500/15 disabled:opacity-50"
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {attachmentError ? <InlineError error={attachmentError} /> : null}
                  {trial.submitError ? <InlineError error={trial.submitError} /> : null}

                  <div className="flex items-end gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-lg shadow-slate-900/5 focus-within:border-cyan-400 focus-within:ring-4 focus-within:ring-cyan-500/10">
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple={maxFiles > 1}
                      accept={supportedMedia.join(',') || undefined}
                      onChange={(event) => void selectFiles(event.target.files)}
                      className="sr-only"
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={!acceptsFiles || attachmentBusy || attachments.length >= maxFiles}
                      aria-label="上传试用附件"
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-cyan-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-cyan-500/15 disabled:cursor-not-allowed disabled:opacity-35"
                    >
                      {attachmentBusy ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : <Paperclip className="h-5 w-5" aria-hidden="true" />}
                    </button>
                    <textarea
                      value={textMode === 'unsupported' ? '' : draft}
                      onChange={(event) => setDraft(event.target.value)}
                      disabled={textMode === 'unsupported'}
                      rows={1}
                      maxLength={10000}
                      placeholder={
                        textMode === 'unsupported'
                          ? '该专家不接收文字；请上传附件'
                          : textMode === 'required'
                            ? '输入需要专家处理的问题…'
                            : '输入说明，或只提交附件…'
                      }
                      className="expert-trial-textarea min-h-11 max-h-32 min-w-0 flex-1 resize-y rounded-xl border-0 bg-transparent px-2 py-2.5 text-sm leading-6 text-slate-900 outline-none placeholder:text-slate-400 disabled:cursor-not-allowed disabled:bg-amber-50/70 disabled:px-3 disabled:text-amber-800"
                    />
                    <button
                      type="button"
                      onClick={() => void submit()}
                      disabled={!canSubmit}
                      aria-label="发送给专家"
                      className="expert-trial-submit flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white shadow-lg shadow-slate-900/15 transition hover:bg-cyan-800 focus:outline-none focus-visible:ring-4 focus-visible:ring-cyan-500/20 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
                    >
                      {trial.submitting ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : <Send className="h-5 w-5" aria-hidden="true" />}
                    </button>
                  </div>
                  <div className="flex flex-col gap-1 px-1 text-[11px] text-slate-400 sm:flex-row sm:items-center sm:justify-between">
                    <span>
                      {textMode === 'unsupported'
                        ? '发送时 text 固定为空字符串；每个附件是一次独立请求。'
                        : `文字输入：${textMode === 'required' ? '必需' : '可选'}。`}
                    </span>
                    <span>
                      {acceptsFiles
                        ? `附件 ${attachments.length}/${maxFiles} · ${supportedMedia.join('、')}`
                        : '该版本未声明附件输入'}
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>
        </section>

        <aside className="mobile-scroll-gutter hidden overflow-y-auto bg-slate-100/70 p-4 lg:block">
          <ExpertCapabilityPanel
            capability={capability}
            interactionMode={version.interaction_mode}
            compact
          />
          <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="flex items-center gap-2 text-xs font-bold text-slate-700">
              <ShieldCheck className="h-4 w-4 text-emerald-600" aria-hidden="true" />
              试用隔离
            </p>
            <ul className="mt-3 space-y-2 text-xs leading-5 text-slate-600">
              <li>不会创建 Task 或 RuntimeExecution 产品记录。</li>
              <li>附件只进入当前私有试用，不会自动成为 Task Artifact。</li>
              <li>正式组织使用新的岗位执行环境，不复用试用 Workspace。</li>
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}

function MessageRow({
  message,
  turn,
  conversationId,
}: {
  message: ExpertMessage;
  turn: ExpertTurn | null;
  conversationId: string;
}) {
  const user = message.role === 'user';
  const text = message.text.trim();
  const structured = !user ? parseStructuredText(text) : null;
  return (
    <div className={`flex gap-3 ${user ? 'justify-end' : 'justify-start'}`}>
      {!user ? (
        <span className="mt-1 hidden h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-slate-900 text-cyan-300 sm:flex">
          <Bot className="h-4 w-4" aria-hidden="true" />
        </span>
      ) : null}
      <div className={`min-w-0 max-w-[92%] sm:max-w-[82%] ${user ? 'items-end' : 'items-start'} flex flex-col`}>
        <div
          className={`min-w-0 rounded-2xl px-4 py-3 text-sm leading-7 shadow-sm ${
            user
              ? 'rounded-tr-sm bg-slate-900 text-white'
              : 'rounded-tl-sm border border-slate-200 bg-white text-slate-700'
          }`}
        >
          {text.length > 0 && !structured ? <p className="whitespace-pre-wrap break-words">{text}</p> : null}
          {structured ? <StructuredResult value={structured} /> : null}
          {text.length === 0 && message.attachment_refs.length > 0 ? (
            <p className={user ? 'text-slate-300' : 'text-slate-500'}>已提交附件，未附带文字。</p>
          ) : null}
          {message.attachment_refs.length > 0 ? (
            <div className="mt-3 space-y-2 border-t border-current/10 pt-3">
              {message.attachment_refs.map((ref, index) => (
                <MessageAttachment
                  key={attachmentRefString(ref, 'attachment_id') ?? `${message.message_id}-${index}`}
                  refValue={ref}
                  conversationId={conversationId}
                  userTone={user}
                />
              ))}
            </div>
          ) : null}
        </div>
        <p className="mt-1 px-1 text-[10px] text-slate-400">
          {user ? '您' : '专家'} · {formatDateTime(message.created_at)}
        </p>
        {turn ? <TurnStatus turn={turn} /> : null}
      </div>
      {user ? (
        <span className="mt-1 hidden h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-cyan-100 text-cyan-800 sm:flex">
          <UserRound className="h-4 w-4" aria-hidden="true" />
        </span>
      ) : null}
    </div>
  );
}

function TurnStatus({ turn }: { turn: ExpertTurn }) {
  const terminal = turn.status === 'completed' || turn.status === 'failed' || turn.status === 'cancelled';
  const failed = turn.status === 'failed';
  return (
    <div
      className={`mt-2 w-full rounded-xl border px-3 py-2 text-xs ${
        failed
          ? 'border-red-200 bg-red-50 text-red-700'
          : terminal
            ? 'border-emerald-100 bg-emerald-50 text-emerald-700'
            : 'border-cyan-100 bg-cyan-50 text-cyan-800'
      }`}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="flex items-center gap-1.5 font-bold">
          {failed ? (
            <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
          ) : terminal ? (
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          )}
          {turnStatusLabel(turn.status)}
        </span>
        {turn.total_tokens !== null ? (
          <span className="flex items-center gap-1">
            <Activity className="h-3.5 w-3.5" aria-hidden="true" />
            {turn.total_tokens.toLocaleString()} Tokens
          </span>
        ) : (
          <span>用量 {turn.usage_status === 'available' ? '已记录' : '暂不可用'}</span>
        )}
        {turn.completed_at ? (
          <span className="flex items-center gap-1">
            <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
            {formatDateTime(turn.completed_at)}
          </span>
        ) : null}
      </div>
      {failed && turn.failure_message ? (
        <p className="mt-1.5 break-words leading-5">
          {turn.failure_message}
          {turn.failure_code ? <span className="ml-1 font-mono text-[10px]">{turn.failure_code}</span> : null}
        </p>
      ) : null}
    </div>
  );
}

function MessageAttachment({
  refValue,
  conversationId,
  userTone,
}: {
  refValue: Record<string, unknown>;
  conversationId: string;
  userTone: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const attachmentId = attachmentRefString(refValue, 'attachment_id');
  const fileName = attachmentRefString(refValue, 'file_name') ?? '试用附件';
  const mediaType = attachmentRefString(refValue, 'media_type') ?? 'application/octet-stream';
  const byteSize = typeof refValue.byte_size === 'number' ? refValue.byte_size : null;

  const open = async (download: boolean) => {
    if (!attachmentId) return;
    setBusy(true);
    setError(null);
    try {
      const blob = await readExpertAttachmentContent(conversationId, attachmentId, download);
      const objectUrl = URL.createObjectURL(blob);
      if (download) {
        const anchor = document.createElement('a');
        anchor.href = objectUrl;
        anchor.download = fileName;
        anchor.click();
      } else {
        window.open(objectUrl, '_blank', 'noopener,noreferrer');
      }
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
    } catch (cause: unknown) {
      setError(apiErrorFromThrown(cause).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`rounded-xl border px-3 py-2 ${userTone ? 'border-white/15 bg-white/10' : 'border-slate-200 bg-slate-50'}`}>
      <div className="flex min-w-0 items-center gap-2">
        <FileText className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate text-xs font-semibold">{fileName}</span>
        {byteSize !== null ? <span className="shrink-0 text-[10px] opacity-70">{formatBytes(byteSize)}</span> : null}
        <button
          type="button"
          onClick={() => void open(false)}
          disabled={busy || !attachmentId}
          className="flex h-11 min-w-11 items-center justify-center rounded-lg px-2 text-[10px] font-semibold transition hover:bg-black/5 focus:outline-none focus-visible:ring-4 focus-visible:ring-cyan-500/15 disabled:opacity-40"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Upload className="h-3.5 w-3.5" aria-hidden="true" />}
          <span className="sr-only">预览 {fileName}</span>
        </button>
        <button
          type="button"
          onClick={() => void open(true)}
          disabled={busy || !attachmentId}
          className="flex h-11 min-w-11 items-center justify-center rounded-lg px-2 transition hover:bg-black/5 focus:outline-none focus-visible:ring-4 focus-visible:ring-cyan-500/15 disabled:opacity-40"
          aria-label={`下载 ${fileName}`}
        >
          <Download className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
      <p className="mt-1 truncate font-mono text-[9px] opacity-60">{mediaType}</p>
      {error ? <p className="mt-1 text-[10px] text-red-500">{error}</p> : null}
    </div>
  );
}

function StructuredResult({ value }: { value: Record<string, unknown> }) {
  return (
    <div className="space-y-2">
      <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-cyan-700">
        <MessageSquareText className="h-4 w-4" aria-hidden="true" />
        结构化结果
      </p>
      <dl className="grid gap-2 sm:grid-cols-2">
        {Object.entries(value).map(([key, item]) => (
          <div key={key} className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
            <dt className="break-all font-mono text-[10px] uppercase tracking-wide text-slate-400">{key}</dt>
            <dd className="mt-1 break-words text-xs font-semibold leading-5 text-slate-700">
              {typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean'
                ? String(item)
                : JSON.stringify(item)}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function parseStructuredText(text: string): Record<string, unknown> | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return null;
  try {
    const value = JSON.parse(trimmed) as unknown;
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function attachmentRefString(ref: Record<string, unknown>, key: string): string | null {
  const value = ref[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function turnStatusLabel(status: ExpertTurn['status']): string {
  return {
    queued: '排队中',
    submitted: '已提交 Provider',
    running: '执行中',
    waiting: '等待 Provider',
    completed: '已完成',
    failed: '执行失败',
    cancelled: '已取消',
  }[status];
}

function providerLabel(provider: string): string {
  return provider === 'codex' ? 'Codex' : provider === 'dify' ? 'Dify' : provider;
}
