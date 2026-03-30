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

const ENGINE_PROVIDER_REGISTRY: Record<EngineProviderId, EngineProviderDefinition> = {
  internal: {
    id: 'internal',
    displayName: 'Internal engine',
    summary: internalEngineShell.availableInBuild
      ? 'Built-in provider-neutral runtime. Recommended default path.'
      : 'Internal runtime shell is registered, but this build still routes through the compatibility runtime.',
    runtimeKind: internalEngineShell.runtime.runtimeKind,
    transport: internalEngineShell.runtime.transport,
    availableInBuild: internalEngineShell.availableInBuild,
    selectionEnabled: internalEngineShell.availableInBuild,
    availabilityReason: internalEngineShell.availableInBuild
      ? undefined
      : migrationPlan.blockers.internal ?? internalEngineShell.unavailableReason,
  },
  'openclaw-compat': {
    id: 'openclaw-compat',
    displayName: 'OpenClaw compatibility',
    summary: 'Legacy/manual runtime endpoint for existing OpenClaw deployments.',
    runtimeKind: 'openclaw-compat',
    transport: 'websocket-gateway',
    availableInBuild: true,
    selectionEnabled: true,
  },
};

export function listEngineProviders(): EngineProviderDefinition[] {
  return Object.values(ENGINE_PROVIDER_REGISTRY);
}

export function getEngineProvider(providerId: EngineProviderId): EngineProviderDefinition {
  return ENGINE_PROVIDER_REGISTRY[providerId] ?? ENGINE_PROVIDER_REGISTRY.internal;
}

export function isInternalEngineProvider(providerId: string | null | undefined): boolean {
  return providerId === 'internal';
}

export function isOpenClawCompatibilityProvider(providerId: string | null | undefined): boolean {
  return providerId === 'openclaw-compat';
}
