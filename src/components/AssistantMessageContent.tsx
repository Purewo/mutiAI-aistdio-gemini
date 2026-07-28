import { useState } from 'react';
import type { ReactNode } from 'react';
import {
  AlertTriangle,
  Check,
  Clipboard,
  Download,
  ExternalLink,
  File,
  FileCode2,
  FileText,
  Link2,
  Loader2,
  RefreshCw,
  Users,
  Workflow,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { Link } from 'react-router-dom';
import {
  getAssistantAttachmentContentUrl,
  getTask,
  listOrganizationVersions,
} from '../api/endpoints';
import { resolveBackendUrl } from '../api/http';
import { describeApiError } from '../api/errors';
import type {
  AssistantContentBlock,
  AssistantMessage,
  OrganizationDiagramSource,
  TaskPlanDiagramSource,
} from '../api/types';
import { useApiResource } from '../api/useApiResource';
import { formatBytes } from '../lib/format';
import OrganizationGraph from './OrganizationGraph';
import PlanGraph from './PlanGraph';

const SUPPORTED_CONTENT_SCHEMA_VERSIONS = new Set(['1.0', '1.1']);

/**
 * Render the backend-owned assistant content contract.
 *
 * `content_blocks` is authoritative. `message.text` is used only when the schema version is not
 * supported or a legacy message has no blocks; the frontend never parses it to reconstruct blocks.
 */
export default function AssistantMessageContent({
  message,
  inverted = false,
}: {
  message: AssistantMessage;
  inverted?: boolean;
}) {
  const supported = SUPPORTED_CONTENT_SCHEMA_VERSIONS.has(message.content_schema_version);
  const blocks = supported ? message.content_blocks : [];

  if (blocks.length === 0) {
    return (
      <div className="space-y-2">
        {!supported ? (
          <p
            className={`text-[11px] font-medium ${inverted ? 'text-indigo-100' : 'text-amber-700'}`}
          >
            内容版本 {message.content_schema_version} 暂未支持，已显示纯文本降级内容。
          </p>
        ) : null}
        <PlainText text={message.text} inverted={inverted} />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {blocks.map((block, index) => (
        <ContentBlock
          key={`${message.message_id}:${index}`}
          block={block}
          conversationId={message.conversation_id}
          inverted={inverted}
        />
      ))}
    </div>
  );
}

function ContentBlock({
  block,
  conversationId,
  inverted,
}: {
  block: AssistantContentBlock;
  conversationId: string;
  inverted: boolean;
}) {
  switch (block.type) {
    case 'text':
      return <PlainText text={block.text} inverted={inverted} />;
    case 'markdown':
      return <MarkdownBlock text={block.text} truncated={block.truncated} inverted={inverted} />;
    case 'code':
      return <CodeBlock block={block} />;
    case 'error':
      return <ErrorBlock block={block} />;
    case 'attachment':
      return <AttachmentBlock block={block} conversationId={conversationId} inverted={inverted} />;
    case 'resource_ref':
      return <ResourceReferenceBlock block={block} inverted={inverted} />;
    case 'diagram':
      return <DiagramBlock block={block} />;
    case 'html_report':
      return <HtmlReportBlock block={block} />;
    default: {
      // A future backend schema can reach an older deployed bundle before it is refreshed. Every
      // block is required to carry `text`, so degrade without guessing its shape.
      const futureBlock = block as { text?: string };
      return <PlainText text={futureBlock.text ?? '暂不支持的内容块'} inverted={inverted} />;
    }
  }
}

function PlainText({ text, inverted }: { text: string; inverted: boolean }) {
  return (
    <p className={`whitespace-pre-wrap break-words ${inverted ? 'text-white' : 'text-slate-700'}`}>
      {text}
    </p>
  );
}

function MarkdownBlock({
  text,
  truncated,
  inverted,
}: {
  text: string;
  truncated: boolean;
  inverted: boolean;
}) {
  const prose = inverted ? 'text-white' : 'text-slate-700';
  return (
    <div className={`min-w-0 break-words ${prose}`}>
      <ReactMarkdown
        skipHtml
        components={{
          p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
          h1: ({ children }) => <h3 className="mb-2 mt-3 text-base font-bold first:mt-0">{children}</h3>,
          h2: ({ children }) => <h3 className="mb-2 mt-3 text-sm font-bold first:mt-0">{children}</h3>,
          h3: ({ children }) => <h4 className="mb-1.5 mt-3 text-sm font-semibold first:mt-0">{children}</h4>,
          ul: ({ children }) => <ul className="mb-2 list-disc space-y-1 pl-5 last:mb-0">{children}</ul>,
          ol: ({ children }) => <ol className="mb-2 list-decimal space-y-1 pl-5 last:mb-0">{children}</ol>,
          blockquote: ({ children }) => (
            <blockquote
              className={`my-2 border-l-2 pl-3 ${inverted ? 'border-white/40 text-indigo-50' : 'border-indigo-200 text-slate-600'}`}
            >
              {children}
            </blockquote>
          ),
          pre: ({ children }) => (
            <pre className="my-2 max-h-80 overflow-auto rounded-xl bg-slate-950 p-3 text-xs leading-relaxed text-slate-100 shadow-inner">
              {children}
            </pre>
          ),
          code: ({ children, className }) => (
            <code
              className={
                className
                  ? className
                  : `rounded px-1 py-0.5 font-mono text-[0.9em] ${
                      inverted ? 'bg-white/15 text-white' : 'bg-slate-100 text-indigo-700'
                    }`
              }
            >
              {children}
            </code>
          ),
          a: ({ children, href }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className={`font-medium underline decoration-1 underline-offset-2 ${
                inverted ? 'text-white decoration-white/50' : 'text-indigo-700 decoration-indigo-300'
              }`}
            >
              {children}
            </a>
          ),
        }}
      >
        {text}
      </ReactMarkdown>
      {truncated ? <TruncatedNote inverted={inverted} /> : null}
    </div>
  );
}

function CodeBlock({
  block,
}: {
  block: Extract<AssistantContentBlock, { type: 'code' }>;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(block.text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-700 bg-slate-950 shadow-sm">
      <header className="flex items-center gap-2 border-b border-white/10 bg-white/[0.04] px-3 py-2 text-[11px] text-slate-300">
        <FileCode2 className="h-3.5 w-3.5 text-sky-300" aria-hidden="true" />
        <span className="font-mono font-semibold text-sky-200">{block.language || 'text'}</span>
        {block.file_name ? <span className="min-w-0 truncate text-slate-400">{block.file_name}</span> : null}
        <button
          type="button"
          onClick={() => void copy()}
          className="ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-1 font-semibold text-slate-300 transition-colors hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
        >
          {copied ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Clipboard className="h-3.5 w-3.5" aria-hidden="true" />}
          {copied ? '已复制' : '复制'}
        </button>
      </header>
      <pre className="max-h-96 overflow-auto p-4 text-xs leading-relaxed text-slate-100">
        <code>{block.text}</code>
      </pre>
      {block.truncated ? (
        <p className="border-t border-white/10 px-3 py-2 text-[11px] text-amber-200">内容已由后端截断</p>
      ) : null}
    </section>
  );
}

function ErrorBlock({
  block,
}: {
  block: Extract<AssistantContentBlock, { type: 'error' }>;
}) {
  return (
    <section role="alert" className="rounded-2xl border border-red-200 bg-red-50/90 p-3.5 text-red-800">
      <div className="flex items-start gap-2.5">
        <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-500" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{block.text}</p>
          <p className="mt-1 font-mono text-[11px] font-semibold text-red-600">{block.code}</p>
          {block.details != null ? (
            <pre className="mt-2 max-h-44 overflow-auto rounded-lg border border-red-200/70 bg-white/70 p-2 text-[11px] leading-relaxed text-red-700">
              {typeof block.details === 'string'
                ? block.details
                : JSON.stringify(block.details, null, 2)}
            </pre>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function AttachmentBlock({
  block,
  conversationId,
  inverted,
}: {
  block: Extract<AssistantContentBlock, { type: 'attachment' }>;
  conversationId: string;
  inverted: boolean;
}) {
  const previewUrl = getAssistantAttachmentContentUrl(conversationId, block.attachment_id);
  const downloadUrl = getAssistantAttachmentContentUrl(conversationId, block.attachment_id, true);
  return (
    <section
      className={`rounded-2xl border p-3 ${
        inverted ? 'border-white/20 bg-white/10 text-white' : 'border-slate-200 bg-slate-50/90 text-slate-700'
      }`}
    >
      <div className="flex min-w-0 items-center gap-3">
        <div
          className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border ${
            inverted ? 'border-white/20 bg-white/10' : 'border-slate-200 bg-white text-indigo-600'
          }`}
        >
          <File className="h-5 w-5" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold" title={block.file_name}>{block.file_name}</p>
          <p className={`truncate text-[11px] ${inverted ? 'text-indigo-100' : 'text-slate-500'}`}>
            {block.media_type} · {formatBytes(block.byte_size)} · SHA-256 {block.sha256.slice(0, 10)}…
          </p>
        </div>
        <a
          href={previewUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-semibold transition-colors hover:bg-black/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-current"
        >
          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          预览
        </a>
        <a
          href={downloadUrl}
          className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-semibold transition-colors hover:bg-black/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-current"
        >
          <Download className="h-3.5 w-3.5" aria-hidden="true" />
          下载
        </a>
      </div>
    </section>
  );
}

function HtmlReportBlock({
  block,
}: {
  block: Extract<AssistantContentBlock, { type: 'html_report' }>;
}) {
  const [previewFailed, setPreviewFailed] = useState(false);
  const previewUrl = resolveBackendUrl(block.preview_url);
  const downloadUrl = resolveBackendUrl(block.download_url);
  const previewAvailable = block.preview_status === 'available' && !previewFailed;

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <header className="flex flex-wrap items-start gap-3 border-b border-slate-200 bg-slate-50/80 px-4 py-3">
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border border-indigo-100 bg-indigo-50 text-indigo-600">
          <FileText className="h-4 w-4" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-800">{block.title}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{block.text}</p>
        </div>
        <div className="flex items-center gap-1.5">
          <Link
            to={`/tasks/${encodeURIComponent(block.source.task_id)}`}
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-indigo-700 transition-colors hover:bg-indigo-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-indigo-500/15"
          >
            查看任务
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
          <a
            href={downloadUrl}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-100 focus:outline-none focus-visible:ring-4 focus-visible:ring-indigo-500/15"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            下载报告
          </a>
        </div>
      </header>

      <div className="border-b border-slate-200 px-4 py-2 text-[11px] text-slate-400">
        <span>{block.media_type}</span>
        <span className="mx-1.5">·</span>
        <span>{formatBytes(block.byte_size)}</span>
        <span className="mx-1.5">·</span>
        <span className="font-mono" title={block.sha256}>SHA-256 {block.sha256.slice(0, 12)}…</span>
      </div>

      {block.preview_status === 'too_large' ? (
        <ReportFallback message="报告超过在线预览大小限制，请下载后查看。" />
      ) : previewAvailable ? (
        <div className="bg-slate-100 p-3">
          <iframe
            key={previewUrl}
            src={previewUrl}
            title={block.title}
            sandbox=""
            referrerPolicy="no-referrer"
            loading="lazy"
            onError={() => setPreviewFailed(true)}
            className="h-[420px] w-full rounded-xl border border-slate-200 bg-white shadow-inner"
          />
          <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
            这是后端校验后的静态报告预览，脚本、外部资源和交互能力均已禁用。
          </p>
        </div>
      ) : (
        <ReportFallback message="报告预览暂时不可用，请下载原始报告。" onRetry={() => setPreviewFailed(false)} />
      )}
    </section>
  );
}

function ReportFallback({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2 bg-amber-50 px-4 py-5 text-sm text-amber-800">
      <AlertTriangle className="h-4 w-4 flex-shrink-0 text-amber-600" aria-hidden="true" />
      <span className="min-w-0 flex-1">{message}</span>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="rounded-lg px-2 py-1 text-xs font-semibold hover:bg-amber-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/30"
        >
          重试
        </button>
      ) : null}
    </div>
  );
}

function ResourceReferenceBlock({
  block,
  inverted,
}: {
  block: Extract<AssistantContentBlock, { type: 'resource_ref' }>;
  inverted: boolean;
}) {
  const href = resourceHref(block);
  const body = (
    <div className="flex min-w-0 items-center gap-3">
      <div
        className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border ${
          inverted ? 'border-white/20 bg-white/10' : 'border-indigo-100 bg-indigo-50 text-indigo-600'
        }`}
      >
        <Link2 className="h-4 w-4" aria-hidden="true" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{block.label}</p>
        <p className={`truncate font-mono text-[10px] ${inverted ? 'text-indigo-100' : 'text-slate-400'}`}>
          {block.resource_type} · {block.resource_id}
        </p>
      </div>
      {href ? <ExternalLink className="h-4 w-4 flex-shrink-0 opacity-60" aria-hidden="true" /> : null}
    </div>
  );

  const classes = `block rounded-2xl border p-3 transition-colors ${
    inverted
      ? 'border-white/20 bg-white/10 text-white hover:bg-white/15'
      : 'border-indigo-100 bg-white text-slate-700 hover:border-indigo-200 hover:bg-indigo-50/30'
  }`;
  return href ? <Link to={href} className={classes}>{body}</Link> : <div className={classes}>{body}</div>;
}

function resourceHref(block: Extract<AssistantContentBlock, { type: 'resource_ref' }>): string | null {
  if (block.resource_type === 'organization') {
    return `/orgs/${encodeURIComponent(block.resource_id)}`;
  }
  if (
    block.resource_type === 'organization_spec_version' &&
    block.parent?.resource_type === 'organization'
  ) {
    return `/orgs/${encodeURIComponent(block.parent.resource_id)}`;
  }
  if (block.resource_type === 'task') return `/tasks/${encodeURIComponent(block.resource_id)}`;
  if (block.resource_type === 'runtime_binding') return '/runtime';
  return null;
}

function DiagramBlock({
  block,
}: {
  block: Extract<AssistantContentBlock, { type: 'diagram' }>;
}) {
  if (block.template === 'organization_chart' && block.source.kind === 'organization_spec_version') {
    return <OrganizationDiagram source={block.source} fallbackText={block.text} />;
  }
  if (block.template === 'execution_plan' && block.source.kind === 'task_plan') {
    return <ExecutionPlanDiagram source={block.source} fallbackText={block.text} />;
  }
  return <PlainText text={block.text} inverted={false} />;
}

function OrganizationDiagram({
  source,
  fallbackText,
}: {
  source: OrganizationDiagramSource;
  fallbackText: string;
}) {
  const versions = useApiResource(
    (signal) => listOrganizationVersions(source.organization_id, signal),
    [source.organization_id],
  );

  if (versions.state.status === 'loading') {
    return <DiagramLoading label="正在读取组织版本..." icon={<Users className="h-4 w-4" />} />;
  }
  if (versions.state.status === 'error') {
    return <DiagramError message={describeApiError(versions.state.error)} onRetry={versions.reload} />;
  }

  const version = versions.state.data.find((item) => item.spec_version_id === source.spec_version_id);
  if (!version) return <DiagramError message="引用的组织版本不存在或当前用户无权访问。" />;

  return (
    <DiagramFrame
      icon={<Users className="h-4 w-4" />}
      title="组织架构"
      description={fallbackText}
      link={`/orgs/${encodeURIComponent(source.organization_id)}`}
    >
      <OrganizationGraph spec={version.spec} />
    </DiagramFrame>
  );
}

function ExecutionPlanDiagram({
  source,
  fallbackText,
}: {
  source: TaskPlanDiagramSource;
  fallbackText: string;
}) {
  const task = useApiResource((signal) => getTask(source.task_id, signal), [source.task_id]);

  if (task.state.status === 'loading') {
    return <DiagramLoading label="正在读取执行计划..." icon={<Workflow className="h-4 w-4" />} />;
  }
  if (task.state.status === 'error') {
    return <DiagramError message={describeApiError(task.state.error)} onRetry={task.reload} />;
  }

  const plan = task.state.data.execution_plan;
  if (!plan || plan.plan_id !== source.plan_id) {
    return <DiagramError message="引用的执行计划不存在或已经被新版本替代。" />;
  }

  return (
    <DiagramFrame
      icon={<Workflow className="h-4 w-4" />}
      title="执行计划"
      description={fallbackText}
      link={`/tasks/${encodeURIComponent(source.task_id)}`}
    >
      <PlanGraph steps={plan.steps} />
    </DiagramFrame>
  );
}

function DiagramFrame({
  icon,
  title,
  description,
  link,
  children,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  link: string;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50/70 shadow-sm">
      <header className="flex items-start gap-2.5 border-b border-slate-200 bg-white px-4 py-3">
        <span className="mt-0.5 text-indigo-600">{icon}</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-800">{title}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{description}</p>
        </div>
        <Link
          to={link}
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-indigo-700 transition-colors hover:bg-indigo-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/20"
        >
          查看详情
          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </header>
      <div className="overflow-x-auto p-3 sm:p-4">{children}</div>
    </section>
  );
}

function DiagramLoading({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500" role="status">
      <span className="text-indigo-500">{icon}</span>
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      {label}
    </div>
  );
}

function DiagramError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
      <AlertTriangle className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
      <span className="min-w-0 flex-1 break-words">{message}</span>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold hover:bg-amber-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/20"
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          重试
        </button>
      ) : null}
    </div>
  );
}

function TruncatedNote({ inverted }: { inverted: boolean }) {
  return (
    <p className={`mt-2 text-[11px] font-medium ${inverted ? 'text-indigo-100' : 'text-amber-700'}`}>
      内容已由后端截断
    </p>
  );
}
