/**
 * Pure utility functions and shared types for chat, cowork, and thread management.
 * No React imports — safe to use anywhere.
 */
import type { ChatActivityItem, ChatMessage } from '@/app-types';
import type { EngineErrorInfo } from './engine-runtime-types';

/* ── Exported types ──────────────────────────────────────────────────────── */

export type ChatThread = {
  id: string;
  sessionKey: string;
  title: string;
  updatedAt: number;
};

export type PersistedRecents = {
  chatThreads?: ChatThread[];
  coworkThreads?: ChatThread[];
};

export type RecentWorkspaceEntry = {
  id: string;
  label: string;
  sessionKey: string;
  kind: 'chat' | 'cowork';
};


/* ── Constants ───────────────────────────────────────────────────────────── */

export const RELAY_RECENTS_KEY = 'relay.recents.v1';

export const DEFAULT_CHAT_THREAD_TITLE = 'New chat';
export const DEFAULT_COWORK_THREAD_TITLE = 'New task';
export const MAIN_SESSION_KEY = 'main';

const MAIN_THREAD_TITLE = 'Main chat';
const RECENT_CHAT_CONTEXT_LIMIT = 8;
const RECENT_CHAT_CHARS_PER_MESSAGE = 500;
const SIDEBAR_RECENTS_LIMIT = 7;
const SIDEBAR_RECENT_LABEL_LIMIT = 88;
const MAX_THREAD_STORE_ITEMS = 100;

/* ── Message extraction ──────────────────────────────────────────────────── */

export function extractChatText(message: unknown): string {
  if (!message || typeof message !== 'object') {
    return '';
  }

  const record = message as Record<string, unknown>;
  if (typeof record.text === 'string' && record.text.trim()) {
    return record.text;
  }
  if (typeof record.content === 'string' && record.content.trim()) {
    return record.content;
  }

  if (Array.isArray(record.content)) {
    const parts = record.content
      .map((item) => {
        if (!item || typeof item !== 'object') {
          return '';
        }
        const part = item as Record<string, unknown>;
        if (part.type === 'text' && typeof part.text === 'string') {
          return part.text;
        }
        return '';
      })
      .filter((part) => part.length > 0);
    return parts.join('');
  }

  return '';
}

export function extractChatRole(message: unknown): ChatMessage['role'] {
  if (!message || typeof message !== 'object') {
    return 'assistant';
  }

  const role = (message as Record<string, unknown>).role;
  return role === 'user' || role === 'assistant' || role === 'system' ? role : 'assistant';
}

/* ── Context building ────────────────────────────────────────────────────── */

function truncateForContext(text: string, maxChars: number): string {
  if (text.length <= maxChars) {
    return text;
  }
  return `${text.slice(0, maxChars).trimEnd()}...`;
}

function buildRecentChatContext(messages: ChatMessage[]): string {
  const recent = messages
    .filter((message) => (message.role === 'user' || message.role === 'assistant') && message.text.trim().length > 0)
    .slice(-RECENT_CHAT_CONTEXT_LIMIT)
    .map((message) => {
      const speaker = message.role === 'user' ? 'User' : 'Assistant';
      const normalized = message.text.replace(/\s+/g, ' ').trim();
      return `${speaker}: ${truncateForContext(normalized, RECENT_CHAT_CHARS_PER_MESSAGE)}`;
    });

  return recent.join('\n');
}

export function buildOutboundChatPrompt(userText: string, recentMessages: ChatMessage[]): string {
  const contextBlock = buildRecentChatContext(recentMessages);
  if (!contextBlock) {
    return userText;
  }

  return [
    'Use the recent conversation context below when helpful. If context conflicts with the latest user request, prioritize the latest request.',
    '',
    'Recent conversation:',
    contextBlock,
    '',
    'Latest user message:',
    userText,
  ].join('\n');
}

/* ── Label / key utilities ───────────────────────────────────────────────── */

export function toRecentSidebarLabel(text: string): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return '';
  }
  if (normalized.length <= SIDEBAR_RECENT_LABEL_LIMIT) {
    return normalized;
  }
  return `${normalized.slice(0, SIDEBAR_RECENT_LABEL_LIMIT).trimEnd()}...`;
}

