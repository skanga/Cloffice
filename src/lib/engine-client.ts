import type { EngineProviderId, EngineRuntimeKind, EngineTransport } from '@/app-types';
import { InternalEnginePlaceholderClient } from './internal-engine-placeholder';
import {
  OpenClawCompatibilityEngineClient,
  type OpenClawCompatibilityEventFrame,
} from './openclaw-compat-engine';
import { getEngineProviderCapability } from './engine-provider-capabilities';

export type EngineConnectionHandler = (connected: boolean, message: string) => void;
export type EngineEventFrame = OpenClawCompatibilityEventFrame;
export type EngineEventHandler = (event: EngineEventFrame) => void;

/**
 * Minimal seam for the future provider-neutral Cloffice engine.
 *
 * This first pass intentionally keeps the current OpenClaw compatibility path in
 * place so the UI can move toward an engine-oriented boundary without forcing a
 * full runtime migration in the same change set.
 */
export interface EngineClient {
  readonly runtimeKind: EngineRuntimeKind;
  readonly transport: EngineTransport;
  setConnectionHandler(handler: EngineConnectionHandler): void;
  setEventHandler(handler: EngineEventHandler): void;
}

/**
 * Transitional adapter that currently delegates to the OpenClaw compatibility
 * module. TODO(engine-migration): replace this with the internal engine IPC
 * client once the provider-neutral runtime is available.
 */
export class OpenClawRuntimeAdapter extends OpenClawCompatibilityEngineClient implements EngineClient {}

export type EngineClientInstance = OpenClawRuntimeAdapter | InternalEnginePlaceholderClient;

/**
 * Maps the configured provider model to the runtime path that is actually
 * available in this build.
 */
export function resolveAvailableEngineProviderId(providerId: EngineProviderId): EngineProviderId {
  const capability = getEngineProviderCapability(providerId);
  return capability.availableInBuild ? capability.id : 'openclaw-compat';
}

export function createEngineClient(providerId: EngineProviderId = 'openclaw-compat'): EngineClientInstance {
  const resolvedProviderId = resolveAvailableEngineProviderId(providerId);
  return resolvedProviderId === 'internal'
    ? new InternalEnginePlaceholderClient()
    : new OpenClawRuntimeAdapter();
}
