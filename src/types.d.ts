import type {
  AppConfig,
  HealthCheckResult,
  LocalFileApplyResult,
  LocalFileAppendResult,
  LocalFileCreateResult,
  LocalFileDeleteResult,
  LocalFileExistsResult,
  LocalFileListResult,
  LocalFileReadResult,
  LocalFileRenameResult,
  LocalFileStatResult,
  LocalFilePlanAction,
  LocalFilePlanResult,
} from './app-types';
import type { DesktopBridgeEngineConfig, EngineDraftConfig } from './lib/engine-config';
import type { EngineChatMessage, EngineConnectOptions, EngineCronJob, EngineEventFrame, EngineModelChoice, EngineRuntimeHealthResult, EngineSessionSummary } from './lib/engine-runtime-types';
import type { InternalProviderConfig } from './lib/engine-config';
import type {
  InternalEngineCoworkContinuationRequest,
  InternalEngineCoworkContinuationResult,
  InternalEnginePendingApprovalDecision,
  InternalEnginePendingApprovalDecisionResult,
  InternalEngineRunRecord,
  InternalEngineRuntimeRetentionPolicy,
  InternalEngineRuntimeInfo,
  InternalEngineSendChatResult,
  InternalEngineShellStatus,
} from './lib/internal-engine-bridge';
import type { InternalProviderConnectionTestResult } from './lib/internal-provider-adapter';
import type { InternalApprovalRecoveryFlow } from './lib/internal-approval-recovery';

