import { useCallback, useEffect, useState } from 'react';
import type { UserPreferences } from '@/app-types';
import { LEGACY_STORAGE_KEYS, readLocalStorageItem, STORAGE_KEYS, writeLocalStorageItem } from '@/lib/storage-keys';

const defaultPreferences: UserPreferences = {
  fullName: '',
  displayName: '',
  role: '',
  responsePreferences: '',
  systemPrompt: '',
  injectMemory: true,
  theme: 'light',
  style: 'cloffice',
  language: 'en',
};

const CLOFFICE_PREFERENCES_KEY = STORAGE_KEYS.preferences;
const CLOFFICE_PREFERENCES_LEGACY_KEYS = [LEGACY_STORAGE_KEYS.preferences] as const;

export function usePreferences() {
  const [preferences, setPreferences] = useState<UserPreferences>(() => {
    try {
      const stored = readLocalStorageItem(CLOFFICE_PREFERENCES_KEY, CLOFFICE_PREFERENCES_LEGACY_KEYS);
      if (stored) {
        const parsed = JSON.parse(stored) as Partial<UserPreferences> & { style?: string };
        return {
          ...defaultPreferences,
          ...parsed,
          style: parsed.style ?? defaultPreferences.style,
        };
      }
    } catch {
      // ignore malformed local state and fall back to defaults
    }
    return defaultPreferences;
  });

  const updatePreferences = useCallback((patch: Partial<UserPreferences>) => {
    setPreferences((prev) => {
      const next = { ...prev, ...patch };
      writeLocalStorageItem(CLOFFICE_PREFERENCES_KEY, JSON.stringify(next), CLOFFICE_PREFERENCES_LEGACY_KEYS);
      return next;
    });
  }, []);

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
    root.classList.toggle('cloffice-style', preferences.style === 'cloffice');
  }, [preferences.style]);

  return { preferences, updatePreferences };
}

export type { UserPreferences };
