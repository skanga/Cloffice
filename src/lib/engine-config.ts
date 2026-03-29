import type { AppConfig, EngineProviderId, EngineRuntimeKind, EngineTransport } from '../app-types.js';
import type { EngineConnectOptions } from './engine-runtime-types.js';
import {
  buildDeferredProviderAwareEngineConfigV2,
  NEXT_PROVIDER_AWARE_ENGINE_CONFIG_STORAGE_VERSION,
  PROVIDER_AWARE_ENGINE_CONFIG_WRITE_MODE,
  resolveProviderAwareEngineConfigWriteMode,
  type ProviderAwareEngineConfigWriteMode,
  type ProviderAwareStoredEngineConfigV2,
} from './engine-config-migration.js';

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

export type DesktopBridgeEngineConfig = ParsedStoredEngineConfig;
export type PreparedEngineConfigWrite = {
  activeFormat: 'app-config-v1-compat' | 'provider-aware-v2';
  legacyAppConfig: AppConfig;
  providerAwareConfig: ProviderAwareStoredEngineConfigV2;
  providerAwareWriteEligible: boolean;
  providerAwareWriteEnabled: boolean;
  providerAwareWriteMode: ProviderAwareEngineConfigWriteMode;
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

export function parseDesktopBridgeEngineConfig(entry: unknown, fallbackEndpointUrl: string): DesktopBridgeEngineConfig {
  return (
    parseStoredEngineConfig(entry, fallbackEndpointUrl) ?? {
      appConfig: {
        gatewayUrl: fallbackEndpointUrl,
        gatewayToken: '',
      },
      engineDraft: buildEngineDraftConfig({
        providerId: 'openclaw-compat',
        endpointUrl: fallbackEndpointUrl,
        accessToken: '',
      }),
      storageVersion: 1,
    }
  );
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

export function buildDeferredProviderAwareEngineConfig(draft: EngineDraftConfig): ProviderAwareStoredEngineConfigV2 {
  return buildDeferredProviderAwareEngineConfigV2({
    providerId: draft.providerId,
    runtimeKind: draft.runtimeKind,
    transport: draft.transport,
    endpointUrl: draft.endpointUrl,
    accessToken: draft.accessToken,
  });
}

export function prepareEngineConfigWrite(
  draft: EngineDraftConfig,
  options?: {
    developerBuild?: boolean;
    developerOptIn?: boolean;
  },
): PreparedEngineConfigWrite {
  const providerAwareWriteMode = resolveProviderAwareEngineConfigWriteMode({
    providerId: draft.providerId,
    developerBuild: options?.developerBuild ?? false,
    developerOptIn: options?.developerOptIn ?? false,
  });
  const providerAwareWriteEligible = draft.providerId === 'internal';
  const providerAwareWriteEnabled = providerAwareWriteMode === 'internal-experimental';

  return {
    activeFormat: providerAwareWriteEnabled ? 'provider-aware-v2' : 'app-config-v1-compat',
    legacyAppConfig: appConfigFromEngineDraft(draft),
    providerAwareConfig: buildDeferredProviderAwareEngineConfig(draft),
    providerAwareWriteEligible,
    providerAwareWriteEnabled,
    providerAwareWriteMode,
  };
}

export function engineConnectOptionsFromDraft(
  draft: Pick<EngineDraftConfig, 'endpointUrl' | 'accessToken'>,
): EngineConnectOptions {
  return {
    endpointUrl: draft.endpointUrl,
    accessToken: draft.accessToken,
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
