import type { ChatActivityItem, CoworkProjectTaskStatus, EngineProviderId, EngineRequestedAction } from '../app-types.js';
export const INTERNAL_ENGINE_ACTION_FIELD = 'engine_actions';

function normalizeRequestedAction(action: unknown): EngineRequestedAction | null {
  if (!action || typeof action !== 'object') {
    return null;
  }

  const record = action as Record<string, unknown>;
  const id = typeof record.id === 'string' ? record.id : undefined;
  const type = typeof record.type === 'string' ? record.type : '';
  const path = typeof record.path === 'string' ? record.path : '';

  switch (type) {
    case 'create_file':
      return path && typeof record.content === 'string'
        ? { id, type, path, content: record.content, overwrite: record.overwrite === true }
        : null;
    case 'append_file':
      return path && typeof record.content === 'string'
        ? { id, type, path, content: record.content }
        : null;
    case 'read_file':
    case 'exists':
    case 'stat':
    case 'delete':
      return path ? { id, type, path } as EngineRequestedAction : null;
    case 'list_dir':
      return { id, type, path: path || undefined };
    case 'rename':
      return path && typeof record.newPath === 'string'
        ? { id, type, path, newPath: record.newPath }
        : null;
    case 'shell_exec':
      return path && typeof record.command === 'string'
        ? { id, type, path, command: record.command, timeoutMs: typeof record.timeoutMs === 'number' ? record.timeoutMs : undefined }
        : null;
    case 'web_fetch':
      return path && typeof record.url === 'string'
        ? {
            id,
            type,
            path,
            url: record.url,
            method: typeof record.method === 'string' ? record.method : undefined,
            body: typeof record.body === 'string' ? record.body : undefined,
            contentType: typeof record.contentType === 'string' ? record.contentType : undefined,
          }
        : null;
    default:
      return null;
  }
}

function parseRequestedActionsCandidate(rawInput: unknown): EngineRequestedAction[] {
  if (Array.isArray(rawInput)) {
    return rawInput
      .map((item) => normalizeRequestedAction(item))
      .filter((item): item is EngineRequestedAction => item !== null);
  }

  if (typeof rawInput === 'string') {
    const trimmed = rawInput.trim();
    if (!trimmed) {
      return [];
    }
    try {
      return parseRequestedActionsCandidate(JSON.parse(trimmed));
    } catch {
      const matches = trimmed.match(/```json\s*([\s\S]*?)```/gi) ?? [];
      for (const match of matches) {
        const jsonCandidate = match.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
        try {
          const parsed = JSON.parse(jsonCandidate);
          const direct = parseRequestedActionsCandidate(parsed);
          if (direct.length > 0) {
            return direct;
          }
        } catch {
          // continue
        }
      }
      return [];
    }
  }

  if (!rawInput || typeof rawInput !== 'object') {
    return [];
  }

  const record = rawInput as Record<string, unknown>;
  return parseRequestedActionsCandidate(
    record.requestedActions
    ?? record.requested_actions
    ?? record[INTERNAL_ENGINE_ACTION_FIELD]
    ?? record.engineActions,
  );
}

function normalizeActivityItem(item: unknown): ChatActivityItem | null {
  if (!item || typeof item !== 'object') {
    return null;
  }

  const record = item as Record<string, unknown>;
  const id = typeof record.id === 'string' ? record.id : '';
  const label = typeof record.label === 'string' ? record.label.trim() : '';
  const details = typeof record.details === 'string' ? record.details.trim() : undefined;
  const tone = record.tone === 'success' || record.tone === 'danger' || record.tone === 'neutral'
    ? record.tone
    : 'neutral';
  if (!id || !label) {
    return null;
  }
  return { id, label, details, tone };
}

