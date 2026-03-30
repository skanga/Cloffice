import type {
  ChatMessage,
  CoworkProgressStage,
  CoworkProjectTaskStatus,
  EngineSessionEvent,
  EngineSessionResult,
  LocalActionReceipt,
  MessageUsage,
  PendingApprovalAction,
} from '@/app-types';
import type { EngineClientInstance } from './engine-client';
import type { DesktopBridgeApi } from './connectors/connector-types';
import type { InternalApprovalRecoveryFlow } from './internal-approval-recovery';
import type { InternalEngineCoworkContinuationRequest } from './internal-engine-bridge';
import { type EngineApprovalDecision } from './engine-approval-orchestrator';
import { buildInternalApprovalRecoveryFlow } from './internal-approval-recovery';
import { isInternalEngineProvider } from './engine-provider-registry';
import {
  applyEngineCoworkFinalMessageUpdate,
  applyEngineCoworkStreamMessageUpdate,
  appendEngineCoworkActivityMessage,
  appendEngineCoworkSystemMessage,
  deriveEngineActionRunKey,
  executeEngineCoworkActionExecution,
  resolveEngineCoworkApprovalApplication,
  resolveEngineCoworkFailureApplication,
  resolveEngineCoworkNoActionCommit,
  resolveEngineCoworkReceiptCommit,
} from './engine-run-coordinator';
import {
  buildEngineActionExecutionResult,
  deriveEngineSessionArtifacts,
  getEngineSessionMessageIds,
  isEngineSessionError,
  isEngineSessionStreaming,
  resolveEngineCoworkApprovalTransition,
  resolveEngineCoworkStreamingTransition,
} from './engine-session-events';
import { parseUsageFromPayload } from './token-usage';
import { loadSafetyScopes } from './safety-policy';
import { validateProjectRelativePath } from './engine-cowork-prompt-controller';

type NotifyingBridge = DesktopBridgeApi & {
  notify?: (title: string, body: string) => Promise<unknown>;
};

type CoworkRunContext = {
  projectId: string;
  projectTitle: string;
  rootFolder: string;
};

type CoworkTaskRef = {
  taskId: string;
};

type CoworkMessageUpdater = (current: ChatMessage[]) => ChatMessage[];

