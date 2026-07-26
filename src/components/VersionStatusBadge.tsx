import type { OrganizationVersionStatus } from '../api/types';

/**
 * One presentation per contracted organization-version state. The label translates the enum for
 * display; the underlying value always comes from the backend and is never inferred client-side.
 */
const PRESENTATION: Record<OrganizationVersionStatus, { label: string; tone: string }> = {
  proposal: { label: '方案', tone: 'border-blue-200 bg-blue-50 text-blue-700' },
  confirmed: { label: '已确认', tone: 'border-amber-200 bg-amber-50 text-amber-700' },
  published: { label: '已发布', tone: 'border-emerald-200/50 bg-emerald-50 text-emerald-700' },
  superseded: { label: '已被取代', tone: 'border-slate-200 bg-slate-50 text-slate-500' },
  archived: { label: '已归档', tone: 'border-slate-200 bg-slate-100 text-slate-500' },
};

export default function VersionStatusBadge({ status }: { status: OrganizationVersionStatus }) {
  const { label, tone } = PRESENTATION[status] ?? {
    // An enum value this build does not know yet must not crash the view.
    label: status,
    tone: 'border-slate-200 bg-slate-50 text-slate-600',
  };
  return (
    <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${tone}`}>{label}</span>
  );
}
