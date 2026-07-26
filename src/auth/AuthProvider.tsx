import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getCurrentUser, login as loginRequest, logout as logoutRequest } from '../api/endpoints';
import { ApiError, apiErrorFromThrown } from '../api/errors';
import { setUnauthorizedListener } from '../api/http';
import { AuthContext, type AuthContextValue, type AuthState } from './context';

/**
 * Resolves and owns the browser session for the whole application.
 *
 * Bootstrap asks the backend who the current user is. A 401 during any later request tears the
 * session down globally so protected data cannot stay on screen after the backend has rejected it.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });

  // Read inside the 401 listener without making the listener depend on the current state.
  const stateRef = useRef(state);
  stateRef.current = state;

  const resolveSession = useCallback(async (signal?: AbortSignal) => {
    setState({ status: 'loading' });
    try {
      const user = await getCurrentUser(signal);
      setState({ status: 'authenticated', user });
    } catch (cause) {
      const error = apiErrorFromThrown(cause);
      if (error.kind === 'aborted') return;
      if (error.isUnauthenticated) {
        setState({ status: 'unauthenticated', reason: 'initial' });
        return;
      }
      // The backend is unreachable or misbehaving. Do not report this as a sign-out.
      setState({ status: 'error', error });
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void resolveSession(controller.signal);
    return () => controller.abort();
  }, [resolveSession]);

  useEffect(() => {
    setUnauthorizedListener(() => {
      // Only a session the app believed in can expire. A 401 while already signed out changes
      // nothing, and overwriting the reason would misreport why the user is on the login screen.
      if (stateRef.current.status !== 'authenticated') return;
      setState({ status: 'unauthenticated', reason: 'session_expired' });
    });
    return () => setUnauthorizedListener(null);
  }, []);

  const signIn = useCallback(async (username: string, password: string) => {
    // Let the error propagate: the login form owns the invalid-credential message, and the session
    // state must not flip to authenticated on a failure.
    const response = await loginRequest({ username, password });
    setState({ status: 'authenticated', user: response.user });
  }, []);

  const signOut = useCallback(async () => {
    try {
      await logoutRequest();
    } catch (cause) {
      const error = apiErrorFromThrown(cause);
      // A rejected session is already gone; anything else leaves the server session intact, so the
      // frontend must not pretend the user signed out.
      if (!(error instanceof ApiError) || !error.isUnauthenticated) throw error;
    }
    setState({ status: 'unauthenticated', reason: 'signed_out' });
  }, []);

  const refresh = useCallback(() => resolveSession(), [resolveSession]);

  const value = useMemo<AuthContextValue>(
    () => ({ state, signIn, signOut, refresh }),
    [state, signIn, signOut, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
