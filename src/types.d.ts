import type {
  AppConfig,
  EngineRequestedAction,
  LocalActionReceipt,
  LocalFileApplyResult,
  LocalFileAppendResult,
  LocalFileCreateResult,
  LocalFileDeleteResult,
  LocalExplorerSelection,
  LocalFileExistsResult,
  LocalFileListResult,
  LocalFileReadResult,
  LocalFileRenameResult,
  LocalFileStatResult,
  LocalFilePlanAction,
  LocalFilePlanResult,
} from './app-types';
import type { DesktopBridgeEngineConfig, EngineDraftConfig } from './lib/engine-config';
import type { EngineChatMessage, EngineConnectOptions, EngineCronJob, EngineEventFrame, EngineModelChoice, EngineSessionSummary } from './lib/engine-runtime-types';
import type { InternalProviderConfig } from './lib/engine-config';
import type {
  InternalEngineCoworkContinuationRequest,
  InternalEngineCoworkContinuationResult,
  InternalEngineCoworkNormalizationProbeResult,
  InternalEngineCoworkPromptProbeResult,
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

export type DesktopBridgeApi = {
  getConfig: () => Promise<AppConfig>;
  saveConfig?: (config: AppConfig) => Promise<AppConfig>;
  getAuthSession: () => Promise<{
    email: string;
    accessToken: string;
    refreshToken: string;
    rememberMe: boolean;
    expiresAt: number;
  } | null>;
  saveAuthSession: (session: {
    email: string;
    accessToken: string;
    refreshToken: string;
    rememberMe: boolean;
    expiresAt: number;
  }) => Promise<{
    email: string;
    accessToken: string;
    refreshToken: string;
    rememberMe: boolean;
    expiresAt: number;
  }>;
  clearAuthSession: () => Promise<void>;
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
    explorerId?: string;
    model?: string | null;
    }) => Promise<EngineCronJob>;
    setInternalRuntimeRetentionPolicy: (payload: {
      runHistoryRetentionLimit?: number;
      artifactHistoryRetentionLimit?: number;
    }) => Promise<InternalEngineRuntimeRetentionPolicy>;
    seedInternalProviderCoworkTrendForE2E?: () => Promise<InternalEngineRuntimeInfo>;
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
  debugNormalizeInternalCoworkResponse?: (
    payload:
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
  ) => Promise<InternalEngineCoworkNormalizationProbeResult>;
  debugBuildInternalCoworkPrompt?: (
    payload:
      | {
          phase: 'planning';
          model: string;
          taskAndContext: string;
        }
      | {
          phase: 'continuation';
          model: string;
          sessionKey?: string;
          approvedActions?: EngineRequestedAction[];
          rejectedActions?: InternalEngineCoworkContinuationRequest['rejectedActions'];
          execution?: {
            receipts?: LocalActionReceipt[];
            previews?: string[];
            errors?: string[];
          };
        }
  ) => Promise<InternalEngineCoworkPromptProbeResult>;
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
  minimizeWindow: () => Promise<void>;
  toggleMaximizeWindow: () => Promise<boolean>;
  isWindowMaximized: () => Promise<boolean>;
  closeWindow: () => Promise<void>;
  showSystemMenu: (x: number, y: number) => Promise<void>;
  getDownloadsPath: () => Promise<string>;
  authorizeFolderForE2E?: (rootPath: string) => Promise<LocalExplorerSelection>;
  selectFolder: (initialPath?: string) => Promise<LocalExplorerSelection | null>;
  planOrganizeFolder: (explorerId: string) => Promise<LocalFilePlanResult>;
  applyOrganizeFolderPlan: (explorerId: string, actions: LocalFilePlanAction[]) => Promise<LocalFileApplyResult>;
  createFileInFolder: (explorerId: string, relativePath: string, content: string, overwrite?: boolean) => Promise<LocalFileCreateResult>;
  appendFileInFolder: (explorerId: string, relativePath: string, content: string) => Promise<LocalFileAppendResult>;
  readFileInFolder: (explorerId: string, relativePath: string) => Promise<LocalFileReadResult>;
  listDirInFolder: (explorerId: string, relativePath?: string) => Promise<LocalFileListResult>;
  existsInFolder: (explorerId: string, relativePath: string) => Promise<LocalFileExistsResult>;
  renameInFolder: (explorerId: string, oldRelative: string, newRelative: string) => Promise<LocalFileRenameResult>;
  deleteInFolder: (explorerId: string, relativePath: string) => Promise<LocalFileDeleteResult>;
  statInFolder: (explorerId: string, relativePath: string) => Promise<LocalFileStatResult>;
  openPath: (targetPath: string) => Promise<{ ok: boolean; error?: string }>;
  shellExec?: (rootPath: string, command: string, timeoutMs?: number) => Promise<{
    stdout: string;
    stderr: string;
    exitCode: number | null;
    timedOut: boolean;
  }>;
  webFetch?: (
    url: string,
    options?: { method?: string; headers?: Record<string, string>; body?: string },
  ) => Promise<{
    status: number;
    statusText: string;
    headers: Record<string, string>;
    body: string;
    truncated: boolean;
  }>;
  notify: (title: string, body?: string) => Promise<{ ok: boolean; message?: string }>;
};

declare global {
  interface Window {
    cloffice?: DesktopBridgeApi;
  }
}

export {};
