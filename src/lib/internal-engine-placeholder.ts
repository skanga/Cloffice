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

const INTERNAL_ENGINE_UNAVAILABLE_MESSAGE = 'The internal engine runtime is not available in this build yet.';

function internalEngineUnavailable(): Error {
  return new Error(INTERNAL_ENGINE_UNAVAILABLE_MESSAGE);
}

export class InternalEnginePlaceholderClient implements EngineRuntimeClient {
  readonly providerId = INTERNAL_ENGINE_RUNTIME_DESCRIPTOR.providerId;
  readonly runtimeKind = INTERNAL_ENGINE_RUNTIME_DESCRIPTOR.runtimeKind;
  readonly transport = INTERNAL_ENGINE_RUNTIME_DESCRIPTOR.transport;

  connect(_options: EngineConnectOptions): Promise<void> {
    return Promise.reject(internalEngineUnavailable());
  }

  disconnect(): void {}

  isConnected(): boolean {
    return false;
  }

  setConnectionHandler(_handler: EngineConnectionHandler): void {}

  setEventHandler(_handler: EngineEventHandler): void {}

  getActiveSessionKey(): Promise<string> {
    return Promise.reject(internalEngineUnavailable());
  }

  createChatSession(): Promise<string> {
    return Promise.reject(internalEngineUnavailable());
  }

  createCoworkSession(): Promise<string> {
    return Promise.reject(internalEngineUnavailable());
  }

  sendChat(_sessionKey: string, _text: string): Promise<{ sessionKey: string }> {
    return Promise.reject(internalEngineUnavailable());
  }

  resolveSessionKey(_preferredKey?: string): Promise<string> {
    return Promise.reject(internalEngineUnavailable());
  }

  getHistory(_sessionKey: string, _limit?: number): Promise<EngineChatMessage[]> {
    return Promise.reject(internalEngineUnavailable());
  }

  listModels(): Promise<EngineModelChoice[]> {
    return Promise.reject(internalEngineUnavailable());
  }

  getSessionModel(_sessionKey: string): Promise<string | null> {
    return Promise.reject(internalEngineUnavailable());
  }

  listSessions(_limit?: number): Promise<EngineSessionSummary[]> {
    return Promise.reject(internalEngineUnavailable());
  }

  setSessionModel(_sessionKey: string, _modelValue: string | null): Promise<void> {
    return Promise.reject(internalEngineUnavailable());
  }

  setSessionTitle(_sessionKey: string, _title: string | null): Promise<void> {
    return Promise.reject(internalEngineUnavailable());
  }

  deleteSession(_sessionKey: string): Promise<void> {
    return Promise.reject(internalEngineUnavailable());
  }

  listCronJobs(): Promise<EngineCronJob[]> {
    return Promise.reject(internalEngineUnavailable());
  }

  fetchToolsCatalog(): Promise<EngineToolsCatalog> {
    return Promise.reject(internalEngineUnavailable());
  }

  listWorkspaceFiles(_relativePath?: string): Promise<EngineWorkspaceListResult> {
    return Promise.reject(internalEngineUnavailable());
  }

  readWorkspaceFile(_relativePath: string): Promise<EngineWorkspaceReadResult> {
    return Promise.reject(internalEngineUnavailable());
  }

  statWorkspaceFile(_relativePath: string): Promise<EngineWorkspaceStatResult> {
    return Promise.reject(internalEngineUnavailable());
  }

  renameWorkspaceFile(_oldPath: string, _newPath: string): Promise<void> {
    return Promise.reject(internalEngineUnavailable());
  }

  deleteWorkspaceFile(_path: string): Promise<void> {
    return Promise.reject(internalEngineUnavailable());
  }

  writeWorkspaceFile(_path: string, _content: string): Promise<void> {
    return Promise.reject(internalEngineUnavailable());
  }
}
