import { contextBridge, ipcRenderer } from 'electron';
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
} from '../src/app-types.js';
import type { DesktopBridgeEngineConfig, EngineDraftConfig, InternalProviderConfig } from '../src/lib/engine-config.js';
import type { EngineConnectOptions, EngineEventFrame, EngineRuntimeHealthResult } from '../src/lib/engine-runtime-types.js';
import type {
  InternalEngineCoworkContinuationRequest,
  InternalEngineCoworkContinuationResult,
  InternalEnginePendingApprovalDecision,
  InternalEnginePendingApprovalDecisionResult,
  InternalEngineRunRecord,
  InternalEngineRuntimeInfo,
  InternalEngineSendChatResult,
  InternalEngineShellStatus,
} from '../src/lib/internal-engine-bridge.js';
import type { InternalApprovalRecoveryFlow } from '../src/lib/internal-approval-recovery.js';

const DEFAULT_INTERNAL_ENGINE_ENDPOINT = 'internal://dev-runtime';
const INTERNAL_ENGINE_RUNTIME_DESCRIPTOR = {
  providerId: 'internal',
  runtimeKind: 'internal',
  transport: 'internal-ipc',
} as const;

function parseDesktopBridgeEngineConfig(entry: unknown, fallbackEndpoint: string): DesktopBridgeEngineConfig {
  if (!entry || typeof entry !== 'object') {
    return {
      appConfig: {
        gatewayUrl: DEFAULT_INTERNAL_ENGINE_ENDPOINT,
        gatewayToken: '',
      },
      engineDraft: {
        providerId: INTERNAL_ENGINE_RUNTIME_DESCRIPTOR.providerId,
        runtimeKind: INTERNAL_ENGINE_RUNTIME_DESCRIPTOR.runtimeKind,
        transport: INTERNAL_ENGINE_RUNTIME_DESCRIPTOR.transport,
        endpointUrl: DEFAULT_INTERNAL_ENGINE_ENDPOINT,
        accessToken: '',
        internalProviderConfig: {
          openaiApiKey: '',
          openaiBaseUrl: '',
          openaiModels: '',
          anthropicApiKey: '',
          anthropicModels: '',
          geminiApiKey: '',
          geminiModels: '',
        },
      },
      storageVersion: 2,
    };
  }

  const record = entry as Record<string, unknown>;
  if (record.version === 2) {
    const internalProviderConfig =
      record.internalProviderConfig && typeof record.internalProviderConfig === 'object'
        ? record.internalProviderConfig as Record<string, unknown>
        : {};
    return {
      appConfig: {
        gatewayUrl: typeof record.endpointUrl === 'string' && record.endpointUrl.trim() ? record.endpointUrl.trim() : fallbackEndpoint,
        gatewayToken: typeof record.accessToken === 'string' ? record.accessToken : '',
      },
      engineDraft: {
        providerId: 'internal',
        runtimeKind: 'internal',
        transport: 'internal-ipc',
        endpointUrl: typeof record.endpointUrl === 'string' && record.endpointUrl.trim() ? record.endpointUrl.trim() : fallbackEndpoint,
        accessToken: typeof record.accessToken === 'string' ? record.accessToken : '',
        internalProviderConfig: {
          openaiApiKey: typeof internalProviderConfig.openaiApiKey === 'string' ? internalProviderConfig.openaiApiKey : '',
          openaiBaseUrl: typeof internalProviderConfig.openaiBaseUrl === 'string' ? internalProviderConfig.openaiBaseUrl : '',
          openaiModels: typeof internalProviderConfig.openaiModels === 'string' ? internalProviderConfig.openaiModels : '',
          anthropicApiKey: typeof internalProviderConfig.anthropicApiKey === 'string' ? internalProviderConfig.anthropicApiKey : '',
          anthropicModels: typeof internalProviderConfig.anthropicModels === 'string' ? internalProviderConfig.anthropicModels : '',
          geminiApiKey: typeof internalProviderConfig.geminiApiKey === 'string' ? internalProviderConfig.geminiApiKey : '',
          geminiModels: typeof internalProviderConfig.geminiModels === 'string' ? internalProviderConfig.geminiModels : '',
        },
      },
      storageVersion: 2,
    };
  }

  return {
    appConfig: {
      gatewayUrl: typeof record.gatewayUrl === 'string' && record.gatewayUrl.trim() ? record.gatewayUrl.trim() : fallbackEndpoint,
      gatewayToken: typeof record.gatewayToken === 'string' ? record.gatewayToken : '',
    },
    engineDraft: {
      providerId: INTERNAL_ENGINE_RUNTIME_DESCRIPTOR.providerId,
      runtimeKind: INTERNAL_ENGINE_RUNTIME_DESCRIPTOR.runtimeKind,
      transport: INTERNAL_ENGINE_RUNTIME_DESCRIPTOR.transport,
      endpointUrl: typeof record.gatewayUrl === 'string' && record.gatewayUrl.trim() ? record.gatewayUrl.trim() : fallbackEndpoint,
      accessToken: typeof record.gatewayToken === 'string' ? record.gatewayToken : '',
      internalProviderConfig: {
        openaiApiKey: '',
        openaiBaseUrl: '',
        openaiModels: '',
        anthropicApiKey: '',
        anthropicModels: '',
        geminiApiKey: '',
        geminiModels: '',
      },
    },
    storageVersion: 1,
  };
}

