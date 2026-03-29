import type {
  EngineChatMessage,
  EngineConnectOptions,
  EngineCronJob,
  EngineModelChoice,
  EngineRuntimeDescriptor,
  EngineSessionSummary,
  EngineToolsCatalog,
  EngineWorkspaceListResult,
  EngineWorkspaceReadResult,
  EngineWorkspaceStatResult,
} from './engine-runtime-types.js';

export type InternalEngineShellCapabilities = {
  connection: boolean;
  sessions: boolean;
  models: boolean;
  scheduling: boolean;
  toolsCatalog: boolean;
  workspaceRpc: boolean;
};

export type InternalEngineShellStatus = {
  runtime: EngineRuntimeDescriptor;
  capabilities: InternalEngineShellCapabilities;
  availableInBuild: boolean;
  unavailableReason: string;
};

export type InternalEngineRuntimeInfo = {
  status: InternalEngineShellStatus;
  runtimeHome: string;
  serviceVersion: string;
  serviceName: string;
  connected: boolean;
};

export type InternalEngineLifecycleBridge = {
  connect(options: EngineConnectOptions): Promise<void>;
  disconnect(): Promise<void> | void;
  isConnected(): boolean;
};

export type InternalEngineSessionBridge = {
  getActiveSessionKey(): Promise<string>;
  createChatSession(): Promise<string>;
  createCoworkSession(): Promise<string>;
  sendChat(sessionKey: string, text: string): Promise<{ sessionKey: string }>;
  resolveSessionKey(preferredKey?: string): Promise<string>;
  getHistory(sessionKey: string, limit?: number): Promise<EngineChatMessage[]>;
  listModels(): Promise<EngineModelChoice[]>;
  getSessionModel(sessionKey: string): Promise<string | null>;
  listSessions(limit?: number): Promise<EngineSessionSummary[]>;
  setSessionModel(sessionKey: string, modelValue: string | null): Promise<void>;
  setSessionTitle(sessionKey: string, title: string | null): Promise<void>;
  deleteSession(sessionKey: string): Promise<void>;
};

export type InternalEngineSchedulingBridge = {
  listCronJobs(): Promise<EngineCronJob[]>;
};

export type InternalEngineToolsBridge = {
  fetchToolsCatalog(): Promise<EngineToolsCatalog>;
};

export type InternalEngineWorkspaceBridge = {
  listWorkspaceFiles(relativePath?: string): Promise<EngineWorkspaceListResult>;
  readWorkspaceFile(relativePath: string): Promise<EngineWorkspaceReadResult>;
  statWorkspaceFile(relativePath: string): Promise<EngineWorkspaceStatResult>;
  renameWorkspaceFile(oldPath: string, newPath: string): Promise<void>;
  deleteWorkspaceFile(path: string): Promise<void>;
  writeWorkspaceFile(path: string, content: string): Promise<void>;
};

export type InternalEngineBridge = {
  status: InternalEngineShellStatus;
  lifecycle: InternalEngineLifecycleBridge;
  sessions: InternalEngineSessionBridge;
  scheduling: InternalEngineSchedulingBridge;
  tools: InternalEngineToolsBridge;
  workspace: InternalEngineWorkspaceBridge;
};

export type InternalEngineDesktopBridge = {
  getInternalEngineStatus(): Promise<InternalEngineShellStatus>;
  getInternalEngineRuntimeInfo(): Promise<InternalEngineRuntimeInfo>;
  connectInternalEngine(options: EngineConnectOptions): Promise<void>;
  disconnectInternalEngine(): Promise<void>;
  getInternalEngineActiveSessionKey(): Promise<string>;
};

function createUnavailableInternalEngineError(message: string): Error {
  return new Error(message);
}

