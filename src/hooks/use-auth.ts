import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getSupabaseAuthConfigError,
  restoreSupabaseSession,
  signInWithPassword,
  signOutSupabase,
  type PersistedAuthSession,
} from '@/lib/supabase-auth';
import { getDesktopBridge } from '@/lib/desktop-bridge';
import {
  LEGACY_STORAGE_KEYS,
  readLocalStorageItem,
  readSessionStorageItem,
  removeLocalStorageItem,
  removeSessionStorageItem,
  STORAGE_KEYS,
  writeLocalStorageItem,
} from '@/lib/storage-keys';

/* Storage-backed auth session type */
export type AuthSession = PersistedAuthSession;

type LoginCredentials = {
  email: string;
  password: string;
  rememberMe: boolean;
};

const AUTH_LOCAL_STORAGE_KEY = STORAGE_KEYS.authLocal;
const AUTH_LOCAL_STORAGE_LEGACY_KEYS = [LEGACY_STORAGE_KEYS.authLocal] as const;
const AUTH_SESSION_STORAGE_KEY = STORAGE_KEYS.authSession;
const AUTH_SESSION_STORAGE_LEGACY_KEYS = [LEGACY_STORAGE_KEYS.authSession] as const;
const CLOFFICE_USAGE_MODE_KEY = STORAGE_KEYS.usageMode;
const CLOFFICE_USAGE_MODE_LEGACY_KEYS = [LEGACY_STORAGE_KEYS.usageMode] as const;
const CLOFFICE_ONBOARDING_KEY = STORAGE_KEYS.onboardingComplete;
const CLOFFICE_ONBOARDING_LEGACY_KEYS = [LEGACY_STORAGE_KEYS.onboardingComplete] as const;

function clearAuthStorage() {
  removeLocalStorageItem(AUTH_LOCAL_STORAGE_KEY, AUTH_LOCAL_STORAGE_LEGACY_KEYS);
  removeSessionStorageItem(AUTH_SESSION_STORAGE_KEY, AUTH_SESSION_STORAGE_LEGACY_KEYS);
}

function readLegacyStoredAuthSession(): AuthSession | null {
  const localRaw = readLocalStorageItem(AUTH_LOCAL_STORAGE_KEY, AUTH_LOCAL_STORAGE_LEGACY_KEYS);
  const sessionRaw = readSessionStorageItem(AUTH_SESSION_STORAGE_KEY, AUTH_SESSION_STORAGE_LEGACY_KEYS);
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

async function readStoredAuthSession(): Promise<AuthSession | null> {
  const bridge = getDesktopBridge();
  const stored = bridge?.getAuthSession ? await bridge.getAuthSession() : null;
  return stored ?? null;
}

async function persistAuthSession(session: AuthSession): Promise<void> {
  const bridge = getDesktopBridge();
  if (bridge?.saveAuthSession) {
    await bridge.saveAuthSession(session);
  }
  clearAuthStorage();
}

async function clearPersistedAuthSession(): Promise<void> {
  const bridge = getDesktopBridge();
  if (bridge?.clearAuthSession) {
    await bridge.clearAuthSession();
  }
  clearAuthStorage();
}

type UseAuthOptions = {
  onStatusChange?: (message: string) => void;
};

export function useAuth({ onStatusChange }: UseAuthOptions = {}) {
  const statusRef = useRef(onStatusChange);
  useEffect(() => {
    statusRef.current = onStatusChange;
  }, [onStatusChange]);

  const [authSession, setAuthSession] = useState<AuthSession | null>(null);
  const [authenticating, setAuthenticating] = useState(false);
  const [authError, setAuthError] = useState('');
  const [guestMode, setGuestMode] = useState(true);
  const [onboardingComplete, setOnboardingComplete] = useState(
    () => readLocalStorageItem(CLOFFICE_ONBOARDING_KEY, CLOFFICE_ONBOARDING_LEGACY_KEYS) === 'true',
  );

  useEffect(() => {
    const storedUsageMode = readLocalStorageItem(CLOFFICE_USAGE_MODE_KEY, CLOFFICE_USAGE_MODE_LEGACY_KEYS);
    if (storedUsageMode === 'guest') {
      setGuestMode(true);
      statusRef.current?.('Running in local mode.');
    }

    let cancelled = false;

    const recoverSession = async () => {
      const secureSession = await readStoredAuthSession();
      const legacySession = readLegacyStoredAuthSession();
      const storedSession = secureSession ?? legacySession;
      if (legacySession) {
        clearAuthStorage();
      }
      if (!secureSession && legacySession) {
        await persistAuthSession(legacySession);
      }

      if (!storedSession) {
        const configError = getSupabaseAuthConfigError();
        if (configError && storedUsageMode !== 'guest' && !cancelled) {
          setAuthError(configError);
        }
        return;
      }

      if (!cancelled) {
        setAuthenticating(true);
      }

      try {
        const restored = await restoreSupabaseSession(storedSession);
        if (cancelled) {
          return;
        }
        setAuthSession(restored);
        setGuestMode(false);
        writeLocalStorageItem(CLOFFICE_USAGE_MODE_KEY, 'auth', CLOFFICE_USAGE_MODE_LEGACY_KEYS);
        await persistAuthSession(restored);
        statusRef.current?.(`Signed in as ${restored.email}.`);
      } catch {
        if (cancelled) {
          return;
        }
        await clearPersistedAuthSession();
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
  }, []);

  const handleLogin = useCallback(async (credentials: LoginCredentials) => {
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
      writeLocalStorageItem(CLOFFICE_USAGE_MODE_KEY, 'auth', CLOFFICE_USAGE_MODE_LEGACY_KEYS);
      await persistAuthSession(session);
      statusRef.current?.(`Signed in as ${session.email}.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid credentials.';
      setAuthError(message);
    } finally {
      setAuthenticating(false);
    }
  }, []);

  const handleLogout = useCallback(() => {
    if (authSession) {
      void signOutSupabase().catch(() => {
        // local cleanup below still ends the desktop session
      });
    }
    void clearPersistedAuthSession();
    setAuthSession(null);
    setGuestMode(false);
    removeLocalStorageItem(CLOFFICE_USAGE_MODE_KEY, CLOFFICE_USAGE_MODE_LEGACY_KEYS);
    setAuthError('');
    statusRef.current?.('Signed out.');
  }, [authSession]);

  const handleContinueAsGuest = useCallback(() => {
    setGuestMode(true);
    setAuthError('');
    setAuthSession(null);
    void clearPersistedAuthSession();
    writeLocalStorageItem(CLOFFICE_USAGE_MODE_KEY, 'guest', CLOFFICE_USAGE_MODE_LEGACY_KEYS);
    statusRef.current?.('Running in local mode. Sign in anytime for hosted cloud features.');
  }, []);

  const completeOnboarding = useCallback(() => {
    writeLocalStorageItem(CLOFFICE_ONBOARDING_KEY, 'true', CLOFFICE_ONBOARDING_LEGACY_KEYS);
    setOnboardingComplete(true);
  }, []);

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
