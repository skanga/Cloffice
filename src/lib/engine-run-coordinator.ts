import type {
  ChatActivityItem,
  ChatMessage,
  CoworkProjectTaskStatus,
  EngineActionExecutionResult,
  EngineRequestedAction,
  LocalActionReceipt,
  MessageUsage,
  PendingApprovalAction,
  SafetyPermissionScope,
} from '@/app-types';
import type { DesktopBridgeApi } from './connectors/connector-types';
import {
  runEngineReadOnlyApprovalLoop,
  resolveEngineApprovalTaskTransition,
  type EngineApprovalDecision,
  type EngineRejectedApprovalAction,
} from './engine-approval-orchestrator';
import { executeEngineLocalActionPlan } from './engine-local-action-orchestrator';
import { buildEngineActionExecutionResult } from './engine-session-events';

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

export function applyEngineCoworkFinalMessageUpdate(params: {
  current: ChatMessage[];
  streamId: string;
  finalId: string;
  role: ChatMessage['role'];
  visibleText: string;
  usage?: MessageUsage;
  hasRequestedActions: boolean;
  hasStructuredActivity: boolean;
}): ChatMessage[] {
  const withoutStream = params.current.filter((entry) => {
    if (entry.id === params.streamId) {
      return false;
    }
    if ((params.hasRequestedActions || params.hasStructuredActivity) && entry.id.startsWith('cowork-stream-')) {
      return false;
    }
    return true;
  });

  if (withoutStream.some((entry) => entry.id === params.finalId)) {
    return withoutStream;
  }

  return params.visibleText
    ? [
        ...withoutStream,
        {
          id: params.finalId,
          role: params.role,
          text: params.visibleText,
          ...(params.usage ? { usage: params.usage } : {}),
        },
      ]
    : withoutStream;
}

export function appendEngineCoworkActivityMessage(params: {
  current: ChatMessage[];
  activityId: string;
  activityItems: ChatActivityItem[];
}): ChatMessage[] {
  const activityMessage: ChatMessage = {
    id: params.activityId,
    role: 'system',
    text: params.activityItems.map((item) => item.label).join('\n'),
    meta: {
      kind: 'activity',
      items: params.activityItems,
    },
  };

  if (params.current.some((entry) => entry.id === activityMessage.id)) {
    return params.current;
  }

  return [...params.current, activityMessage];
}

type ValidateProjectRelativePath = (
  inputPath: string,
  options?: { allowEmpty?: boolean },
) => { ok: true } | { ok: false; reason: string };

type NotifyingBridge = DesktopBridgeApi & {
  notify?: (title: string, body: string) => Promise<unknown>;
};

export type EngineCoworkActionExecutionOutcome =
  | { kind: 'continued' }
  | {
      kind: 'completed';
      result: EngineActionExecutionResult;
      notification?: {
        title: string;
        body: string;
      };
    };