export function normalizeSessionKey(sessionKey: string): string {
  return sessionKey.trim();
}

export function getThreadIdForSession(sessionKey: string): string {
  return `thread-${sessionKey}`;
}

export function findMatchingSessionKey(sessionKeys: string[], requestedKey: string): string | null {
  const requested = normalizeSessionKey(requestedKey);
  if (!requested) {
    return null;
  }

  const requestedLower = requested.toLowerCase();
  const direct = sessionKeys.find((key) => normalizeSessionKey(key).toLowerCase() === requestedLower);
  if (direct) {
    return normalizeSessionKey(direct);
  }

  const requestedTail = requestedLower.includes(':')
    ? requestedLower.slice(requestedLower.lastIndexOf(':') + 1)
    : requestedLower;
  if (!requestedTail) {
    return null;
  }

  const byTail = sessionKeys.find((key) => {
    const normalized = normalizeSessionKey(key).toLowerCase();
    if (!normalized) {
      return false;
    }
    if (normalized.endsWith(`:${requestedTail}`)) {
      return true;
    }
    const tail = normalized.includes(':') ? normalized.slice(normalized.lastIndexOf(':') + 1) : normalized;
    return tail === requestedTail;
  });

  return byTail ? normalizeSessionKey(byTail) : null;
}

/* ── Thread utilities ────────────────────────────────────────────────────── */

export function deriveThreadTitleFromMessages(messages: ChatMessage[]): string {
  const firstUserMessage = messages.find((message) => message.role === 'user');
  if (!firstUserMessage) {
    return '';
  }
  return toRecentSidebarLabel(firstUserMessage.text);
}

export function toFallbackThreadTitle(sessionKey: string, kind: 'chat' | 'cowork' = 'chat'): string {
  const normalized = normalizeSessionKey(sessionKey);
  if (!normalized) {
    return kind === 'cowork' ? DEFAULT_COWORK_THREAD_TITLE : DEFAULT_CHAT_THREAD_TITLE;
  }
  if (normalized.toLowerCase() === MAIN_SESSION_KEY) {
    return MAIN_THREAD_TITLE;
  }
  return kind === 'cowork' ? DEFAULT_COWORK_THREAD_TITLE : DEFAULT_CHAT_THREAD_TITLE;
}

export function isCustomChatThreadTitle(title: string, sessionKey: string): boolean {
  const normalizedTitle = title.trim();
  if (!normalizedTitle) {
    return false;
  }
  return normalizedTitle !== toFallbackThreadTitle(sessionKey, 'chat');
}

export function mergeChatThreads(existing: ChatThread[], incoming: ChatThread[]): ChatThread[] {
  const bySession = new Map<string, ChatThread>();

  for (const thread of [...incoming, ...existing]) {
    const normalizedSessionKey = normalizeSessionKey(thread.sessionKey).toLowerCase();
    if (!normalizedSessionKey) {
      continue;
    }

    const previous = bySession.get(normalizedSessionKey);
    if (!previous || thread.updatedAt >= previous.updatedAt) {
      bySession.set(normalizedSessionKey, thread);
    }
  }

  return Array.from(bySession.values())
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, MAX_THREAD_STORE_ITEMS);
}

function normalizeStoredThread(thread: unknown): ChatThread | null {
  if (!thread || typeof thread !== 'object') {
    return null;
  }

  const record = thread as Record<string, unknown>;
  const sessionKey = typeof record.sessionKey === 'string' ? normalizeSessionKey(record.sessionKey) : '';
  if (!sessionKey) {
    return null;
  }

  const title = typeof record.title === 'string' ? toRecentSidebarLabel(record.title) : '';
  const updatedAtRaw = typeof record.updatedAt === 'number' ? record.updatedAt : Number(record.updatedAt);
  const updatedAt = Number.isFinite(updatedAtRaw) ? updatedAtRaw : Date.now();

  return {
    id: getThreadIdForSession(sessionKey),
    sessionKey,
    title: title || toFallbackThreadTitle(sessionKey, sessionKey.toLowerCase().includes('cowork') ? 'cowork' : 'chat'),
    updatedAt,
  };
}

