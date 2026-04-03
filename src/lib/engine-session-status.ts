export type EngineSessionScope = 'chat' | 'cowork';
export type EngineSessionOperation =
  | 'resolve_active'
  | 'create_chat'
  | 'update_model'
  | 'delete'
  | 'sync_title';

function labelForScope(scope: EngineSessionScope): string {
  return scope === 'cowork' ? 'task' : 'chat';
}

function titleForScope(scope: EngineSessionScope): string {
  return scope === 'cowork' ? 'Task' : 'Chat';
}

export function buildInvalidSessionKeyStatus(scope: EngineSessionScope): string {
  return scope === 'cowork' ? 'Invalid cowork session key.' : 'Invalid session key.';
}

export function buildLoadedSessionStatus(params: {
  scope: EngineSessionScope;
  prefix: string;
  titleFromHistory?: string;
  hasMessages?: boolean;
  fallbackTitle: string;
}): string {
  if (params.titleFromHistory) {
    return `${params.prefix}: ${params.titleFromHistory}`;
  }

  if (params.scope === 'chat' && params.hasMessages === false) {
    return `${params.prefix}: no messages in this chat yet.`;
  }

  return `${params.prefix}: ${params.fallbackTitle}`;
}

export function buildSessionReadyStatus(sessionKey: string): string {
  return `Session ready: ${sessionKey}`;
}

export function buildSessionModelUpdatedStatus(params: {
  scope: EngineSessionScope;
  sessionKey: string;
  modelValue: string;
}): string {
  if (params.scope === 'cowork') {
    return `Cowork model updated for session ${params.sessionKey}: ${params.modelValue}`;
  }
  return `Model updated for session ${params.sessionKey}: ${params.modelValue}`;
}

export function buildSessionModelResetStatus(params: {
  scope: EngineSessionScope;
  sessionKey: string;
}): string {
  if (params.scope === 'cowork') {
    return `Cowork model reset to default for session ${params.sessionKey}.`;
  }
  return `Model reset to default for session ${params.sessionKey}.`;
}

export function buildPendingCoworkModelSelectionStatus(modelValue: string): string {
  return modelValue
    ? `Cowork model selected: ${modelValue}. It will apply on the next task run.`
    : 'Cowork model reset to default. It will apply on the next task run.';
}

export function buildStartedNewChatStatus(sessionKey: string): string {
  return `Started a new chat: ${sessionKey}.`;
}

export function buildOpenedRecentSessionStatus(scope: EngineSessionScope, title?: string): string {
  const label = labelForScope(scope);
  return title ? `Opened ${label}: ${title}` : `Opened ${label}.`;
}

export function buildLoadingRecentSessionStatus(scope: EngineSessionScope): string {
  return scope === 'cowork' ? 'Loading recent cowork task...' : 'Loading recent chat...';
}

export function buildRenamedRecentSessionStatus(scope: EngineSessionScope): string {
  return `${titleForScope(scope)} renamed.`;
}

export function buildDeletedRecentSessionStatus(scope: EngineSessionScope): string {
  return `${titleForScope(scope)} deleted.`;
}

export function buildRuntimeClientUnavailableStatus(): string {
  return 'Runtime client not initialized.';
}

export function buildMissingActiveSessionError(): string {
  return 'No active session available from the current runtime.';
}

export function buildUnableToResolveActiveSessionError(message: string): string {
  return `Unable to get active session. ${message}`;
}

export function buildMissingCreatedSessionKeyError(): string {
  return 'No session key returned from the current runtime.';
}

export function buildNoActiveChatSessionError(): string {
  return 'No active chat session. Start a new chat first.';
}

export function buildSessionOperationFailureStatus(
  operation: EngineSessionOperation,
  scope: EngineSessionScope = 'chat',
): string {
  if (operation === 'create_chat') {
    return 'Failed to create chat session.';
  }
  if (operation === 'update_model') {
    return scope === 'cowork' ? 'Failed to update cowork model.' : 'Failed to update model.';
  }
  if (operation === 'delete') {
    return 'Unable to delete session.';
  }
  if (operation === 'sync_title') {
    return 'Renamed locally. Runtime title sync is not available on this server.';
  }
  return 'Unable to get active session.';
}
