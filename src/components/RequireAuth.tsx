import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/context';
import { ErrorState, LoadingState } from './states';

/**
 * Route guard for every screen that reads owner-scoped product data.
 *
 * Protected content renders only for a confirmed `authenticated` state. While bootstrap is still
 * resolving, nothing protected is mounted, so an expired session can never briefly expose data.
 */
export default function RequireAuth() {
  const { state, refresh } = useAuth();
  const location = useLocation();

  if (state.status === 'loading') {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-slate-50">
        <LoadingState label="正在恢复会话..." />
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-slate-50 p-8">
        <div className="w-full max-w-lg">
          <ErrorState error={state.error} title="无法确认登录状态" onRetry={refresh} />
        </div>
      </div>
    );
  }

  if (state.status === 'unauthenticated') {
    // Remember where the user was headed so sign-in can return them there.
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
}
