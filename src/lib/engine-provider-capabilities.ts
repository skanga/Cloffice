import type { EngineProviderId, EngineRuntimeKind, EngineTransport } from '@/app-types';
import { getProviderAwareEngineConfigMigrationPlan } from './engine-config-migration';

export type EngineProviderCapability = {
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

const ENGINE_PROVIDER_CAPABILITIES: Record<EngineProviderId, EngineProviderCapability> = {
  'openclaw-compat': {
    id: 'openclaw-compat',
    displayName: 'OpenClaw compatibility',
    summary: 'Current runtime path. Use this for today\'s connection flow.',
    runtimeKind: 'openclaw-compat',
    transport: 'websocket-gateway',
    availableInBuild: true,
    selectionEnabled: true,
  },
  internal: {
    id: 'internal',
    displayName: 'Internal engine',
    summary: 'Planned next phase. The UI can prepare for it, but this build still runs through the compatibility runtime.',
    runtimeKind: 'internal',
    transport: 'internal-ipc',
    availableInBuild: false,
    selectionEnabled: false,
    availabilityReason: migrationPlan.blockers.internal ?? 'Not available in this build.',
  },
};

export function listEngineProviderCapabilities(): EngineProviderCapability[] {
  return Object.values(ENGINE_PROVIDER_CAPABILITIES);
}

export function getEngineProviderCapability(providerId: EngineProviderId): EngineProviderCapability {
  return ENGINE_PROVIDER_CAPABILITIES[providerId] ?? ENGINE_PROVIDER_CAPABILITIES['openclaw-compat'];
}