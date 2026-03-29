import type { EngineProviderId, EngineRuntimeKind, EngineTransport } from '../app-types.js';
import type { OpenClawCompatibilityDiscoveryResult } from './openclaw-compat-engine.js';

export type EngineDiscoveryResult = {
  found: boolean;
  endpointUrl: string | null;
  binaryFound: boolean;
  binaryPath: string | null;
  message: string;
  providerId: EngineProviderId;
  runtimeKind: EngineRuntimeKind;
  transport: EngineTransport;
};

export function normalizeEngineDiscoveryResult(result: OpenClawCompatibilityDiscoveryResult): EngineDiscoveryResult {
  return {
    found: result.found,
    endpointUrl: result.gatewayUrl,
    binaryFound: result.binaryFound,
    binaryPath: result.binaryPath,
    message: result.message,
    providerId: 'openclaw-compat',
    runtimeKind: 'openclaw-compat',
    transport: 'websocket-gateway',
  };
}

export function getEngineDiscoveryEndpoint(result: Pick<EngineDiscoveryResult, 'endpointUrl'>): string | null {
  return result.endpointUrl;
}
