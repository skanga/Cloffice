import type { ChatMessage } from '@/app-types';
import type { EngineConnectOptions, EngineRuntimeClient } from './engine-runtime-types';
import { deriveThreadTitleFromMessages, findMatchingSessionKey, normalizeSessionKey } from './chat-utils';

export type LoadedEngineSessionResult = {
  requestedSessionKey: string;
  resolvedSessionKey: string;
  history: ChatMessage[];
  titleFromHistory: string;
};

type LoadEngineSessionParams = {
  client: EngineRuntimeClient;
  connectOptions: EngineConnectOptions;
  requestedSessionKey: string;
  historyLimit: number;
  loadSessionModels?: (client: EngineRuntimeClient, sessionKey: string) => Promise<void>;
  normalizeHistory?: (message: ChatMessage) => ChatMessage;
};

function isMissingSessionError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return (
    message.includes('no session found') ||
    message.includes('no sendable session found') ||
    message.includes('session not found')
  );
}

async function loadSessionHistory(
  client: EngineRuntimeClient,
  sessionKey: string,
  historyLimit: number,
  loadSessionModels?: (client: EngineRuntimeClient, sessionKey: string) => Promise<void>,
): Promise<ChatMessage[]> {
  const [history] = await Promise.all([
    client.getHistory(sessionKey, historyLimit),
    loadSessionModels ? loadSessionModels(client, sessionKey) : Promise.resolve(),
  ]);
  return history;
}

async function resolveRetrySessionKey(client: EngineRuntimeClient, sessionKey: string): Promise<string> {
  let retrySessionKey = '';

  try {
    const liveSessions = await client.listSessions(200);
    const liveKeys = liveSessions.map((session) => session.key);
    retrySessionKey = findMatchingSessionKey(liveKeys, sessionKey) ?? '';
  } catch {
    // fallback below
  }

  if (!retrySessionKey) {
    retrySessionKey = normalizeSessionKey(await client.resolveSessionKey(sessionKey));
  }

  return retrySessionKey;
}

async function loadEngineSession({
  client,
  connectOptions,
  requestedSessionKey,
  historyLimit,
  loadSessionModels,
  normalizeHistory,
}: LoadEngineSessionParams): Promise<LoadedEngineSessionResult> {
  const normalizedRequestedSessionKey = normalizeSessionKey(requestedSessionKey);
  if (!normalizedRequestedSessionKey) {
    throw new Error('Invalid session key.');
  }

  await client.connect(connectOptions);

  let resolvedSessionKey = normalizedRequestedSessionKey;
  let history: ChatMessage[];

  try {
    history = await loadSessionHistory(client, resolvedSessionKey, historyLimit, loadSessionModels);
  } catch (error) {
    if (!isMissingSessionError(error)) {
      throw error;
    }

    const retrySessionKey = await resolveRetrySessionKey(client, resolvedSessionKey);
    if (!retrySessionKey) {
      throw error;
    }

    resolvedSessionKey = retrySessionKey;
    history = await loadSessionHistory(client, resolvedSessionKey, historyLimit, loadSessionModels);
  }

  const normalizedHistory = normalizeHistory ? history.map(normalizeHistory) : history;

  return {
    requestedSessionKey: normalizedRequestedSessionKey,
    resolvedSessionKey,
    history: normalizedHistory,
    titleFromHistory: deriveThreadTitleFromMessages(normalizedHistory),
  };
}

export async function loadEngineChatSession(
  params: Omit<LoadEngineSessionParams, 'historyLimit' | 'normalizeHistory'>,
): Promise<LoadedEngineSessionResult> {
  return loadEngineSession({
    ...params,
    historyLimit: 30,
  });
}

export async function loadEngineCoworkSession(
  params: Omit<LoadEngineSessionParams, 'historyLimit'>,
): Promise<LoadedEngineSessionResult> {
  return loadEngineSession({
    ...params,
    historyLimit: 50,
  });
}

export function isMissingEngineSessionError(error: unknown): boolean {
  return isMissingSessionError(error);
}
