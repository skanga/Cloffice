import type { ChatActivityItem, EngineRequestedAction } from '@/app-types';
import {
  parseRelayActivityItems,
  parseRelayFileActions,
  stripRelayActionPayloadFromText,
} from './chat-utils';

export const OPENCLAW_COMPAT_ENGINE_ACTION_FIELD = 'relay_actions';

export function parseEngineRequestedActions(rawInput: unknown): EngineRequestedAction[] {
  return parseRelayFileActions(rawInput);
}

export function parseEngineActivityItems(rawInput: unknown): ChatActivityItem[] {
  return parseRelayActivityItems(rawInput);
}

export function stripEngineActionPayloadFromText(rawText: string): string {
  return stripRelayActionPayloadFromText(rawText);
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
