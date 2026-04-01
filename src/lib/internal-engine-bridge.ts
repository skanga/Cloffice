import type {
  EngineChatMessage,
  EngineConnectOptions,
  EngineCronJob,
  EngineEventFrame,
  EngineModelChoice,
  EngineRuntimeDescriptor,
  EngineSessionSummary,
  EngineToolsCatalog,
  EngineWorkspaceListResult,
  EngineWorkspaceReadResult,
  EngineWorkspaceStatResult,
} from './engine-runtime-types.js';
import type { ChatActivityItem, EngineRequestedAction, LocalActionReceipt } from '../app-types.js';
import type { InternalApprovalRecoveryFlow } from './internal-approval-recovery.js';
import type { InternalChatProviderId, InternalProviderConnectionTestResult, InternalProviderStatus } from './internal-provider-adapter.js';

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
  artifactCount: number;
  scheduleCount: number;
  pendingApprovalCount: number;
  interruptedRunCount: number;
  activeSessionKey: string | null;
  defaultModel: string;
  stateRestoreStatus: 'fresh' | 'restored' | 'recovered_after_interruption' | 'load_failed';
  lastRecoveryNote: string | null;
  latestArtifactSummary: string | null;
  latestRunTimelinePhase: string | null;
  latestRunTimelineMessage: string | null;
  chatProviders: InternalProviderStatus[];
  providerBackedModelCount: number;
  providerCoworkRunCount: number;
  providerCoworkStructuredCount: number;
  providerCoworkNormalizedCount: number;
  providerCoworkFallbackCount: number;
  providerCoworkNormalizationByProvider: Array<{
    providerId: InternalChatProviderId;
    runCount: number;
    structuredCount: number;
    normalizedCount: number;
    fallbackCount: number;
  }>;
  providerCoworkNormalizationTrend: Array<{
    date: string;
    runCount: number;
    structuredCount: number;
    normalizedCount: number;
    fallbackCount: number;
  }>;
  lastProviderId: InternalChatProviderId | null;
  lastProviderError: string | null;
  lastScheduledJobName: string | null;
  lastScheduleError: string | null;
};

export type InternalEngineRuntimeRetentionPolicy = {
  schemaVersion: number;
  runHistoryRetentionLimit: number;
  artifactHistoryRetentionLimit: number;
};

export type InternalEngineRunTimelineEntry = {
  id: string;
  at: number;
  phase: 'submitted' | 'awaiting_approval' | 'approval_decision' | 'executing' | 'completed' | 'blocked' | 'interrupted';
  message: string;
  details?: string;
  action?: {
    actionId: string;
    actionType: EngineRequestedAction['type'];
    path: string;
  };
  decision?: {
    approved: boolean;
    reason?: string;
  };
  receipt?: {
    status: LocalActionReceipt['status'];
    message?: string;
    errorCode?: string;
  };
};

export type InternalEngineArtifactRecord = {
  id: string;
  runId: string;
  sessionKey: string;
  kind: 'cowork_execution';
  createdAt: number;
  receiptCount: number;
  receipts: LocalActionReceipt[];
  previews: string[];
  errors: string[];
  summary?: string;
};

export type InternalEngineRunRecord = {
  runId: string;
  scheduleId?: string;
  scheduleName?: string;
  sessionKey: string;
  sessionKind: string;
  model: string;
  providerBacked?: boolean;
  providerPhase?: 'chat' | 'planning' | 'continuation';
  responseSchemaVersion?: number;
  responseNormalization?: 'provider_structured' | 'normalized_sections' | 'synthetic_fallback';
  actionMode: 'none' | 'read-only';
  status: 'running' | 'awaiting_approval' | 'executing' | 'completed' | 'blocked' | 'interrupted';
  startedAt: number;
  updatedAt: number;
  promptPreview?: string;
  summary?: string;
  interruptedReason?: string;
  artifactId?: string;
  approvedActionCount?: number;
  rejectedActionCount?: number;
  resultSummary?: string;
  artifact?: InternalEngineArtifactRecord;
  timeline?: InternalEngineRunTimelineEntry[];
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

export type InternalEngineCoworkNormalizationProbeResult = {
  phase: 'planning' | 'continuation';
  normalization: 'provider_structured' | 'normalized_sections' | 'synthetic_fallback';
  text: string;
};

export type InternalEngineCoworkPromptProbeResult = {
  phase: 'planning' | 'continuation';
  providerId: InternalChatProviderId;
  text: string;
};

export type InternalEnginePendingApprovalDecision = {
  approved: boolean;
  reason?: string;
};

export type InternalEnginePendingApprovalDecisionResult =
  | { kind: 'missing' }
  | { kind: 'next'; flow: InternalApprovalRecoveryFlow }
  | { kind: 'complete'; payload: InternalEngineCoworkContinuationRequest };

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
  events: {
    setEventHandler(handler: ((frame: EngineEventFrame) => void) | null): void;
  };
  scheduling: InternalEngineSchedulingBridge;
  tools: InternalEngineToolsBridge;
  workspace: InternalEngineWorkspaceBridge;
};