export async function handleEngineCoworkEvent(params: {
  chatEvent: EngineSessionEvent;
  sessionResult: EngineSessionResult | null;
  client: EngineClientInstance;
  currentCoworkSessionKey: string;
  bridge?: NotifyingBridge;
  maxActionsPerRun: number;
  executedActionRunKeys: Set<string>;
  requestApproval: (request: PendingApprovalAction) => Promise<EngineApprovalDecision>;
  resolveRunContext: (sessionKey: string, runId: string) => CoworkRunContext;
  resolveTaskEntry: (sessionKey: string, runId: string) => CoworkTaskRef | null;
  persistInternalApprovalRecoveryFlow: (flow: InternalApprovalRecoveryFlow) => void;
  clearInternalApprovalRecoveryFlow: (runId: string) => void;
  onUsage: (usage: MessageUsage) => void;
  onSetAwaitingStream: (value: boolean) => void;
  onSetRunPhase: (phase: 'idle' | 'sending' | 'streaming' | 'completed' | 'error') => void;
  onSetRunStatus: (status: string) => void;
  onSetProgressStage: (
    stage: CoworkProgressStage,
    options?: { details?: string; blocked?: boolean; completeThrough?: boolean },
  ) => void;
  onSetStatus: (status: string) => void;
  onSetStreamingText: (text: string) => void;
  onUpdateMessages: (updater: CoworkMessageUpdater, cacheKey?: string) => void;
  onTouchThread: (sessionKey: string) => void;
  onSetTaskStatus: (
    taskId: string,
    status: CoworkProjectTaskStatus,
    options?: { runId?: string; summary?: string; outcome?: string },
  ) => void;
  onFinalizeTaskRun: (sessionKey: string, taskId: string) => void;
  onPushLocalActionReceipts: (receipts: LocalActionReceipt[]) => void;
  onRecordArtifactsFromReceipts: (receipts: LocalActionReceipt[], runId: string) => void;
  onClearPendingApprovalsForRun: (runId: string) => void;
}): Promise<void> {
  const { chatEvent, sessionResult } = params;
  const { payload, sessionKey: eventSessionKey, runId, visibleText, role } = chatEvent;
  const resolvedSessionKey = eventSessionKey || params.currentCoworkSessionKey;

  if (sessionResult?.status === 'failed' && isEngineSessionError(chatEvent)) {
    params.onSetAwaitingStream(false);
    params.onSetRunPhase('error');
    const resolvedErrorMessage = sessionResult.statusMessage || 'Cowork stream failed.';
    const failureApplication = resolveEngineCoworkFailureApplication(resolvedErrorMessage);
    params.onSetRunStatus(failureApplication.runStatus);
    params.onSetProgressStage('executing_workstreams', {
      blocked: true,
      details: failureApplication.progressDetails,
    });
    params.onSetStatus(failureApplication.runStatus);
    const taskEntry = params.resolveTaskEntry(resolvedSessionKey, runId);
    if (taskEntry) {
      params.onSetTaskStatus(taskEntry.taskId, failureApplication.taskStatus, {
        runId,
        summary: failureApplication.taskSummary,
        outcome: failureApplication.taskOutcome,
      });
      params.onFinalizeTaskRun(resolvedSessionKey, taskEntry.taskId);
    }
    return;
  }

  if (isEngineSessionStreaming(chatEvent)) {
    params.onSetAwaitingStream(false);
    params.onSetRunPhase('streaming');
    const streamingTransition = resolveEngineCoworkStreamingTransition(chatEvent);
    params.onSetRunStatus(streamingTransition.runStatus);
    params.onSetProgressStage('executing_workstreams', {
      details: streamingTransition.progressDetails,
    });
    params.onSetStreamingText(visibleText);
    const taskEntry = params.resolveTaskEntry(resolvedSessionKey, runId);
    if (taskEntry) {
      params.onSetTaskStatus(taskEntry.taskId, streamingTransition.taskStatus, {
        runId,
        summary: streamingTransition.taskSummary,
      });
    }
    const { streamId } = getEngineSessionMessageIds('cowork', runId);
    params.onUpdateMessages((current) =>
      applyEngineCoworkStreamMessageUpdate({
        current,
        streamId,
        role,
        visibleText,
      }),
    eventSessionKey);
    return;
  }

  if (!sessionResult || sessionResult.status === 'failed') {
    return;
  }

  params.onSetAwaitingStream(false);
  params.onSetRunPhase('completed');
  params.onSetRunStatus(sessionResult.status === 'aborted' ? 'Cowork run ended early.' : 'Cowork run completed.');
  params.onSetProgressStage('synthesizing_outputs', {
    details: 'Synthesizing output from completed workstreams.',
  });
  params.onSetStreamingText(visibleText);

  const { streamId, finalId, activityId } = getEngineSessionMessageIds('cowork', runId);
  const activeModel = chatEvent.model;
  const coworkUsage = parseUsageFromPayload(payload, activeModel);
  const {
    requestedActions,
    activityItems,
    hasRequestedActions,
    hasStructuredActivity,
    actionPhase,
    actionMode,
    providerId,
    executionResult,
  } = deriveEngineSessionArtifacts(chatEvent);
  const internalExecution = isInternalEngineProvider(providerId) ? executionResult : null;

  if (coworkUsage) {
    params.onUsage(coworkUsage);
  }

  params.onUpdateMessages((current) =>
    applyEngineCoworkFinalMessageUpdate({
      current,
      streamId,
      finalId,
      role,
      visibleText,
      usage: coworkUsage,
      hasRequestedActions,
      hasStructuredActivity,
    }),
  eventSessionKey);

  if (!hasRequestedActions && hasStructuredActivity) {
    params.onUpdateMessages((current) =>
      appendEngineCoworkActivityMessage({
        current,
        activityId,
        activityItems,
      }),
    eventSessionKey);
  }

  if (eventSessionKey) {
    params.onTouchThread(eventSessionKey);
  }

  const actionRunKey = deriveEngineActionRunKey(eventSessionKey, runId);
  const runContext = params.resolveRunContext(resolvedSessionKey, runId);
  const taskEntry = params.resolveTaskEntry(resolvedSessionKey, runId);

  const postCoworkActionReceipt = (result: ReturnType<typeof buildEngineActionExecutionResult>) => {
    const receiptCommit = resolveEngineCoworkReceiptCommit({
      result,
      hasTaskEntry: Boolean(taskEntry),
    });
    params.onSetRunStatus(receiptCommit.runStatus);
    params.onSetProgressStage('deliverables', {
      completeThrough: true,
      details: receiptCommit.progressDetails,
    });
    params.onSetStatus(receiptCommit.runStatus);
    params.onPushLocalActionReceipts(receiptCommit.receipts);
    params.onRecordArtifactsFromReceipts(receiptCommit.receipts, runId);

    if (taskEntry && receiptCommit.taskCommit) {
      params.onSetTaskStatus(taskEntry.taskId, receiptCommit.taskCommit.taskStatus, {
        runId,
        summary: receiptCommit.taskCommit.taskSummary,
        outcome: receiptCommit.taskCommit.taskOutcome,
      });
      if (receiptCommit.taskCommit.shouldFinalize) {
        params.onFinalizeTaskRun(resolvedSessionKey, taskEntry.taskId);
      }
    }

    params.onUpdateMessages((current) =>
      appendEngineCoworkSystemMessage({
        current,
        message: receiptCommit.message,
      }),
    eventSessionKey);
  };

  const approvalTransition = resolveEngineCoworkApprovalTransition({
    hasRequestedActions,
    actionPhase,
    actionMode,
  });
  if (approvalTransition && taskEntry) {
    const approvalApplication = resolveEngineCoworkApprovalApplication(approvalTransition);
    params.onSetRunStatus(approvalApplication.runStatus);
    params.onSetProgressStage('executing_workstreams', {
      details: approvalApplication.progressDetails,
    });
    params.onSetTaskStatus(taskEntry.taskId, approvalApplication.taskStatus, {
      runId,
      summary: approvalApplication.taskSummary,
    });
  }

  if (
    requestedActions.length > 0 &&
    !params.executedActionRunKeys.has(actionRunKey)
  ) {
    params.executedActionRunKeys.add(actionRunKey);
    const executionOutcome = await executeEngineCoworkActionExecution({
      requestedActions,
      providerId,
      actionMode,
      runId,
      eventSessionKey,
      currentCoworkSessionKey: params.currentCoworkSessionKey,
      runContext,
      continueCoworkRun: 'continueCoworkRun' in params.client
        ? (params.client as EngineClientInstance & {
            continueCoworkRun?: (payload: InternalEngineCoworkContinuationRequest) => Promise<unknown>;
          }).continueCoworkRun?.bind(params.client)
        : undefined,
      bridge: params.bridge,
      maxActionsPerRun: params.maxActionsPerRun,
      safetyScopes: loadSafetyScopes(runContext.projectId || undefined),
      requestApproval: params.requestApproval,
      validateProjectRelativePath,
      onRunStatus: params.onSetRunStatus,
      onProgress: (details) => {
        params.onSetProgressStage('executing_workstreams', { details });
      },
      onTaskStatus: taskEntry
        ? (status, summary, outcome) => {
            params.onSetTaskStatus(taskEntry.taskId, status, {
              runId,
              summary,
              outcome,
            });
          }
        : undefined,
      onInternalApprovalCheckpoint: ({ request, sessionKey, rootPath, context, requestedActions: boundedActions, currentIndex, approvedActions, rejectedActions }) => {
        params.persistInternalApprovalRecoveryFlow(
          buildInternalApprovalRecoveryFlow({
            sessionKey,
            rootPath,
            context,
            requestedActions: boundedActions,
            currentIndex,
            approvedActions,
            rejectedActions,
            currentApproval: request,
          }),
        );
      },
      onInternalApprovalFlowComplete: (completedRunId) => {
        params.clearInternalApprovalRecoveryFlow(completedRunId);
      },
    });
    if (executionOutcome.kind === 'continued') {
      params.onClearPendingApprovalsForRun(runId);
      return;
    }

    postCoworkActionReceipt(executionOutcome.result);
    if (executionOutcome.notification && params.bridge?.notify) {
      params.bridge.notify(executionOutcome.notification.title, executionOutcome.notification.body).catch(() => {
        /* notification failure is non-critical */
      });
    }
    return;
  }

  if (internalExecution) {
    params.onClearPendingApprovalsForRun(runId);
    postCoworkActionReceipt(
      buildEngineActionExecutionResult({
        runId,
        receipts: internalExecution.receipts,
        previews: internalExecution.previews,
        errors: internalExecution.errors,
        projectTitle: runContext.projectTitle,
        rootPath: runContext.rootFolder || '(not set)',
      }),
    );
    return;
  }

  if (requestedActions.length === 0) {
    params.onClearPendingApprovalsForRun(runId);
    const noActionCommit = resolveEngineCoworkNoActionCommit({
      visibleText,
      projectTitle: runContext.projectTitle,
      runId,
      rootPath: runContext.rootFolder,
      hasTaskEntry: Boolean(taskEntry),
    });
    params.onSetProgressStage('deliverables', {
      completeThrough: true,
      details: noActionCommit.progressDetails,
    });
    if (taskEntry && noActionCommit.taskCommit) {
      params.onSetTaskStatus(taskEntry.taskId, noActionCommit.taskCommit.taskStatus, {
        runId,
        summary: noActionCommit.taskCommit.taskSummary,
        outcome: noActionCommit.taskCommit.taskOutcome,
      });
      if (noActionCommit.taskCommit.shouldFinalize) {
        params.onFinalizeTaskRun(resolvedSessionKey, taskEntry.taskId);
      }

      if (params.bridge?.notify) {
        params.bridge.notify(noActionCommit.notificationTitle, noActionCommit.notificationBody).catch(() => {});
      }
    }

    params.onUpdateMessages((current) =>
      appendEngineCoworkSystemMessage({
        current,
        message: noActionCommit.message,
      }),
    eventSessionKey);
  }
}
