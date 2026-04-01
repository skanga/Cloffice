import type { EngineProviderId, EngineRuntimeKind, EngineTransport } from '../app-types.js';

export const CURRENT_ENGINE_CONFIG_STORAGE_VERSION = 2;
export const NEXT_PROVIDER_AWARE_ENGINE_CONFIG_STORAGE_VERSION = 2;
export type ProviderAwareEngineConfigWriteMode = 'disabled' | 'internal-experimental';
export const PROVIDER_AWARE_ENGINE_CONFIG_WRITE_MODE: ProviderAwareEngineConfigWriteMode = 'disabled';

export type StoredInternalProviderConfig = {
  openaiApiKey: string;
  openaiBaseUrl: string;
  openaiModels: string;
  anthropicApiKey: string;
  anthropicModels: string;
  geminiApiKey: string;
  geminiModels: string;
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
  currentReader: 'provider-aware-v2';
  currentWriter: 'provider-aware-v2';
  nextWriter: 'provider-aware-v2';
  futureFields: readonly ['providerId', 'runtimeKind', 'transport', 'endpointUrl', 'accessToken', 'internalProviderConfig'];
  blockers: Record<EngineProviderId, string | null>;
  notes: readonly string[];
};

export const FIRST_PROVIDER_AWARE_ENGINE_CONFIG_MIGRATION: ProviderAwareEngineConfigMigrationPlan = {
  currentStorageVersion: CURRENT_ENGINE_CONFIG_STORAGE_VERSION,
  nextStorageVersion: NEXT_PROVIDER_AWARE_ENGINE_CONFIG_STORAGE_VERSION,
  currentReader: 'provider-aware-v2',
  currentWriter: 'provider-aware-v2',
  nextWriter: 'provider-aware-v2',
  futureFields: ['providerId', 'runtimeKind', 'transport', 'endpointUrl', 'accessToken', 'internalProviderConfig'],
  blockers: {
    internal: null,
  },
  notes: [
    'Internal engine config now reads and writes only the provider-aware v2 shape.',
    'Canonical config naming is endpointUrl/accessToken across persisted config and desktop bridge state.',
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
