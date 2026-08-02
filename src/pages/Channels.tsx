import { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import {
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  AlertCircle,
  Clock3,
  ExternalLink,
  KeyRound,
  Link2Off,
  Loader2,
  MessageCircle,
  Plus,
  QrCode,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  UserCheck,
  UserMinus,
} from 'lucide-react';
import {
  beginChannelAuthorization,
  createChannelConnection,
  disconnectChannelConnection,
  listChannelConnections,
  listChannelIdentities,
  listChannelInboundDeliveries,
  listChannelOutboundDeliveries,
  listChannelProviders,
  pollChannelAuthorization,
  revokeChannelIdentity,
  upsertChannelIdentity,
} from '../api/endpoints';
import { apiErrorFromThrown, type ApiError } from '../api/errors';
import type {
  ChannelAuthorization,
  ChannelConnection,
  ChannelConnectionStatus,
  ChannelIdentity,
  ChannelInboundDelivery,
  ChannelOutboundDelivery,
  ChannelProvider,
} from '../api/types';
import { useApiResource } from '../api/useApiResource';
import PageHeader from '../components/PageHeader';
import { EmptyState, ErrorState, InlineError, LoadingState } from '../components/states';
import { formatDateTime } from '../lib/format';

type ChannelOverview = {
  providers: ChannelProvider[];
  connections: ChannelConnection[];
};

type ChannelDetails = {
  identities: ChannelIdentity[];
  inbound: ChannelInboundDelivery[];
  outbound: ChannelOutboundDelivery[];
};

const CONNECTION_STATUS: Record<
  ChannelConnectionStatus,
  { label: string; tone: string; dot: string }
> = {
  pending: {
    label: '等待授权',
    tone: 'border-slate-200 bg-slate-50 text-slate-700',
    dot: 'bg-slate-400',
  },
  authenticating: {
    label: '等待扫码',
    tone: 'border-amber-200 bg-amber-50 text-amber-800',
    dot: 'bg-amber-500',
  },
  connected: {
    label: '已连接',
    tone: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    dot: 'bg-emerald-500',
  },
  degraded: {
    label: '连接异常',
    tone: 'border-orange-200 bg-orange-50 text-orange-800',
    dot: 'bg-orange-500',
  },
  disconnected: {
    label: '已断开',
    tone: 'border-slate-200 bg-slate-100 text-slate-600',
    dot: 'bg-slate-400',
  },
  error: {
    label: '连接失败',
    tone: 'border-red-200 bg-red-50 text-red-800',
    dot: 'bg-red-500',
  },
};

const AUTH_STATUS = {
  pending: '等待微信扫码',
  scanned: '已扫码，请在微信中确认',
  confirmed: '授权成功',
  expired: '二维码已过期',
  failed: '授权失败',
} as const;

export default function Channels() {
  const overview = useApiResource<ChannelOverview>(async (signal) => {
    const [providers, connections] = await Promise.all([
      listChannelProviders(signal),
      listChannelConnections(signal),
    ]);
    return { providers, connections };
  }, []);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creatingProvider, setCreatingProvider] = useState<string | null>(null);
  const [createError, setCreateError] = useState<ApiError | null>(null);

  const selectedConnection = useMemo(() => {
    if (overview.state.status !== 'ready') return null;
    return (
      overview.state.data.connections.find((item) => item.connection_id === selectedId) ??
      overview.state.data.connections[0] ??
      null
    );
  }, [overview.state, selectedId]);

  useEffect(() => {
    if (selectedConnection && selectedConnection.connection_id !== selectedId) {
      setSelectedId(selectedConnection.connection_id);
    }
  }, [selectedConnection, selectedId]);

  const handleCreate = async (provider: ChannelProvider) => {
    setCreatingProvider(provider.provider_key);
    setCreateError(null);
    try {
      const created = await createChannelConnection({
        provider_key: provider.provider_key,
        display_name: provider.display_name,
        configuration: {},
      });
      if (overview.state.status === 'ready') {
        overview.set({
          ...overview.state.data,
          connections: [...overview.state.data.connections, created],
        });
      }
      setSelectedId(created.connection_id);
    } catch (cause) {
      setCreateError(apiErrorFromThrown(cause));
    } finally {
      setCreatingProvider(null);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--nexwork-page)]">
      <PageHeader
        title="微信连接"
        description="把个人微信直聊接入平台小助理；连接、身份与投递状态均来自产品记录"
        actions={
          <button
            type="button"
            onClick={overview.reload}
            className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:border-emerald-200 hover:text-emerald-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-emerald-500/15 sm:w-auto"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            刷新状态
          </button>
        }
      />

      <div className="relative flex-1 overflow-y-auto px-3 py-4 sm:p-8">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-72 overflow-hidden" aria-hidden="true">
          <div className="absolute -right-20 -top-36 h-96 w-96 rounded-full bg-emerald-200/25 blur-3xl" />
          <div className="absolute left-1/3 top-0 h-48 w-72 -rotate-12 rounded-full bg-teal-100/40 blur-3xl" />
        </div>

        <div className="relative mx-auto max-w-6xl pb-2">
          {overview.state.status === 'loading' ? <LoadingState label="加载渠道连接中..." /> : null}
          {overview.state.status === 'error' ? (
            <ErrorState error={overview.state.error} title="加载渠道连接失败" onRetry={overview.reload} />
          ) : null}
          {overview.state.status === 'ready' ? (
            <>
              <ChannelBoundary providers={overview.state.data.providers} />
              {createError ? <div className="mt-5"><InlineError error={createError} /></div> : null}

              {overview.state.data.connections.length === 0 ? (
                <div className="mt-6">
                  <EmptyConnections
                    providers={overview.state.data.providers}
                    creatingProvider={creatingProvider}
                    onCreate={handleCreate}
                  />
                </div>
              ) : (
                <div className="mt-6 grid items-start gap-5 lg:grid-cols-[19rem_minmax(0,1fr)]">
                  <ConnectionList
                    connections={overview.state.data.connections}
                    selectedId={selectedConnection?.connection_id ?? null}
                    providers={overview.state.data.providers}
                    creatingProvider={creatingProvider}
                    onSelect={setSelectedId}
                    onCreate={handleCreate}
                  />
                  {selectedConnection ? (
                    <ConnectionPanel
                      key={selectedConnection.connection_id}
                      connection={selectedConnection}
                      provider={overview.state.data.providers.find(
                        (item) => item.provider_key === selectedConnection.provider_key,
                      )}
                      onConnectionChanged={overview.reload}
                    />
                  ) : null}
                </div>
              )}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ChannelBoundary({ providers }: { providers: ChannelProvider[] }) {
  const provider = providers.find((item) => item.provider_key === 'weixin-ilink') ?? providers[0];
  return (
    <section className="overflow-hidden rounded-2xl border border-emerald-100 bg-[#0d3b2e] text-white shadow-xl shadow-emerald-950/10 sm:rounded-[1.75rem]">
      <div className="grid gap-5 px-4 py-5 sm:gap-6 sm:px-8 sm:py-6 lg:grid-cols-[1.3fr_1fr] lg:items-center lg:py-8">
        <div className="min-w-0">
          <div className="mb-4 inline-flex max-w-full items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold text-emerald-50">
            <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="truncate">{provider?.display_name ?? '个人微信'} · 首版能力</span>
          </div>
          <h2 className="max-w-2xl text-2xl font-bold tracking-tight sm:text-3xl">
            在微信里，继续和同一个小助理对话
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-emerald-50/75">
            微信是新的消息入口，组织、任务和产出仍由 Nexwork 统一管理。
            <span className="hidden sm:inline">不会在微信侧复制另一套工作流。</span>
          </p>
        </div>
        <div className="hidden grid-cols-2 gap-3 sm:grid">
          <BoundaryItem icon={<UserCheck className="h-4 w-4" />} label="支持" value="个人直聊" />
          <BoundaryItem icon={<MessageCircle className="h-4 w-4" />} label="内容" value="文字收发" />
          <BoundaryItem icon={<ShieldCheck className="h-4 w-4" />} label="身份" value="显式授权" />
          <BoundaryItem icon={<AlertCircle className="h-4 w-4" />} label="暂不支持" value="媒体与群聊" />
        </div>
      </div>
      <details className="group border-t border-white/10 bg-black/10 sm:hidden">
        <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-4 text-xs font-semibold text-emerald-50/80 marker:content-none">
          <ShieldCheck className="h-4 w-4" aria-hidden="true" />
          个人直聊 · 文字收发
          <span className="ml-auto text-emerald-100/60 group-open:hidden">查看边界</span>
          <span className="ml-auto hidden text-emerald-100/60 group-open:inline">收起</span>
        </summary>
        <div className="grid grid-cols-2 gap-2.5 border-t border-white/10 px-4 py-4">
          <BoundaryItem icon={<UserCheck className="h-4 w-4" />} label="支持" value="个人直聊" />
          <BoundaryItem icon={<MessageCircle className="h-4 w-4" />} label="内容" value="文字收发" />
          <BoundaryItem icon={<ShieldCheck className="h-4 w-4" />} label="身份" value="显式授权" />
          <BoundaryItem icon={<AlertCircle className="h-4 w-4" />} label="暂不支持" value="媒体与群聊" />
        </div>
        <p className="border-t border-white/10 px-4 py-3 text-xs leading-5 text-emerald-50/65">
          图片、语音、文件和视频会被记录为“暂不支持读取”；当前不支持群聊、卡片、反应或附件发送。
        </p>
      </details>
      <div className="hidden border-t border-white/10 bg-black/10 px-8 py-3 text-xs leading-5 text-emerald-50/65 sm:block">
        图片、语音、文件和视频会被记录为“暂不支持读取”；当前不支持群聊、卡片、反应或附件发送。
      </div>
    </section>
  );
}

function BoundaryItem({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-2xl border border-white/10 bg-white/[0.07] p-3 sm:p-3.5">
      <div className="flex items-center gap-2 text-emerald-100/70">
        {icon}
        <span className="text-[11px] font-semibold uppercase tracking-wider">{label}</span>
      </div>
      <p className="mt-2 break-words text-sm font-bold text-white">{value}</p>
    </div>
  );
}

function EmptyConnections({
  providers,
  creatingProvider,
  onCreate,
}: {
  providers: ChannelProvider[];
  creatingProvider: string | null;
  onCreate: (provider: ChannelProvider) => void;
}) {
  const weixin = providers.find((item) => item.provider_key === 'weixin-ilink') ?? providers[0];
  if (!weixin) {
    return (
      <EmptyState
        title="当前没有可用的渠道适配器"
        description="后端尚未注册微信渠道；页面不会显示虚假的连接入口。"
      />
    );
  }
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white px-4 py-8 text-center shadow-sm sm:rounded-[1.75rem] sm:px-10 sm:py-12">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100">
        <Smartphone className="h-7 w-7" aria-hidden="true" />
      </div>
      <h3 className="mt-5 text-xl font-bold text-slate-900">还没有微信连接</h3>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">
        先创建一条产品连接，再生成限时二维码。只有完成微信扫码并确认后，状态才会变为“已连接”。
      </p>
      <button
        type="button"
        onClick={() => onCreate(weixin)}
        disabled={creatingProvider === weixin.provider_key}
        className="mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-emerald-900/15 transition-colors hover:bg-emerald-800 focus:outline-none focus-visible:ring-4 focus-visible:ring-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
      >
        {creatingProvider === weixin.provider_key ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <Plus className="h-4 w-4" aria-hidden="true" />
        )}
        创建微信连接
      </button>
    </div>
  );
}

function ConnectionList({
  connections,
  selectedId,
  providers,
  creatingProvider,
  onSelect,
  onCreate,
}: {
  connections: ChannelConnection[];
  selectedId: string | null;
  providers: ChannelProvider[];
  creatingProvider: string | null;
  onSelect: (connectionId: string) => void;
  onCreate: (provider: ChannelProvider) => void;
}) {
  const weixin = providers.find((item) => item.provider_key === 'weixin-ilink') ?? providers[0];
  return (
    <aside className="min-w-0 overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-3 shadow-sm lg:sticky lg:top-0">
      <div className="flex items-center justify-between px-2 pb-2 pt-1">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Connections</p>
          <h2 className="mt-1 font-bold text-slate-900">连接列表</h2>
        </div>
        {weixin ? (
          <button
            type="button"
            onClick={() => onCreate(weixin)}
            disabled={creatingProvider === weixin.provider_key}
            title="新建微信连接"
            className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition-colors hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-emerald-500/15 disabled:opacity-50"
          >
            {creatingProvider === weixin.provider_key ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Plus className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
        ) : null}
      </div>
      <div className="-mx-1 mt-2 flex snap-x snap-mandatory gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:mx-0 lg:block lg:space-y-1.5 lg:overflow-visible lg:px-0 lg:pb-0">
        {connections.map((connection) => {
          const status = CONNECTION_STATUS[connection.status];
          const selected = connection.connection_id === selectedId;
          return (
            <button
              type="button"
              key={connection.connection_id}
              onClick={() => onSelect(connection.connection_id)}
              className={`min-h-16 w-full min-w-[13rem] snap-start rounded-xl border px-3 py-3 text-left transition-all focus:outline-none focus-visible:ring-4 focus-visible:ring-emerald-500/15 lg:min-w-0 ${
                selected
                  ? 'border-emerald-200 bg-emerald-50/70 shadow-sm'
                  : 'border-transparent hover:border-slate-200 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-emerald-700 shadow-sm ring-1 ring-slate-200/80">
                  <MessageCircle className="h-4 w-4" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-slate-800">
                    {connection.display_name || '微信连接'}
                  </span>
                  <span className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                    <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} aria-hidden="true" />
                    {status.label}
                  </span>
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </aside>
  );
}

function ConnectionPanel({
  connection,
  provider,
  onConnectionChanged,
}: {
  connection: ChannelConnection;
  provider?: ChannelProvider;
  onConnectionChanged: () => void;
}) {
  const details = useApiResource<ChannelDetails>(async (signal) => {
    const [identities, inbound, outbound] = await Promise.all([
      listChannelIdentities(connection.connection_id, signal),
      listChannelInboundDeliveries(connection.connection_id, 25, signal),
      listChannelOutboundDeliveries(connection.connection_id, 25, signal),
    ]);
    return { identities, inbound, outbound };
  }, [connection.connection_id]);
  const reloadDetails = details.reload;
  const [authorization, setAuthorization] = useState<ChannelAuthorization | null>(null);
  const [authPollVersion, setAuthPollVersion] = useState(0);
  const [authorizing, setAuthorizing] = useState(false);
  const [authError, setAuthError] = useState<ApiError | null>(null);
  const [pollError, setPollError] = useState<ApiError | null>(null);
  const [verifyCode, setVerifyCode] = useState('');
  const [submittingCode, setSubmittingCode] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);

  const authSessionId = authorization?.auth_session_id ?? null;
  useEffect(() => {
    if (!authSessionId) return;
    let cancelled = false;
    let timer: number | undefined;
    const controller = new AbortController();

    const run = async () => {
      timer = window.setTimeout(async () => {
        try {
          const next = await pollChannelAuthorization(
            connection.connection_id,
            authSessionId,
            undefined,
            controller.signal,
          );
          if (cancelled) return;
          setAuthorization(next);
          setPollError(null);
          if (next.status === 'confirmed') {
            onConnectionChanged();
            reloadDetails();
            return;
          }
          if (next.status === 'expired' || next.status === 'failed' || next.needs_verify_code) return;
          setAuthPollVersion((version) => version + 1);
        } catch (cause) {
          if (cancelled) return;
          const error = apiErrorFromThrown(cause);
          if (error.kind !== 'aborted') setPollError(error);
        }
      }, 900);
    };
    void run();

    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
      controller.abort();
    };
  }, [authSessionId, authPollVersion, connection.connection_id, onConnectionChanged, reloadDetails]);

  const startAuthorization = async () => {
    setAuthorizing(true);
    setAuthError(null);
    setPollError(null);
    setImageFailed(false);
    try {
      const next = await beginChannelAuthorization(connection.connection_id);
      setAuthorization(next);
      setAuthPollVersion((version) => version + 1);
    } catch (cause) {
      setAuthError(apiErrorFromThrown(cause));
    } finally {
      setAuthorizing(false);
    }
  };

  const submitVerifyCode = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!authorization || verifyCode.trim().length === 0) return;
    setSubmittingCode(true);
    setPollError(null);
    try {
      const next = await pollChannelAuthorization(
        connection.connection_id,
        authorization.auth_session_id,
        { verify_code: verifyCode.trim() },
      );
      setAuthorization(next);
      if (next.status === 'confirmed') {
        onConnectionChanged();
        reloadDetails();
      } else if (!next.needs_verify_code && next.status !== 'expired' && next.status !== 'failed') {
        setAuthPollVersion((version) => version + 1);
      }
    } catch (cause) {
      setPollError(apiErrorFromThrown(cause));
    } finally {
      setSubmittingCode(false);
    }
  };

  const disconnect = async () => {
    setDisconnecting(true);
    setAuthError(null);
    try {
      await disconnectChannelConnection(connection.connection_id);
      setAuthorization(null);
      setConfirmDisconnect(false);
      onConnectionChanged();
      reloadDetails();
    } catch (cause) {
      setAuthError(apiErrorFromThrown(cause));
    } finally {
      setDisconnecting(false);
    }
  };

  const status = CONNECTION_STATUS[connection.status];
  return (
    <main className="min-w-0 space-y-5">
      <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 className="break-words text-xl font-bold text-slate-900">
                {connection.display_name || provider?.display_name || '微信连接'}
              </h2>
              <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold ${status.tone}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} aria-hidden="true" />
                {status.label}
              </span>
            </div>
            <p className="mt-2 break-all font-mono text-xs text-slate-400">{connection.connection_id}</p>
          </div>
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            {connection.status !== 'connected' ? (
              <button
                type="button"
                onClick={startAuthorization}
                disabled={authorizing}
                className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-2 text-sm font-bold text-white shadow-md shadow-emerald-900/10 transition-colors hover:bg-emerald-800 focus:outline-none focus-visible:ring-4 focus-visible:ring-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
              >
                {authorizing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <QrCode className="h-4 w-4" aria-hidden="true" />}
                {connection.status === 'authenticating' ? '重新生成二维码' : '开始扫码连接'}
              </button>
            ) : null}
            {connection.status === 'connected' || connection.status === 'degraded' ? (
              confirmDisconnect ? (
                <div className="flex w-full items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-1 sm:w-auto">
                  <button
                    type="button"
                    onClick={disconnect}
                    disabled={disconnecting}
                    className="min-h-11 flex-1 rounded-lg bg-red-600 px-3 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-60 sm:flex-none"
                  >
                    {disconnecting ? '断开中...' : '确认断开'}
                  </button>
                  <button type="button" onClick={() => setConfirmDisconnect(false)} className="min-h-11 flex-1 rounded-lg px-3 text-xs font-semibold text-red-700 sm:flex-none">
                    取消
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDisconnect(true)}
                  className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-red-500/15 sm:w-auto"
                >
                  <Link2Off className="h-4 w-4" aria-hidden="true" />
                  断开连接
                </button>
              )
            ) : null}
          </div>
        </div>

        <dl className="mt-5 grid grid-cols-2 gap-2 border-t border-slate-100 pt-5 sm:gap-3 xl:grid-cols-4">
          <Info label="微信账号" value={connection.external_account_id ?? '尚未授权'} />
          <Info label="协议" value={provider?.protocol_version ?? connection.provider_key} mono />
          <Info label="最近收到" value={formatDateTime(connection.last_inbound_at)} />
          <Info label="最近发出" value={formatDateTime(connection.last_outbound_at)} />
        </dl>

        {connection.last_error_message ? (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <p className="break-words">{connection.last_error_message}</p>
            {connection.last_error_code ? <p className="mt-1 break-all font-mono text-xs text-amber-600">{connection.last_error_code}</p> : null}
          </div>
        ) : null}
        {authError ? <div className="mt-4"><InlineError error={authError} /></div> : null}
      </section>

      {authorization ? (
        <AuthorizationPanel
          authorization={authorization}
          imageFailed={imageFailed}
          pollError={pollError}
          verifyCode={verifyCode}
          submittingCode={submittingCode}
          onImageError={() => setImageFailed(true)}
          onVerifyCodeChange={setVerifyCode}
          onSubmitVerifyCode={submitVerifyCode}
          onRetryPoll={() => {
            setPollError(null);
            setAuthPollVersion((version) => version + 1);
          }}
          onRestart={startAuthorization}
        />
      ) : null}

      {details.state.status === 'loading' ? <LoadingState label="加载连接明细中..." /> : null}
      {details.state.status === 'error' ? (
        <ErrorState error={details.state.error} title="加载连接明细失败" onRetry={reloadDetails} />
      ) : null}
      {details.state.status === 'ready' ? (
        <>
          <IdentityPanel
            connectionId={connection.connection_id}
            identities={details.state.data.identities}
            onChanged={reloadDetails}
          />
          <DeliveryPanel inbound={details.state.data.inbound} outbound={details.state.data.outbound} onRefresh={reloadDetails} />
        </>
      ) : null}
    </main>
  );
}

function AuthorizationPanel({
  authorization,
  imageFailed,
  pollError,
  verifyCode,
  submittingCode,
  onImageError,
  onVerifyCodeChange,
  onSubmitVerifyCode,
  onRetryPoll,
  onRestart,
}: {
  authorization: ChannelAuthorization;
  imageFailed: boolean;
  pollError: ApiError | null;
  verifyCode: string;
  submittingCode: boolean;
  onImageError: () => void;
  onVerifyCodeChange: (value: string) => void;
  onSubmitVerifyCode: (event: React.FormEvent) => void;
  onRetryPoll: () => void;
  onRestart: () => void;
}) {
  const safeUrl = safeAuthorizationUrl(authorization.authorization_url);
  const [qrImageUrl, setQrImageUrl] = useState<string | null>(null);
  const [qrGenerationFailed, setQrGenerationFailed] = useState(false);
  const terminal = authorization.status === 'confirmed' || authorization.status === 'expired' || authorization.status === 'failed';

  useEffect(() => {
    let cancelled = false;
    setQrImageUrl(null);
    setQrGenerationFailed(false);
    if (!safeUrl) {
      setQrGenerationFailed(true);
      return () => {
        cancelled = true;
      };
    }
    if (/^data:image\//i.test(safeUrl)) {
      setQrImageUrl(safeUrl);
      return () => {
        cancelled = true;
      };
    }
    void QRCode.toDataURL(safeUrl, {
      width: 448,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#0d3b2e', light: '#ffffff' },
    })
      .then((dataUrl) => {
        if (!cancelled) setQrImageUrl(dataUrl);
      })
      .catch(() => {
        if (!cancelled) setQrGenerationFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [safeUrl]);

  return (
    <section className="overflow-hidden rounded-2xl border border-emerald-200/70 bg-white shadow-sm">
      <div className="flex flex-col items-start gap-3 border-b border-emerald-100 bg-emerald-50/70 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-emerald-700 shadow-sm ring-1 ring-emerald-100">
            {authorization.status === 'confirmed' ? <CheckCircle2 className="h-5 w-5" aria-hidden="true" /> : <QrCode className="h-5 w-5" aria-hidden="true" />}
          </span>
          <div className="min-w-0">
            <h3 className="font-bold text-slate-900">{AUTH_STATUS[authorization.status]}</h3>
            <p className="mt-0.5 break-words text-xs leading-5 text-slate-500">二维码有效期至 {formatDateTime(authorization.expires_at)}</p>
          </div>
        </div>
        {!terminal && !authorization.needs_verify_code ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            自动检查中
          </span>
        ) : null}
      </div>

      <div className="grid gap-5 p-4 sm:gap-6 sm:p-6 md:grid-cols-[15rem_minmax(0,1fr)] md:items-center">
        <div className="mx-auto flex aspect-square w-full max-w-56 items-center justify-center rounded-3xl border border-slate-200 bg-white p-3 shadow-inner">
          {qrImageUrl && !imageFailed ? (
            <img src={qrImageUrl} alt="微信授权二维码" onError={onImageError} className="h-full w-full rounded-2xl object-contain" />
          ) : authorization.status === 'confirmed' ? (
            <CheckCircle2 className="h-20 w-20 text-emerald-500" aria-hidden="true" />
          ) : safeUrl && !qrGenerationFailed && !imageFailed ? (
            <Loader2 className="h-8 w-8 animate-spin text-emerald-600" aria-label="正在生成二维码" />
          ) : (
            <div className="px-4 text-center">
              <AlertCircle className="mx-auto h-9 w-9 text-amber-500" aria-hidden="true" />
              <p className="mt-3 text-sm font-semibold text-slate-700">二维码图片无法直接显示</p>
              <p className="mt-1 text-xs leading-5 text-slate-500">可尝试在新窗口打开授权地址。</p>
            </div>
          )}
        </div>

        <div>
          {authorization.status === 'pending' ? (
            <>
              <p className="text-lg font-bold text-slate-900">请使用微信扫描二维码</p>
              <p className="mt-2 text-sm leading-6 text-slate-500">扫码后仍需在微信内确认。页面只有收到后端的 confirmed 状态，才会显示“已连接”。</p>
            </>
          ) : null}
          {authorization.status === 'scanned' ? (
            <>
              <p className="text-lg font-bold text-slate-900">已识别扫码，请回到微信确认</p>
              <p className="mt-2 text-sm leading-6 text-slate-500">确认完成前不要关闭此页面，系统会继续轮询授权状态。</p>
            </>
          ) : null}
          {authorization.status === 'confirmed' ? (
            <>
              <p className="text-lg font-bold text-emerald-800">微信账号已连接</p>
              <p className="mt-2 text-sm leading-6 text-slate-500">长轮询和消息投递由后端管理。可从下方记录检查真实收发结果。</p>
            </>
          ) : null}
          {authorization.status === 'expired' || authorization.status === 'failed' ? (
            <>
              <p className="text-lg font-bold text-slate-900">本次授权没有完成</p>
              <p className="mt-2 text-sm leading-6 text-slate-500">{authorization.error_message ?? '请生成新的二维码后重试。'}</p>
              <button type="button" onClick={onRestart} className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-800 sm:w-auto">
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                重新生成二维码
              </button>
            </>
          ) : null}

          {authorization.needs_verify_code ? (
            <form onSubmit={onSubmitVerifyCode} className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-3 sm:p-4">
              <label htmlFor="weixin-verify-code" className="text-sm font-bold text-amber-900">微信要求输入配对验证码</label>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <div className="relative min-w-0 flex-1">
                  <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-amber-500" aria-hidden="true" />
                  <input id="weixin-verify-code" name="weixin-verify-code" value={verifyCode} onChange={(event) => onVerifyCodeChange(event.target.value)} maxLength={20} autoComplete="one-time-code" className="min-h-12 w-full rounded-xl border border-amber-200 bg-white pl-9 pr-3 text-base outline-none focus:border-amber-400 focus:ring-4 focus:ring-amber-500/10 sm:text-sm" />
                </div>
                <button type="submit" disabled={verifyCode.trim().length === 0 || submittingCode} className="min-h-12 rounded-xl bg-amber-700 px-4 text-sm font-bold text-white hover:bg-amber-800 disabled:opacity-50">
                  {submittingCode ? '提交中...' : '提交验证码'}
                </button>
              </div>
            </form>
          ) : null}

          {authorization.error_message && !authorization.needs_verify_code && authorization.status !== 'failed' ? (
            <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">{authorization.error_message}</p>
          ) : null}
          {pollError ? (
            <div className="mt-4">
              <InlineError error={pollError} />
              <button type="button" onClick={onRetryPoll} className="mt-2 inline-flex min-h-11 items-center text-sm font-bold text-emerald-700 hover:underline">继续检查状态</button>
            </div>
          ) : null}
          {safeUrl && authorization.status !== 'confirmed' ? (
            <a href={safeUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex min-h-11 items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-emerald-700">
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              在新窗口打开授权地址
            </a>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function IdentityPanel({ connectionId, identities, onChanged }: { connectionId: string; identities: ChannelIdentity[]; onChanged: () => void }) {
  const [externalUserId, setExternalUserId] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [saving, setSaving] = useState(false);
  const [workingIdentity, setWorkingIdentity] = useState<string | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (externalUserId.trim().length === 0) return;
    setSaving(true);
    setError(null);
    try {
      await upsertChannelIdentity(connectionId, {
        external_user_id: externalUserId.trim(),
        display_name: displayName.trim() || null,
      });
      setExternalUserId('');
      setDisplayName('');
      onChanged();
    } catch (cause) {
      setError(apiErrorFromThrown(cause));
    } finally {
      setSaving(false);
    }
  };

  const setIdentityStatus = async (identity: ChannelIdentity, active: boolean) => {
    setWorkingIdentity(identity.identity_id);
    setError(null);
    try {
      if (active) {
        await upsertChannelIdentity(connectionId, {
          external_user_id: identity.external_user_id,
          display_name: identity.display_name,
        });
      } else {
        await revokeChannelIdentity(connectionId, identity.identity_id);
      }
      onChanged();
    } catch (cause) {
      setError(apiErrorFromThrown(cause));
    } finally {
      setWorkingIdentity(null);
    }
  };

  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-bold text-slate-900">允许的发送者</h3>
          <p className="mt-1 text-sm leading-6 text-slate-500">只有 active 身份发来的直聊消息会进入小助理。扫码账号会自动加入，不需要手填。</p>
        </div>
        <ShieldCheck className="h-5 w-5 shrink-0 text-emerald-600" aria-hidden="true" />
      </div>

      <div className="mt-4 space-y-2">
        {identities.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-center text-sm text-slate-500">授权完成后，微信身份会显示在这里。</p>
        ) : identities.map((identity) => (
          <div key={identity.identity_id} className="grid grid-cols-[2.75rem_minmax(0,1fr)] items-center gap-3 rounded-xl border border-slate-200 px-3 py-3 sm:flex sm:px-4">
            <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${identity.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>
              {identity.status === 'active' ? <UserCheck className="h-4 w-4" aria-hidden="true" /> : <UserMinus className="h-4 w-4" aria-hidden="true" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-slate-800">{identity.display_name || '微信发送者'}</p>
              <p className="mt-0.5 break-all font-mono text-xs text-slate-400">{identity.external_user_id}</p>
            </div>
            <button
              type="button"
              disabled={workingIdentity === identity.identity_id}
              onClick={() => setIdentityStatus(identity, identity.status !== 'active')}
              className={`col-span-2 min-h-11 rounded-xl border px-3 text-xs font-bold transition-colors disabled:opacity-50 sm:col-span-1 ${identity.status === 'active' ? 'border-slate-200 text-slate-600 hover:border-red-200 hover:bg-red-50 hover:text-red-700' : 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'}`}
            >
              {workingIdentity === identity.identity_id ? '处理中...' : identity.status === 'active' ? '撤销' : '恢复'}
            </button>
          </div>
        ))}
      </div>

      <details className="group mt-4 rounded-xl border border-slate-200 bg-slate-50/60">
        <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-4 text-sm font-bold text-slate-700 marker:content-none">
          <Plus className="h-4 w-4 text-emerald-600" aria-hidden="true" />
          添加其他发送者 ID
          <span className="ml-auto text-xs font-medium text-slate-400 group-open:hidden">展开</span>
        </summary>
        <form onSubmit={save} className="grid gap-3 border-t border-slate-200 p-4 sm:grid-cols-[1fr_1fr_auto]">
          <input id="channel-external-user-id" name="external-user-id" value={externalUserId} onChange={(event) => setExternalUserId(event.target.value)} placeholder="微信 external user ID" maxLength={255} className="min-h-12 min-w-0 rounded-xl border border-slate-200 bg-white px-3 text-base outline-none focus:border-emerald-400 focus:ring-4 focus:ring-emerald-500/10 sm:text-sm" />
          <input id="channel-display-name" name="display-name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="备注名称（可选）" maxLength={255} className="min-h-12 min-w-0 rounded-xl border border-slate-200 bg-white px-3 text-base outline-none focus:border-emerald-400 focus:ring-4 focus:ring-emerald-500/10 sm:text-sm" />
          <button type="submit" disabled={saving || externalUserId.trim().length === 0} className="min-h-12 rounded-xl bg-slate-900 px-4 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-50">{saving ? '保存中...' : '保存'}</button>
        </form>
      </details>
      {error ? <div className="mt-4"><InlineError error={error} /></div> : null}
    </section>
  );
}

function DeliveryPanel({ inbound, outbound, onRefresh }: { inbound: ChannelInboundDelivery[]; outbound: ChannelOutboundDelivery[]; onRefresh: () => void }) {
  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-bold text-slate-900">最近投递</h3>
          <p className="mt-1 text-sm leading-6 text-slate-500">这里显示产品 journal 与 outbox 的持久化状态，不以页面内存代替送达事实。</p>
        </div>
        <button type="button" onClick={onRefresh} title="刷新投递记录" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-emerald-700">
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        <DeliveryColumn title="收到的消息" icon={<ArrowDownLeft className="h-4 w-4" />} empty="还没有微信入站记录">
          {inbound.slice(0, 8).map((item) => (
            <DeliveryRow key={item.delivery_id} title={item.external_sender_id} status={item.status} time={item.received_at} error={item.last_error_message} />
          ))}
        </DeliveryColumn>
        <DeliveryColumn title="发出的回复" icon={<ArrowUpRight className="h-4 w-4" />} empty="还没有微信出站记录">
          {outbound.slice(0, 8).map((item) => (
            <DeliveryRow key={item.delivery_id} title={item.assistant_message_id} status={item.status} time={item.created_at} error={item.last_error_message} />
          ))}
        </DeliveryColumn>
      </div>
    </section>
  );
}

function DeliveryColumn({ title, icon, empty, children }: { title: string; icon: React.ReactNode; empty: string; children: React.ReactNode }) {
  const hasChildren = Array.isArray(children) ? children.length > 0 : Boolean(children);
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3">
      <h4 className="flex items-center gap-2 px-1 pb-2 text-xs font-bold uppercase tracking-wider text-slate-500">{icon}{title}</h4>
      <div className="space-y-1.5">{hasChildren ? children : <p className="rounded-lg bg-white px-3 py-6 text-center text-sm text-slate-400">{empty}</p>}</div>
    </div>
  );
}

function DeliveryRow({ title, status, time, error }: { title: string; status: string; time: string; error: string | null }) {
  const failed = status === 'failed' || status === 'retryable';
  const active = status === 'processing' || status === 'sending' || status === 'queued';
  return (
    <div className="rounded-lg border border-slate-200/70 bg-white px-3 py-2.5">
      <div className="flex min-w-0 items-center gap-2">
        <p className="min-w-0 flex-1 break-all font-mono text-xs leading-5 text-slate-600 line-clamp-2">{title}</p>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${failed ? 'bg-red-50 text-red-700' : active ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>{status}</span>
      </div>
      <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-slate-400"><Clock3 className="h-3 w-3" aria-hidden="true" />{formatDateTime(time)}</div>
      {error ? <p className="mt-1.5 break-words text-xs leading-5 text-red-600">{error}</p> : null}
    </div>
  );
}

function Info({ label, value, mono = false }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="min-w-0 rounded-xl bg-slate-50 px-3.5 py-3">
      <dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{label}</dt>
      <dd className={`mt-1 min-w-0 break-all text-sm font-bold text-slate-700 ${mono ? 'font-mono text-xs' : ''}`}>{value}</dd>
    </div>
  );
}

function safeAuthorizationUrl(value: string | null): string | null {
  if (!value) return null;
  if (/^data:image\//i.test(value)) return value;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? value : null;
  } catch {
    return null;
  }
}
