import type { AppConfig } from '@/app-types';
import type { EngineClientInstance } from './engine-client';
import {
  createLegacyAppConfigFromConnection,
  type DesktopBridgeEngineConfig,
  type EngineDraftConfig,
} from './engine-config';
import type { EngineConnectOptions } from './engine-runtime-types';
import type { EngineErrorInfo } from './engine-runtime-types';
import {
  buildEngineConnectSuccessHealthMessage,
  buildEngineResetPairingSuccess,
  describeEngineConnectFailure,
  describeEngineResetPairingFailure,
} from './engine-connection-status';

type ConfigPersistenceBridge = {
  saveEngineConfig?: (draft: EngineDraftConfig) => Promise<DesktopBridgeEngineConfig>;
  saveConfig?: (config: AppConfig) => Promise<AppConfig>;
};

export async function persistEngineRuntimeConfig(params: {
  bridge?: ConfigPersistenceBridge | null;
  nextEngineDraft: EngineDraftConfig;
  nextConfig: AppConfig;
  persistLocalConfig: (config: AppConfig) => void;
}): Promise<DesktopBridgeEngineConfig> {
  const { bridge, nextEngineDraft, nextConfig, persistLocalConfig } = params;

  const savedEngineConfig = bridge
    ? bridge.saveEngineConfig
      ? await bridge.saveEngineConfig(nextEngineDraft)
      : {
          appConfig: await bridge.saveConfig!(nextConfig),
          engineDraft: nextEngineDraft,
          storageVersion: 1 as const,
        }
    : {
        appConfig: nextConfig,
        engineDraft: nextEngineDraft,
        storageVersion: 1 as const,
      };

  persistLocalConfig(savedEngineConfig.appConfig);
  return savedEngineConfig;
}

export async function connectEngineRuntimeShell(params: {
  client: EngineClientInstance;
  providerId: string | null | undefined;
  connectOptions: EngineConnectOptions;
  onboardingComplete: boolean;
  shouldRestoreRecovery: boolean;
  readEngineError: (error: unknown) => EngineErrorInfo;
  onMarkLastUsed: (config: AppConfig) => void;
  onRestoreInternalApprovalRecovery: () => Promise<void>;
  onClearRecoveredApprovals: () => void;
  onCompleteOnboarding: () => void;
  onRefreshState: () => Promise<void>;
}): Promise<
  | { kind: 'connected'; healthMessage: string; refreshErrorMessage: string | null }
  | { kind: 'failed'; pairingRequestId: string | null; healthMessage: string; statusMessage: string }
> {
  const {
    client,
    providerId,
    connectOptions,
    onboardingComplete,
    shouldRestoreRecovery,
    readEngineError,
    onMarkLastUsed,
    onRestoreInternalApprovalRecovery,
    onClearRecoveredApprovals,
    onCompleteOnboarding,
    onRefreshState,
  } = params;

  try {
    await client.connect(connectOptions);
    onMarkLastUsed(createLegacyAppConfigFromConnection(connectOptions.endpointUrl, connectOptions.accessToken ?? ''));

    if (shouldRestoreRecovery) {
      await onRestoreInternalApprovalRecovery();
    } else {
      onClearRecoveredApprovals();
    }

    if (!onboardingComplete) {
      onCompleteOnboarding();
    }

    let refreshErrorMessage: string | null = null;
    try {
      await onRefreshState();
    } catch (error) {
      refreshErrorMessage = error instanceof Error ? error.message : 'Failed to refresh runtime state.';
    }

    return {
      kind: 'connected',
      healthMessage: buildEngineConnectSuccessHealthMessage(connectOptions.endpointUrl),
      refreshErrorMessage,
    };
  } catch (error) {
    const info = readEngineError(error);
    const description = describeEngineConnectFailure(providerId, info);
    return {
      kind: 'failed',
      pairingRequestId: description.pairingRequestId,
      healthMessage: description.healthMessage,
      statusMessage: description.statusMessage,
    };
  }
}

export async function resetEngineRuntimePairing(params: {
  client: EngineClientInstance;
  providerId: string | null | undefined;
  connectOptions: EngineConnectOptions;
  currentSessionKey?: string | null;
  readEngineError: (error: unknown) => EngineErrorInfo;
  resetDeviceIdentity: () => void;
}): Promise<
  | {
      kind: 'connected';
      sessionKey: string;
      healthMessage: string;
      statusMessage: string;
    }
  | {
      kind: 'failed';
      pairingRequestId: string | null;
      healthMessage: string;
      statusMessage: string;
    }
> {
  try {
    params.client.disconnect();
    params.resetDeviceIdentity();
    await params.client.connect(params.connectOptions);

    const sessionKey = (params.currentSessionKey ?? '').trim();
    const success = buildEngineResetPairingSuccess(params.providerId, params.connectOptions.endpointUrl);
    return {
      kind: 'connected',
      sessionKey,
      healthMessage: success.healthMessage,
      statusMessage: success.statusMessage,
    };
  } catch (error) {
    const info = params.readEngineError(error);
    const description = describeEngineResetPairingFailure(params.providerId, info);
    return {
      kind: 'failed',
      pairingRequestId: description.pairingRequestId,
      healthMessage: description.healthMessage,
      statusMessage: description.statusMessage,
    };
  }
}