export function parseEngineRequestedActions(rawInput: unknown): EngineRequestedAction[] {
  const queue: unknown[] = [rawInput];
  const seen = new Set<unknown>();

  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined || current === null) {
      continue;
    }

    const direct = parseRequestedActionsCandidate(current);
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
    const preferred = parseRequestedActionsCandidate(record);
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
  if (Array.isArray(rawInput)) {
    return rawInput
      .map((item) => normalizeActivityItem(item))
      .filter((item): item is ChatActivityItem => item !== null);
  }
  if (!rawInput || typeof rawInput !== 'object') {
    return [];
  }
  const record = rawInput as Record<string, unknown>;
  return parseEngineActivityItems(
    record.activityItems
    ?? record.activity_items
    ?? record.relay_activity
    ?? record.relayActivity,
  );
}

export function stripEngineActionPayloadFromText(rawText: string): string {
  let sanitized = rawText;
  sanitized = sanitized.replace(/```json\s*[\s\S]*?"engine_actions"[\s\S]*?```/gi, '');
  sanitized = sanitized.replace(/```[\s\S]*?"engine_actions"[\s\S]*?```/gi, '');
  sanitized = sanitized.replace(/\{[\s\S]*?"engine_actions"[\s\S]*?\}/gi, '');
  return sanitized.replace(/\n{3,}/g, '\n\n').trim();
}

export function buildInternalEngineActionInstruction(): string {
  return [
    `If the task requires inspecting local project files, include ONE JSON code block with ${INTERNAL_ENGINE_ACTION_FIELD}.`,
    'Prefer read-only actions first while the internal cowork action runner is still being developed.',
    'Start with list_dir, read_file, exists, or stat when you need more context before planning further work.',
  ].join('\n');
}

export function buildEngineActionInstruction(_providerId: EngineProviderId): string {
  return buildInternalEngineActionInstruction();
}

export function summarizeEngineRequestedAction(action: EngineRequestedAction): string {
  if (action.type === 'list_dir') {
    return `List directory ${action.path || '.'}`;
  }
  if (action.type === 'read_file') {
    return `Read ${action.path}`;
  }
  if (action.type === 'stat') {
    return `Inspect metadata for ${action.path}`;
  }
  if (action.type === 'exists') {
    return `Check exists ${action.path}`;
  }
  if (action.type === 'create_file') {
    return `Create ${action.path}${action.overwrite ? ' (overwrite)' : ''}`;
  }
  if (action.type === 'append_file') {
    return `Append ${action.path}`;
  }
  if (action.type === 'rename') {
    return `Rename ${action.path} -> ${action.newPath}`;
  }
  if (action.type === 'delete') {
    return `Delete ${action.path}`;
  }
  return `Run ${action.type} on ${action.path}`;
}

export function buildEngineApprovalPreview(action: EngineRequestedAction): string {
  const actionPath = action.path || '.';
  if (action.type === 'list_dir') {
    return [
      'Cowork requested a read-only directory listing.',
      `Path: ${actionPath}`,
    ].join('\n');
  }
  if (action.type === 'read_file') {
    return [
      'Cowork requested a read-only file read.',
      `Path: ${actionPath}`,
    ].join('\n');
  }
  if (action.type === 'stat') {
    return [
      'Cowork requested a read-only file or folder metadata check.',
      `Path: ${actionPath}`,
    ].join('\n');
  }
  if (action.type === 'exists') {
    return [
      'Cowork requested a read-only existence check.',
      `Path: ${actionPath}`,
    ].join('\n');
  }
  return [
    `Cowork requested ${action.type}.`,
    `Path: ${actionPath}`,
  ].join('\n');
}

export function resolveEngineApprovalTaskTransition(
  stage: 'pending' | 'approved' | 'rejected',
  action: EngineRequestedAction,
  reason?: string,
): { status: CoworkProjectTaskStatus; summary: string; outcome?: string } {
  const actionSummary = summarizeEngineRequestedAction(action);

  if (stage === 'approved') {
    return {
      status: 'approved',
      summary: `Approved: ${actionSummary}`,
    };
  }

  if (stage === 'rejected') {
    return {
      status: 'rejected',
      summary: `Rejected: ${actionSummary}`,
      outcome: reason,
    };
  }

  return {
    status: 'needs_approval',
    summary: `Needs approval: ${actionSummary}`,
  };
}
