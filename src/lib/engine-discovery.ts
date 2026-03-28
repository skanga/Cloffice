import type { EngineProviderId, EngineRuntimeKind, EngineTransport, GatewayDiscoveryResult } from '../app-types.js';

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

export function normalizeEngineDiscoveryResult(result: GatewayDiscoveryResult): EngineDiscoveryResult {
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