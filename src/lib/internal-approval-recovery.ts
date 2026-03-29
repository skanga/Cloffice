import type { EngineRequestedAction, PendingApprovalAction } from '@/app-types';
import {
  createPendingEngineApprovalAction,
  type EngineApprovalLoopContext,
  type EngineApprovalDecision,
  type EngineRejectedApprovalAction,
} from './engine-approval-orchestrator';

export const INTERNAL_APPROVAL_RECOVERY_STORAGE_KEY = 'cloffice.internal.approval-recovery.v1';

export type InternalApprovalRecoveryFlow = {
  runId: string;
  sessionKey: string;
  rootPath: string;
  context: EngineApprovalLoopContext;
  requestedActions: EngineRequestedAction[];
  currentIndex: number;
  approvedActions: EngineRequestedAction[];
  rejectedActions: EngineRejectedApprovalAction[];
  currentApproval: PendingApprovalAction;
};

export function buildInternalApprovalRecoveryFlow(params: {
  sessionKey: string;
  rootPath: string;
  context: EngineApprovalLoopContext;
  requestedActions: EngineRequestedAction[];
  currentIndex: number;
  approvedActions: EngineRequestedAction[];
  rejectedActions: EngineRejectedApprovalAction[];
  currentApproval: PendingApprovalAction;
}): InternalApprovalRecoveryFlow {
  return {
    runId: params.context.runId,
    sessionKey: params.sessionKey,
    rootPath: params.rootPath,
    context: params.context,
    requestedActions: params.requestedActions,
    currentIndex: params.currentIndex,
    approvedActions: params.approvedActions,
    rejectedActions: params.rejectedActions,
    currentApproval: params.currentApproval,
  };
}

export function loadInternalApprovalRecoveryFlows(storage: Storage): InternalApprovalRecoveryFlow[] {
  try {
    const raw = storage.getItem(INTERNAL_APPROVAL_RECOVERY_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(Boolean) as InternalApprovalRecoveryFlow[] : [];
  } catch {
    return [];
  }
}

export function saveInternalApprovalRecoveryFlows(storage: Storage, flows: InternalApprovalRecoveryFlow[]): void {
  try {
    if (flows.length === 0) {
      storage.removeItem(INTERNAL_APPROVAL_RECOVERY_STORAGE_KEY);
      return;
    }
    storage.setItem(INTERNAL_APPROVAL_RECOVERY_STORAGE_KEY, JSON.stringify(flows));
  } catch {
    // ignore localStorage persistence failures
  }
}

export function applyInternalApprovalRecoveryDecision(
  flow: InternalApprovalRecoveryFlow,
  decision: EngineApprovalDecision,
): {
  kind: 'next';
  flow: InternalApprovalRecoveryFlow;
} | {
  kind: 'complete';
  payload: {
    sessionKey: string;
    runId: string;
    rootPath: string;
    approvedActions: EngineRequestedAction[];
    rejectedActions: EngineRejectedApprovalAction[];
  };
} {
  const action = flow.requestedActions[flow.currentIndex];
  const actionId = action?.id || `action-${flow.currentIndex + 1}`;
  const actionPath = action?.path || '.';
  const approvedActions = [...flow.approvedActions];
  const rejectedActions = [...flow.rejectedActions];

  if (decision.approved) {
    approvedActions.push(action);
  } else {
    rejectedActions.push({
      id: actionId,
      actionId,
      actionType: action.type,
      path: actionPath,
      approved: false,
      reason: decision.reason || 'Rejected by operator.',
    });
  }

  const nextIndex = flow.currentIndex + 1;
  if (nextIndex < flow.requestedActions.length) {
    const nextAction = flow.requestedActions[nextIndex];
    return {
      kind: 'next',
      flow: {
        ...flow,
        currentIndex: nextIndex,
        approvedActions,
        rejectedActions,
        currentApproval: createPendingEngineApprovalAction({
          action: nextAction,
          index: nextIndex,
          context: flow.context,
        }),
      },
    };
  }

  return {
    kind: 'complete',
    payload: {
      sessionKey: flow.sessionKey,
      runId: flow.runId,
      rootPath: flow.rootPath,
      approvedActions,
      rejectedActions,
    },
  };
}