function prepareDesktopBridgeEngineConfigWrite(draft: EngineDraftConfig): { activeEntry: unknown } {
  if (draft.providerId === 'internal') {
    return {
      activeEntry: {
        version: 2,
        providerId: draft.providerId,
        runtimeKind: INTERNAL_ENGINE_RUNTIME_DESCRIPTOR.runtimeKind,
        transport: INTERNAL_ENGINE_RUNTIME_DESCRIPTOR.transport,
        endpointUrl: draft.endpointUrl?.trim() || DEFAULT_INTERNAL_ENGINE_ENDPOINT,
        accessToken: draft.accessToken ?? '',
        internalProviderConfig: {
          openaiApiKey: draft.internalProviderConfig.openaiApiKey ?? '',
          openaiBaseUrl: draft.internalProviderConfig.openaiBaseUrl ?? '',
          openaiModels: draft.internalProviderConfig.openaiModels ?? '',
          anthropicApiKey: draft.internalProviderConfig.anthropicApiKey ?? '',
          anthropicModels: draft.internalProviderConfig.anthropicModels ?? '',
          geminiApiKey: draft.internalProviderConfig.geminiApiKey ?? '',
          geminiModels: draft.internalProviderConfig.geminiModels ?? '',
        },
      },
    };
  }

  return {
    activeEntry: {
      version: 2,
      providerId: INTERNAL_ENGINE_RUNTIME_DESCRIPTOR.providerId,
      runtimeKind: INTERNAL_ENGINE_RUNTIME_DESCRIPTOR.runtimeKind,
      transport: INTERNAL_ENGINE_RUNTIME_DESCRIPTOR.transport,
      endpointUrl: draft.endpointUrl?.trim() || DEFAULT_INTERNAL_ENGINE_ENDPOINT,
      accessToken: draft.accessToken ?? '',
      internalProviderConfig: {
        openaiApiKey: draft.internalProviderConfig.openaiApiKey ?? '',
        openaiBaseUrl: draft.internalProviderConfig.openaiBaseUrl ?? '',
        openaiModels: draft.internalProviderConfig.openaiModels ?? '',
        anthropicApiKey: draft.internalProviderConfig.anthropicApiKey ?? '',
        anthropicModels: draft.internalProviderConfig.anthropicModels ?? '',
        geminiApiKey: draft.internalProviderConfig.geminiApiKey ?? '',
        geminiModels: draft.internalProviderConfig.geminiModels ?? '',
      },
    },
  };
}

