import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Cpu, LogOut, MessageSquare, MoreHorizontal, Smartphone, Sparkles, Store, User, Users, Waypoints } from 'lucide-react';
import { useAuth } from '../auth/context';
import { describeApiError } from '../api/errors';
import Assistant from '../pages/Assistant';
import { ThemeToggle } from '../theme/ThemeProvider';

export default function SidebarLayout() {
  const { state, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const assistantVisible = location.pathname === '/';
  const assistantSurfaceRef = useRef<HTMLElement>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);

  useLayoutEffect(() => {
    assistantSurfaceRef.current?.toggleAttribute('inert', !assistantVisible);
  }, [assistantVisible]);

  useEffect(() => {
    setMobileMoreOpen(false);
  }, [location.pathname]);

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
      setMobileMoreOpen(true);
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <div className="nexwork-app-shell flex h-[100dvh] w-full flex-col bg-slate-50 font-sans text-slate-800 selection:bg-indigo-100 selection:text-indigo-900 md:flex-row">
      {/* Phones use the bottom navigation below. Tablets keep the compact rail; desktop shows labels. */}
      <aside className="nexwork-sidebar relative z-10 hidden h-full w-16 flex-shrink-0 flex-col border-r border-slate-200/60 bg-white shadow-sm md:flex lg:w-64">
        <div className="flex items-center justify-center gap-2 border-b border-slate-100 p-4 lg:justify-start lg:p-6">
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-blue-600 text-white shadow-md shadow-indigo-200">
            <Sparkles className="h-4 w-4" aria-hidden="true" />
          </div>
          <h1 className="nexwork-brand hidden bg-gradient-to-r from-slate-900 to-slate-600 bg-clip-text text-xl font-bold text-transparent lg:block">
            Nexwork
          </h1>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto p-2 lg:p-4">
          <NavItem to="/" icon={<MessageSquare className="h-5 w-5" />} label="平台小助理" />
          <NavItem to="/orgs" icon={<Users className="h-5 w-5" />} label="组织管理" />
          <NavItem to="/experts" icon={<Store className="h-5 w-5" />} label="专家市场" />
          <NavItem to="/coordination" icon={<Waypoints className="h-5 w-5" />} label="协作中心" />
          <NavItem to="/runtime" icon={<Cpu className="h-5 w-5" />} label="Runtime 配置" />
          <NavItem to="/channels" icon={<Smartphone className="h-5 w-5" />} label="微信对接" />
        </nav>

        <div className="nexwork-sidebar-footer space-y-1 border-t border-slate-100 bg-slate-50/50 p-2 lg:p-4">
          <ThemeToggle />
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

      <main className="nexwork-main-surface relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-slate-50/50">
        {/*
          Keep the conversation mounted and fully laid out like a chat client. `visibility` hides
          the layer without collapsing its box, while `inert` removes the inactive layer from focus
          navigation and the accessibility tree. Route changes still preserve the rendered history,
          product-backed diagrams, event stream, dimensions, and exact scroll position.
        */}
        <section
          ref={assistantSurfaceRef}
          className={`absolute inset-0 h-full min-h-0 ${
            assistantVisible ? 'visible' : 'invisible pointer-events-none'
          }`}
        >
          <Assistant />
        </section>
        {assistantVisible ? null : <Outlet />}
      </main>

      <nav
        aria-label="移动端主导航"
        className="nexwork-mobile-nav relative z-20 flex shrink-0 items-stretch border-t border-slate-200/80 bg-white/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_24px_rgba(15,23,42,0.06)] backdrop-blur-md md:hidden"
      >
        {mobileMoreOpen ? (
          <>
            <button
              type="button"
              aria-label="关闭更多菜单"
              onClick={() => setMobileMoreOpen(false)}
              className="fixed inset-0 z-30 cursor-default bg-slate-950/25 backdrop-blur-[1px]"
            />
            <section
              id="mobile-more-menu"
              aria-label="更多功能"
              className="absolute bottom-full left-3 right-3 z-40 mb-3 overflow-hidden rounded-2xl border border-slate-200 bg-white p-3 shadow-2xl shadow-slate-950/20"
            >
              <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-slate-200" aria-hidden="true" />
              {state.status === 'authenticated' ? (
                <p className="truncate px-2 pb-2 text-xs font-medium text-slate-500">{state.user.display_name}</p>
              ) : null}
              <div className="grid grid-cols-2 gap-2">
                <MobileMoreNavItem
                  to="/coordination"
                  icon={<Waypoints className="h-5 w-5" />}
                  label="协作中心"
                  onSelect={() => setMobileMoreOpen(false)}
                />
                <MobileMoreNavItem
                  to="/runtime"
                  icon={<Cpu className="h-5 w-5" />}
                  label="Runtime 配置"
                  onSelect={() => setMobileMoreOpen(false)}
                />
                <MobileMoreNavItem
                  to="/profile"
                  icon={<User className="h-5 w-5" />}
                  label="个人中心"
                  onSelect={() => setMobileMoreOpen(false)}
                />
              </div>
              <div className="mt-2">
                <ThemeToggle compact />
              </div>
              <button
                type="button"
                onClick={handleSignOut}
                disabled={signingOut}
                className="mt-2 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-red-100 bg-red-50 px-4 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100 focus:outline-none focus-visible:ring-4 focus-visible:ring-red-500/15 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <LogOut className="h-5 w-5" aria-hidden="true" />
                {signingOut ? '退出中...' : '退出登录'}
              </button>
              {signOutError ? (
                <p role="alert" className="mt-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-center text-xs text-red-700">
                  {signOutError}
                </p>
              ) : null}
            </section>
          </>
        ) : null}
        <MobileNavItem to="/" icon={<MessageSquare className="h-5 w-5" />} label="小助理" />
        <MobileNavItem to="/orgs" icon={<Users className="h-5 w-5" />} label="组织" />
        <MobileNavItem to="/experts" icon={<Store className="h-5 w-5" />} label="专家" />
        <MobileNavItem to="/channels" icon={<Smartphone className="h-5 w-5" />} label="微信" />
        <button
          type="button"
          onClick={() => setMobileMoreOpen((open) => !open)}
          className={`flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-1 px-1 text-[10px] font-medium transition-colors focus:outline-none focus-visible:bg-indigo-50 focus-visible:text-indigo-700 ${
            mobileMoreOpen ||
            location.pathname.startsWith('/coordination') ||
            location.pathname === '/runtime' ||
            location.pathname === '/profile'
              ? 'bg-indigo-50/80 text-indigo-700'
              : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
          }`}
          aria-expanded={mobileMoreOpen}
          aria-controls="mobile-more-menu"
          aria-label={mobileMoreOpen ? '关闭更多菜单' : '打开更多菜单'}
        >
          <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
          <span>更多</span>
        </button>
      </nav>
    </div>
  );
}

function MobileMoreNavItem({
  to,
  icon,
  label,
  onSelect,
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
  onSelect: () => void;
}) {
  return (
    <NavLink
      to={to}
      onClick={onSelect}
      className={({ isActive }) =>
        `flex min-h-14 items-center gap-3 rounded-xl border px-3 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-4 focus-visible:ring-indigo-500/15 ${
          isActive
            ? 'border-indigo-100 bg-indigo-50 text-indigo-700'
            : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-indigo-100 hover:bg-indigo-50 hover:text-indigo-700'
        }`
      }
    >
      <span aria-hidden="true">{icon}</span>
      <span className="min-w-0 truncate">{label}</span>
    </NavLink>
  );
}

function MobileNavItem({
  to,
  icon,
  label,
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) =>
        `flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-1 px-1 text-[10px] font-medium transition-colors focus:outline-none focus-visible:bg-indigo-50 focus-visible:text-indigo-700 ${
          isActive ? 'bg-indigo-50/80 text-indigo-700' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
        }`
      }
    >
      {icon}
      <span className="max-w-full truncate">{label}</span>
    </NavLink>
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
