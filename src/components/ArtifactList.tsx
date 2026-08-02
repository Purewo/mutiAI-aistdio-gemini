/**
 * Released Task Artifacts.
 *
 * Access uses only backend-issued URLs (`content_url`, `download_url`). `storage_relative_path` is a
 * host filesystem detail and is never displayed or used to construct a location. A 409 means the
 * Artifact failed its integrity check or is not released; that renders as an unavailable result,
 * never as a reason to read the filesystem directly.
 */
import { useState } from 'react';
import { Download, Eye, FileText, Loader2, ShieldAlert } from 'lucide-react';
import { fetchArtifactContent, resolveBackendUrl } from '../api/http';
import { apiErrorFromThrown, describeApiError } from '../api/errors';
import type { Artifact, ArtifactStatus } from '../api/types';
import { formatDateTime } from '../lib/format';

const STATUS_PRESENTATION: Record<ArtifactStatus, { label: string; tone: string }> = {
  draft: { label: '草稿', tone: 'border-slate-200 bg-slate-50 text-slate-600' },
  validated: { label: '已校验', tone: 'border-blue-200 bg-blue-50 text-blue-700' },
  released: { label: '已发布', tone: 'border-emerald-200/60 bg-emerald-50 text-emerald-700' },
  rejected: { label: '已拒绝', tone: 'border-red-200 bg-red-50 text-red-700' },
  superseded: { label: '已被取代', tone: 'border-slate-300 bg-slate-100 text-slate-500' },
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Media types the browser can render inline as text in this preview. */
function isTextPreviewable(mediaType: string): boolean {
  return (
    mediaType.startsWith('text/') ||
    mediaType === 'application/json' ||
    mediaType.endsWith('+json')
  );
}

function ArtifactRow({
  artifact,
  replayNumberById,
}: {
  artifact: Artifact;
  replayNumberById?: ReadonlyMap<string, number>;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const status = STATUS_PRESENTATION[artifact.status] ?? {
    label: artifact.status,
    tone: 'border-slate-200 bg-slate-50 text-slate-600',
  };
  const previewable = isTextPreviewable(artifact.media_type);
  const contentAvailable = artifact.status === 'released';

  const loadPreview = async () => {
    if (preview !== null) {
      setPreview(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const content = await fetchArtifactContent(artifact.content_url);
      const text = await content.blob.text();
      // Pretty-print JSON so a released deliverable is readable rather than one long line.
      try {
        setPreview(JSON.stringify(JSON.parse(text), null, 2));
      } catch {
        setPreview(text);
      }
    } catch (cause) {
      const apiError = apiErrorFromThrown(cause);
      setError(
        apiError.isConflict
          ? `结果当前不可用：${describeApiError(apiError)}`
          : describeApiError(apiError),
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <li className="rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <FileText className="h-4 w-4 flex-shrink-0 text-slate-400" aria-hidden="true" />
        <span className="min-w-0 break-all text-sm font-semibold text-slate-800">{artifact.file_name}</span>
        <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${status.tone}`}>
          {status.label}
        </span>
        <span className="max-w-full break-all rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-[10px] text-slate-500 sm:truncate">
          {artifact.contract_key}
        </span>

        <div className="flex w-full items-center justify-end gap-1.5 sm:ml-auto sm:w-auto">
          {contentAvailable && previewable ? (
            <button
              type="button"
              onClick={loadPreview}
              disabled={loading}
              className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-indigo-500/15 disabled:cursor-not-allowed disabled:opacity-60 sm:flex-none"
            >
              {loading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <Eye className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              {preview === null ? '预览' : '收起'}
            </button>
          ) : null}
          {contentAvailable ? (
            /* Download goes through the backend-issued URL; the browser handles the transfer. */
            <a
              href={resolveBackendUrl(artifact.download_url)}
              className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-indigo-500/15 sm:flex-none"
            >
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              下载
            </a>
          ) : (
            <span className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 sm:flex-none">
              <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
              仅审计
            </span>
          )}
        </div>
      </div>

      <dl className="mt-2 flex flex-wrap gap-x-6 gap-y-0.5 text-[11px] text-slate-400">
        <div className="flex gap-1">
          <dt>类型</dt>
          <dd className="font-mono">{artifact.media_type}</dd>
        </div>
        <div className="flex gap-1">
          <dt>大小</dt>
          <dd>{formatBytes(artifact.byte_size)}</dd>
        </div>
        <div className="flex gap-1">
          <dt>版本</dt>
          <dd>v{artifact.artifact_version}</dd>
        </div>
        <div className="flex gap-1">
          <dt>来源</dt>
          <dd>{artifact.origin}</dd>
        </div>
        {artifact.replay_run_id && replayNumberById?.has(artifact.replay_run_id) ? (
          <div className="flex gap-1">
            <dt>重放血缘</dt>
            <dd>第 {replayNumberById.get(artifact.replay_run_id)} 次</dd>
          </div>
        ) : null}
        {artifact.released_at ? (
          <div className="flex gap-1">
            <dt>发布于</dt>
            <dd>{formatDateTime(artifact.released_at)}</dd>
          </div>
        ) : null}
      </dl>

      {artifact.validation_summary ? (
        <p className="mt-2 text-xs leading-relaxed text-slate-500">
          校验：{artifact.validation_summary}
        </p>
      ) : null}

      {artifact.status === 'rejected' ? (
        <p className="mt-2 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-xs leading-5 text-red-700">
          该候选产物未通过产品校验，仅作为不可变失败证据保留；后续成功交付会生成新的已发布版本。
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="mt-2 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-sm leading-relaxed text-red-700">
          {error}
        </p>
      ) : null}

      {preview !== null ? (
        <pre className="mt-2 max-h-80 overflow-auto rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs leading-relaxed text-slate-600">
          {preview}
        </pre>
      ) : null}
    </li>
  );
}

export default function ArtifactList({
  artifacts,
  replayNumberById,
}: {
  artifacts: readonly Artifact[];
  replayNumberById?: ReadonlyMap<string, number>;
}) {
  return (
    <ul className="space-y-3">
      {artifacts.map((artifact) => (
        <ArtifactRow key={artifact.artifact_id} artifact={artifact} replayNumberById={replayNumberById} />
      ))}
    </ul>
  );
}
