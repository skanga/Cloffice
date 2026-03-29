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
import type { ChatActivityItem, EngineRequestedAction, LocalActionReceipt } from '../app-types.js';

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
  readiness: 'unavailable' | 'idle' | 'ready';
  sessionCount: number;
  runCount: number;
  interruptedRunCount: number;
  activeSessionKey: string | null;
  defaultModel: string;
  stateRestoreStatus: 'fresh' | 'restored' | 'recovered_after_interruption' | 'load_failed';
  lastRecoveryNote: string | null;
};

export type InternalEngineCoworkActionPhase =
  | 'none'
  | 'planning'
  | 'approval_required'
  | 'awaiting_approval'
  | 'executing'
  | 'completed'
  | 'blocked';

export type InternalEngineSendChatResult = {
  sessionKey: string;
  runId: string;
  assistantMessage: EngineChatMessage;
  model: string;
  historyLength: number;
  sessionTitle?: string;
  providerId?: 'internal';
  runtimeKind?: 'internal';
  sessionKind?: string;
  requestedActions?: EngineRequestedAction[];
  activityItems?: ChatActivityItem[];
  engineActionPhase?: InternalEngineCoworkActionPhase;
  engineActionMode?: 'none' | 'read-only';
};

export type InternalEngineCoworkActionDecision = {
  id: string;
  actionId: string;
  actionType: EngineRequestedAction['type'];
  path: string;
  approved: boolean;
  reason?: string;
};

export type InternalEngineCoworkContinuationRequest = {
  sessionKey: string;
  runId: string;
  rootPath: string;
  approvedActions: EngineRequestedAction[];
  rejectedActions: InternalEngineCoworkActionDecision[];
};

export type InternalEngineActionExecutionResult = {
  receipts: LocalActionReceipt[];
  previews: string[];
  errors: string[];
};

export type InternalEngineCoworkContinuationResult = InternalEngineSendChatResult & {
  execution: InternalEngineActionExecutionResult;
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
  sendChat(sessionKey: string, text: string): Promise<{ sessionKey: string } | InternalEngineSendChatResult>;
  resolveSessionKey(preferredKey?: string): Promise<string>;
  getHistory(sessionKey: string, limit?: number): Promise<EngineChatMessage[]>;
  continueCoworkRun(payload: InternalEngineCoworkContinuationRequest): Promise<InternalEngineCoworkContinuationResult>;
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
  createInternalChatSession(): Promise<string>;
  createInternalCoworkSession(): Promise<string>;
  resolveInternalSessionKey(preferredKey?: string): Promise<string>;
  listInternalSessions(limit?: number): Promise<EngineSessionSummary[]>;
  listInternalModels(): Promise<EngineModelChoice[]>;
  getInternalSessionModel(sessionKey: string): Promise<string | null>;
  setInternalSessionModel(sessionKey: string, modelValue: string | null): Promise<void>;
  setInternalSessionTitle(sessionKey: string, title: string | null): Promise<void>;
  deleteInternalSession(sessionKey: string): Promise<void>;
  getInternalHistory(sessionKey: string, limit?: number): Promise<EngineChatMessage[]>;
  sendInternalChat(sessionKey: string, text: string): Promise<InternalEngineSendChatResult>;
  continueInternalCoworkRun(payload: InternalEngineCoworkContinuationRequest): Promise<InternalEngineCoworkContinuationResult>;
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
      continueCoworkRun: (_payload) => fail<InternalEngineCoworkContinuationResult>(),
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
  let connected = false;

  return {
    status,
    lifecycle: {
      connect: async (options) => {
        await desktopBridge.connectInternalEngine(options);
        connected = true;
      },
      disconnect: async () => {
        connected = false;
        await desktopBridge.disconnectInternalEngine();
      },
      isConnected: () => connected,
    },
    sessions: {
      getActiveSessionKey: () => desktopBridge.getInternalEngineActiveSessionKey(),
      createChatSession: () => desktopBridge.createInternalChatSession(),
      createCoworkSession: () => desktopBridge.createInternalCoworkSession(),
      sendChat: (sessionKey, text) => desktopBridge.sendInternalChat(sessionKey, text),
      resolveSessionKey: (preferredKey) => desktopBridge.resolveInternalSessionKey(preferredKey),
      getHistory: (sessionKey, limit) => desktopBridge.getInternalHistory(sessionKey, limit),
      continueCoworkRun: (payload) => desktopBridge.continueInternalCoworkRun(payload),
      listModels: () => desktopBridge.listInternalModels(),
      getSessionModel: (sessionKey) => desktopBridge.getInternalSessionModel(sessionKey),
      listSessions: (limit) => desktopBridge.listInternalSessions(limit),
      setSessionModel: (sessionKey, modelValue) => desktopBridge.setInternalSessionModel(sessionKey, modelValue),
      setSessionTitle: (sessionKey, title) => desktopBridge.setInternalSessionTitle(sessionKey, title),
      deleteSession: (sessionKey) => desktopBridge.deleteInternalSession(sessionKey),
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
