import type { ChatMessage, EngineSessionEvent, EngineSessionResult, MessageUsage } from '@/app-types';
import {
  getEngineSessionMessageIds,
  isEngineSessionError,
  isEngineSessionStreaming,
} from './engine-session-events';
import { parseUsageFromPayload } from './token-usage';

type ChatMessageUpdater = (current: ChatMessage[]) => ChatMessage[];

export async function handleEngineChatEvent(params: {
  chatEvent: EngineSessionEvent;
  sessionResult: EngineSessionResult | null;
  activeSessionKey: string;
  onRekeySession: (fromSessionKey: string, toSessionKey: string) => void;
  onCommitActiveSessionKey: (sessionKey: string) => void;
  onSetAwaitingStream: (value: boolean) => void;
  onSetStatus: (status: string) => void;
  onUsage: (usage: MessageUsage) => void;
  onUpdateMessages: (updater: ChatMessageUpdater, cacheKey?: string) => void;
  onTouchThread: (sessionKey: string) => void;
}): Promise<void> {
  const { chatEvent, sessionResult } = params;
  const { payload, sessionKey: eventSessionKey, runId, text, role } = chatEvent;

  if (eventSessionKey && eventSessionKey !== params.activeSessionKey) {
    params.onRekeySession(params.activeSessionKey, eventSessionKey);
    params.onCommitActiveSessionKey(eventSessionKey);
  }

  if (sessionResult?.status === 'failed' && isEngineSessionError(chatEvent)) {
    params.onSetAwaitingStream(false);
    params.onSetStatus(sessionResult.statusMessage || 'Chat stream failed.');
    return;
  }

  if (isEngineSessionStreaming(chatEvent)) {
    params.onSetAwaitingStream(false);
    const { streamId } = getEngineSessionMessageIds('chat', runId);
    params.onUpdateMessages((current) => {
      const index = current.findIndex((entry) => entry.id === streamId);
      if (index >= 0) {
        const next = [...current];
        next[index] = { ...next[index], text, role };
        return next;
      }
      return [...current, { id: streamId, role, text }];
    });
    return;
  }

  if (!sessionResult || sessionResult.status === 'failed' || !text) {
    return;
  }

  params.onSetAwaitingStream(false);
  const { streamId, finalId } = getEngineSessionMessageIds('chat', runId);
  const usage = parseUsageFromPayload(payload, chatEvent.model);
  if (usage) {
    params.onUsage(usage);
  }

  params.onUpdateMessages((current) => {
    const withoutStream = current.filter((entry) => entry.id !== streamId);
    if (withoutStream.some((entry) => entry.id === finalId)) {
      return withoutStream;
    }
    return [...withoutStream, { id: finalId, role, text, ...(usage ? { usage } : {}) }];
  }, eventSessionKey || params.activeSessionKey);

  if (eventSessionKey) {
    params.onTouchThread(eventSessionKey);
  }
}
