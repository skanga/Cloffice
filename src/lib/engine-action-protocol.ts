import type { ChatActivityItem, EngineRequestedAction } from '@/app-types';
import {
  parseRelayActivityItems,
  parseRelayFileActions,
  stripRelayActionPayloadFromText,
} from './chat-utils';

export const OPENCLAW_COMPAT_ENGINE_ACTION_FIELD = 'relay_actions';
export const INTERNAL_ENGINE_ACTION_FIELD = 'engine_actions';

function normalizeEngineActionPayload(rawInput: unknown): unknown {
  if (typeof rawInput === 'string') {
    return rawInput
      .replaceAll(`"${INTERNAL_ENGINE_ACTION_FIELD}"`, `"${OPENCLAW_COMPAT_ENGINE_ACTION_FIELD}"`)
      .replaceAll('"engineActions"', '"relayActions"');
  }

  if (!rawInput || typeof rawInput !== 'object') {
    return rawInput;
  }

  if (Array.isArray(rawInput)) {
    return rawInput.map((item) => normalizeEngineActionPayload(item));
  }

  const record = rawInput as Record<string, unknown>;
  const normalized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(record)) {
    normalized[key] = normalizeEngineActionPayload(value);
  }

  if (
    normalized[OPENCLAW_COMPAT_ENGINE_ACTION_FIELD] === undefined
    && normalized.relayActions === undefined
  ) {
    if (normalized[INTERNAL_ENGINE_ACTION_FIELD] !== undefined) {
      normalized[OPENCLAW_COMPAT_ENGINE_ACTION_FIELD] = normalized[INTERNAL_ENGINE_ACTION_FIELD];
    } else if (normalized.engineActions !== undefined) {
      normalized.relayActions = normalized.engineActions;
    }
  }

  return normalized;
}

export function parseEngineRequestedActions(rawInput: unknown): EngineRequestedAction[] {
  const normalizedInput = normalizeEngineActionPayload(rawInput);
  const queue: unknown[] = [normalizedInput];
  const seen = new Set<unknown>();

  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined || current === null) {
      continue;
    }

    const direct = parseRelayFileActions(current);
    if (direct.length > 0) {
      return direct;
    }

    if (typeof current !== 'object') {
      continue;
    }

    if (seen.has(current)) {
      continue;
    }
    seen.add(current);

    if (Array.isArray(current)) {
      for (const item of current) {
        queue.push(item);
      }
      continue;
    }

    const record = current as Record<string, unknown>;
    const preferred = parseRelayFileActions(
      record.requestedActions
      ?? record.requested_actions
      ?? record[INTERNAL_ENGINE_ACTION_FIELD]
      ?? record.engineActions
      ?? record[OPENCLAW_COMPAT_ENGINE_ACTION_FIELD]
      ?? record.relayActions,
    );
    if (preferred.length > 0) {
      return preferred;
    }

    for (const value of Object.values(record)) {
      queue.push(value);
    }
  }

  return [];
}

export function parseEngineActivityItems(rawInput: unknown): ChatActivityItem[] {
  return parseRelayActivityItems(rawInput);
}

export function stripEngineActionPayloadFromText(rawText: string): string {
  let sanitized = stripRelayActionPayloadFromText(rawText);
  sanitized = sanitized.replace(/```json\s*[\s\S]*?"engine_actions"[\s\S]*?```/gi, '');
  sanitized = sanitized.replace(/```[\s\S]*?"engine_actions"[\s\S]*?```/gi, '');
  sanitized = sanitized.replace(/\{[\s\S]*?"engine_actions"[\s\S]*?\}/gi, '');
  return sanitized.replace(/\n{3,}/g, '\n\n').trim();
}

export function buildOpenClawCompatEngineActionInstruction(): string {
  return [
    `If the user request involves local files/folders in any way, your response MUST be ONE JSON code block with ${OPENCLAW_COMPAT_ENGINE_ACTION_FIELD} and no prose.`,
    '```json',
    `{"${OPENCLAW_COMPAT_ENGINE_ACTION_FIELD}":[{"id":"a1","type":"list_dir","path":"."},{"id":"a2","type":"create_file","path":"relative/path.ext","content":"file contents","overwrite":false},{"id":"a3","type":"append_file","path":"relative/path.ext","content":"more text"},{"id":"a4","type":"read_file","path":"relative/path.ext"},{"id":"a5","type":"exists","path":"relative/path.ext"},{"id":"a6","type":"rename","path":"old.ext","newPath":"new.ext"},{"id":"a7","type":"delete","path":"obsolete.ext"}]}`,
    '```',
    'If filenames are unknown, first emit a list_dir action and do not ask follow-up questions.',
    'Never respond with natural language explanations for file-operation requests.',
  ].join('\n');
}

export function buildInternalEngineActionInstruction(): string {
  return [
    `If the task requires inspecting local project files, include ONE JSON code block with ${INTERNAL_ENGINE_ACTION_FIELD}.`,
    'Prefer read-only actions first while the internal cowork action runner is still being developed.',
    'Start with list_dir, read_file, exists, or stat when you need more context before planning further work.',
  ].join('\n');
}
