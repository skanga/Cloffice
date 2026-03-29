import type { EngineRequestedAction, PendingApprovalAction, SafetyRiskLevel } from '../app-types.js';
import {
  buildEngineApprovalPreview,
  resolveEngineApprovalTaskTransition,
  summarizeEngineRequestedAction,
} from './engine-action-protocol.js';

export type EngineApprovalDecision = {
  approved: boolean;
  reason?: string;
  expired?: boolean;
};

export type EngineRejectedApprovalAction = {
  id: string;
  actionId: string;
  actionType: EngineRequestedAction['type'];
  path: string;
  approved: false;
  reason?: string;
};

export type EngineApprovalLoopResult = {
  approvedActions: EngineRequestedAction[];
  rejectedActions: EngineRejectedApprovalAction[];
  truncated: boolean;
};

export type EngineApprovalLoopContext = {
  runId: string;
  projectId?: string;
  projectTitle?: string;
  projectRootFolder?: string;
  scopeId: string;
  scopeName: string;
  riskLevel: SafetyRiskLevel;
  maxActionsPerRun: number;
};

export function createPendingEngineApprovalAction(params: {
  action: EngineRequestedAction;
  index: number;
  context: EngineApprovalLoopContext;
}): PendingApprovalAction {
  const actionId = params.action.id || `action-${params.index + 1}`;
  const actionPath = params.action.path || '.';
  const actionSummary = summarizeEngineRequestedAction(params.action);

  return {
    id: `${params.context.runId}-${actionId}-${params.index + 1}`,
    runId: params.context.runId,
    actionId,
    actionType: params.action.type,
    projectId: params.context.projectId,
    projectTitle: params.context.projectTitle,
    projectRootFolder: params.context.projectRootFolder,
    path: actionPath,
    scopeId: params.context.scopeId,
    scopeName: params.context.scopeName,
    riskLevel: params.context.riskLevel,
    summary: `${params.context.projectTitle ? `[${params.context.projectTitle}] ` : ''}${actionSummary}`,
    preview: buildEngineApprovalPreview(params.action),
    createdAt: Date.now(),
  };
}

export async function runEngineReadOnlyApprovalLoop(params: {
  actions: EngineRequestedAction[];
  context: EngineApprovalLoopContext;
  requestApproval: (request: PendingApprovalAction) => Promise<EngineApprovalDecision>;
  onPending?: (info: {
    action: EngineRequestedAction;
    actionId: string;
    actionPath: string;
    actionSummary: string;
  }) => void;
  onApproved?: (info: {
    action: EngineRequestedAction;
    actionSummary: string;
  }) => void;
  onRejected?: (info: {
    action: EngineRequestedAction;
    actionSummary: string;
    reason: string;
  }) => void;
  onCheckpoint?: (info: {
    request: PendingApprovalAction;
    currentIndex: number;
    boundedActions: EngineRequestedAction[];
    approvedActions: EngineRequestedAction[];
    rejectedActions: EngineRejectedApprovalAction[];
  }) => void;
}): Promise<EngineApprovalLoopResult> {
  const boundedActions = params.actions.slice(0, params.context.maxActionsPerRun);
  const approvedActions: EngineRequestedAction[] = [];
  const rejectedActions: EngineRejectedApprovalAction[] = [];

  for (let index = 0; index < boundedActions.length; index += 1) {
    const action = boundedActions[index];
    const actionId = action.id || `action-${index + 1}`;
    const actionPath = action.path || '.';
    const actionSummary = summarizeEngineRequestedAction(action);

    params.onPending?.({
      action,
      actionId,
      actionPath,
      actionSummary,
    });

    const request = createPendingEngineApprovalAction({
      action,
      index,
      context: params.context,
    });
    params.onCheckpoint?.({
      request,
      currentIndex: index,
      boundedActions,
      approvedActions: [...approvedActions],
      rejectedActions: [...rejectedActions],
    });
    const decision = await params.requestApproval(request);

    if (!decision.approved) {
      const reason = decision.reason || 'Rejected by operator.';
      rejectedActions.push({
        id: actionId,
        actionId,
        actionType: action.type,
        path: actionPath,
        approved: false,
        reason,
      });
      params.onRejected?.({
        action,
        actionSummary,
        reason,
      });
      continue;
    }

    approvedActions.push(action);
    params.onApproved?.({
      action,
      actionSummary,
    });
  }

  return {
    approvedActions,
    rejectedActions,
    truncated: params.actions.length > params.context.maxActionsPerRun,
  };
}

export { resolveEngineApprovalTaskTransition };
