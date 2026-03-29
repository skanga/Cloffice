import type {
  ChatActivityItem,
  CoworkProjectTaskStatus,
  EngineActionExecutionResult,
  EngineChatEventState,
  EngineRequestedAction,
  EngineSessionEvent,
  EngineSessionResult,
} from '@/app-types';
import type { EngineEventFrame } from './engine-client';
import {
  deriveActivityItemsFromAssistantText,
  extractChatRole,
  extractChatText,
} from './chat-utils';
import {
  parseEngineActivityItems,
  parseEngineRequestedActions,
  stripEngineActionPayloadFromText,
} from './engine-action-protocol';

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
  const visibleText = stripEngineActionPayloadFromText(text);
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
  requestedActions: EngineRequestedAction[];
  activityItems: ChatActivityItem[];
  hasRequestedActions: boolean;
  hasStructuredActivity: boolean;
  actionPhase: 'none' | 'planning' | 'approval_required' | 'awaiting_approval' | 'executing' | 'completed' | 'blocked';
  actionMode: 'none' | 'read-only';
  providerId?: string;
};

export type EngineSessionScope = 'chat' | 'cowork';

export type EngineSessionMessageIds = {
  streamId: string;
  finalId: string;
  activityId: string;
};

export type EngineCoworkUiTransition = {
  runStatus: string;
  progressDetails: string;
  taskStatus: CoworkProjectTaskStatus;
  taskSummary: string;
};

