import type { ChatActivityItem, EngineRequestedAction } from '../app-types.js';

export type OpenClawCompatibilityRequestedAction = EngineRequestedAction;

export function parseOpenClawCompatibilityFileActions(rawInput: unknown): OpenClawCompatibilityRequestedAction[] {
  const hasUnsafePathChars = (value: string): boolean => /[\u0000-\u001F]/.test(value);

  const normalizeActions = (value: unknown): OpenClawCompatibilityRequestedAction[] => {
    let rawActions: unknown = value;

    if (typeof rawActions === 'string') {
      try {
        rawActions = JSON.parse(rawActions);
      } catch {
        return [];
      }
    }

    const actionArray = Array.isArray(rawActions) ? rawActions : rawActions ? [rawActions] : [];

    return actionArray.reduce<OpenClawCompatibilityRequestedAction[]>((acc, action) => {
      if (!action || typeof action !== 'object') {
        return acc;
      }

      const record = action as Record<string, unknown>;
      const type = record.type;
      if (
        type !== 'create_file' &&
        type !== 'append_file' &&
        type !== 'read_file' &&
        type !== 'list_dir' &&
        type !== 'exists' &&
        type !== 'stat' &&
        type !== 'rename' &&
        type !== 'delete'
      ) {
        return acc;
      }

      const id = typeof record.id === 'string' && record.id.trim() ? record.id.trim() : undefined;

      const filePath = typeof record.path === 'string' ? record.path.trim() : '';
      if (filePath && hasUnsafePathChars(filePath)) {
        return acc;
      }
      if ((type === 'create_file' || type === 'append_file' || type === 'read_file' || type === 'exists' || type === 'delete' || type === 'stat') && !filePath) {
        return acc;
      }

      if (type === 'read_file') {
        acc.push({ id, type: 'read_file', path: filePath });
        return acc;
      }

      if (type === 'list_dir') {
        acc.push({ id, type: 'list_dir', path: filePath || undefined });
        return acc;
      }

      if (type === 'exists') {
        acc.push({ id, type: 'exists', path: filePath });
        return acc;
      }

      if (type === 'stat') {
        acc.push({ id, type: 'stat', path: filePath });
        return acc;
      }

      if (type === 'rename') {
        const newPath =
          typeof record.newPath === 'string'
            ? record.newPath.trim()
            : typeof record.new_path === 'string'
              ? record.new_path.trim()
              : typeof record.toPath === 'string'
                ? record.toPath.trim()
                : typeof record.to === 'string'
                  ? record.to.trim()
                  : '';
        if ((filePath && hasUnsafePathChars(filePath)) || (newPath && hasUnsafePathChars(newPath))) {
          return acc;
        }
        if (!filePath || !newPath) {
          return acc;
        }
        acc.push({ id, type: 'rename', path: filePath, newPath });
        return acc;
      }

      if (type === 'delete') {
        acc.push({ id, type: 'delete', path: filePath });
        return acc;
      }

      const content = typeof record.content === 'string' ? record.content : '';
      const overwrite = typeof record.overwrite === 'boolean' ? record.overwrite : undefined;

      if (type === 'append_file') {
        acc.push({ id, type: 'append_file', path: filePath, content });
        return acc;
      }

      acc.push({ id, type: 'create_file', path: filePath, content, overwrite });
      return acc;
    }, []);
  };

  const tryParseCandidateText = (candidate: string): OpenClawCompatibilityRequestedAction[] => {
    const text = candidate.trim();
    if (!text) {
      return [];
    }

    try {
      const parsed = JSON.parse(text) as Record<string, unknown>;
      const direct = normalizeActions(parsed.relay_actions ?? parsed.relayActions);
      if (direct.length > 0) {
        return direct;
      }
    } catch {
      // Continue with fallbacks.
    }

    const jsonObjectWithRelayActionsPattern = /\{[\s\S]*?"relay_actions"[\s\S]*?\}/gi;
    let objectMatch: RegExpExecArray | null;
    while ((objectMatch = jsonObjectWithRelayActionsPattern.exec(text)) !== null) {
      const payload = objectMatch[0]?.trim();
      if (!payload) {
        continue;
      }
      try {
        const parsed = JSON.parse(payload) as Record<string, unknown>;
        const direct = normalizeActions(parsed.relay_actions ?? parsed.relayActions);
        if (direct.length > 0) {
          return direct;
        }
      } catch {
        // Keep scanning.
      }
    }

    const jsonCodeBlockPattern = /```json\s*([\s\S]*?)```/gi;
    let codeBlockMatch: RegExpExecArray | null;
    while ((codeBlockMatch = jsonCodeBlockPattern.exec(text)) !== null) {
      const payload = codeBlockMatch[1]?.trim();
      if (!payload) {
        continue;
      }
      try {
        const parsed = JSON.parse(payload) as Record<string, unknown>;
        const direct = normalizeActions(parsed.relay_actions ?? parsed.relayActions);
        if (direct.length > 0) {
          return direct;
        }
      } catch {
        // Continue trying other candidates.
      }
    }

    const genericCodeBlockPattern = /```\s*([\s\S]*?)```/gi;
    while ((codeBlockMatch = genericCodeBlockPattern.exec(text)) !== null) {
      const payload = codeBlockMatch[1]?.trim();
      if (!payload) {
        continue;
      }
      try {
        const parsed = JSON.parse(payload) as Record<string, unknown>;
        const direct = normalizeActions(parsed.relay_actions ?? parsed.relayActions);
        if (direct.length > 0) {
          return direct;
        }
      } catch {
        // Keep trying.
      }
    }

    return [];
  };

  const queue: unknown[] = [rawInput];
  const seen = new Set<unknown>();

  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined || current === null) {
      continue;
    }

    if (typeof current === 'string') {
      const fromText = tryParseCandidateText(current);
      if (fromText.length > 0) {
        return fromText;
      }
      continue;
    }

    if (typeof current !== 'object') {
      continue;
    }

    if (seen.has(current)) {
      continue;
    }
    seen.add(current);

    if (Array.isArray(current)) {
      const direct = normalizeActions(current);
      if (direct.length > 0) {
        return direct;
      }
      for (const item of current) {
        queue.push(item);
      }
      continue;
    }

    const record = current as Record<string, unknown>;
    const direct = normalizeActions(record.relay_actions ?? record.relayActions);
    if (direct.length > 0) {
      return direct;
    }

    for (const value of Object.values(record)) {
      queue.push(value);
    }
  }

  return [];
}

