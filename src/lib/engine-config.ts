import type { AppConfig, EngineProviderId, EngineRuntimeKind, EngineTransport } from '../app-types.js';
import type { EngineConnectOptions } from './engine-runtime-types.js';
import {
  buildDeferredProviderAwareEngineConfigV2,
  NEXT_PROVIDER_AWARE_ENGINE_CONFIG_STORAGE_VERSION,
  resolveProviderAwareEngineConfigWriteMode,
  type ProviderAwareEngineConfigWriteMode,
  type ProviderAwareStoredEngineConfigV2,
  type StoredInternalProviderConfig,
} from './engine-config-migration.js';

export type InternalProviderConfig = StoredInternalProviderConfig;

export const DEFAULT_ENGINE_PROVIDER_ID: EngineProviderId = 'internal';
export const DEFAULT_INTERNAL_ENGINE_ENDPOINT_URL = 'internal://dev-runtime';

export const EMPTY_INTERNAL_PROVIDER_CONFIG: InternalProviderConfig = {
  openaiApiKey: '',
  openaiBaseUrl: '',
  openaiModels: '',
  anthropicApiKey: '',
  anthropicModels: '',
  geminiApiKey: '',
  geminiModels: '',
};

export type EngineDraftConfig = {
  runtimeKind: EngineRuntimeKind;
  providerId: EngineProviderId;
  transport: EngineTransport;
  endpointUrl: string;
  accessToken: string;
  internalProviderConfig: InternalProviderConfig;
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

export function normalizeEngineEndpointUrl(
  endpointUrl: string | null | undefined,
  fallbackEndpointUrl: string = DEFAULT_INTERNAL_ENGINE_ENDPOINT_URL,
): string {
  return typeof endpointUrl === 'string' && endpointUrl.trim() ? endpointUrl.trim() : fallbackEndpointUrl;
}

export function createDefaultAppConfig(
  fallbackEndpointUrl: string = DEFAULT_INTERNAL_ENGINE_ENDPOINT_URL,
): AppConfig {
  return {
    gatewayUrl: fallbackEndpointUrl,
    gatewayToken: '',
  };
}

export function createDefaultEngineDraft(
  fallbackEndpointUrl: string = DEFAULT_INTERNAL_ENGINE_ENDPOINT_URL,
): EngineDraftConfig {
  return buildEngineDraftConfig({
    providerId: DEFAULT_ENGINE_PROVIDER_ID,
    endpointUrl: fallbackEndpointUrl,
    accessToken: '',
  });
}

export function buildEngineDraftConfig(params: {
  providerId: EngineProviderId;
  endpointUrl: string;
  accessToken: string;
  internalProviderConfig?: Partial<InternalProviderConfig>;
}): EngineDraftConfig {
  return {
    runtimeKind: 'internal',
    providerId: params.providerId,
    transport: 'internal-ipc',
    endpointUrl: params.endpointUrl,
    accessToken: params.accessToken,
    internalProviderConfig: {
      ...EMPTY_INTERNAL_PROVIDER_CONFIG,
      ...params.internalProviderConfig,
    },
  };
}

export function parseStoredAppConfig(entry: unknown, fallbackEndpointUrl: string): AppConfig | null {
  if (!entry || typeof entry !== 'object') {
    return null;
  }

  const record = entry as Record<string, unknown>;
  return {
    gatewayUrl: normalizeEngineEndpointUrl(
      typeof record.gatewayUrl === 'string' ? record.gatewayUrl : null,
      fallbackEndpointUrl,
    ),
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
      internalProviderConfig: providerAwareConfig.internalProviderConfig,
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
      appConfig: createDefaultAppConfig(fallbackEndpointUrl),
      engineDraft: createDefaultEngineDraft(fallbackEndpointUrl),
      storageVersion: 1,
    }
  );
}

export function engineDraftFromAppConfig(config: AppConfig): EngineDraftConfig {
  return buildEngineDraftConfig({
    providerId: DEFAULT_ENGINE_PROVIDER_ID,
    endpointUrl: normalizeEngineEndpointUrl(config.gatewayUrl),
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
    ...(draft.providerId === 'internal' ? { internalProviderConfig: { ...draft.internalProviderConfig } } : {}),
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

  const providerId = 'internal';
  const runtimeKind = 'internal';
  const transport = 'internal-ipc';
  const endpointUrl = normalizeEngineEndpointUrl(
    typeof record.endpointUrl === 'string' ? record.endpointUrl : null,
    fallbackEndpointUrl,
  );

  return {
    version: NEXT_PROVIDER_AWARE_ENGINE_CONFIG_STORAGE_VERSION,
    providerId,
    runtimeKind,
    transport,
    endpointUrl,
    accessToken: typeof record.accessToken === 'string' ? record.accessToken : '',
    ...(record.internalProviderConfig && typeof record.internalProviderConfig === 'object'
      ? {
          internalProviderConfig: {
            openaiApiKey:
              typeof (record.internalProviderConfig as Record<string, unknown>).openaiApiKey === 'string'
                ? (record.internalProviderConfig as Record<string, string>).openaiApiKey
                : '',
            openaiBaseUrl:
              typeof (record.internalProviderConfig as Record<string, unknown>).openaiBaseUrl === 'string'
                ? (record.internalProviderConfig as Record<string, string>).openaiBaseUrl
                : '',
            openaiModels:
              typeof (record.internalProviderConfig as Record<string, unknown>).openaiModels === 'string'
                ? (record.internalProviderConfig as Record<string, string>).openaiModels
                : '',
            anthropicApiKey:
              typeof (record.internalProviderConfig as Record<string, unknown>).anthropicApiKey === 'string'
                ? (record.internalProviderConfig as Record<string, string>).anthropicApiKey
                : '',
            anthropicModels:
              typeof (record.internalProviderConfig as Record<string, unknown>).anthropicModels === 'string'
                ? (record.internalProviderConfig as Record<string, string>).anthropicModels
                : '',
            geminiApiKey:
              typeof (record.internalProviderConfig as Record<string, unknown>).geminiApiKey === 'string'
                ? (record.internalProviderConfig as Record<string, string>).geminiApiKey
                : '',
            geminiModels:
              typeof (record.internalProviderConfig as Record<string, unknown>).geminiModels === 'string'
                ? (record.internalProviderConfig as Record<string, string>).geminiModels
                : '',
          },
        }
      : {}),
  };
}
