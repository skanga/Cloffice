import type { ChatMessage, CoworkProjectTaskStatus, EngineActionExecutionResult, LocalActionReceipt } from '@/app-types';

export function deriveEngineActionRunKey(sessionKey: string, runId: string): string {
  return `${sessionKey || 'unknown'}:${runId}`;
}

export function resolveEngineActionTaskStatus(result: EngineActionExecutionResult): CoworkProjectTaskStatus {
  return result.errors.length > 0
    ? 'failed'
    : result.receipts.some((item) => item.status === 'ok')
      ? 'completed'
      : 'failed';
}

export function resolveEngineActionOutcome(result: EngineActionExecutionResult): string {
  return result.errors.length > 0 ? result.errors.join('\n') : result.previews.join('\n');
}

export function appendUniqueSystemMessage(current: ChatMessage[], message: ChatMessage): ChatMessage[] {
  return current.some((entry) => entry.id === message.id) ? current : [...current, message];
}