export function stripOpenClawCompatibilityActionPayloadFromText(rawText: string): string {
  if (!rawText.trim()) {
    return '';
  }

  let sanitized = rawText;

  sanitized = sanitized.replace(/```json\s*[\s\S]*?"relay_actions"[\s\S]*?```/gi, '');
  sanitized = sanitized.replace(/```[\s\S]*?"relay_actions"[\s\S]*?```/gi, '');
  sanitized = sanitized.replace(/\{[\s\S]*?"relay_actions"[\s\S]*?\}/gi, '');

  return sanitized.replace(/\n{3,}/g, '\n\n').trim();
}

export function parseOpenClawCompatibilityActivityItems(rawInput: unknown): ChatActivityItem[] {
  const normalizeItems = (value: unknown): ChatActivityItem[] => {
    const items = Array.isArray(value) ? value : [];
    return items.reduce<ChatActivityItem[]>((acc, item, index) => {
      if (!item || typeof item !== 'object') {
        return acc;
      }
      const record = item as Record<string, unknown>;
      const label = typeof record.label === 'string' ? record.label.trim() : '';
      if (!label) {
        return acc;
      }
      const id = typeof record.id === 'string' && record.id.trim() ? record.id.trim() : `activity-${index + 1}`;
      const toneValue = typeof record.tone === 'string' ? record.tone.trim().toLowerCase() : 'neutral';
      const tone: ChatActivityItem['tone'] =
        toneValue === 'success' || toneValue === 'danger' || toneValue === 'neutral' ? toneValue : 'neutral';
      const details = typeof record.details === 'string' && record.details.trim() ? record.details.trim() : undefined;
      acc.push({ id, label, details, tone });
      return acc;
    }, []);
  };

  const queue: unknown[] = [rawInput];
  const seen = new Set<unknown>();

  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined || current === null) {
      continue;
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
    const direct = normalizeItems(record.relay_activity ?? record.relayActivity);
    if (direct.length > 0) {
      return direct;
    }

    for (const value of Object.values(record)) {
      queue.push(value);
    }
  }

  return [];
}