export function createUnavailableInternalEngineBridge(status: InternalEngineShellStatus): InternalEngineBridge {
  const fail = <T>(): Promise<T> => Promise.reject(createUnavailableInternalEngineError(status.unavailableReason));

  return {
    status,
    lifecycle: {
      connect: (_options) => fail<void>(),
      disconnect: () => undefined,
      isConnected: () => false,
    },
    sessions: {
      getActiveSessionKey: () => fail<string>(),
      createChatSession: () => fail<string>(),
      createCoworkSession: () => fail<string>(),
      sendChat: (_sessionKey, _text) => fail<{ sessionKey: string }>(),
      resolveSessionKey: (_preferredKey) => fail<string>(),
      getHistory: (_sessionKey, _limit) => fail<EngineChatMessage[]>(),
      listModels: () => fail<EngineModelChoice[]>(),
      getSessionModel: (_sessionKey) => fail<string | null>(),
      listSessions: (_limit) => fail<EngineSessionSummary[]>(),
      setSessionModel: (_sessionKey, _modelValue) => fail<void>(),
      setSessionTitle: (_sessionKey, _title) => fail<void>(),
      deleteSession: (_sessionKey) => fail<void>(),
    },
    scheduling: {
      listCronJobs: () => fail<EngineCronJob[]>(),
    },
    tools: {
      fetchToolsCatalog: () => fail<EngineToolsCatalog>(),
    },
    workspace: {
      listWorkspaceFiles: (_relativePath) => fail<EngineWorkspaceListResult>(),
      readWorkspaceFile: (_relativePath) => fail<EngineWorkspaceReadResult>(),
      statWorkspaceFile: (_relativePath) => fail<EngineWorkspaceStatResult>(),
      renameWorkspaceFile: (_oldPath, _newPath) => fail<void>(),
      deleteWorkspaceFile: (_path) => fail<void>(),
      writeWorkspaceFile: (_path, _content) => fail<void>(),
    },
  };
}

export function createDesktopBackedInternalEngineBridge(
  desktopBridge: InternalEngineDesktopBridge,
  status: InternalEngineShellStatus,
): InternalEngineBridge {
  const fail = <T>(): Promise<T> => Promise.reject(createUnavailableInternalEngineError(status.unavailableReason));

  return {
    status,
    lifecycle: {
      connect: (options) => desktopBridge.connectInternalEngine(options),
      disconnect: () => desktopBridge.disconnectInternalEngine(),
      isConnected: () => false,
    },
    sessions: {
      getActiveSessionKey: () => desktopBridge.getInternalEngineActiveSessionKey(),
      createChatSession: () => fail<string>(),
      createCoworkSession: () => fail<string>(),
      sendChat: (_sessionKey, _text) => fail<{ sessionKey: string }>(),
      resolveSessionKey: (_preferredKey) => fail<string>(),
      getHistory: (_sessionKey, _limit) => fail<EngineChatMessage[]>(),
      listModels: () => fail<EngineModelChoice[]>(),
      getSessionModel: (_sessionKey) => fail<string | null>(),
      listSessions: (_limit) => fail<EngineSessionSummary[]>(),
      setSessionModel: (_sessionKey, _modelValue) => fail<void>(),
      setSessionTitle: (_sessionKey, _title) => fail<void>(),
      deleteSession: (_sessionKey) => fail<void>(),
    },
    scheduling: {
      listCronJobs: () => fail<EngineCronJob[]>(),
    },
    tools: {
      fetchToolsCatalog: () => fail<EngineToolsCatalog>(),
    },
    workspace: {
      listWorkspaceFiles: (_relativePath) => fail<EngineWorkspaceListResult>(),
      readWorkspaceFile: (_relativePath) => fail<EngineWorkspaceReadResult>(),
      statWorkspaceFile: (_relativePath) => fail<EngineWorkspaceStatResult>(),
      renameWorkspaceFile: (_oldPath, _newPath) => fail<void>(),
      deleteWorkspaceFile: (_path) => fail<void>(),
      writeWorkspaceFile: (_path, _content) => fail<void>(),
    },
  };
}
