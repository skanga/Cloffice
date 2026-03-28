import type { AppConfig, EngineProviderId, EngineRuntimeKind, EngineTransport } from '@/app-types';
import type { OpenClawCompatibilityConnectOptions } from './openclaw-compat-engine';
import {
  NEXT_PROVIDER_AWARE_ENGINE_CONFIG_STORAGE_VERSION,
  type ProviderAwareStoredEngineConfigV2,
} from './engine-config-migration';

export type EngineDraftConfig = {
  runtimeKind: EngineRuntimeKind;
  providerId: EngineProviderId;
  transport: EngineTransport;
  endpointUrl: string;
  accessToken: string;
};

export type ParsedStoredEngineConfig = {
  appConfig: AppConfig;
  engineDraft: EngineDraftConfig;
  storageVersion: 1 | typeof NEXT_PROVIDER_AWARE_ENGINE_CONFIG_STORAGE_VERSION;
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

export function parseStoredEngineConfig(entry: unknown, fallbackEndpointUrl: string): ParsedStoredEngineConfig | null {
  const providerAwareConfig = parseStoredProviderAwareEngineConfigV2(entry, fallbackEndpointUrl);
  if (providerAwareConfig) {
    const engineDraft = buildEngineDraftConfig({
      providerId: providerAwareConfig.providerId,
      endpointUrl: providerAwareConfig.endpointUrl,
      accessToken: providerAwareConfig.accessToken,
    });

    return {
      appConfig: appConfigFromEngineDraft(engineDraft),
      engineDraft,
      storageVersion: providerAwareConfig.version,
    };
  }

  const legacyConfig = parseStoredAppConfig(entry, fallbackEndpointUrl);
  if (!legacyConfig) {
    return null;
  }

  return {
    appConfig: legacyConfig,
    engineDraft: engineDraftFromAppConfig(legacyConfig),
    storageVersion: 1,
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

function parseStoredProviderAwareEngineConfigV2(
  entry: unknown,
  fallbackEndpointUrl: string,
): ProviderAwareStoredEngineConfigV2 | null {
  if (!entry || typeof entry !== 'object') {
    return null;
  }

  const record = entry as Record<string, unknown>;
  if (record.version !== NEXT_PROVIDER_AWARE_ENGINE_CONFIG_STORAGE_VERSION) {
    return null;
  }

  const providerId = record.providerId === 'internal' ? 'internal' : 'openclaw-compat';
  const runtimeKind = record.runtimeKind === 'internal' ? 'internal' : 'openclaw-compat';
  const transport = record.transport === 'internal-ipc' ? 'internal-ipc' : 'websocket-gateway';
  const endpointUrl =
    typeof record.endpointUrl === 'string' && record.endpointUrl.trim()
      ? record.endpointUrl.trim()
      : fallbackEndpointUrl;

  return {
    version: NEXT_PROVIDER_AWARE_ENGINE_CONFIG_STORAGE_VERSION,
    providerId,
    runtimeKind,
    transport,
    endpointUrl,
    accessToken: typeof record.accessToken === 'string' ? record.accessToken : '',
  };
}
