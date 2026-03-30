import type { EngineProviderId, EngineRuntimeKind, EngineTransport } from '../app-types.js';
import { getProviderAwareEngineConfigMigrationPlan } from './engine-config-migration.js';
import { describeInternalEngineShell } from './internal-engine-placeholder.js';

export type EngineProviderDefinition = {
  id: EngineProviderId;
  displayName: string;
  summary: string;
  runtimeKind: EngineRuntimeKind;
  transport: EngineTransport;
  availableInBuild: boolean;
  selectionEnabled: boolean;
  availabilityReason?: string;
};

const migrationPlan = getProviderAwareEngineConfigMigrationPlan();
const internalEngineShell = describeInternalEngineShell();

const INTERNAL_ENGINE_PROVIDER: EngineProviderDefinition = {
  id: 'internal',
  displayName: 'Internal engine',
  summary: internalEngineShell.availableInBuild
    ? 'Built-in provider-neutral runtime. Recommended default path.'
    : 'Internal runtime shell is registered but not available in this build.',
  runtimeKind: internalEngineShell.runtime.runtimeKind,
  transport: internalEngineShell.runtime.transport,
  availableInBuild: internalEngineShell.availableInBuild,
  selectionEnabled: internalEngineShell.availableInBuild,
  availabilityReason: internalEngineShell.availableInBuild
    ? undefined
    : migrationPlan.blockers.internal ?? internalEngineShell.unavailableReason,
};

export function listEngineProviders(): EngineProviderDefinition[] {
  return [INTERNAL_ENGINE_PROVIDER];
}

export function getEngineProvider(providerId: EngineProviderId): EngineProviderDefinition {
  return providerId === 'internal' ? INTERNAL_ENGINE_PROVIDER : INTERNAL_ENGINE_PROVIDER;
}

export function isInternalEngineProvider(providerId: string | null | undefined): boolean {
  return providerId === 'internal';
}
