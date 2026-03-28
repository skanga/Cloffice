import type { ChatActivityItem, EngineChatEventState, EngineSessionEvent, EngineSessionResult } from '@/app-types';
import type { EngineEventFrame } from './engine-client';
import {
  deriveActivityItemsFromAssistantText,
  extractChatRole,
  extractChatText,
  parseRelayActivityItems,
  type RelayFileAction,
  parseRelayFileActions,
  stripRelayActionPayloadFromText,
} from './chat-utils';

export function parseEngineChatEvent(event: EngineEventFrame, fallbackRunId: string): EngineSessionEvent | null {
  if (event.type !== 'event' || event.event !== 'chat') {
    return null;
  }

  const payload = (event.payload ?? {}) as Record<string, unknown>;
  const sessionKey = typeof payload.sessionKey === 'string' ? payload.sessionKey.trim() : '';
  const runId = typeof payload.runId === 'string' ? payload.runId : fallbackRunId;
  const state = normalizeEngineChatEventState(payload.state);
  const message = payload.message ?? payload;
  const text = extractChatText(message);
  const visibleText = stripRelayActionPayloadFromText(text);
  const role = extractChatRole(message);
  const model = typeof payload.model === 'string' ? payload.model : undefined;
  const errorMessage =
    typeof payload.errorMessage === 'string' && payload.errorMessage.trim() ? payload.errorMessage : null;

  return {
    payload,
    sessionKey,
    runId,
    state,
    text,
    visibleText,
    role,
    model,
    errorMessage,
  };
}

export function isEngineSessionError(event: EngineSessionEvent): boolean {
  return event.state === 'error';
}

export function isEngineSessionStreaming(event: EngineSessionEvent): boolean {
  return event.state === 'delta' && !!event.text;
}

export function getEngineSessionResult(event: EngineSessionEvent): EngineSessionResult | null {
  if (event.state === 'delta') {
    return null;
  }

  if (event.state === 'error') {
    return {
      sessionKey: event.sessionKey,
      runId: event.runId,
      status: 'failed',
      statusMessage: event.errorMessage ?? 'Engine run failed.',
      model: event.model,
      payload: event.payload,
    };
  }

  return {
    sessionKey: event.sessionKey,
    runId: event.runId,
    status: event.state === 'aborted' ? 'aborted' : 'completed',
    statusMessage: event.state === 'aborted' ? 'Engine run ended early.' : 'Engine run completed.',
    model: event.model,
    payload: event.payload,
  };
}

export type EngineSessionArtifacts = {
  message: unknown;
  relayActions: RelayFileAction[];
  activityItems: ChatActivityItem[];
  hasStructuredActions: boolean;
  hasStructuredActivity: boolean;
};

export type EngineSessionScope = 'chat' | 'cowork';

export type EngineSessionMessageIds = {
  streamId: string;
  finalId: string;
  activityId: string;
};

export function deriveEngineSessionArtifacts(event: EngineSessionEvent): EngineSessionArtifacts {
  const message = event.payload.message ?? event.payload;
  const relayActions = parseRelayFileActions({
    text: event.text,
    message,
    payload: event.payload,
  });
  const structuredActivityItems = parseRelayActivityItems({
    text: event.text,
    message,
    payload: event.payload,
  });
  const fallbackActivityItems = deriveActivityItemsFromAssistantText(event.visibleText, event.runId);
  const activityItems = structuredActivityItems.length > 0 ? structuredActivityItems : fallbackActivityItems;

  return {
    message,
    relayActions,
    activityItems,
    hasStructuredActions: relayActions.length > 0,
    hasStructuredActivity: activityItems.length > 0,
  };
}

export function getEngineSessionMessageIds(scope: EngineSessionScope, runId: string): EngineSessionMessageIds {
  const prefix = scope === 'cowork' ? 'cowork-' : '';
  return {
    streamId: `${prefix}stream-${runId}`,
    finalId: `${prefix}final-${runId}`,
    activityId: `${prefix}activity-${runId}`,
  };
}

function normalizeEngineChatEventState(value: unknown): EngineChatEventState {
  return value === 'delta' || value === 'aborted' || value === 'error' ? value : 'final';
}
