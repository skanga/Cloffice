import { useEffect, useRef, useState } from 'react';
import {
  getSupabaseAuthConfigError,
  restoreSupabaseSession,
  signInWithPassword,
  signOutSupabase,
} from '@/lib/supabase-auth';

/* ── Types ───────────────────────────────────────────────────────────────── */

export type AuthSession = {
  email: string;
  accessToken: string;
  refreshToken: string;
  rememberMe: boolean;
  expiresAt: number;
};

type LoginCredentials = {
  email: string;
  password: string;
  rememberMe: boolean;
};

/* ── Storage constants (private) ─────────────────────────────────────────── */

const AUTH_LOCAL_STORAGE_KEY = 'relay.auth.local';
const AUTH_SESSION_STORAGE_KEY = 'relay.auth.session';
const RELAY_USAGE_MODE_KEY = 'relay.usage.mode';
const RELAY_ONBOARDING_KEY = 'relay.onboarding.complete';

/* ── Storage helpers (private) ───────────────────────────────────────────── */

function clearAuthStorage() {
  localStorage.removeItem(AUTH_LOCAL_STORAGE_KEY);
  sessionStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
}

function persistAuthSession(session: AuthSession) {
  clearAuthStorage();
  const serialized = JSON.stringify(session);
  if (session.rememberMe) {
    localStorage.setItem(AUTH_LOCAL_STORAGE_KEY, serialized);
    return;
  }
  sessionStorage.setItem(AUTH_SESSION_STORAGE_KEY, serialized);
}

function readStoredAuthSession(): AuthSession | null {
  const localRaw = localStorage.getItem(AUTH_LOCAL_STORAGE_KEY);
  const sessionRaw = sessionStorage.getItem(AUTH_SESSION_STORAGE_KEY);
  const raw = localRaw ?? sessionRaw;
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<AuthSession>;
    if (
      typeof parsed.email !== 'string' ||
      typeof parsed.accessToken !== 'string' ||
      typeof parsed.refreshToken !== 'string' ||
      typeof parsed.rememberMe !== 'boolean' ||
      typeof parsed.expiresAt !== 'number'
    ) {
      return null;
    }
    return {
      email: parsed.email,
      accessToken: parsed.accessToken,
      refreshToken: parsed.refreshToken,
      rememberMe: parsed.rememberMe,
      expiresAt: parsed.expiresAt,
    };
  } catch {
    return null;
  }
}

/* ── Hook ────────────────────────────────────────────────────────────────── */

type UseAuthOptions = {
  onStatusChange?: (message: string) => void;
};

export function useAuth({ onStatusChange }: UseAuthOptions = {}) {
  // Use a ref so the setup effect always calls the latest version of the
  // callback without needing to be in the dependency array.
  const statusRef = useRef(onStatusChange);
  useEffect(() => {
    statusRef.current = onStatusChange;
  }, [onStatusChange]);

  const [authSession, setAuthSession] = useState<AuthSession | null>(null);
  const [authenticating, setAuthenticating] = useState(false);
  const [authError, setAuthError] = useState('');
  const [guestMode, setGuestMode] = useState(false);
  const [onboardingComplete, setOnboardingComplete] = useState(
    () => localStorage.getItem(RELAY_ONBOARDING_KEY) === 'true',
  );

  // Session recovery on mount
  useEffect(() => {
    const storedUsageMode = localStorage.getItem(RELAY_USAGE_MODE_KEY);
    if (storedUsageMode === 'guest') {
      setGuestMode(true);
      statusRef.current?.('Running in local mode.');
    }

    const storedSession = readStoredAuthSession();
    if (!storedSession) {
      const configError = getSupabaseAuthConfigError();
      if (configError && storedUsageMode !== 'guest') {
        setAuthError(configError);
      }
      return;
    }

    let cancelled = false;
    setAuthenticating(true);

    const recoverSession = async () => {
      try {
        const restored = await restoreSupabaseSession(storedSession);
        if (cancelled) {
          return;
        }
        setAuthSession(restored);
        setGuestMode(false);
        localStorage.setItem(RELAY_USAGE_MODE_KEY, 'auth');
        persistAuthSession(restored);
        statusRef.current?.(`Signed in as ${restored.email}.`);
      } catch {
        if (cancelled) {
          return;
        }
        clearAuthStorage();
        setAuthError('Session expired or invalid. Please login again.');
      } finally {
        if (!cancelled) {
          setAuthenticating(false);
        }
      }
    };

    void recoverSession();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLogin = async (credentials: LoginCredentials) => {
    setAuthError('');

    const configError = getSupabaseAuthConfigError();
    if (configError) {
      setAuthError(configError);
      return;
    }

    const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(credentials.email);
    if (!isValidEmail) {
      setAuthError('Invalid credentials. Use a valid work email.');
      return;
    }

    if (!credentials.password.trim()) {
      setAuthError('Invalid credentials. Password is required.');
      return;
    }

    setAuthenticating(true);
    try {
      const session = await signInWithPassword(credentials.email, credentials.password, credentials.rememberMe);
      setAuthSession(session);
      setGuestMode(false);
      localStorage.setItem(RELAY_USAGE_MODE_KEY, 'auth');
      persistAuthSession(session);
      statusRef.current?.(`Signed in as ${session.email}.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid credentials.';
      setAuthError(message);
    } finally {
      setAuthenticating(false);
    }
  };

  const handleLogout = () => {
    if (authSession) {
      void signOutSupabase().catch(() => {
        // local cleanup below still ends the desktop session
      });
    }
    setAuthSession(null);
    setGuestMode(false);
    localStorage.removeItem(RELAY_USAGE_MODE_KEY);
    clearAuthStorage();
    setAuthError('');
    statusRef.current?.('Signed out.');
  };

  const handleContinueAsGuest = () => {
    setGuestMode(true);
    setAuthError('');
    setAuthSession(null);
    clearAuthStorage();
    localStorage.setItem(RELAY_USAGE_MODE_KEY, 'guest');
    statusRef.current?.('Running in local mode. Sign in anytime for hosted cloud features.');
  };

  /** Sets onboarding as complete. Caller is responsible for navigation side-effects. */
  const completeOnboarding = () => {
    localStorage.setItem(RELAY_ONBOARDING_KEY, 'true');
    setOnboardingComplete(true);
  };

  return {
    authSession,
    authenticating,
    authError,
    guestMode,
    onboardingComplete,
    canUseAppShell: Boolean(authSession) || guestMode,
    userIdentityLabel: authSession?.email ?? 'Guest (local mode)',
    usageModeLabel: guestMode ? 'Local mode' : authSession ? 'Cloud mode' : 'Signed out',
    handleLogin,
    handleLogout,
    handleContinueAsGuest,
    completeOnboarding,
  };
}
