import { contextBridge, ipcRenderer } from 'electron';
import type {
  AppConfig,
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
} from '../src/app-types.js';
import type { DesktopBridgeEngineConfig, EngineDraftConfig, InternalProviderConfig } from '../src/lib/engine-config.js';
import type { EngineConnectOptions, EngineEventFrame } from '../src/lib/engine-runtime-types.js';
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
} from '../src/lib/internal-engine-bridge.js';
import type { InternalApprovalRecoveryFlow } from '../src/lib/internal-approval-recovery.js';

const enableDevelopmentBridge =
  Boolean(process.defaultApp)
  || process.env.CLOFFICE_ENABLE_TEST_BRIDGE === '1';

const desktopBridgeApi = {
  getConfig: () => ipcRenderer.invoke('config:get') as Promise<AppConfig>,
  getAuthSession: () =>
    ipcRenderer.invoke('auth:get-session') as Promise<{
      email: string;
      accessToken: string;
      refreshToken: string;
      rememberMe: boolean;
      expiresAt: number;
    } | null>,
  saveAuthSession: (session: {
    email: string;
    accessToken: string;
    refreshToken: string;
    rememberMe: boolean;
    expiresAt: number;
  }) =>
    ipcRenderer.invoke('auth:save-session', session) as Promise<{
      email: string;
      accessToken: string;
      refreshToken: string;
      rememberMe: boolean;
      expiresAt: number;
    }>,
  clearAuthSession: () =>
    ipcRenderer.invoke('auth:clear-session') as Promise<void>,
  getInternalEngineStatus: () =>
    ipcRenderer.invoke('internal-engine:status') as Promise<InternalEngineShellStatus>,
  getInternalEngineRuntimeInfo: () =>
    ipcRenderer.invoke('internal-engine:get-runtime-info') as Promise<InternalEngineRuntimeInfo>,
  getInternalRunHistory: (limit?: number) =>
    ipcRenderer.invoke('internal-engine:get-run-history', limit) as Promise<InternalEngineRunRecord[]>,
  getInternalRunDetails: (runId: string) =>
    ipcRenderer.invoke('internal-engine:get-run-details', runId) as Promise<InternalEngineRunRecord | null>,
  getInternalRuntimeRetentionPolicy: () =>
    ipcRenderer.invoke('internal-engine:get-runtime-retention-policy') as Promise<InternalEngineRuntimeRetentionPolicy>,
  connectInternalEngine: (options: EngineConnectOptions) =>
    ipcRenderer.invoke('internal-engine:connect', options) as Promise<void>,
  disconnectInternalEngine: () =>
    ipcRenderer.invoke('internal-engine:disconnect') as Promise<void>,
  getInternalEngineActiveSessionKey: () =>
    ipcRenderer.invoke('internal-engine:get-active-session-key') as Promise<string>,
  createInternalChatSession: () =>
    ipcRenderer.invoke('internal-engine:create-chat-session') as Promise<string>,
  createInternalCoworkSession: () =>
    ipcRenderer.invoke('internal-engine:create-cowork-session') as Promise<string>,
  resolveInternalSessionKey: (preferredKey?: string) =>
    ipcRenderer.invoke('internal-engine:resolve-session-key', preferredKey) as Promise<string>,
  listInternalSessions: (limit?: number) =>
    ipcRenderer.invoke('internal-engine:list-sessions', limit) as Promise<Array<{ key: string; kind: string; title?: string }>>,
  listInternalModels: () =>
    ipcRenderer.invoke('internal-engine:list-models') as Promise<Array<{ value: string; label: string }>>,
  getInternalSessionModel: (sessionKey: string) =>
    ipcRenderer.invoke('internal-engine:get-session-model', sessionKey) as Promise<string | null>,
  setInternalSessionModel: (sessionKey: string, modelValue: string | null) =>
    ipcRenderer.invoke('internal-engine:set-session-model', sessionKey, modelValue) as Promise<void>,
  setInternalSessionTitle: (sessionKey: string, title: string | null) =>
    ipcRenderer.invoke('internal-engine:set-session-title', sessionKey, title) as Promise<void>,
  deleteInternalSession: (sessionKey: string) =>
    ipcRenderer.invoke('internal-engine:delete-session', sessionKey) as Promise<void>,
  getInternalHistory: (sessionKey: string, limit?: number) =>
    ipcRenderer.invoke('internal-engine:get-history', sessionKey, limit) as Promise<Array<{ id: string; role: 'user' | 'assistant' | 'system'; text: string }>>,
  listInternalCronJobs: () =>
    ipcRenderer.invoke('internal-engine:list-cron-jobs') as Promise<Array<{ id: string; name: string; schedule: string; enabled: boolean; state: string; nextRunAt: string | null; lastRunAt: string | null }>>,
  getInternalScheduleHistoryRetentionLimit: () =>
    ipcRenderer.invoke('internal-engine:get-schedule-history-retention-limit') as Promise<number>,
  createInternalPromptSchedule: (payload: { kind?: 'chat' | 'cowork'; prompt: string; name?: string; intervalMinutes?: number; projectId?: string; projectTitle?: string; explorerId?: string; model?: string | null }) =>
      ipcRenderer.invoke('internal-engine:create-prompt-schedule', payload) as Promise<{ id: string; name: string; schedule: string; enabled: boolean; state: string; nextRunAt: string | null; lastRunAt: string | null }>,
  updateInternalPromptSchedule: (id: string, payload: { enabled?: boolean; intervalMinutes?: number; name?: string; prompt?: string; model?: string | null; clearHistory?: boolean }) =>
      ipcRenderer.invoke('internal-engine:update-prompt-schedule', id, payload) as Promise<{ id: string; name: string; schedule: string; enabled: boolean; state: string; nextRunAt: string | null; lastRunAt: string | null }>,
  deleteInternalPromptSchedule: (id: string) =>
      ipcRenderer.invoke('internal-engine:delete-prompt-schedule', id) as Promise<void>,
  runInternalPromptScheduleNow: (id: string) =>
      ipcRenderer.invoke('internal-engine:run-prompt-schedule-now', id) as Promise<{ id: string; name: string; schedule: string; enabled: boolean; state: string; nextRunAt: string | null; lastRunAt: string | null }>,
  setInternalScheduleHistoryRetentionLimit: (limit: number) =>
      ipcRenderer.invoke('internal-engine:set-schedule-history-retention-limit', limit) as Promise<number>,
  setInternalRuntimeRetentionPolicy: (payload: { runHistoryRetentionLimit?: number; artifactHistoryRetentionLimit?: number }) =>
      ipcRenderer.invoke('internal-engine:set-runtime-retention-policy', payload) as Promise<InternalEngineRuntimeRetentionPolicy>,
  sendInternalChat: (sessionKey: string, text: string) =>
    ipcRenderer.invoke('internal-engine:send-chat', sessionKey, text) as Promise<InternalEngineSendChatResult>,
  setInternalEngineEventHandler: (() => {
    let currentHandler: ((frame: EngineEventFrame) => void) | null = null;
    ipcRenderer.on('internal-engine:event', (_event, frame: EngineEventFrame) => {
      currentHandler?.(frame);
    });
    return (handler: ((frame: EngineEventFrame) => void) | null) => {
      currentHandler = handler;
    };
  })(),
  testInternalProviderConnection: (providerId: 'openai' | 'anthropic' | 'gemini', config?: Partial<InternalProviderConfig>) =>
    ipcRenderer.invoke('internal-engine:test-provider-connection', providerId, config) as Promise<import('../src/lib/internal-provider-adapter.js').InternalProviderConnectionTestResult>,
  continueInternalCoworkRun: (payload: InternalEngineCoworkContinuationRequest) =>
    ipcRenderer.invoke('internal-engine:continue-cowork-run', payload) as Promise<InternalEngineCoworkContinuationResult>,
  listInternalPendingApprovals: () =>
    ipcRenderer.invoke('internal-engine:list-pending-approvals') as Promise<InternalApprovalRecoveryFlow[]>,
  saveInternalPendingApproval: (flow: InternalApprovalRecoveryFlow) =>
    ipcRenderer.invoke('internal-engine:save-pending-approval', flow) as Promise<void>,
  clearInternalPendingApproval: (runId: string) =>
    ipcRenderer.invoke('internal-engine:clear-pending-approval', runId) as Promise<void>,
  applyInternalPendingApprovalDecision: (runId: string, decision: InternalEnginePendingApprovalDecision) =>
    ipcRenderer.invoke('internal-engine:apply-pending-approval-decision', runId, decision) as Promise<InternalEnginePendingApprovalDecisionResult>,
  getEngineConfig: async () =>
    ipcRenderer.invoke('engine-config:get') as Promise<DesktopBridgeEngineConfig>,
  saveEngineConfig: async (draft: EngineDraftConfig) =>
    ipcRenderer.invoke('engine-config:save', draft) as Promise<DesktopBridgeEngineConfig>,
  minimizeWindow: () => ipcRenderer.invoke('window:minimize') as Promise<void>,
  toggleMaximizeWindow: () => ipcRenderer.invoke('window:toggle-maximize') as Promise<boolean>,
  isWindowMaximized: () => ipcRenderer.invoke('window:is-maximized') as Promise<boolean>,
  closeWindow: () => ipcRenderer.invoke('window:close') as Promise<void>,
  showSystemMenu: (x: number, y: number) => ipcRenderer.invoke('window:show-system-menu', { x, y }) as Promise<void>,
  getDownloadsPath: () => ipcRenderer.invoke('local:downloads-path') as Promise<string>,
  selectFolder: (initialPath?: string) => ipcRenderer.invoke('local:select-folder', initialPath) as Promise<LocalExplorerSelection | null>,
  planOrganizeFolder: (explorerId: string) =>
    ipcRenderer.invoke('local:plan-organize-folder', explorerId) as Promise<LocalFilePlanResult>,
  applyOrganizeFolderPlan: (explorerId: string, actions: LocalFilePlanAction[]) =>
    ipcRenderer.invoke('local:apply-organize-folder-plan', {
      explorerId,
      actions,
    }) as Promise<LocalFileApplyResult>,
  createFileInFolder: (explorerId: string, relativePath: string, content: string, overwrite?: boolean) =>
    ipcRenderer.invoke('local:create-file-in-folder', {
      explorerId,
      relativePath,
      content,
      overwrite,
    }) as Promise<LocalFileCreateResult>,
  appendFileInFolder: (explorerId: string, relativePath: string, content: string) =>
    ipcRenderer.invoke('local:append-file-in-folder', {
      explorerId,
      relativePath,
      content,
    }) as Promise<LocalFileAppendResult>,
  readFileInFolder: (explorerId: string, relativePath: string) =>
    ipcRenderer.invoke('local:read-file-in-folder', {
      explorerId,
      relativePath,
    }) as Promise<LocalFileReadResult>,
  listDirInFolder: (explorerId: string, relativePath?: string) =>
    ipcRenderer.invoke('local:list-dir-in-folder', {
      explorerId,
      relativePath,
    }) as Promise<LocalFileListResult>,
  existsInFolder: (explorerId: string, relativePath: string) =>
    ipcRenderer.invoke('local:exists-in-folder', {
      explorerId,
      relativePath,
    }) as Promise<LocalFileExistsResult>,
  renameInFolder: (explorerId: string, oldRelative: string, newRelative: string) =>
    ipcRenderer.invoke('local:rename-in-folder', {
      explorerId,
      oldRelative,
      newRelative,
    }) as Promise<LocalFileRenameResult>,
  deleteInFolder: (explorerId: string, relativePath: string) =>
    ipcRenderer.invoke('local:delete-in-folder', {
      explorerId,
      relativePath,
    }) as Promise<LocalFileDeleteResult>,
  statInFolder: (explorerId: string, relativePath: string) =>
    ipcRenderer.invoke('local:stat-in-folder', {
      explorerId,
      relativePath,
    }) as Promise<LocalFileStatResult>,
  openPath: (targetPath: string) =>
    ipcRenderer.invoke('local:open-path', {
      targetPath,
    }) as Promise<{ ok: boolean; error?: string }>,
  notify: (title: string, body?: string) =>
    ipcRenderer.invoke('notify', { title, body }) as Promise<{ ok: boolean; message?: string }>,
};

