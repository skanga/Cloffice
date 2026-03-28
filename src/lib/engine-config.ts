import type { AppConfig, EngineProviderId, EngineRuntimeKind, EngineTransport } from '@/app-types';

export type EngineDraftConfig = {
  runtimeKind: EngineRuntimeKind;
  providerId: EngineProviderId;
  transport: EngineTransport;
  endpointUrl: string;
  accessToken: string;
};

export function engineDraftFromAppConfig(config: AppConfig): EngineDraftConfig {
  return {
    runtimeKind: 'openclaw-compat',
    providerId: 'openclaw-compat',
    transport: 'websocket-gateway',
    endpointUrl: config.gatewayUrl,
    accessToken: config.gatewayToken,
  };
}

export function appConfigFromEngineDraft(draft: EngineDraftConfig): AppConfig {
  return {
    gatewayUrl: draft.endpointUrl,
    gatewayToken: draft.accessToken,
  };
}