export type InternalEngineDesktopBridge = {
  getInternalEngineStatus(): Promise<InternalEngineShellStatus>;
  getInternalEngineRuntimeInfo(): Promise<InternalEngineRuntimeInfo>;
  getInternalRunHistory(limit?: number): Promise<InternalEngineRunRecord[]>;
  getInternalRunDetails(runId: string): Promise<InternalEngineRunRecord | null>;
  getInternalRuntimeRetentionPolicy(): Promise<InternalEngineRuntimeRetentionPolicy>;
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
  listInternalCronJobs(): Promise<EngineCronJob[]>;
  getInternalScheduleHistoryRetentionLimit(): Promise<number>;
  createInternalPromptSchedule(payload: {
    kind?: 'chat' | 'cowork';
    prompt: string;
    name?: string;
    intervalMinutes?: number;
    projectId?: string;
    projectTitle?: string;
    rootPath?: string;
    model?: string | null;
  }): Promise<EngineCronJob>;
  setInternalScheduleHistoryRetentionLimit(limit: number): Promise<number>;
  setInternalRuntimeRetentionPolicy(payload: {
    runHistoryRetentionLimit?: number;
    artifactHistoryRetentionLimit?: number;
  }): Promise<InternalEngineRuntimeRetentionPolicy>;
  updateInternalPromptSchedule(id: string, payload: {
    enabled?: boolean;
    intervalMinutes?: number;
    name?: string;
    prompt?: string;
    model?: string | null;
    clearHistory?: boolean;
  }): Promise<EngineCronJob>;
  deleteInternalPromptSchedule(id: string): Promise<void>;
  sendInternalChat(sessionKey: string, text: string): Promise<InternalEngineSendChatResult>;
  setInternalEngineEventHandler(handler: ((frame: EngineEventFrame) => void) | null): void;
  testInternalProviderConnection(
    providerId: InternalChatProviderId,
    config?: Partial<{
      openaiApiKey: string;
      openaiBaseUrl: string;
      openaiModels: string;
      anthropicApiKey: string;
      anthropicModels: string;
      geminiApiKey: string;
      geminiModels: string;
    }>,
  ): Promise<InternalProviderConnectionTestResult>;
  debugNormalizeInternalCoworkResponse(payload:
    | {
        phase: 'planning';
        task: string;
        rawText: string;
        requestedActions?: EngineRequestedAction[];
      }
    | {
        phase: 'continuation';
        rawText: string;
        requestedActions?: EngineRequestedAction[];
        execution?: {
          receipts?: LocalActionReceipt[];
          previews?: string[];
          errors?: string[];
        };
      }
  ): Promise<InternalEngineCoworkNormalizationProbeResult>;
  debugBuildInternalCoworkPrompt(payload:
    | {
        phase: 'planning';
        model: string;
        taskAndContext: string;
      }
    | {
        phase: 'continuation';
        model: string;
        sessionKey: string;
        approvedActions?: EngineRequestedAction[];
        rejectedActions?: InternalEngineCoworkContinuationRequest['rejectedActions'];
        execution?: {
          receipts?: LocalActionReceipt[];
          previews?: string[];
          errors?: string[];
        };
      }
  ): Promise<InternalEngineCoworkPromptProbeResult>;
  continueInternalCoworkRun(payload: InternalEngineCoworkContinuationRequest): Promise<InternalEngineCoworkContinuationResult>;
  listInternalPendingApprovals(): Promise<InternalApprovalRecoveryFlow[]>;
  saveInternalPendingApproval(flow: InternalApprovalRecoveryFlow): Promise<void>;
  clearInternalPendingApproval(runId: string): Promise<void>;
  applyInternalPendingApprovalDecision(
    runId: string,
    decision: InternalEnginePendingApprovalDecision,
  ): Promise<InternalEnginePendingApprovalDecisionResult>;
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
    events: {
      setEventHandler: (_handler) => undefined,
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
    events: {
      setEventHandler: (handler) => desktopBridge.setInternalEngineEventHandler(handler),
    },
    scheduling: {
      listCronJobs: () => desktopBridge.listInternalCronJobs(),
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
