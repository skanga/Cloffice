import type {
  EngineChatMessage,
  EngineConnectOptions,
  EngineConnectionHandler,
  EngineCronJob,
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
  type InternalEngineShellCapabilities,
  type InternalEngineSendChatResult,
} from './internal-engine-bridge.js';

/**
 * Placeholder client for the future internal engine.
 *
 * It intentionally does not provide a working transport yet. The class exists so
 * higher-level factory code can model the future provider split without claiming
 * that the internal engine path is implemented.
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
      if (internalResult.assistantMessage) {
        this.eventHandler?.({
          type: 'event',
          event: 'chat',
          payload: {
            sessionKey: internalResult.sessionKey,
            runId: internalResult.runId,
            model: internalResult.model,
            state: 'completed',
            message: internalResult.assistantMessage,
          },
        });
      }
      return { sessionKey: internalResult.sessionKey };
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
