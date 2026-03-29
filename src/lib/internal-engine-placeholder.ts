import type {
  EngineChatMessage,
  EngineConnectOptions,
  EngineConnectionHandler,
  EngineCronJob,
  EngineEventFrame,
  EngineEventHandler,
  EngineModelChoice,
  EngineRuntimeClient,
  EngineRuntimeDescriptor,
  EngineSessionSummary,
  EngineToolsCatalog,
  EngineWorkspaceListResult,
  EngineWorkspaceReadResult,
  EngineWorkspaceStatResult,
} from './engine-runtime-types.js';
import {
  createUnavailableInternalEngineBridge,
  type InternalEngineBridge,
  type InternalEngineCoworkContinuationResult,
  type InternalEngineCoworkContinuationRequest,
  type InternalEngineShellCapabilities,
  type InternalEngineSendChatResult,
} from './internal-engine-bridge.js';

/**
 * Transitional client for the internal engine development path.
 *
 * The current implementation is intentionally narrow: it supports the desktop-
 * backed development runtime for connection/session/chat semantics, while
 * leaving broader cowork, scheduling, and workspace behavior for later phases.
 */
export const INTERNAL_ENGINE_RUNTIME_DESCRIPTOR: EngineRuntimeDescriptor = {
  providerId: 'internal',
  runtimeKind: 'internal',
  transport: 'internal-ipc',
};

export const INTERNAL_ENGINE_SHELL_CAPABILITIES: InternalEngineShellCapabilities = {
  connection: false,
  sessions: false,
  models: false,
  scheduling: false,
  toolsCatalog: false,
  workspaceRpc: false,
};

const INTERNAL_ENGINE_UNAVAILABLE_MESSAGE = 'The internal engine runtime is not available in this build yet.';

export class InternalEnginePlaceholderClient implements EngineRuntimeClient {
  private readonly bridge: InternalEngineBridge;
  private connectionHandler: EngineConnectionHandler | null = null;
  private eventHandler: EngineEventHandler | null = null;

  readonly providerId = INTERNAL_ENGINE_RUNTIME_DESCRIPTOR.providerId;
  readonly runtimeKind = INTERNAL_ENGINE_RUNTIME_DESCRIPTOR.runtimeKind;
  readonly transport = INTERNAL_ENGINE_RUNTIME_DESCRIPTOR.transport;

  constructor(bridge: InternalEngineBridge = createUnavailableInternalEngineBridge(describeInternalEngineShell())) {
    this.bridge = bridge;
  }

  private emitEvent(event: EngineEventFrame): void {
    this.eventHandler?.(event);
  }

  private emitInternalResult(internalResult: InternalEngineSendChatResult): void {
    if (!internalResult.assistantMessage) {
      return;
    }

    const payload: Record<string, unknown> = {
      providerId: internalResult.providerId ?? this.providerId,
      runtimeKind: internalResult.runtimeKind ?? this.runtimeKind,
      sessionKind: internalResult.sessionKind,
      sessionKey: internalResult.sessionKey,
      runId: internalResult.runId,
      model: internalResult.model,
      state: 'completed',
      message: internalResult.assistantMessage,
      requestedActions: internalResult.requestedActions,
      activityItems: internalResult.activityItems,
      engineActionPhase: internalResult.engineActionPhase ?? 'none',
      engineActionMode: internalResult.engineActionMode ?? 'none',
    };
    if ('execution' in internalResult) {
      payload.execution = (internalResult as InternalEngineCoworkContinuationResult).execution;
    }

    this.emitEvent({
      type: 'event',
      event: 'chat',
      stateVersion: {
        historyLength: internalResult.historyLength,
      },
      payload,
    });
  }

  private emitExecutingCoworkPhase(payload: InternalEngineCoworkContinuationRequest): void {
    const message: EngineChatMessage = {
      id: `internal-executing-${payload.runId}`,
      role: 'assistant',
      text: 'Internal cowork is executing approved read-only actions...',
    };

    this.emitEvent({
      type: 'event',
      event: 'chat',
      payload: {
        providerId: this.providerId,
        runtimeKind: this.runtimeKind,
        sessionKind: 'cowork',
        sessionKey: payload.sessionKey,
        runId: payload.runId,
        state: 'delta',
        message,
        requestedActions: [],
        activityItems: [
          {
            id: `internal-executing-${payload.runId}`,
            label: 'Internal cowork is executing approved read-only actions.',
            details: `Approved actions: ${payload.approvedActions.length}`,
            tone: 'neutral',
          },
        ],
        engineActionPhase: 'executing',
        engineActionMode: 'read-only',
      },
    });
  }