export function deriveEngineSessionArtifacts(event: EngineSessionEvent): EngineSessionArtifacts {
  const payload = event.payload;
  const message = event.payload.message ?? event.payload;
  const rawPayloadRequestedActions = (payload as Record<string, unknown>).requestedActions;
  const payloadRequestedActions = Array.isArray(rawPayloadRequestedActions)
    ? rawPayloadRequestedActions.filter((entry): entry is EngineRequestedAction => !!entry && typeof entry === 'object' && typeof (entry as { type?: unknown }).type === 'string')
    : parseEngineRequestedActions(rawPayloadRequestedActions);
  const requestedActions = payloadRequestedActions.length > 0
    ? payloadRequestedActions
    : parseEngineRequestedActions({
        text: event.text,
        message,
        payload: event.payload,
      });
  const rawPayloadActivityItems = (payload as Record<string, unknown>).activityItems;
  const payloadActivityItems = Array.isArray(rawPayloadActivityItems)
    ? rawPayloadActivityItems.filter((entry): entry is ChatActivityItem => !!entry && typeof entry === 'object' && typeof (entry as { label?: unknown }).label === 'string')
    : parseEngineActivityItems(rawPayloadActivityItems);
  const structuredActivityItems = payloadActivityItems.length > 0
    ? payloadActivityItems
    : parseEngineActivityItems({
        text: event.text,
        message,
        payload: event.payload,
      });
  const fallbackActivityItems = deriveActivityItemsFromAssistantText(event.visibleText, event.runId);
  const activityItems = structuredActivityItems.length > 0 ? structuredActivityItems : fallbackActivityItems;

  return {
    message,
    requestedActions,
    activityItems,
    hasRequestedActions: requestedActions.length > 0,
    hasStructuredActivity: activityItems.length > 0,
    actionPhase: normalizeEngineActionPhase(payload.engineActionPhase),
    actionMode: payload.engineActionMode === 'read-only' ? 'read-only' : 'none',
    providerId: typeof payload.providerId === 'string' ? payload.providerId : undefined,
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

export function resolveEngineCoworkStreamingTransition(event: EngineSessionEvent): EngineCoworkUiTransition {
  const actionPhase = normalizeEngineActionPhase(event.payload.engineActionPhase);
  const actionMode = event.payload.engineActionMode === 'read-only' ? 'read-only' : 'none';

  if (actionPhase === 'executing') {
    return {
      runStatus: 'Cowork is executing approved engine actions.',
      progressDetails:
        actionMode === 'read-only'
          ? 'Cowork is executing approved read-only workspace inspection actions.'
          : 'Cowork is executing approved engine actions.',
      taskStatus: 'running',
      taskSummary:
        actionMode === 'read-only'
          ? 'Executing approved read-only engine actions.'
          : 'Executing approved engine actions.',
    };
  }

  return {
    runStatus: 'Cowork is streaming a response.',
    progressDetails: 'Running workstreams and producing intermediate results.',
    taskStatus: 'running',
    taskSummary: 'Streaming response from cowork.',
  };
}

export function resolveEngineCoworkApprovalTransition(
  artifacts: Pick<EngineSessionArtifacts, 'actionPhase' | 'actionMode' | 'hasRequestedActions'>,
): EngineCoworkUiTransition | null {
  if (!artifacts.hasRequestedActions) {
    return null;
  }

  if (artifacts.actionPhase !== 'approval_required' && artifacts.actionPhase !== 'awaiting_approval') {
    return null;
  }

  return {
    runStatus:
      artifacts.actionMode === 'read-only'
        ? 'Cowork is requesting approval for read-only engine actions.'
        : 'Cowork is requesting approval for engine actions.',
    progressDetails:
      artifacts.actionMode === 'read-only'
        ? 'Cowork requested scoped read-only inspection actions and is awaiting approval handling.'
        : 'Cowork requested governed engine actions and is awaiting approval handling.',
    taskStatus: 'needs_approval',
    taskSummary:
      artifacts.actionMode === 'read-only'
        ? 'Awaiting approval for read-only engine actions.'
        : 'Awaiting approval for engine actions.',
  };
}

export function buildEngineActionExecutionResult(params: {
  runId: string;
  receipts: EngineActionExecutionResult['receipts'];
  previews: string[];
  errors: string[];
  projectTitle?: string;
  rootPath: string;
  scope?: EngineSessionScope;
}): EngineActionExecutionResult {
  const okCount = params.receipts.filter((item) => item.status === 'ok').length;
  const errorCount = params.receipts.filter((item) => item.status === 'error').length;
  const summaryParts: string[] = [];

  if (okCount > 0) {
    summaryParts.push(`Executed ${okCount} local action${okCount === 1 ? '' : 's'}.`);
  }
  if (errorCount > 0) {
    summaryParts.push(`Failed ${errorCount} action${errorCount === 1 ? '' : 's'}.`);
  }
  if (params.projectTitle) {
    summaryParts.push(`Project: ${params.projectTitle}.`);
  }
  summaryParts.push(`Folder: ${params.rootPath}`);

  const summary = summaryParts.join(' ') || 'No file actions were applied.';
  const activityItems: ChatActivityItem[] = params.receipts.length > 0
    ? params.receipts.map((receipt, index): ChatActivityItem => {
        const tone: ChatActivityItem['tone'] = receipt.status === 'ok' ? 'success' : 'danger';
        const verb =
          receipt.type === 'create_file' ? 'Created' :
          receipt.type === 'append_file' ? 'Appended' :
          receipt.type === 'read_file' ? 'Read' :
          receipt.type === 'list_dir' ? 'Listed' :
          receipt.type === 'exists' ? 'Checked' :
          receipt.type === 'stat' ? 'Inspected' :
          receipt.type === 'rename' ? 'Renamed' :
          receipt.type === 'delete' ? 'Deleted' :
          receipt.type === 'shell_exec' ? 'Executed' :
          receipt.type === 'web_fetch' ? 'Fetched' :
          'Completed';
        return {
          id: `activity-receipt-${params.runId}-${index + 1}`,
          label: `${receipt.status === 'ok' ? verb : `${verb} failed`}: ${receipt.path}`,
          details: receipt.message || receipt.errorCode || receipt.path,
          tone,
        };
      })
    : [
        {
          id: `activity-summary-${params.runId}`,
          label: summary,
          details: summary,
          tone: params.errors.length > 0 ? 'danger' : 'success',
        },
      ];

  const machineReadableReceipt = {
    relay_action_receipts: params.receipts,
  };
  const receiptLines = [
    summary,
    ...params.previews,
    ...params.errors.map((line) => `! ${line}`),
    '```json',
    JSON.stringify(machineReadableReceipt, null, 2),
    '```',
  ];
  const scope = params.scope ?? 'cowork';
  const receiptMessage = {
    id: scope === 'cowork' ? `cowork-actions-${params.runId}` : `chat-actions-${params.runId}`,
    role: 'system' as const,
    text: receiptLines.join('\n'),
    meta: {
      kind: 'activity' as const,
      items: activityItems,
    },
  };

  return {
    summary,
    okCount,
    errorCount,
    receipts: params.receipts,
    previews: params.previews,
    errors: params.errors,
    activityItems,
    receiptMessage,
  };
}

export function buildMissingEngineRequestedActionsMessage(params: {
  runId: string;
  projectTitle?: string;
  rootPath?: string;
}): EngineActionExecutionResult['receiptMessage'] {
  return {
    id: `cowork-actions-missing-${params.runId}`,
    role: 'system',
    text: [
      'No executable engine actions were found in the cowork final event.',
      params.projectTitle ? `Project: ${params.projectTitle}` : 'Project: (none)',
      `Folder: ${params.rootPath || '(not set)'}`,
    ].join('\n'),
    meta: {
      kind: 'activity',
      items: [
        {
          id: `activity-no-actions-${params.runId}`,
          label: 'No executable engine actions were found.',
          details: [
            params.projectTitle ? `Project: ${params.projectTitle}` : 'Project: (none)',
            `Folder: ${params.rootPath || '(not set)'}`,
          ].join('\n'),
          tone: 'neutral',
        },
      ],
    },
  };
}

function normalizeEngineChatEventState(value: unknown): EngineChatEventState {
  return value === 'delta' || value === 'aborted' || value === 'error' ? value : 'final';
}

function normalizeEngineActionPhase(value: unknown): EngineSessionArtifacts['actionPhase'] {
  return value === 'planning'
    || value === 'approval_required'
    || value === 'awaiting_approval'
    || value === 'executing'
    || value === 'completed'
    || value === 'blocked'
    ? value
    : 'none';
}
