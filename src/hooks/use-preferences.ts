import { useCallback, useEffect, useRef, useState } from 'react';
import type { UserPreferences } from '@/app-types';

const defaultPreferences: UserPreferences = {
  fullName: '',
  displayName: '',
  role: '',
  responsePreferences: '',
  systemPrompt: '',
  theme: 'light',
  style: 'relay',
  language: 'en',
};

const RELAY_PREFERENCES_KEY = 'relay.preferences';

export function usePreferences() {
  const [preferences, setPreferences] = useState<UserPreferences>(() => {
    try {
      const stored = localStorage.getItem(RELAY_PREFERENCES_KEY);
      if (stored) return { ...defaultPreferences, ...JSON.parse(stored) };
    } catch { /* ignore */ }
    return defaultPreferences;
  });

  const updatePreferences = useCallback((patch: Partial<UserPreferences>) => {
    setPreferences((prev) => {
      const next = { ...prev, ...patch };
      localStorage.setItem(RELAY_PREFERENCES_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  // Apply theme class to document
  useEffect(() => {
    const root = document.documentElement;
    if (preferences.theme === 'dark') {
      root.classList.add('dark');
    } else if (preferences.theme === 'auto') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      root.classList.toggle('dark', prefersDark);
      const handler = (e: MediaQueryListEvent) => root.classList.toggle('dark', e.matches);
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      mq.addEventListener('change', handler);
      return () => mq.removeEventListener('change', handler);
    } else {
      root.classList.remove('dark');
    }
  }, [preferences.theme]);

  useEffect(() => {
    document.documentElement.lang = preferences.language;
  }, [preferences.language]);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('relay-style', preferences.style === 'relay');
  }, [preferences.style]);

  return { preferences, updatePreferences };
}

// Re-export the type alias so callers can import it from this module if needed
export type { UserPreferences };
