/**
 * Global authentication state.
 *
 * The session is an HttpOnly cookie the frontend cannot read, so authentication is never inferred
 * from browser storage. It is resolved by asking the backend through `GET /api/v1/auth/me` and is
 * lost only when the backend says so with a 401.
 */
import { createContext, useContext } from 'react';
import type { ApiError } from '../api/errors';
import type { User } from '../api/types';

/** Why the frontend currently holds no session. */
export type SignedOutReason =
  /** Bootstrap found no session. */
  | 'initial'
  /** The backend rejected a request with 401 while the app believed it was signed in. */
  | 'session_expired'
  /** The user signed out and the backend confirmed it. */
  | 'signed_out';

export type AuthState =
  /** Bootstrap is still resolving. Protected data must not render yet. */
  | { status: 'loading' }
  | { status: 'authenticated'; user: User }
  | { status: 'unauthenticated'; reason: SignedOutReason }
  /**
   * The session could not be resolved because the backend was unreachable or answered unexpectedly.
   * This is deliberately distinct from `unauthenticated`: a backend that is down must not be
   * presented to the user as a sign-out.
   */
  | { status: 'error'; error: ApiError };

export interface AuthContextValue {
  state: AuthState;
  /** Sign in. Throws `ApiError` so the caller can render the contracted message. */
  signIn: (username: string, password: string) => Promise<void>;
  /** Sign out. Frontend state is cleared only after the backend request is handled. */
  signOut: () => Promise<void>;
  /** Re-resolve the session against the backend, for retry after an error state. */
  refresh: () => Promise<void>;
  /** Replace the held user with one the backend just returned, e.g. after a profile update. */
  setUser: (user: User) => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>.');
  return value;
}

/** Convenience accessor for screens that already render inside a route guard. */
export function useAuthenticatedUser(): User {
  const { state } = useAuth();
  if (state.status !== 'authenticated') {
    throw new Error('useAuthenticatedUser requires an authenticated session.');
  }
  return state.user;
}