export function loadPersistedRecents(): PersistedRecents {
  try {
    const raw = localStorage.getItem(RELAY_RECENTS_KEY);
    if (!raw) {
      return { chatThreads: [], coworkThreads: [] };
    }

    const parsed = JSON.parse(raw) as PersistedRecents;
    const chatThreads = Array.isArray(parsed?.chatThreads)
      ? parsed.chatThreads
          .map(normalizeStoredThread)
          .filter((thread): thread is ChatThread => thread !== null)
      : [];
    const coworkThreads = Array.isArray(parsed?.coworkThreads)
      ? parsed.coworkThreads
          .map(normalizeStoredThread)
          .filter((thread): thread is ChatThread => thread !== null)
      : [];

    return {
      chatThreads: mergeChatThreads([], chatThreads),
      coworkThreads: mergeChatThreads([], coworkThreads),
    };
  } catch {
    return { chatThreads: [], coworkThreads: [] };
  }
}

export function toRecentSidebarItems(threads: ChatThread[], kind: 'chat' | 'cowork'): RecentWorkspaceEntry[] {
  return [...threads]
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, SIDEBAR_RECENTS_LIMIT)
    .map((thread) => ({
      id: thread.id,
      label: thread.title,
      sessionKey: thread.sessionKey,
      kind,
    }));
}

/* ── Runtime error helpers ───────────────────────────────────────────────── */

function extractUuidFromMessage(msg?: string): string | undefined {
  if (!msg) return undefined;
  const match = msg.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  return match?.[0];
}

export function readEngineError(error: unknown): EngineErrorInfo {
  if (!(error instanceof Error)) {
    return { message: 'Runtime connection failed.' };
  }

  return {
    message: error.message || 'Runtime connection failed.',
    requestId: extractUuidFromMessage(error.message),
  };
}

export function deriveActivityItemsFromAssistantText(text: string, runId: string): ChatActivityItem[] {
  const normalized = text.trim();
  if (!normalized) {
    return [];
  }

  const lower = normalized.toLowerCase();
  const hasActionVerb =
    lower.includes('created') ||
    lower.includes('updated') ||
    lower.includes('deleted') ||
    lower.includes('scheduled') ||
    lower.includes('applied') ||
    lower.includes('presented');
  const hasWindowsPathHint = normalized.includes(':\\');
  const hasFolderHint = lower.includes(' folder ');
  const hasFileHint = lower.includes(' file');
  const hasInPhrase = lower.includes(' in ');
  const tokens = normalized.split(' ');
  const hasFileNameToken = tokens.some((token) => {
    const trimmed = token.trim();
    if (!trimmed || trimmed.length < 3 || trimmed.length > 80) {
      return false;
    }
    if (trimmed.endsWith('.') || trimmed.endsWith(',')) {
      return false;
    }
    const dotIndex = trimmed.lastIndexOf('.');
    if (dotIndex <= 0 || dotIndex >= trimmed.length - 1) {
      return false;
    }
    return true;
  });

  const hasContextHint = hasWindowsPathHint || hasFolderHint || hasFileHint || (hasInPhrase && hasFileNameToken);

  if (!hasActionVerb || !hasContextHint) {
    return [];
  }

  const tone: ChatActivityItem['tone'] =
    lower.includes('failed') || lower.includes('error')
      ? 'danger'
      : lower.includes('created') || lower.includes('updated') || lower.includes('applied') || lower.includes('done')
        ? 'success'
        : 'neutral';

  const firstLine = normalized.split('\n')[0]?.trim() || normalized;
  return [
    {
      id: `activity-summary-${runId}`,
      label: firstLine,
      details: normalized,
      tone,
    },
  ];
}

export function normalizeCoworkMessage(message: ChatMessage): ChatMessage {
  if (message.meta?.kind === 'activity' || message.role !== 'assistant') {
    return message;
  }

  const items = deriveActivityItemsFromAssistantText(message.text, message.id);
  if (items.length === 0) {
    return message;
  }

  return {
    ...message,
    meta: {
      kind: 'activity',
      items,
    },
  };
}

export const readGatewayError = readEngineError;


