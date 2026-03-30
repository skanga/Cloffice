import type { CoworkProjectTask } from '@/app-types';
import type { EngineConnectOptions, EngineRuntimeClient } from './engine-runtime-types';
import type {
  InternalEngineCoworkContinuationRequest,
  InternalEnginePendingApprovalDecisionResult,
} from './internal-engine-bridge';
import type { InternalApprovalRecoveryFlow } from './internal-approval-recovery';
import { normalizeSessionKey } from './chat-utils';
import {
  buildMissingCoworkSessionKeyError,
  buildRecoveredApprovalAwaitingStatus,
} from './engine-cowork-status';
import { ensureConnectedEngineClient } from './engine-session-controller';

export type PreparedCoworkTaskQueueEntry = {
  taskId: string;
  status: 'queued';
};

export type PreparedEngineCoworkTaskDispatch = {
  now: number;
  sessionKey: string;
  queuedTaskId: string;
  task: CoworkProjectTask;
  queueEntry: PreparedCoworkTaskQueueEntry;
};

export async function ensureEngineCoworkSession(params: {
  client: EngineRuntimeClient;
  connectOptions: EngineConnectOptions;
  currentSessionKey?: string | null;
}): Promise<string> {
  const { client, connectOptions, currentSessionKey } = params;
  await ensureConnectedEngineClient(client, connectOptions);

  const existingSessionKey = normalizeSessionKey(currentSessionKey ?? '');
  if (existingSessionKey) {
    return existingSessionKey;
  }

  const sessionKey = normalizeSessionKey(await client.createCoworkSession());
  if (!sessionKey) {
    throw new Error(buildMissingCoworkSessionKeyError());
  }

  return sessionKey;
}

export function prepareEngineCoworkTaskDispatch(params: {
  sessionKey: string;
  prompt: string;
  projectId: string;
  projectTitle: string;
  now?: number;
}): PreparedEngineCoworkTaskDispatch {
  const now = params.now ?? Date.now();
  const queuedTaskId = `task-${now}-${Math.random().toString(36).slice(2, 8)}`;

  return {
    now,
    sessionKey: params.sessionKey,
    queuedTaskId,
    task: {
      id: queuedTaskId,
      projectId: params.projectId,
      projectTitle: params.projectTitle,
      sessionKey: params.sessionKey,
      prompt: params.prompt,
      status: 'queued',
      summary: 'Task queued for execution.',
      createdAt: now,
      updatedAt: now,
    },
    queueEntry: {
      taskId: queuedTaskId,
      status: 'queued',
    },
  };
}

export function resolveRecoveredEngineApprovalDecision(params: {
  currentFlows: Iterable<InternalApprovalRecoveryFlow>;
  runId: string;
  next: InternalEnginePendingApprovalDecisionResult | null | undefined;
}):
  | { kind: 'missing' }
  | { kind: 'next'; flows: InternalApprovalRecoveryFlow[]; statusMessage: string }
  | { kind: 'continue'; payload: InternalEngineCoworkContinuationRequest } {
  const { currentFlows, runId, next } = params;
  if (!next || next.kind === 'missing') {
    return { kind: 'missing' };
  }

  if (next.kind === 'next') {
    const flows = [
      ...Array.from(currentFlows).filter((entry) => entry.runId !== runId),
      next.flow,
    ];
    return {
      kind: 'next',
      flows,
      statusMessage: buildRecoveredApprovalAwaitingStatus(next.flow.currentApproval.summary),
    };
  }

  return {
    kind: 'continue',
    payload: next.payload,
  };
}