function normalizeEngineRuntimeHealthResult(
  result: HealthCheckResult,
  runtime: typeof INTERNAL_ENGINE_RUNTIME_DESCRIPTOR,
): EngineRuntimeHealthResult {
  return {
    ...result,
    providerId: runtime.providerId,
    runtimeKind: runtime.runtimeKind,
    transport: runtime.transport,
  };
}

const desktopBridgeApi = {
  getConfig: () => ipcRenderer.invoke('config:get') as Promise<AppConfig>,
  saveConfig: (config: AppConfig) => ipcRenderer.invoke('config:save', config) as Promise<AppConfig>,
  getInternalEngineStatus: () =>
    ipcRenderer.invoke('internal-engine:status') as Promise<InternalEngineShellStatus>,
  getInternalEngineRuntimeInfo: () =>
    ipcRenderer.invoke('internal-engine:get-runtime-info') as Promise<InternalEngineRuntimeInfo>,
  getInternalRunHistory: (limit?: number) =>
    ipcRenderer.invoke('internal-engine:get-run-history', limit) as Promise<InternalEngineRunRecord[]>,
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
  createInternalPromptSchedule: (payload: { kind?: 'chat' | 'cowork'; prompt: string; name?: string; intervalMinutes?: number; projectId?: string; projectTitle?: string; rootPath?: string; model?: string | null }) =>
      ipcRenderer.invoke('internal-engine:create-prompt-schedule', payload) as Promise<{ id: string; name: string; schedule: string; enabled: boolean; state: string; nextRunAt: string | null; lastRunAt: string | null }>,
  updateInternalPromptSchedule: (id: string, payload: { enabled?: boolean; intervalMinutes?: number; name?: string; prompt?: string; model?: string | null }) =>
      ipcRenderer.invoke('internal-engine:update-prompt-schedule', id, payload) as Promise<{ id: string; name: string; schedule: string; enabled: boolean; state: string; nextRunAt: string | null; lastRunAt: string | null }>,
  deleteInternalPromptSchedule: (id: string) =>
      ipcRenderer.invoke('internal-engine:delete-prompt-schedule', id) as Promise<void>,
  runInternalPromptScheduleNow: (id: string) =>
      ipcRenderer.invoke('internal-engine:run-prompt-schedule-now', id) as Promise<{ id: string; name: string; schedule: string; enabled: boolean; state: string; nextRunAt: string | null; lastRunAt: string | null }>,
  setInternalScheduleHistoryRetentionLimit: (limit: number) =>
      ipcRenderer.invoke('internal-engine:set-schedule-history-retention-limit', limit) as Promise<number>,
  seedInternalScheduleArtifactForE2E: (id: string) =>
      ipcRenderer.invoke('internal-engine:seed-schedule-artifact-e2e', id),
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
    parseDesktopBridgeEngineConfig(await ipcRenderer.invoke('engine-config:get'), DEFAULT_INTERNAL_ENGINE_ENDPOINT) as DesktopBridgeEngineConfig,
  saveEngineConfig: async (draft: EngineDraftConfig) => {
    const preparedWrite = prepareDesktopBridgeEngineConfigWrite(draft);
    return parseDesktopBridgeEngineConfig(
      await ipcRenderer.invoke(
        'engine-config:save',
        preparedWrite.activeEntry,
      ),
      draft.endpointUrl || DEFAULT_INTERNAL_ENGINE_ENDPOINT,
    ) as DesktopBridgeEngineConfig;
  },
  healthCheck: (baseUrl: string) =>
    ipcRenderer.invoke('backend:health-check', baseUrl) as Promise<HealthCheckResult>,
  checkRuntimeHealth: async (baseUrl: string) =>
    normalizeEngineRuntimeHealthResult(
      await ipcRenderer.invoke('backend:health-check', baseUrl) as HealthCheckResult,
      INTERNAL_ENGINE_RUNTIME_DESCRIPTOR,
    ) as EngineRuntimeHealthResult,
  minimizeWindow: () => ipcRenderer.invoke('window:minimize') as Promise<void>,
  toggleMaximizeWindow: () => ipcRenderer.invoke('window:toggle-maximize') as Promise<boolean>,
  isWindowMaximized: () => ipcRenderer.invoke('window:is-maximized') as Promise<boolean>,
  closeWindow: () => ipcRenderer.invoke('window:close') as Promise<void>,
  showSystemMenu: (x: number, y: number) => ipcRenderer.invoke('window:show-system-menu', { x, y }) as Promise<void>,
  getDownloadsPath: () => ipcRenderer.invoke('local:downloads-path') as Promise<string>,
  selectFolder: (initialPath?: string) => ipcRenderer.invoke('local:select-folder', initialPath) as Promise<string | null>,
  planOrganizeFolder: (rootPath: string) =>
    ipcRenderer.invoke('local:plan-organize-folder', rootPath) as Promise<LocalFilePlanResult>,
  applyOrganizeFolderPlan: (rootPath: string, actions: LocalFilePlanAction[]) =>
    ipcRenderer.invoke('local:apply-organize-folder-plan', {
      rootPath,
      actions,
    }) as Promise<LocalFileApplyResult>,
  createFileInFolder: (rootPath: string, relativePath: string, content: string, overwrite?: boolean) =>
    ipcRenderer.invoke('local:create-file-in-folder', {
      rootPath,
      relativePath,
      content,
      overwrite,
    }) as Promise<LocalFileCreateResult>,
  appendFileInFolder: (rootPath: string, relativePath: string, content: string) =>
    ipcRenderer.invoke('local:append-file-in-folder', {
      rootPath,
      relativePath,
      content,
    }) as Promise<LocalFileAppendResult>,
  readFileInFolder: (rootPath: string, relativePath: string) =>
    ipcRenderer.invoke('local:read-file-in-folder', {
      rootPath,
      relativePath,
    }) as Promise<LocalFileReadResult>,
  listDirInFolder: (rootPath: string, relativePath?: string) =>
    ipcRenderer.invoke('local:list-dir-in-folder', {
      rootPath,
      relativePath,
    }) as Promise<LocalFileListResult>,
  existsInFolder: (rootPath: string, relativePath: string) =>
    ipcRenderer.invoke('local:exists-in-folder', {
      rootPath,
      relativePath,
    }) as Promise<LocalFileExistsResult>,
  renameInFolder: (rootPath: string, oldRelative: string, newRelative: string) =>
    ipcRenderer.invoke('local:rename-in-folder', {
      rootPath,
      oldRelative,
      newRelative,
    }) as Promise<LocalFileRenameResult>,
  deleteInFolder: (rootPath: string, relativePath: string) =>
    ipcRenderer.invoke('local:delete-in-folder', {
      rootPath,
      relativePath,
    }) as Promise<LocalFileDeleteResult>,
  statInFolder: (rootPath: string, relativePath: string) =>
    ipcRenderer.invoke('local:stat-in-folder', {
      rootPath,
      relativePath,
    }) as Promise<LocalFileStatResult>,
  openPath: (targetPath: string) =>
    ipcRenderer.invoke('local:open-path', {
      targetPath,
    }) as Promise<{ ok: boolean; error?: string }>,
  shellExec: (rootPath: string, command: string, timeoutMs?: number) =>
    ipcRenderer.invoke('local:shell-exec', {
      rootPath,
      command,
      timeoutMs,
    }) as Promise<{ stdout: string; stderr: string; exitCode: number | null; timedOut: boolean }>,
  webFetch: (url: string, options?: { method?: string; headers?: Record<string, string>; body?: string }) =>
    ipcRenderer.invoke('local:web-fetch', {
      url,
      options,
    }) as Promise<{ status: number; statusText: string; headers: Record<string, string>; body: string; truncated: boolean }>,
  notify: (title: string, body?: string) =>
    ipcRenderer.invoke('notify', { title, body }) as Promise<{ ok: boolean; message?: string }>,
};

contextBridge.exposeInMainWorld('cloffice', desktopBridgeApi);
contextBridge.exposeInMainWorld('relay', desktopBridgeApi);
