import React, { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Loader2, Sparkles } from 'lucide-react';
import { motion } from 'motion/react';
import { useAuth } from '../auth/context';
import { describeApiError } from '../api/errors';
import { LoadingState } from '../components/states';

interface RedirectState {
  from?: { pathname?: string };
}

export default function Login() {
  const { state, signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Wait for bootstrap rather than flashing the form at a user who already has a session.
  if (state.status === 'loading') {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-slate-50">
        <LoadingState label="正在恢复会话..." />
      </div>
    );
  }

  if (state.status === 'authenticated') {
    const from = (location.state as RedirectState | null)?.from?.pathname;
    return <Navigate to={from && from !== '/login' ? from : '/'} replace />;
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      // There is no development bypass. Only a backend-issued session grants access, so a rejected
      // login keeps the user on this page regardless of which account was used.
      await signIn(username, password);
      const from = (location.state as RedirectState | null)?.from?.pathname;
      navigate(from && from !== '/login' ? from : '/', { replace: true });
    } catch (cause) {
      setError(describeApiError(cause));
    } finally {
      setSubmitting(false);
    }
  };

  const expired = state.status === 'unauthenticated' && state.reason === 'session_expired';

  return (
    <div className="flex h-screen w-full items-center justify-center bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-50 via-slate-50 to-white p-4">
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="w-full max-w-md rounded-3xl border border-white bg-white/80 p-8 shadow-xl shadow-slate-200/50 backdrop-blur-xl"
      >
        <div className="mb-10 flex flex-col items-center text-center">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1, rotate: 360 }}
            transition={{ type: 'spring', stiffness: 200, damping: 20, delay: 0.1 }}
            className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-blue-600 text-white shadow-lg shadow-indigo-200"
          >
            <Sparkles className="h-6 w-6" aria-hidden="true" />
          </motion.div>
          <h1 className="bg-gradient-to-r from-slate-900 to-slate-700 bg-clip-text text-3xl font-bold text-transparent">
            mutiAI
          </h1>
          <p className="mt-2 font-medium text-slate-500">登录到您的工作区</p>
        </div>

        {expired ? (
          <div
            role="status"
            className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
          >
            会话已过期，请重新登录。
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="space-y-5" noValidate>
          <div>
            <label htmlFor="username" className="mb-1.5 block text-sm font-medium text-slate-700">
              用户名
            </label>
            <input
              id="username"
              name="username"
              type="text"
              autoComplete="username"
              required
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 transition-all duration-200 focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>

          <div>
            <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-slate-700">
              密码
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 transition-all duration-200 focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>

          {error ? (
            <motion.p
              role="alert"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-center text-sm leading-relaxed text-red-700"
            >
              {error}
            </motion.p>
          ) : null}

          <motion.button
            whileHover={{ scale: submitting ? 1 : 1.02 }}
            whileTap={{ scale: submitting ? 1 : 0.98 }}
            type="submit"
            disabled={submitting || username.length === 0 || password.length === 0}
            className="flex w-full items-center justify-center rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 px-4 py-3 font-medium text-white shadow-lg shadow-indigo-200 transition-all duration-200 hover:from-indigo-700 hover:to-blue-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {submitting ? <Loader2 className="h-5 w-5 animate-spin" aria-label="登录中" /> : '登录'}
          </motion.button>
        </form>
      </motion.div>
    </div>
  );
}
