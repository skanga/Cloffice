import type { EngineProviderId } from '@/app-types';

export type ProviderAwareEngineConfigMigrationPlan = {
  currentStorageVersion: 1;
  nextStorageVersion: 2;
  currentReader: 'app-config-v1-compat';
  currentWriter: 'app-config-v1-compat';
  nextWriter: 'deferred-provider-aware-v2';
  legacyKeys: readonly ['gatewayUrl', 'gatewayToken'];
  futureFields: readonly ['providerId', 'runtimeKind', 'transport', 'endpointUrl', 'accessToken'];
  blockers: Record<EngineProviderId, string | null>;
  notes: readonly string[];
};

export const FIRST_PROVIDER_AWARE_ENGINE_CONFIG_MIGRATION: ProviderAwareEngineConfigMigrationPlan = {
  currentStorageVersion: 1,
  nextStorageVersion: 2,
  currentReader: 'app-config-v1-compat',
  currentWriter: 'app-config-v1-compat',
  nextWriter: 'deferred-provider-aware-v2',
  legacyKeys: ['gatewayUrl', 'gatewayToken'],
  futureFields: ['providerId', 'runtimeKind', 'transport', 'endpointUrl', 'accessToken'],
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