if (enableDevelopmentBridge) {
  Object.assign(desktopBridgeApi, {
    shellExec: (rootPath: string, command: string, timeoutMs?: number) =>
      ipcRenderer.invoke('connector:shell-exec', {
        rootPath,
        command,
        timeoutMs,
      }) as Promise<{
        stdout: string;
        stderr: string;
        exitCode: number | null;
        timedOut: boolean;
      }>,
    webFetch: (
      url: string,
      options?: { method?: string; headers?: Record<string, string>; body?: string },
    ) =>
      ipcRenderer.invoke('connector:web-fetch', {
        url,
        options,
      }) as Promise<{
        status: number;
        statusText: string;
        headers: Record<string, string>;
        body: string;
        truncated: boolean;
      }>,
    authorizeFolderForE2E: (rootPath: string) =>
      ipcRenderer.invoke('local:authorize-folder-e2e', rootPath) as Promise<LocalExplorerSelection>,
    saveConfig: (config: AppConfig) =>
      ipcRenderer.invoke('config:save', config) as Promise<AppConfig>,
    seedInternalProviderCoworkTrendForE2E: () =>
      ipcRenderer.invoke('internal-engine:seed-provider-cowork-trend-e2e') as Promise<InternalEngineRuntimeInfo>,
    seedInternalScheduleArtifactForE2E: (id: string) =>
      ipcRenderer.invoke('internal-engine:seed-schedule-artifact-e2e', id),
    debugNormalizeInternalCoworkResponse: (payload: {
      phase: 'planning';
      task: string;
      rawText: string;
      requestedActions?: import('../src/app-types.js').EngineRequestedAction[];
    } | {
      phase: 'continuation';
      rawText: string;
      requestedActions?: import('../src/app-types.js').EngineRequestedAction[];
      execution?: {
        receipts?: import('../src/app-types.js').LocalActionReceipt[];
        previews?: string[];
        errors?: string[];
      };
    }) =>
      ipcRenderer.invoke('internal-engine:debug-normalize-cowork-response', payload) as Promise<InternalEngineCoworkNormalizationProbeResult>,
    debugBuildInternalCoworkPrompt: (payload: {
      phase: 'planning';
      model: string;
      taskAndContext: string;
    } | {
      phase: 'continuation';
      model: string;
      sessionKey?: string;
      approvedActions?: import('../src/app-types.js').EngineRequestedAction[];
      rejectedActions?: import('../src/lib/internal-engine-bridge.js').InternalEngineCoworkContinuationRequest['rejectedActions'];
      execution?: {
        receipts?: import('../src/app-types.js').LocalActionReceipt[];
        previews?: string[];
        errors?: string[];
      };
    }) =>
      ipcRenderer.invoke('internal-engine:debug-build-cowork-prompt', payload) as Promise<InternalEngineCoworkPromptProbeResult>,
  });
}

contextBridge.exposeInMainWorld('cloffice', desktopBridgeApi);
