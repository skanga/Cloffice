export const STORAGE_KEYS = {
  config: 'cloffice.config',
  engineConnections: 'cloffice.engine.connections.v1',
  coworkProjects: 'cloffice.cowork.projects.v1',
  coworkActiveProject: 'cloffice.cowork.projects.active.v1',
  coworkTasks: 'cloffice.cowork.tasks.v1',
  coworkProjectKnowledge: 'cloffice.cowork.project.knowledge.v1',
  coworkWebSearchMode: 'cloffice.cowork.websearch.v1',
  chatDraft: 'cloffice.chat.draft.v1',
  coworkDraft: 'cloffice.cowork.draft.v1',
  authLocal: 'cloffice.auth.local',
  authSession: 'cloffice.auth.session',
  usageMode: 'cloffice.usage.mode',
  onboardingComplete: 'cloffice.onboarding.complete',
  preferences: 'cloffice.preferences',
  recents: 'cloffice.recents.v1',
  safetyScopes: 'cloffice.safety.scopes',
  memoryEntries: 'cloffice.memory.entries',
  connectorsConfig: 'cloffice.connectors.config',
  connectorsWebFetch: 'cloffice.connectors.web-fetch',
  dailyUsagePrefix: 'cloffice.daily-usage.',
} as const;

export const LEGACY_STORAGE_KEYS = {
  config: 'relay.config',
  engineConnections: 'relay.gateway.connections.v1',
  coworkProjects: 'relay.cowork.projects.v1',
  coworkActiveProject: 'relay.cowork.projects.active.v1',
  coworkTasks: 'relay.cowork.tasks.v1',
  coworkProjectKnowledge: 'relay.cowork.project.knowledge.v1',
  coworkWebSearchMode: 'relay.cowork.websearch.v1',
  chatDraft: 'relay.chat.draft.v1',
  coworkDraft: 'relay.cowork.draft.v1',
  authLocal: 'relay.auth.local',
  authSession: 'relay.auth.session',
  usageMode: 'relay.usage.mode',
  onboardingComplete: 'relay.onboarding.complete',
  preferences: 'relay.preferences',
  recents: 'relay.recents.v1',
  safetyScopes: 'relay.safety.scopes',
  memoryEntries: 'relay.memory.entries',
  connectorsConfig: 'relay.connectors.config',
  connectorsWebFetch: 'relay.connectors.web-fetch',
  dailyUsagePrefix: 'relay.daily-usage.',
} as const;

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function readStorageItem(storage: StorageLike, key: string, legacyKeys: readonly string[] = []): string | null {
  const current = storage.getItem(key);
  if (typeof current === 'string') {
    return current;
  }

  for (const legacyKey of legacyKeys) {
    const legacy = storage.getItem(legacyKey);
    if (typeof legacy === 'string') {
      return legacy;
    }
  }

  return null;
}

function writeStorageItem(storage: StorageLike, key: string, value: string, legacyKeys: readonly string[] = []): void {
  storage.setItem(key, value);
  for (const legacyKey of legacyKeys) {
    storage.removeItem(legacyKey);
  }
}

function removeStorageItem(storage: StorageLike, key: string, legacyKeys: readonly string[] = []): void {
  storage.removeItem(key);
  for (const legacyKey of legacyKeys) {
    storage.removeItem(legacyKey);
  }
}

export function readLocalStorageItem(key: string, legacyKeys: readonly string[] = []): string | null {
  return readStorageItem(localStorage, key, legacyKeys);
}

export function writeLocalStorageItem(key: string, value: string, legacyKeys: readonly string[] = []): void {
  writeStorageItem(localStorage, key, value, legacyKeys);
}

export function removeLocalStorageItem(key: string, legacyKeys: readonly string[] = []): void {
  removeStorageItem(localStorage, key, legacyKeys);
}

export function readSessionStorageItem(key: string, legacyKeys: readonly string[] = []): string | null {
  return readStorageItem(sessionStorage, key, legacyKeys);
}

export function writeSessionStorageItem(key: string, value: string, legacyKeys: readonly string[] = []): void {
  writeStorageItem(sessionStorage, key, value, legacyKeys);
}

export function removeSessionStorageItem(key: string, legacyKeys: readonly string[] = []): void {
  removeStorageItem(sessionStorage, key, legacyKeys);
}

export function buildDatedStorageKey(prefix: string, date: Date = new Date()): string {
  return `${prefix}${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
