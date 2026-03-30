import type { EngineProviderId, EngineRuntimeKind, EngineTransport, HealthCheckResult } from '../app-types.js';

export type EngineConnectOptions = {
  endpointUrl: string;
  accessToken?: string;
  password?: string;
};

export type EngineChatMessage = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  text: string;
};

export type EngineErrorInfo = {
  message: string;
  code?: string;
  requestId?: string;
};

export type EngineModelChoice = {
  value: string;
  label: string;
};

export type EngineSessionSummary = {
  key: string;
  kind: string;
  title?: string;
};

export type EngineCronJob = {
  id: string;
  name: string;
  schedule: string;
  enabled: boolean;
  state: string;
  nextRunAt: string | null;
  lastRunAt: string | null;
  lastRunId?: string;
  lastRunStatus?: string;
  lastRunSummary?: string;
};

export type EngineToolEntry = {
  name: string;
  group?: string;
  source: 'core' | 'plugin';
  pluginId?: string;
  optional?: boolean;
};

export type EngineToolsCatalog = {
  tools: EngineToolEntry[];
};

export type EngineWorkspaceListResult = {
  items: Array<{
    path: string;
    kind: 'file' | 'directory';
    size?: number;
    modifiedMs?: number;
  }>;
  truncated: boolean;
};

export type EngineWorkspaceReadResult = {
  content: string;
};

export type EngineWorkspaceStatResult = {
  kind: 'file' | 'directory';
  size: number;
  createdMs: number;
  modifiedMs: number;
};

export type EngineEventFrame = {
  type: 'event';
  event: string;
  payload?: unknown;
  seq?: number;
  stateVersion?: Record<string, unknown>;
};

export type EngineConnectionHandler = (connected: boolean, message: string) => void;
export type EngineEventHandler = (event: EngineEventFrame) => void;

export type EngineRuntimeDescriptor = {
  providerId: EngineProviderId;
  runtimeKind: EngineRuntimeKind;
  transport: EngineTransport;
};

export type EngineRuntimeHealthResult = HealthCheckResult & EngineRuntimeDescriptor;

export interface EngineRuntimeClient extends EngineRuntimeDescriptor {
  connect(options: EngineConnectOptions): Promise<void>;
  disconnect(): void;
  isConnected(): boolean;
  setConnectionHandler(handler: EngineConnectionHandler): void;
  setEventHandler(handler: EngineEventHandler): void;
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
  listCronJobs(): Promise<EngineCronJob[]>;
  fetchToolsCatalog(): Promise<EngineToolsCatalog>;
  listWorkspaceFiles(relativePath?: string): Promise<EngineWorkspaceListResult>;
  readWorkspaceFile(relativePath: string): Promise<EngineWorkspaceReadResult>;
  statWorkspaceFile(relativePath: string): Promise<EngineWorkspaceStatResult>;
  renameWorkspaceFile(oldPath: string, newPath: string): Promise<void>;
  deleteWorkspaceFile(path: string): Promise<void>;
  writeWorkspaceFile(path: string, content: string): Promise<void>;
}

export function normalizeEngineRuntimeHealthResult(
  result: HealthCheckResult,
  runtime: EngineRuntimeDescriptor,
): EngineRuntimeHealthResult {
  return {
    ...result,
    providerId: runtime.providerId,
    runtimeKind: runtime.runtimeKind,
    transport: runtime.transport,
  };
}
