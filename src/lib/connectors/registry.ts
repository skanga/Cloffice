import type { ConnectorDefinition } from './connector-types';
import { LEGACY_STORAGE_KEYS, readLocalStorageItem, STORAGE_KEYS, writeLocalStorageItem } from '../storage-keys';

const CONNECTOR_CONFIG_KEY = STORAGE_KEYS.connectorsConfig;
const CONNECTOR_CONFIG_LEGACY_KEYS = [LEGACY_STORAGE_KEYS.connectorsConfig] as const;

/* Registry */

const connectors = new Map<string, ConnectorDefinition>();

export function registerConnector(connector: ConnectorDefinition) {
  connectors.set(connector.id, connector);
}

export function getConnector(id: string): ConnectorDefinition | undefined {
  return connectors.get(id);
}

export function listConnectors(): ConnectorDefinition[] {
  return Array.from(connectors.values());
}

function getDesktopBridgeSupport() {
  if (typeof window === 'undefined') {
    return null;
  }
  return window.cloffice ?? null;
}

export function isConnectorSupportedInCurrentBuild(connector: ConnectorDefinition): boolean {
  const bridge = getDesktopBridgeSupport();
  if (connector.id === 'shell') {
    return Boolean(bridge?.shellExec);
  }
  if (connector.id === 'web-fetch') {
    return Boolean(bridge?.webFetch);
  }
  return true;
}

/* ── Persisted config ────────────────────────────────────────────────────── */

type SavedConnectorConfigs = Record<string, { enabled: boolean; config: Record<string, unknown> }>;

function loadSavedConfigs(): SavedConnectorConfigs {
  try {
    const raw = readLocalStorageItem(CONNECTOR_CONFIG_KEY, CONNECTOR_CONFIG_LEGACY_KEYS);
    if (!raw) return {};
    return JSON.parse(raw) as SavedConnectorConfigs;
  } catch {
    return {};
  }
}

function saveSavedConfigs(configs: SavedConnectorConfigs) {
  writeLocalStorageItem(CONNECTOR_CONFIG_KEY, JSON.stringify(configs), CONNECTOR_CONFIG_LEGACY_KEYS);
}

/** Apply stored config + status to all registered connectors. */
export function hydrateConnectors() {
  const saved = loadSavedConfigs();
  for (const connector of connectors.values()) {
    const entry = saved[connector.id];
    if (entry) {
      connector.config = { ...connector.config, ...entry.config };
      connector.status = entry.enabled ? 'active' : 'inactive';
    }
    if (!isConnectorSupportedInCurrentBuild(connector)) {
      connector.status = 'inactive';
    }
  }
}

/** Persist a connector's current config and status. */
export function persistConnectorConfig(id: string) {
  const connector = connectors.get(id);
  if (!connector) return;
  const saved = loadSavedConfigs();
  saved[id] = { enabled: connector.status === 'active', config: connector.config };
  saveSavedConfigs(saved);
}

/** Build a system prompt fragment listing available connector actions. */
export function buildConnectorPromptFragment(): string {
  const active = listConnectors().filter((c) => c.status === 'active' && isConnectorSupportedInCurrentBuild(c));
  if (active.length === 0) return '';

  const lines = ['## Available connector actions', ''];
  for (const c of active) {
    lines.push(`### ${c.name}`);
    for (const action of c.actions) {
      const params = action.params.map((p) => `${p.name}${p.required ? '' : '?'}: ${p.type}`).join(', ');
      lines.push(`- \`${action.id}(${params})\` — ${action.description} [${action.riskLevel}]`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
