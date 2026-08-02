import React, { useState } from 'react';
import { Check, Info, Loader2, Shield, User as UserIcon } from 'lucide-react';
import { changePassword, updateCurrentUser } from '../api/endpoints';
import { apiErrorFromThrown, type ApiError } from '../api/errors';
import { useAuth } from '../auth/context';
import PageHeader from '../components/PageHeader';
import { InlineError, LoadingState } from '../components/states';

/**
 * Account self-service.
 *
 * `display_name` is the only mutable profile field; `username` is immutable by contract and is
 * shown read-only. Changing the password keeps this browser's session and revokes the user's other
 * active sessions, so success must not be presented as a sign-out. Rejections render the backend's
 * localized envelope (`AUTH_CURRENT_PASSWORD_INVALID`, `AUTH_NEW_PASSWORD_MUST_DIFFER`) as-is.
 */

/** Matches the contract's `new_password` bounds so the form does not submit a known-invalid value. */
const PASSWORD_MIN = 8;
const PASSWORD_MAX = 128;
const DISPLAY_NAME_MAX = 100;

const FIELD_CLASS =
  'min-h-12 w-full max-w-none rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm transition-all duration-200 focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:cursor-not-allowed disabled:opacity-60 sm:max-w-md';

const SUBMIT_CLASS =
  'inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-indigo-200 transition-all hover:from-indigo-700 hover:to-blue-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-indigo-500/20 disabled:cursor-not-allowed disabled:opacity-50';

