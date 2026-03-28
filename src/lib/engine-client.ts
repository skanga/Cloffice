import type { EngineRuntimeKind, EngineTransport } from '@/app-types';
import { OpenClawCompatibilityEngineClient } from './openclaw-compat-engine';

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
}

/**
 * Transitional adapter that currently delegates to the OpenClaw compatibility
 * module. TODO(engine-migration): replace this with the internal engine IPC
 * client once the provider-neutral runtime is available.
 */
export class OpenClawRuntimeAdapter extends OpenClawCompatibilityEngineClient implements EngineClient {}

export type EngineClientInstance = OpenClawRuntimeAdapter;

export function createEngineClient(): EngineClientInstance {
  return new OpenClawRuntimeAdapter();
}


