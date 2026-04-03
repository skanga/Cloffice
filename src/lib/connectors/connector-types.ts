import type { SafetyRiskLevel } from '@/app-types';

/* -- Connector system types ------------------------------------------------ */

export type ConnectorStatus = 'active' | 'inactive' | 'error';

export type ConnectorActionParam = {
  name: string;
  description: string;
  required: boolean;
  type: 'string' | 'number' | 'boolean';
};

export type ConnectorAction = {
  /** Fully-qualified action name, e.g. `filesystem.read_file`, `shell.exec` */
  id: string;
  name: string;
  description: string;
  /** Safety scope that governs this action */
  scopeId: string;
  riskLevel: SafetyRiskLevel;
  params: ConnectorActionParam[];
};

export type ConnectorConfig = Record<string, unknown>;

export type ConnectorDefinition = {
  id: string;
  name: string;
  description: string;
  icon: string;
  status: ConnectorStatus;
  /** Runtime configuration, e.g. allowed domains or timeout values */
  config: ConnectorConfig;
  actions: ConnectorAction[];
  /** Test connectivity / readiness */
  test: () => Promise<{ ok: boolean; message: string }>;
  /** Execute an action by id */
  execute: (
    actionId: string,
    params: Record<string, unknown>,
    context: ConnectorExecutionContext,
  ) => Promise<ConnectorActionResult>;
};

export type ConnectorExecutionContext = {
  explorerId?: string;
  rootPath?: string;
  bridge: DesktopBridgeApi;
};

export type ConnectorActionResult = {
  ok: boolean;
  data?: unknown;
  message?: string;
  errorCode?: string;
};

/** Minimal desktop bridge API surface connectors need. */
export type DesktopBridgeApi = {
  createFileInFolder?: (explorerId: string, rel: string, content: string, overwrite?: boolean) => Promise<unknown>;
  appendFileInFolder?: (explorerId: string, rel: string, content: string) => Promise<unknown>;
  readFileInFolder?: (explorerId: string, rel: string) => Promise<unknown>;
  listDirInFolder?: (explorerId: string, rel?: string) => Promise<unknown>;
  existsInFolder?: (explorerId: string, rel: string) => Promise<unknown>;
  renameInFolder?: (explorerId: string, old: string, newRel: string) => Promise<unknown>;
  deleteInFolder?: (explorerId: string, rel: string) => Promise<unknown>;
  statInFolder?: (explorerId: string, rel: string) => Promise<unknown>;
  shellExec?: (root: string, command: string, timeoutMs?: number) => Promise<unknown>;
  webFetch?: (url: string, options?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<unknown>;
};

export type BridgeApi = DesktopBridgeApi;

export function readConnectorStringArrayConfig(config: ConnectorConfig, key: string): string[] {
  const value = config[key];
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
    ? value
    : [];
}