  connect(options: EngineConnectOptions): Promise<void> {
    if (!this.bridge.status.availableInBuild) {
      this.connectionHandler?.(false, this.bridge.status.unavailableReason);
      this.eventHandler?.({
        type: 'event',
        event: 'engine.unavailable',
        payload: {
          runtimeKind: this.runtimeKind,
          providerId: this.providerId,
          reason: this.bridge.status.unavailableReason,
        },
      });
      return this.bridge.lifecycle.connect(options);
    }

    this.connectionHandler?.(false, 'Connecting to internal engine development path...');
    return this.bridge.lifecycle.connect(options).then(() => {
      this.connectionHandler?.(true, 'Connected to internal engine development path.');
    }).catch((error) => {
      const message = error instanceof Error ? error.message : this.bridge.status.unavailableReason;
      this.connectionHandler?.(false, message);
      throw error;
    });
  }

  disconnect(): void {
    void this.bridge.lifecycle.disconnect();
    this.connectionHandler?.(false, 'Internal engine shell disconnected.');
  }

  isConnected(): boolean {
    return this.bridge.lifecycle.isConnected();
  }

  setConnectionHandler(handler: EngineConnectionHandler): void {
    this.connectionHandler = handler;
  }

  setEventHandler(handler: EngineEventHandler): void {
    this.eventHandler = handler;
  }

  getActiveSessionKey(): Promise<string> {
    return this.bridge.sessions.getActiveSessionKey();
  }

  createChatSession(): Promise<string> {
    return this.bridge.sessions.createChatSession();
  }

  createCoworkSession(): Promise<string> {
    return this.bridge.sessions.createCoworkSession();
  }

  sendChat(_sessionKey: string, _text: string): Promise<{ sessionKey: string }> {
    return this.bridge.sessions.sendChat(_sessionKey, _text).then((result) => {
      const internalResult = result as InternalEngineSendChatResult;
      this.emitInternalResult(internalResult);
      return { sessionKey: internalResult.sessionKey };
    });
  }

  continueCoworkRun(payload: InternalEngineCoworkContinuationRequest): Promise<{ sessionKey: string }> {
    this.emitExecutingCoworkPhase(payload);
    return this.bridge.sessions.continueCoworkRun(payload).then((result) => {
      this.emitInternalResult(result);
      return { sessionKey: result.sessionKey };
    });
  }

  resolveSessionKey(_preferredKey?: string): Promise<string> {
    return this.bridge.sessions.resolveSessionKey(_preferredKey);
  }

  getHistory(_sessionKey: string, _limit?: number): Promise<EngineChatMessage[]> {
    return this.bridge.sessions.getHistory(_sessionKey, _limit);
  }

  listModels(): Promise<EngineModelChoice[]> {
    return this.bridge.sessions.listModels();
  }

  getSessionModel(_sessionKey: string): Promise<string | null> {
    return this.bridge.sessions.getSessionModel(_sessionKey);
  }

  listSessions(_limit?: number): Promise<EngineSessionSummary[]> {
    return this.bridge.sessions.listSessions(_limit);
  }

  setSessionModel(_sessionKey: string, _modelValue: string | null): Promise<void> {
    return this.bridge.sessions.setSessionModel(_sessionKey, _modelValue);
  }

  setSessionTitle(_sessionKey: string, _title: string | null): Promise<void> {
    return this.bridge.sessions.setSessionTitle(_sessionKey, _title);
  }

  deleteSession(_sessionKey: string): Promise<void> {
    return this.bridge.sessions.deleteSession(_sessionKey);
  }

  listCronJobs(): Promise<EngineCronJob[]> {
    return this.bridge.scheduling.listCronJobs();
  }

  fetchToolsCatalog(): Promise<EngineToolsCatalog> {
    return this.bridge.tools.fetchToolsCatalog();
  }

  listWorkspaceFiles(_relativePath?: string): Promise<EngineWorkspaceListResult> {
    return this.bridge.workspace.listWorkspaceFiles(_relativePath);
  }

  readWorkspaceFile(_relativePath: string): Promise<EngineWorkspaceReadResult> {
    return this.bridge.workspace.readWorkspaceFile(_relativePath);
  }

  statWorkspaceFile(_relativePath: string): Promise<EngineWorkspaceStatResult> {
    return this.bridge.workspace.statWorkspaceFile(_relativePath);
  }

  renameWorkspaceFile(_oldPath: string, _newPath: string): Promise<void> {
    return this.bridge.workspace.renameWorkspaceFile(_oldPath, _newPath);
  }

  deleteWorkspaceFile(_path: string): Promise<void> {
    return this.bridge.workspace.deleteWorkspaceFile(_path);
  }

  writeWorkspaceFile(_path: string, _content: string): Promise<void> {
    return this.bridge.workspace.writeWorkspaceFile(_path, _content);
  }
}

export function describeInternalEngineShell() {
  return {
    runtime: INTERNAL_ENGINE_RUNTIME_DESCRIPTOR,
    capabilities: INTERNAL_ENGINE_SHELL_CAPABILITIES,
    availableInBuild: false as const,
    unavailableReason: INTERNAL_ENGINE_UNAVAILABLE_MESSAGE,
  };
}
