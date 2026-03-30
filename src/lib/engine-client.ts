import type { EngineProviderId } from '@/app-types';
import {
  INTERNAL_ENGINE_RUNTIME_DESCRIPTOR,
  describeInternalEngineShell,
  InternalEnginePlaceholderClient,
} from './internal-engine-placeholder';
import { getDesktopBridge } from './desktop-bridge';
import { createDesktopBackedInternalEngineBridge } from './internal-engine-bridge';
import { getEngineProvider } from './engine-provider-registry';
import type {
  EngineRuntimeClient,
  EngineRuntimeDescriptor,
} from './engine-runtime-types';

export type {
  EngineChatMessage,
  EngineConnectOptions,
  EngineCronJob,
  EngineModelChoice,
  EngineRuntimeClient,
  EngineRuntimeDescriptor,
  EngineRuntimeHealthResult,
  EngineSessionSummary,
} from './engine-runtime-types';
export type { EngineConnectionHandler, EngineEventFrame, EngineEventHandler } from './engine-runtime-types';

export type EngineClient = EngineRuntimeClient;

export type EngineClientInstance = EngineRuntimeClient;

export function resolveAvailableEngineProviderId(providerId: EngineProviderId): EngineProviderId {
  const provider = getEngineProvider(providerId);
  return provider.availableInBuild ? provider.id : 'internal';
}

export function getEngineRuntimeDescriptor(providerId: EngineProviderId = 'internal'): EngineRuntimeDescriptor {
  resolveAvailableEngineProviderId(providerId);
  return INTERNAL_ENGINE_RUNTIME_DESCRIPTOR;
}

export function createEngineClient(providerId: EngineProviderId = 'internal'): EngineClientInstance {
  resolveAvailableEngineProviderId(providerId);
  const desktopBridge = getDesktopBridge();
  if (desktopBridge) {
    const internalDesktopStatus = {
      ...describeInternalEngineShell(),
      availableInBuild: true as const,
      unavailableReason: 'Internal engine development path active.',
      capabilities: {
        ...describeInternalEngineShell().capabilities,
        connection: true,
        sessions: true,
        models: true,
      },
    };
    return new InternalEnginePlaceholderClient(
      createDesktopBackedInternalEngineBridge(desktopBridge, internalDesktopStatus),
    );
  }
  return new InternalEnginePlaceholderClient();
}
