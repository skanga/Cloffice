import type { EngineErrorInfo } from './engine-runtime-types.js';
import { isOpenClawCompatibilityProvider } from './engine-provider-registry.js';
import {
  buildOpenClawCompatibilityChatDispatchStatus,
  describeOpenClawCompatibilityConnectFailure,
  describeOpenClawCompatibilityResetPairingFailure,
} from './openclaw-compat-engine.js';

export type EngineConnectionStatusDescription = {
  pairingRequestId: string | null;
  healthMessage: string;
  statusMessage: string;
};

export function buildEngineConnectSuccessHealthMessage(endpointUrl: string): string {
  return `Connected to runtime at ${endpointUrl}`;
}

export function describeEngineConnectFailure(
  providerId: string | null | undefined,
  info: EngineErrorInfo,
): EngineConnectionStatusDescription {
  if (isOpenClawCompatibilityProvider(providerId)) {
    return describeOpenClawCompatibilityConnectFailure(info);
  }

  const message = info.message || 'Runtime is offline or unreachable.';
  return {
    pairingRequestId: null,
    healthMessage: message,
    statusMessage: message,
  };
}

export function buildEngineResetPairingSuccess(
  providerId: string | null | undefined,
  endpointUrl: string,
): Omit<EngineConnectionStatusDescription, 'pairingRequestId'> {
  if (isOpenClawCompatibilityProvider(providerId)) {
    return {
      healthMessage: `Re-paired and connected to ${endpointUrl}`,
      statusMessage:
        'Re-pair complete. If operator.admin is still missing, approve the new request with admin scope on the runtime host.',
    };
  }

  return {
    healthMessage: buildEngineConnectSuccessHealthMessage(endpointUrl),
    statusMessage: 'Runtime connection refreshed.',
  };
}

export function describeEngineResetPairingFailure(
  providerId: string | null | undefined,
  info: EngineErrorInfo,
): EngineConnectionStatusDescription {
  if (isOpenClawCompatibilityProvider(providerId)) {
    return describeOpenClawCompatibilityResetPairingFailure(info);
  }

  const message = info.message || 'Failed to refresh runtime connection.';
  return {
    pairingRequestId: null,
    healthMessage: message,
    statusMessage: message,
  };
}

export function buildEngineChatDispatchStatus(
  providerId: string | null | undefined,
  sessionKey: string,
): string {
  if (isOpenClawCompatibilityProvider(providerId)) {
    return buildOpenClawCompatibilityChatDispatchStatus(sessionKey);
  }

  return `Message sent to the current runtime connection (session: ${sessionKey}). Waiting for streaming events...`;
}

export function shouldRestoreInternalApprovalRecovery(providerId: string | null | undefined): boolean {
  return providerId === 'internal';
}
