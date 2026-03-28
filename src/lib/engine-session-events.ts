import type { ChatMessage } from '@/app-types';
import type { EngineEventFrame } from './engine-client';
import { extractChatRole, extractChatText, stripRelayActionPayloadFromText } from './chat-utils';

export type EngineChatEvent = {
  payload: Record<string, unknown>;
  eventSessionKey: string;
  runId: string;
  state: string;
  text: string;
  visibleText: string;
  role: ChatMessage['role'];
  errorMessage: string | null;
};

export function parseEngineChatEvent(event: EngineEventFrame, fallbackRunId: string): EngineChatEvent | null {
  if (event.type !== 'event' || event.event !== 'chat') {
    return null;
  }

  const payload = (event.payload ?? {}) as Record<string, unknown>;
  const eventSessionKey = typeof payload.sessionKey === 'string' ? payload.sessionKey.trim() : '';
  const runId = typeof payload.runId === 'string' ? payload.runId : fallbackRunId;
  const state = typeof payload.state === 'string' ? payload.state : 'final';
  const message = payload.message ?? payload;
  const text = extractChatText(message);
  const visibleText = stripRelayActionPayloadFromText(text);
  const role = extractChatRole(message);
  const errorMessage =
    typeof payload.errorMessage === 'string' && payload.errorMessage.trim() ? payload.errorMessage : null;

  return {
    payload,
    eventSessionKey,
    runId,
    state,
    text,
    visibleText,
    role,
    errorMessage,
  };
}
