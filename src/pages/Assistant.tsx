import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Loader2, Sparkles } from 'lucide-react';
import {
  confirmOrganizationVersion,
  createOrganizationProposal,
  publishOrganizationVersion,
} from '../api/endpoints';
import { apiErrorFromThrown, type ApiError } from '../api/errors';
import type { OrganizationVersion } from '../api/types';
import OrganizationGraph from '../components/OrganizationGraph';
import OrganizationSpecForm, { type ProposalDraft } from '../components/OrganizationSpecForm';
import PageHeader from '../components/PageHeader';
import VersionStatusBadge from '../components/VersionStatusBadge';
import { InlineError } from '../components/states';
import { formatDateTime } from '../lib/format';

/**
 * Preview-first organization design flow.
 *
 * One submission creates one proposal version; the preview always renders the version the backend
 * returned, never the local draft. Confirm and publish are separate contracted transitions, and the
 * page only ever labels the version with the status the backend reported — a proposal is never
 * presented as published before both transitions complete. Publishing creates no Workspace and no
 * Runtime Thread.
 */

type Flow =
  | { step: 'edit' }
  | { step: 'submitting' }
  | { step: 'review'; version: OrganizationVersion; busy: 'confirm' | 'publish' | null };

export default function Assistant() {
  const [flow, setFlow] = useState<Flow>({ step: 'edit' });
  const [error, setError] = useState<ApiError | null>(null);
  /** Remounts the form after 「再创建一个组织」 so the next draft starts clean. */
  const [formGeneration, setFormGeneration] = useState(0);

  const submitProposal = async (draft: ProposalDraft) => {
    setError(null);
    setFlow({ step: 'submitting' });
    try {
      const version = await createOrganizationProposal({
        source_request: draft.sourceRequest.length > 0 ? draft.sourceRequest : null,
        spec: draft.spec,
      });
      setFlow({ step: 'review', version, busy: null });
    } catch (cause) {
      setError(apiErrorFromThrown(cause));
      // The draft stays mounted underneath, so a rejected submission returns to editing.
      setFlow({ step: 'edit' });
    }
  };

  const runTransition = async (kind: 'confirm' | 'publish') => {
    if (flow.step !== 'review' || flow.busy) return;
    const { version } = flow;
    setError(null);
    setFlow({ step: 'review', version, busy: kind });
    try {
      const next =
        kind === 'confirm'
          ? await confirmOrganizationVersion(version.organization_id, version.spec_version_id)
          : await publishOrganizationVersion(version.organization_id, version.spec_version_id);
      setFlow({ step: 'review', version: next, busy: null });
    } catch (cause) {
      setError(apiErrorFromThrown(cause));
      setFlow({ step: 'review', version, busy: null });
    }
  };

  const startAnother = () => {
    setError(null);
    setFormGeneration((generation) => generation + 1);
    setFlow({ step: 'edit' });
  };

  const editing = flow.step === 'edit' || flow.step === 'submitting';

  return (
    <div className="flex h-full flex-col bg-slate-50/50">
      <PageHeader title="平台小助理" description="设计并发布您的 AI 组织" />

      <div className="flex-1 overflow-y-auto p-6 sm:p-8">
        <div className="mx-auto max-w-5xl space-y-6">
          {/* The draft form stays mounted through review so 「返回修改」 keeps its content. */}
          <section hidden={!editing} className="rounded-3xl border border-slate-200/60 bg-white p-6 shadow-sm sm:p-8">
            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-blue-600 text-white shadow-md shadow-indigo-200">
                <Sparkles className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900">描述您的组织</h2>
                <p className="text-sm text-slate-500">
                  提交后会生成一个待确认的组织方案，确认并发布前不会创建任何组织资源。
                </p>
              </div>
            </div>

            {editing && error ? (
              <div className="mb-5">
                <InlineError error={error} />
              </div>
            ) : null}

            <OrganizationSpecForm
              key={formGeneration}
              disabled={flow.step === 'submitting'}
              onSubmit={submitProposal}
            />
          </section>

          {flow.step === 'review' ? (
            <ReviewPanel
              version={flow.version}
              busy={flow.busy}
              error={error}
              onConfirm={() => runTransition('confirm')}
              onPublish={() => runTransition('publish')}
              onBackToEdit={() => {
                setError(null);
                setFlow({ step: 'edit' });
              }}
              onStartAnother={startAnother}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ReviewPanel({
  version,
  busy,
  error,
  onConfirm,
  onPublish,
  onBackToEdit,
  onStartAnother,
}: {
  version: OrganizationVersion;
  busy: 'confirm' | 'publish' | null;
  error: ApiError | null;
  onConfirm: () => void;
  onPublish: () => void;
  onBackToEdit: () => void;
  onStartAnother: () => void;
}) {
  const actionButton =
    'inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold shadow-md transition-all focus:outline-none focus-visible:ring-4 disabled:cursor-not-allowed disabled:opacity-60';

  return (
    <section className="rounded-3xl border border-slate-200/60 bg-white p-6 shadow-sm sm:p-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-bold text-slate-900">{version.spec.name}</h2>
          <VersionStatusBadge status={version.status} />
          <span className="text-sm text-slate-400">第 {version.version_number} 版</span>
        </div>
        {version.status === 'proposal' ? (
          <button
            type="button"
            onClick={onBackToEdit}
            disabled={busy !== null}
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus-visible:ring-4 focus-visible:ring-indigo-500/15 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            返回修改
          </button>
        ) : null}
      </div>

      {version.spec.description ? (
        <p className="mb-4 text-sm leading-relaxed text-slate-600">{version.spec.description}</p>
      ) : null}
      {version.source_request ? (
        <p className="mb-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-relaxed text-slate-600">
          需求描述：{version.source_request}
        </p>
      ) : null}

      <OrganizationGraph spec={version.spec} />

      <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-1 text-xs text-slate-500">
        <div className="flex gap-1.5">
          <dt>创建于</dt>
          <dd>{formatDateTime(version.created_at)}</dd>
        </div>
        <div className="flex gap-1.5">
          <dt>确认于</dt>
          <dd>{formatDateTime(version.confirmed_at)}</dd>
        </div>
        <div className="flex gap-1.5">
          <dt>发布于</dt>
          <dd>{formatDateTime(version.published_at)}</dd>
        </div>
      </dl>

      {error ? (
        <div className="mt-5">
          <InlineError error={error} />
        </div>
      ) : null}

      <div className="mt-6 flex flex-wrap items-center justify-end gap-3 border-t border-slate-100 pt-5">
        {version.status === 'proposal' ? (
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy !== null}
            className={`${actionButton} bg-gradient-to-r from-indigo-600 to-blue-600 text-white shadow-indigo-200 hover:from-indigo-700 hover:to-blue-700 focus-visible:ring-indigo-500/20`}
          >
            {busy === 'confirm' ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Check className="h-4 w-4" aria-hidden="true" />
            )}
            确认方案
          </button>
        ) : null}

        {version.status === 'confirmed' ? (
          <button
            type="button"
            onClick={onPublish}
            disabled={busy !== null}
            className={`${actionButton} bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-emerald-200 hover:from-emerald-700 hover:to-teal-700 focus-visible:ring-emerald-500/20`}
          >
            {busy === 'publish' ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            )}
            发布组织
          </button>
        ) : null}

        {version.status === 'published' ? (
          <>
            <div className="mr-auto flex items-center gap-2 text-sm font-medium text-emerald-700">
              <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
              组织已发布。发布本身不会创建工作目录或 Runtime 会话。
            </div>
            <button
              type="button"
              onClick={onStartAnother}
              className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900 focus:outline-none focus-visible:ring-4 focus-visible:ring-indigo-500/15"
            >
              再创建一个组织
            </button>
            <Link
              to={`/orgs/${version.organization_id}`}
              className={`${actionButton} bg-gradient-to-r from-indigo-600 to-blue-600 text-white shadow-indigo-200 hover:from-indigo-700 hover:to-blue-700 focus-visible:ring-indigo-500/20`}
            >
              进入组织详情
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </>
        ) : null}
      </div>
    </section>
  );
}
