export type EngineCoworkRunStatusState = {
  runPhase: 'idle' | 'sending' | 'streaming' | 'error';
  runStatus: string;
  statusMessage: string;
  progressDetails?: string;
};

export function buildRecoveredApprovalAwaitingStatus(summary: string): string {
  return `Awaiting approval for ${summary}...`;
}

export function buildRecoveredApprovalContinuationUnavailableStatus(): string {
  return 'Recovered internal approval flow could not continue because the internal runtime continuation API is unavailable.';
}

export function buildRecoveredApprovalSubmittingRunStatus(): string {
  return 'Submitting recovered approval results to internal cowork...';
}

export function buildRecoveredApprovalSubmittingProgressDetails(): string {
  return 'Resuming recovered internal cowork approval flow.';
}

export function buildRecoveredApprovalContinuationFailureStatus(message?: string): string {
  return message || 'Failed to continue recovered internal approval flow.';
}

export function buildApprovalRejectReasonRequiredStatus(): string {
  return 'Provide a reason before rejecting an action.';
}

export function resolveCoworkDisconnectedState(): EngineCoworkRunStatusState {
  return {
    runPhase: 'error',
    runStatus: 'Runtime disconnected.',
    statusMessage: 'Runtime disconnected. Connect in Settings > Engine to run cowork tasks.',
  };
}

export function resolveCoworkSendingState(): EngineCoworkRunStatusState {
  return {
    runPhase: 'sending',
    runStatus: 'Sending cowork task...',
    statusMessage: 'Sending cowork task...',
    progressDetails: 'Interpreting goal and building a task plan.',
  };
}

export function buildCoworkEmptyPromptStatus(): string {
  return 'Describe the outcome first so Cloffice can plan the work.';
}

export function buildMissingCoworkSessionKeyError(): string {
  return 'No cowork session key returned from the current runtime.';
}

export function resolveCoworkWaitingForStreamState(): EngineCoworkRunStatusState {
  return {
    runPhase: 'streaming',
    runStatus: 'Waiting for cowork stream...',
    statusMessage: 'Cowork message sent. Waiting for stream...',
    progressDetails: 'Splitting work into substeps and selecting tools.',
  };
}

export function buildCoworkSendFailureStatus(message?: string): string {
  return message || 'Failed to send cowork task.';
}

export function resolveCoworkResetState(): EngineCoworkRunStatusState {
  return {
    runPhase: 'idle',
    runStatus: 'Ready for a new task.',
    statusMessage: 'Ready for a new task.',
  };
}

export function buildMissingPreviousCoworkPromptStatus(): string {
  return 'No previous task prompt available to rerun.';
}

export function buildLoadedPreviousCoworkPromptStatus(): string {
  return 'Loaded last task prompt. Review and send to rerun.';
}
