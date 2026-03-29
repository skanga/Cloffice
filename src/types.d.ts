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
import type { EngineDiscoveryResult } from './lib/engine-discovery';
import type { EngineChatMessage, EngineConnectOptions, EngineModelChoice, EngineRuntimeHealthResult, EngineSessionSummary } from './lib/engine-runtime-types';
import type { InternalEngineRuntimeInfo, InternalEngineSendChatResult, InternalEngineShellStatus } from './lib/internal-engine-bridge';
import type { OpenClawCompatibilityDiscoveryResult } from './lib/openclaw-compat-engine';

type DesktopBridgeApi = {
  getConfig: () => Promise<AppConfig>;
  saveConfig: (config: AppConfig) => Promise<AppConfig>;
  getInternalEngineStatus: () => Promise<InternalEngineShellStatus>;
  getInternalEngineRuntimeInfo: () => Promise<InternalEngineRuntimeInfo>;
  connectInternalEngine: (options: EngineConnectOptions) => Promise<void>;
  disconnectInternalEngine: () => Promise<void>;
  getInternalEngineActiveSessionKey: () => Promise<string>;
  createInternalChatSession: () => Promise<string>;
  resolveInternalSessionKey: (preferredKey?: string) => Promise<string>;
  listInternalSessions: (limit?: number) => Promise<EngineSessionSummary[]>;
  listInternalModels: () => Promise<EngineModelChoice[]>;
  getInternalSessionModel: (sessionKey: string) => Promise<string | null>;
  setInternalSessionModel: (sessionKey: string, modelValue: string | null) => Promise<void>;
  setInternalSessionTitle: (sessionKey: string, title: string | null) => Promise<void>;
  deleteInternalSession: (sessionKey: string) => Promise<void>;
  getInternalHistory: (sessionKey: string, limit?: number) => Promise<EngineChatMessage[]>;
  sendInternalChat: (sessionKey: string, text: string) => Promise<InternalEngineSendChatResult>;
  getEngineConfig: () => Promise<DesktopBridgeEngineConfig>;
  saveEngineConfig: (draft: EngineDraftConfig) => Promise<DesktopBridgeEngineConfig>;
  healthCheck: (baseUrl: string) => Promise<HealthCheckResult>;
  checkRuntimeHealth: (baseUrl: string) => Promise<EngineRuntimeHealthResult>;
  discoverGateway: () => Promise<OpenClawCompatibilityDiscoveryResult>;
  discoverEngine: () => Promise<EngineDiscoveryResult>;
  checkWorkspacePlugin: () => Promise<{ installed: boolean; error?: string }>;
  installWorkspacePlugin: () => Promise<{ ok: boolean; output?: string; error?: string }>;
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
