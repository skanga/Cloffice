import type { EngineRequestedAction, LocalActionReceipt } from '@/app-types';
import type { DesktopBridge } from './desktop-bridge';

export type InternalReadOnlyActionRunResult = {
  receipts: LocalActionReceipt[];
  previews: string[];
  errors: string[];
};

function trimPreview(value: string, maxChars = 1200): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return '(empty)';
  }
  return trimmed.length <= maxChars ? trimmed : `${trimmed.slice(0, maxChars)}\n... (truncated)`;
}

function toInternalActionError(message: string): string {
  const normalized = message.toLowerCase();
  if (normalized.includes('not found') || normalized.includes('enoent')) {
    return 'NOT_FOUND';
  }
  if (normalized.includes('blocked') || normalized.includes('outside') || normalized.includes('traversal')) {
    return 'PROJECT_BOUNDARY_BLOCK';
  }
  if (normalized.includes('permission') || normalized.includes('eacces') || normalized.includes('eperm')) {
    return 'PERMISSION_DENIED';
  }
  return 'ACTION_FAILED';
}

export function isInternalReadOnlyAction(action: EngineRequestedAction): boolean {
  return action.type === 'list_dir' || action.type === 'read_file' || action.type === 'exists';
}

export async function executeInternalReadOnlyEngineActions(params: {
  bridge: DesktopBridge;
  explorerId: string;
  rootPath: string;
  actions: EngineRequestedAction[];
}): Promise<InternalReadOnlyActionRunResult> {
  const receipts: LocalActionReceipt[] = [];
  const previews: string[] = [];
  const errors: string[] = [];

  for (let index = 0; index < params.actions.length; index += 1) {
    const action = params.actions[index];
    const actionId = action.id || `internal-action-${index + 1}`;
    const actionPath = action.type === 'list_dir' ? (action.path || '.') : action.path;

    if (!isInternalReadOnlyAction(action)) {
      const message = 'Internal action runner currently supports read-only actions only.';
      receipts.push({
        id: actionId,
        type: action.type,
        path: actionPath,
        status: 'error',
        errorCode: 'INTERNAL_ACTION_UNSUPPORTED',
        message,
      });
      errors.push(`${actionPath}: ${message}`);
      continue;
    }

    try {
      if (action.type === 'list_dir') {
        const result = await params.bridge.listDirInFolder(params.explorerId, action.path || '');
        const listed = result.items.slice(0, 12).map((item) => `${item.kind === 'directory' ? '[dir]' : '[file]'} ${item.path}`);
        previews.push(`Listed ${action.path || '.'}\n${listed.join('\n') || '(empty directory)'}`);
      } else if (action.type === 'read_file') {
        const result = await params.bridge.readFileInFolder(params.explorerId, action.path);
        previews.push(`Read ${action.path}\n${trimPreview(result.content)}`);
      } else {
        const result = await params.bridge.existsInFolder(params.explorerId, action.path);
        previews.push(`${action.path}: ${result.exists ? 'exists' : 'missing'}${result.exists ? ` (${result.kind})` : ''}`);
      }

      receipts.push({
        id: actionId,
        type: action.type,
        path: actionPath,
        status: 'ok',
        message: 'Executed through internal read-only action runner.',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Internal read-only action failed.';
      receipts.push({
        id: actionId,
        type: action.type,
        path: actionPath,
        status: 'error',
        errorCode: toInternalActionError(message),
        message,
      });
      errors.push(`${actionPath}: ${message}`);
    }
  }

  return {
    receipts,
    previews,
    errors,
  };
}
