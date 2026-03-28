import type { OpenClawCompatibilityConnectOptions } from './openclaw-compat-engine';
import { OpenClawCompatibilityEngineClient } from './openclaw-compat-engine';

/**
 * Placeholder client for the future internal engine.
 *
 * It intentionally does not provide a working transport yet. The class exists so
 * higher-level factory code can model the future provider split without claiming
 * that the internal engine path is implemented.
 */
export class InternalEnginePlaceholderClient extends OpenClawCompatibilityEngineClient {
  readonly runtimeKind = 'internal' as const;
  readonly transport = 'internal-ipc' as const;

  override async connect(_options: OpenClawCompatibilityConnectOptions): Promise<void> {
    throw new Error('The internal engine runtime is not available in this build yet.');
  }
}