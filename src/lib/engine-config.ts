import type { AppConfig, EngineProviderId, EngineRuntimeKind, EngineTransport } from '@/app-types';
import type { OpenClawCompatibilityConnectOptions } from './openclaw-compat-engine';

export type EngineDraftConfig = {
  runtimeKind: EngineRuntimeKind;
  providerId: EngineProviderId;
  transport: EngineTransport;
  endpointUrl: string;
  accessToken: string;
};

export function buildEngineDraftConfig(params: {
  providerId: EngineProviderId;
  endpointUrl: string;
  accessToken: string;
}): EngineDraftConfig {
  return {
    runtimeKind: params.providerId === 'internal' ? 'internal' : 'openclaw-compat',
    providerId: params.providerId,
    transport: params.providerId === 'internal' ? 'internal-ipc' : 'websocket-gateway',
    endpointUrl: params.endpointUrl,
    accessToken: params.accessToken,
  };
}

export function parseStoredAppConfig(entry: unknown, fallbackEndpointUrl: string): AppConfig | null {
  if (!entry || typeof entry !== 'object') {
    return null;
  }

  const record = entry as Record<string, unknown>;
  return {
    gatewayUrl: typeof record.gatewayUrl === 'string' && record.gatewayUrl.trim() ? record.gatewayUrl.trim() : fallbackEndpointUrl,
    gatewayToken: typeof record.gatewayToken === 'string' ? record.gatewayToken : '',
  };
}

export function engineDraftFromAppConfig(config: AppConfig): EngineDraftConfig {
  return buildEngineDraftConfig({
    providerId: 'openclaw-compat',
    endpointUrl: config.gatewayUrl,
    accessToken: config.gatewayToken,
  });
}

export function appConfigFromEngineDraft(draft: EngineDraftConfig): AppConfig {
  return {
    gatewayUrl: draft.endpointUrl,
    gatewayToken: draft.accessToken,
  };
}

export function engineConnectOptionsFromDraft(
  draft: Pick<EngineDraftConfig, 'endpointUrl' | 'accessToken'>,
): OpenClawCompatibilityConnectOptions {
  return {
    gatewayUrl: draft.endpointUrl,
    token: draft.accessToken,
  };
}