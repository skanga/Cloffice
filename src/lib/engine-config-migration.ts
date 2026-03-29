import type { EngineProviderId, EngineRuntimeKind, EngineTransport } from '../app-types.js';

export const CURRENT_ENGINE_CONFIG_STORAGE_VERSION = 1;
export const NEXT_PROVIDER_AWARE_ENGINE_CONFIG_STORAGE_VERSION = 2;
export type ProviderAwareEngineConfigWriteMode = 'disabled' | 'internal-experimental';
export const PROVIDER_AWARE_ENGINE_CONFIG_WRITE_MODE: ProviderAwareEngineConfigWriteMode = 'disabled';

export type StoredInternalProviderConfig = {
  openaiApiKey: string;
  openaiBaseUrl: string;
  anthropicApiKey: string;
  geminiApiKey: string;
};

export type ProviderAwareStoredEngineConfigV2 = {
  version: typeof NEXT_PROVIDER_AWARE_ENGINE_CONFIG_STORAGE_VERSION;
  providerId: EngineProviderId;
  runtimeKind: EngineRuntimeKind;
  transport: EngineTransport;
  endpointUrl: string;
  accessToken: string;
  internalProviderConfig?: StoredInternalProviderConfig;
};

export type ProviderAwareEngineConfigMigrationPlan = {
  currentStorageVersion: typeof CURRENT_ENGINE_CONFIG_STORAGE_VERSION;
  nextStorageVersion: typeof NEXT_PROVIDER_AWARE_ENGINE_CONFIG_STORAGE_VERSION;
  currentReader: 'app-config-v1-compat';
  currentWriter: 'app-config-v1-compat';
  nextWriter: 'deferred-provider-aware-v2';
  legacyKeys: readonly ['gatewayUrl', 'gatewayToken'];
  futureFields: readonly ['providerId', 'runtimeKind', 'transport', 'endpointUrl', 'accessToken', 'internalProviderConfig'];
  blockers: Record<EngineProviderId, string | null>;
  notes: readonly string[];
};

export const FIRST_PROVIDER_AWARE_ENGINE_CONFIG_MIGRATION: ProviderAwareEngineConfigMigrationPlan = {
  currentStorageVersion: CURRENT_ENGINE_CONFIG_STORAGE_VERSION,
  nextStorageVersion: NEXT_PROVIDER_AWARE_ENGINE_CONFIG_STORAGE_VERSION,
  currentReader: 'app-config-v1-compat',
  currentWriter: 'app-config-v1-compat',
  nextWriter: 'deferred-provider-aware-v2',
  legacyKeys: ['gatewayUrl', 'gatewayToken'],
  futureFields: ['providerId', 'runtimeKind', 'transport', 'endpointUrl', 'accessToken', 'internalProviderConfig'],
  blockers: {
    'openclaw-compat': null,
    internal: 'Persisted provider-aware runtime settings have not shipped yet, so existing installs still write the legacy gateway keys only.',
  },
  notes: [
    'Keep reading the legacy AppConfig shape until a versioned provider-aware config schema exists.',
    'Do not rewrite existing installs to a new shape until the internal engine runtime is actually available.',
    'When v2 ships, read both v1 and v2, but continue writing v1 during the first compatibility window.',
  ],
};

export function getProviderAwareEngineConfigMigrationPlan(): ProviderAwareEngineConfigMigrationPlan {
  return FIRST_PROVIDER_AWARE_ENGINE_CONFIG_MIGRATION;
}

export function buildDeferredProviderAwareEngineConfigV2(
  config: Omit<ProviderAwareStoredEngineConfigV2, 'version'>,
): ProviderAwareStoredEngineConfigV2 {
  return {
    version: NEXT_PROVIDER_AWARE_ENGINE_CONFIG_STORAGE_VERSION,
    ...config,
  };
}

export function resolveProviderAwareEngineConfigWriteMode(params: {
  providerId: EngineProviderId;
  developerBuild: boolean;
  developerOptIn: boolean;
}): ProviderAwareEngineConfigWriteMode {
  if (params.providerId === 'internal') {
    return 'internal-experimental';
  }
  return PROVIDER_AWARE_ENGINE_CONFIG_WRITE_MODE;
}