type DesktopBridgeApi = {
  getConfig: () => Promise<AppConfig>;
  saveConfig: (config: AppConfig) => Promise<AppConfig>;
    getInternalEngineStatus: () => Promise<InternalEngineShellStatus>;
    getInternalEngineRuntimeInfo: () => Promise<InternalEngineRuntimeInfo>;
    getInternalRunHistory: (limit?: number) => Promise<InternalEngineRunRecord[]>;
    getInternalRunDetails: (runId: string) => Promise<InternalEngineRunRecord | null>;
    getInternalRuntimeRetentionPolicy: () => Promise<InternalEngineRuntimeRetentionPolicy>;
    connectInternalEngine: (options: EngineConnectOptions) => Promise<void>;
  disconnectInternalEngine: () => Promise<void>;
  getInternalEngineActiveSessionKey: () => Promise<string>;
  createInternalChatSession: () => Promise<string>;
  createInternalCoworkSession: () => Promise<string>;
  resolveInternalSessionKey: (preferredKey?: string) => Promise<string>;
  listInternalSessions: (limit?: number) => Promise<EngineSessionSummary[]>;
  listInternalModels: () => Promise<EngineModelChoice[]>;
  getInternalSessionModel: (sessionKey: string) => Promise<string | null>;
  setInternalSessionModel: (sessionKey: string, modelValue: string | null) => Promise<void>;
  setInternalSessionTitle: (sessionKey: string, title: string | null) => Promise<void>;
  deleteInternalSession: (sessionKey: string) => Promise<void>;
  getInternalHistory: (sessionKey: string, limit?: number) => Promise<EngineChatMessage[]>;
  listInternalCronJobs: () => Promise<EngineCronJob[]>;
  getInternalScheduleHistoryRetentionLimit: () => Promise<number>;
  createInternalPromptSchedule: (payload: {
    kind?: 'chat' | 'cowork';
    prompt: string;
    name?: string;
    intervalMinutes?: number;
    projectId?: string;
    projectTitle?: string;
    rootPath?: string;
    model?: string | null;
    }) => Promise<EngineCronJob>;
    setInternalRuntimeRetentionPolicy: (payload: {
      runHistoryRetentionLimit?: number;
      artifactHistoryRetentionLimit?: number;
    }) => Promise<InternalEngineRuntimeRetentionPolicy>;
    updateInternalPromptSchedule: (id: string, payload: {
      enabled?: boolean;
      intervalMinutes?: number;
      name?: string;
      prompt?: string;
      model?: string | null;
      clearHistory?: boolean;
    }) => Promise<EngineCronJob>;
    setInternalScheduleHistoryRetentionLimit: (limit: number) => Promise<number>;
    deleteInternalPromptSchedule: (id: string) => Promise<void>;
    runInternalPromptScheduleNow: (id: string) => Promise<EngineCronJob>;
    seedInternalScheduleArtifactForE2E?: (id: string) => Promise<unknown>;
  sendInternalChat: (sessionKey: string, text: string) => Promise<InternalEngineSendChatResult>;
  setInternalEngineEventHandler: (handler: ((frame: EngineEventFrame) => void) | null) => void;
  testInternalProviderConnection: (
    providerId: 'openai' | 'anthropic' | 'gemini',
    config?: Partial<InternalProviderConfig>,
  ) => Promise<InternalProviderConnectionTestResult>;
  continueInternalCoworkRun: (payload: InternalEngineCoworkContinuationRequest) => Promise<InternalEngineCoworkContinuationResult>;
  listInternalPendingApprovals: () => Promise<InternalApprovalRecoveryFlow[]>;
  saveInternalPendingApproval: (flow: InternalApprovalRecoveryFlow) => Promise<void>;
  clearInternalPendingApproval: (runId: string) => Promise<void>;
  applyInternalPendingApprovalDecision: (
    runId: string,
    decision: InternalEnginePendingApprovalDecision,
  ) => Promise<InternalEnginePendingApprovalDecisionResult>;
  getEngineConfig: () => Promise<DesktopBridgeEngineConfig>;
  saveEngineConfig: (draft: EngineDraftConfig) => Promise<DesktopBridgeEngineConfig>;
  healthCheck: (baseUrl: string) => Promise<HealthCheckResult>;
  checkRuntimeHealth: (baseUrl: string) => Promise<EngineRuntimeHealthResult>;
  minimizeWindow: () => Promise<void>;
  toggleMaximizeWindow: () => Promise<boolean>;
  isWindowMaximized: () => Promise<boolean>;
  closeWindow: () => Promise<void>;
  showSystemMenu: (x: number, y: number) => Promise<void>;
  getDownloadsPath: () => Promise<string>;
  selectFolder: (initialPath?: string) => Promise<string | null>;
  planOrganizeFolder: (rootPath: string) => Promise<LocalFilePlanResult>;
  applyOrganizeFolderPlan: (rootPath: string, actions: LocalFilePlanAction[]) => Promise<LocalFileApplyResult>;
  createFileInFolder: (rootPath: string, relativePath: string, content: string, overwrite?: boolean) => Promise<LocalFileCreateResult>;
  appendFileInFolder: (rootPath: string, relativePath: string, content: string) => Promise<LocalFileAppendResult>;
  readFileInFolder: (rootPath: string, relativePath: string) => Promise<LocalFileReadResult>;
  listDirInFolder: (rootPath: string, relativePath?: string) => Promise<LocalFileListResult>;
  existsInFolder: (rootPath: string, relativePath: string) => Promise<LocalFileExistsResult>;
  renameInFolder: (rootPath: string, oldRelative: string, newRelative: string) => Promise<LocalFileRenameResult>;
  deleteInFolder: (rootPath: string, relativePath: string) => Promise<LocalFileDeleteResult>;
  statInFolder: (rootPath: string, relativePath: string) => Promise<LocalFileStatResult>;
  openPath: (targetPath: string) => Promise<{ ok: boolean; error?: string }>;
  shellExec: (rootPath: string, command: string, timeoutMs?: number) => Promise<{ stdout: string; stderr: string; exitCode: number | null; timedOut: boolean }>;
  webFetch: (url: string, options?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<{ status: number; statusText: string; headers: Record<string, string>; body: string; truncated: boolean }>;
  notify: (title: string, body?: string) => Promise<{ ok: boolean; message?: string }>;
};

type ClofficeDesktopApi = DesktopBridgeApi;
type RelayApi = ClofficeDesktopApi;

declare global {
  interface Window {
    cloffice?: ClofficeDesktopApi;
    relay?: RelayApi;
  }
}

export {};