export default function Profile() {
  const { state } = useAuth();

  return (
    <div className="flex h-full flex-col bg-slate-50/50">
      <PageHeader title="个人中心" />
      <div className="mobile-scroll-gutter flex-1 overflow-y-auto px-4 py-5 sm:p-8">
        <div className="mx-auto max-w-2xl space-y-6">
          {state.status !== 'authenticated' ? (
            <LoadingState label="加载账户信息中..." />
          ) : (
            <>
              <ProfileCard />
              <PasswordCard />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ProfileCard() {
  const { state, setUser } = useAuth();
  const user = state.status === 'authenticated' ? state.user : null;

  const [displayName, setDisplayName] = useState(user?.display_name ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [saved, setSaved] = useState(false);

  if (!user) return null;

  const trimmed = displayName.trim();
  const changed = trimmed.length > 0 && trimmed !== user.display_name;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!changed || saving) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      // The response is the persisted user; adopt it rather than assuming the submitted value.
      setUser(await updateCurrentUser({ display_name: trimmed }));
      setSaved(true);
    } catch (cause) {
      setError(apiErrorFromThrown(cause));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="overflow-hidden rounded-3xl border border-slate-200/60 bg-white shadow-sm">
      <div className="p-5 sm:p-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-indigo-100 bg-indigo-50 text-indigo-600">
            <UserIcon className="h-5 w-5" aria-hidden="true" />
          </div>
          <h2 className="text-lg font-bold text-slate-900">账户信息</h2>
        </div>

        <form onSubmit={submit} className="space-y-4" noValidate>
          <div>
            <label htmlFor="display-name" className="mb-1.5 block text-sm font-medium text-slate-700">
              昵称
            </label>
            <input
              id="display-name"
              name="display-name"
              type="text"
              value={displayName}
              maxLength={DISPLAY_NAME_MAX}
              disabled={saving}
              onChange={(event) => {
                setDisplayName(event.target.value);
                setSaved(false);
              }}
              className={FIELD_CLASS}
            />
          </div>

          <div>
            <span className="mb-1.5 block text-sm font-medium text-slate-700">用户名</span>
            <p className="text-sm text-slate-900">{user.username}</p>
            <p className="mt-0.5 text-xs text-slate-400">用户名不可修改。</p>
          </div>

          <div>
            <span className="mb-1.5 block text-sm font-medium text-slate-700">用户 ID</span>
            <p className="break-all font-mono text-sm text-slate-600">{user.user_id}</p>
          </div>

          {error ? <InlineError error={error} /> : null}

          <div className="flex items-center gap-3 pt-1">
            <button type="submit" disabled={!changed || saving} className={SUBMIT_CLASS}>
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Check className="h-4 w-4" aria-hidden="true" />
              )}
              保存昵称
            </button>
            {saved ? (
              <span role="status" className="text-sm font-medium text-emerald-700">
                已保存
              </span>
            ) : null}
          </div>
        </form>
      </div>
    </section>
  );
}

function PasswordCard() {
  const { state } = useAuth();
  const username = state.status === 'authenticated' ? state.user.username : '';
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [localIssue, setLocalIssue] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const filled =
    currentPassword.length > 0 && newPassword.length > 0 && confirmPassword.length > 0;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!filled || saving) return;

    // A new attempt supersedes whatever the last one reported; clear both before re-validating so
    // a stale backend envelope cannot sit next to a fresh local issue.
    setError(null);
    setLocalIssue(null);
    setSaved(false);

    // Confirmation matching is a frontend-only concern; everything else is the backend's rule.
    if (newPassword !== confirmPassword) {
      setLocalIssue('两次输入的新密码不一致。');
      return;
    }
    if (newPassword.length < PASSWORD_MIN || newPassword.length > PASSWORD_MAX) {
      setLocalIssue(`新密码长度需为 ${PASSWORD_MIN}-${PASSWORD_MAX} 个字符。`);
      return;
    }

    setSaving(true);
    try {
      await changePassword({ current_password: currentPassword, new_password: newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setSaved(true);
    } catch (cause) {
      setError(apiErrorFromThrown(cause));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="overflow-hidden rounded-3xl border border-slate-200/60 bg-white shadow-sm">
      <div className="p-5 sm:p-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-blue-100 bg-blue-50 text-blue-600">
            <Shield className="h-5 w-5" aria-hidden="true" />
          </div>
          <h2 className="text-lg font-bold text-slate-900">安全设置</h2>
        </div>

        <form onSubmit={submit} className="space-y-4" noValidate>
          {/*
            Hidden username field so a password manager can associate the change with the right
            account. The value is read-only here; `username` is immutable by contract.
          */}
          <input
            type="text"
            name="username"
            autoComplete="username"
            value={username}
            readOnly
            hidden
            aria-hidden="true"
            tabIndex={-1}
          />

          <div>
            <label
              htmlFor="current-password"
              className="mb-1.5 block text-sm font-medium text-slate-700"
            >
              当前密码
            </label>
            <input
              id="current-password"
              name="current-password"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              disabled={saving}
              onChange={(event) => {
                setCurrentPassword(event.target.value);
                setSaved(false);
              }}
              className={FIELD_CLASS}
            />
          </div>

          <div>
            <label htmlFor="new-password" className="mb-1.5 block text-sm font-medium text-slate-700">
              新密码
            </label>
            <input
              id="new-password"
              name="new-password"
              type="password"
              autoComplete="new-password"
              minLength={PASSWORD_MIN}
              maxLength={PASSWORD_MAX}
              value={newPassword}
              disabled={saving}
              onChange={(event) => {
                setNewPassword(event.target.value);
                setLocalIssue(null);
                setSaved(false);
              }}
              className={FIELD_CLASS}
            />
            <p className="mt-1 text-xs text-slate-400">
              长度 {PASSWORD_MIN}-{PASSWORD_MAX} 个字符，且不能与当前密码相同。
            </p>
          </div>

          <div>
            <label
              htmlFor="confirm-password"
              className="mb-1.5 block text-sm font-medium text-slate-700"
            >
              确认新密码
            </label>
            <input
              id="confirm-password"
              name="confirm-password"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              disabled={saving}
              onChange={(event) => {
                setConfirmPassword(event.target.value);
                setLocalIssue(null);
                setSaved(false);
              }}
              className={FIELD_CLASS}
            />
          </div>

          {localIssue ? (
            <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              {localIssue}
            </p>
          ) : null}
          {error ? <InlineError error={error} /> : null}

          {saved ? (
            <p
              role="status"
              className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-relaxed text-emerald-800"
            >
              <Info className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
              密码已修改。当前浏览器会话保持登录，您在其他设备上的登录已被退出。
            </p>
          ) : null}

          <div className="pt-1">
            <button type="submit" disabled={!filled || saving} className={SUBMIT_CLASS}>
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Shield className="h-4 w-4" aria-hidden="true" />
              )}
              修改密码
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
