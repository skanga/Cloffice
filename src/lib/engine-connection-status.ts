import type { EngineErrorInfo } from './engine-runtime-types.js';

export type EngineConnectionStatusDescription = {
  pairingRequestId: string | null;
  healthMessage: string;
  statusMessage: string;
};

export function buildEngineConnectSuccessHealthMessage(endpointUrl: string): string {
  return `Connected to runtime at ${endpointUrl}`;
}

export function describeEngineConnectFailure(
  _providerId: string | null | undefined,
  info: EngineErrorInfo,
): EngineConnectionStatusDescription {
  const message = info.message || 'Runtime is offline or unreachable.';
  return {
    pairingRequestId: null,
    healthMessage: message,
    statusMessage: message,
  };
}

export function buildEngineResetPairingSuccess(
  _providerId: string | null | undefined,
  endpointUrl: string,
): Omit<EngineConnectionStatusDescription, 'pairingRequestId'> {
  return {
    healthMessage: buildEngineConnectSuccessHealthMessage(endpointUrl),
    statusMessage: 'Runtime connection refreshed.',
  };
}

export function describeEngineResetPairingFailure(
  _providerId: string | null | undefined,
  info: EngineErrorInfo,
): EngineConnectionStatusDescription {
  const message = info.message || 'Failed to refresh runtime connection.';
  return {
    pairingRequestId: null,
    healthMessage: message,
    statusMessage: message,
  };
}

export function buildEngineChatDispatchStatus(
  _providerId: string | null | undefined,
  sessionKey: string,
): string {
  return `Message sent to the current runtime connection (session: ${sessionKey}). Waiting for streaming events...`;
}

export function shouldRestoreInternalApprovalRecovery(providerId: string | null | undefined): boolean {
  return providerId === 'internal';
}
