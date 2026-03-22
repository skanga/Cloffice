import { createClient, type Session } from '@supabase/supabase-js';

export type PersistedAuthSession = {
  email: string;
  rememberMe: boolean;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
};

let supabaseClient: ReturnType<typeof createClient> | null = null;

function getSupabaseConfig() {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error('Supabase auth is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
  }

  return { url, anonKey };
}

function toPersistedSession(session: Session, rememberMe: boolean, fallbackEmail: string): PersistedAuthSession {
  return {
    email: session.user.email ?? fallbackEmail,
    rememberMe,
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    expiresAt: session.expires_at ? session.expires_at * 1000 : Date.now() + 1000 * 60 * 60,
  };
}

export function getSupabaseAuthConfigError(): string | null {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return 'Supabase auth is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.';
  }

  return null;
}

export function getSupabaseClient() {
  if (!supabaseClient) {
    const { url, anonKey } = getSupabaseConfig();
    supabaseClient = createClient(url, anonKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }

  return supabaseClient;
}

export async function signInWithPassword(email: string, password: string, rememberMe: boolean): Promise<PersistedAuthSession> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    throw new Error(error.message || 'Invalid credentials.');
  }

  if (!data.session) {
    throw new Error('Authentication failed. No session was returned.');
  }

  return toPersistedSession(data.session, rememberMe, email);
}

export async function restoreSupabaseSession(stored: PersistedAuthSession): Promise<PersistedAuthSession> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.setSession({
    access_token: stored.accessToken,
    refresh_token: stored.refreshToken,
  });

  if (error || !data.session) {
    throw new Error(error?.message || 'Stored session is no longer valid.');
  }

  return toPersistedSession(data.session, stored.rememberMe, stored.email);
}

export async function signOutSupabase() {
  const supabase = getSupabaseClient();
  await supabase.auth.signOut();
}
