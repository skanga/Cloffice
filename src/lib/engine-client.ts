import type { EngineProviderId } from '@/app-types';
import {
  INTERNAL_ENGINE_RUNTIME_DESCRIPTOR,
  describeInternalEngineShell,
  InternalEnginePlaceholderClient,
} from './internal-engine-placeholder';
import { getDesktopBridge } from './desktop-bridge';
import { createDesktopBackedInternalEngineBridge } from './internal-engine-bridge';
import {
  OPENCLAW_COMPAT_ENGINE_RUNTIME_DESCRIPTOR,
  OpenClawCompatibilityEngineClient,
} from './openclaw-compat-engine';
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

/**
 * Minimal seam for the future provider-neutral Cloffice engine.
 *
 * This first pass intentionally keeps the current OpenClaw compatibility path in
 * place so the UI can move toward an engine-oriented boundary without forcing a
 * full runtime migration in the same change set.
 */
export type EngineClient = EngineRuntimeClient;

/**
 * Transitional adapter that currently delegates to the OpenClaw compatibility
 * module. TODO(engine-migration): replace this with the internal engine IPC
 * client once the provider-neutral runtime is available.
 */
export class OpenClawRuntimeAdapter extends OpenClawCompatibilityEngineClient implements EngineClient {}

export type EngineClientInstance = EngineRuntimeClient;

/**
 * Maps the configured provider model to the runtime path that is actually
 * available in this build.
 */
export function resolveAvailableEngineProviderId(providerId: EngineProviderId): EngineProviderId {
  const provider = getEngineProvider(providerId);
  return provider.availableInBuild ? provider.id : 'openclaw-compat';
}

export function getEngineRuntimeDescriptor(providerId: EngineProviderId = 'openclaw-compat'): EngineRuntimeDescriptor {
  const resolvedProviderId = resolveAvailableEngineProviderId(providerId);
  if (resolvedProviderId === 'internal') {
    return INTERNAL_ENGINE_RUNTIME_DESCRIPTOR;
  }
  return OPENCLAW_COMPAT_ENGINE_RUNTIME_DESCRIPTOR;
}

export function createEngineClient(providerId: EngineProviderId = 'openclaw-compat'): EngineClientInstance {
  if (providerId === 'internal') {
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

  const resolvedProviderId = resolveAvailableEngineProviderId(providerId);
  return new OpenClawRuntimeAdapter();
}