export async function executeEngineCoworkActionExecution(params: {
  requestedActions: EngineRequestedAction[];
  providerId?: string;
  actionMode: 'none' | 'read-only';
  runId: string;
  eventSessionKey: string;
  currentCoworkSessionKey: string;
  runContext: {
    projectId: string;
    projectTitle: string;
    rootFolder: string;
  };
  continueCoworkRun?: (payload: {
    sessionKey: string;
    runId: string;
    rootPath: string;
    approvedActions: EngineRequestedAction[];
    rejectedActions: EngineRejectedApprovalAction[];
  }) => Promise<unknown>;
  bridge?: NotifyingBridge;
  maxActionsPerRun: number;
  safetyScopes: SafetyPermissionScope[];
  requestApproval: (request: PendingApprovalAction) => Promise<EngineApprovalDecision>;
  validateProjectRelativePath: ValidateProjectRelativePath;
  onRunStatus: (status: string) => void;
  onProgress: (details: string) => void;
  onTaskStatus?: (status: CoworkProjectTaskStatus, summary: string, outcome?: string) => void;
}): Promise<EngineCoworkActionExecutionOutcome> {
  if (!params.bridge) {
    return {
      kind: 'completed',
      result: buildEngineActionExecutionResult({
        runId: params.runId,
        receipts: [],
        previews: [],
        errors: ['AI requested local file actions, but Electron desktop bridge is unavailable.'],
        projectTitle: params.runContext.projectTitle,
        rootPath: params.runContext.rootFolder || '(not set)',
      }),
    };
  }

  const rootPath = params.runContext.rootFolder.trim();
  if (!rootPath) {
    return {
      kind: 'completed',
      result: buildEngineActionExecutionResult({
        runId: params.runId,
        receipts: [],
        previews: [],
        errors: ['AI requested local file actions, but this run has no project root folder context.'],
        projectTitle: params.runContext.projectTitle,
        rootPath: '(not set)',
      }),
    };
  }

  if (params.providerId === 'internal' && params.actionMode === 'read-only') {
    if (params.requestedActions.length > params.maxActionsPerRun) {
      console.warn(
        `[Cloffice] internal cowork action limit exceeded: received ${params.requestedActions.length}, executing ${params.maxActionsPerRun}.`,
      );
    }

    const { approvedActions, rejectedActions } = await runEngineReadOnlyApprovalLoop({
      actions: params.requestedActions,
      context: {
        runId: params.runId,
        projectId: params.runContext.projectId || undefined,
        projectTitle: params.runContext.projectTitle || undefined,
        projectRootFolder: params.runContext.rootFolder || undefined,
        scopeId: 'workspace.read',
        scopeName: 'Workspace read',
        riskLevel: 'medium',
        maxActionsPerRun: params.maxActionsPerRun,
      },
      requestApproval: params.requestApproval,
      onPending: ({ action, actionPath, actionSummary }) => {
        params.onRunStatus(`Awaiting approval for ${actionSummary}...`);
        params.onProgress(`Awaiting operator approval for internal read-only action on ${actionPath}.`);
        const taskTransition = resolveEngineApprovalTaskTransition('pending', action);
        params.onTaskStatus?.(taskTransition.status, taskTransition.summary);
      },
      onRejected: ({ action, reason }) => {
        const taskTransition = resolveEngineApprovalTaskTransition('rejected', action, reason);
        params.onTaskStatus?.(taskTransition.status, taskTransition.summary, taskTransition.outcome);
      },
      onApproved: ({ action }) => {
        const taskTransition = resolveEngineApprovalTaskTransition('approved', action);
        params.onTaskStatus?.(taskTransition.status, taskTransition.summary);
      },
    });

    const continuationSessionKey = params.eventSessionKey || params.currentCoworkSessionKey;
    if (!continuationSessionKey) {
      throw new Error('Internal cowork continuation is missing a session key.');
    }
    if (typeof params.continueCoworkRun !== 'function') {
      throw new Error('Internal runtime does not support cowork continuation in this build.');
    }

    params.onRunStatus('Submitting approval results to internal cowork...');
    params.onProgress('Internal cowork is applying approved read-only workspace inspection actions.');
    await params.continueCoworkRun({
      sessionKey: continuationSessionKey,
      runId: params.runId,
      rootPath,
      approvedActions,
      rejectedActions,
    });
    return { kind: 'continued' };
  }

  params.onRunStatus('Applying AI file actions...');
  params.onProgress('Applying local actions in scoped workspace.');
  const result = await executeEngineLocalActionPlan({
    actions: params.requestedActions,
    maxActionsPerRun: params.maxActionsPerRun,
    bridge: params.bridge,
    rootPath,
    runId: params.runId,
    projectId: params.runContext.projectId || undefined,
    projectTitle: params.runContext.projectTitle || undefined,
    safetyScopes: params.safetyScopes,
    validateProjectRelativePath: params.validateProjectRelativePath,
    requestApproval: params.requestApproval,
    onRunStatus: (status, details) => {
      params.onRunStatus(status);
      params.onProgress(details);
    },
    onTaskStatus: params.onTaskStatus,
  });

  return {
    kind: 'completed',
    result,
    notification: params.bridge.notify
      ? {
          title: result.errorCount > 0 ? 'Cloffice task completed with errors' : 'Cloffice task completed',
          body: params.runContext.projectTitle
            ? `${params.runContext.projectTitle}: ${result.okCount} action${result.okCount === 1 ? '' : 's'} executed`
            : `${result.okCount} action${result.okCount === 1 ? '' : 's'} executed`,
        }
      : undefined,
  };
}
