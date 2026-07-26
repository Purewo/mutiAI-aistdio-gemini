import React, { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { LogOut, MessageSquare, Smartphone, Sparkles, User, Users } from 'lucide-react';
import { useAuth } from '../auth/context';
import { describeApiError } from '../api/errors';

export default function SidebarLayout() {
  const { state, signOut } = useAuth();
  const navigate = useNavigate();
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  const handleSignOut = async () => {
    setSigningOut(true);
    setSignOutError(null);
    try {
      // Frontend state is cleared inside signOut only after the backend request is handled, so a
      // failed logout leaves the user signed in rather than faking a local sign-out.
      await signOut();
      navigate('/login', { replace: true });
    } catch (error) {
      setSignOutError(describeApiError(error));
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <div className="flex h-screen w-full bg-slate-50 font-sans text-slate-800 selection:bg-indigo-100 selection:text-indigo-900">
      {/*
        The sidebar collapses to an icon rail below `lg` so a narrow screen keeps most of its width
        for the content area, where the organization and task views live.
      */}
      <aside className="relative z-10 flex h-full w-16 flex-shrink-0 flex-col border-r border-slate-200/60 bg-white shadow-sm lg:w-64">
        <div className="flex items-center justify-center gap-2 border-b border-slate-100 p-4 lg:justify-start lg:p-6">
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-blue-600 text-white shadow-md shadow-indigo-200">
            <Sparkles className="h-4 w-4" aria-hidden="true" />
          </div>
          <h1 className="hidden bg-gradient-to-r from-slate-900 to-slate-600 bg-clip-text text-xl font-bold text-transparent lg:block">
            mutiAI
          </h1>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto p-2 lg:p-4">
          <NavItem to="/" icon={<MessageSquare className="h-5 w-5" />} label="平台小助理" />
          <NavItem to="/orgs" icon={<Users className="h-5 w-5" />} label="组织管理" />
          {/*
            Channel connections are a later milestone. The entry stays visible as a roadmap marker,
            but it links nowhere and shows no connection state, because no backend contract exists.
          */}
          <div
            aria-disabled="true"
            title="微信对接：将在后续里程碑提供后端契约后开放"
            className="flex cursor-not-allowed items-center justify-center rounded-xl px-3 py-2.5 text-sm font-medium text-slate-400 lg:justify-start"
          >
            <Smartphone className="h-5 w-5 flex-shrink-0 lg:mr-3" aria-hidden="true" />
            <span className="hidden truncate lg:inline">微信对接</span>
            <span className="ml-auto hidden rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500 lg:inline">
              后续
            </span>
          </div>
        </nav>

        <div className="space-y-1 border-t border-slate-100 bg-slate-50/50 p-2 lg:p-4">
          {state.status === 'authenticated' ? (
            <p className="hidden truncate px-3 pb-1 text-xs font-medium text-slate-500 lg:block">
              {state.user.display_name}
            </p>
          ) : null}
          <NavItem to="/profile" icon={<User className="h-5 w-5" />} label="个人中心" />
          <button
            type="button"
            onClick={handleSignOut}
            disabled={signingOut}
            title="退出登录"
            className="flex w-full items-center justify-center rounded-xl px-3 py-2.5 text-left text-sm font-medium text-slate-600 transition-all duration-200 hover:bg-red-50 hover:text-red-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-red-500/15 disabled:cursor-not-allowed disabled:opacity-60 lg:justify-start"
          >
            <LogOut className="h-5 w-5 flex-shrink-0 lg:mr-3" aria-hidden="true" />
            <span className="hidden lg:inline">{signingOut ? '退出中...' : '退出登录'}</span>
          </button>
          {signOutError ? (
            <p role="alert" className="px-2 pt-1 text-xs leading-relaxed text-red-600">
              {signOutError}
            </p>
          ) : null}
        </div>
      </aside>

      <main className="flex h-full min-w-0 flex-1 flex-col overflow-hidden bg-slate-50/50">
        <Outlet />
      </main>
    </div>
  );
}

function NavItem({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      title={label}
      className={({ isActive }) =>
        `flex items-center justify-center rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 focus:outline-none focus-visible:ring-4 focus-visible:ring-indigo-500/15 lg:justify-start ${
          isActive
            ? 'border border-indigo-100/50 bg-gradient-to-r from-indigo-50 to-blue-50 text-indigo-700 shadow-sm'
            : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
        }`
      }
    >
      <div className="flex-shrink-0 lg:mr-3" aria-hidden="true">
        {icon}
      </div>
      <span className="hidden truncate lg:inline">{label}</span>
    </NavLink>
  );
}
