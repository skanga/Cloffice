import type {
  EngineChatMessage,
  EngineConnectOptions,
  EngineCronJob,
  EngineErrorInfo,
  EngineModelChoice,
  EngineRuntimeClient,
  EngineRuntimeDescriptor,
  EngineSessionSummary,
  EngineToolEntry,
  EngineToolsCatalog,
  EngineWorkspaceListResult,
  EngineWorkspaceReadResult,
  EngineWorkspaceStatResult,
} from './engine-runtime-types.js';
import {
  OpenClawGatewayClient,
  GatewayRequestError,
} from './openclaw-gateway-client.js';

/**
 * Transitional app-boundary adapter for the current OpenClaw runtime path.
 *
 * This keeps the low-level WebSocket transport in `openclaw-gateway-client.ts`
 * while giving the rest of the app a single compatibility module to depend on
 * until the internal provider-neutral engine replaces it.
 */
export const OPENCLAW_COMPAT_ENGINE_RUNTIME_DESCRIPTOR: EngineRuntimeDescriptor = {
  providerId: 'openclaw-compat',
  runtimeKind: 'openclaw-compat',
  transport: 'websocket-gateway',
};

export const OPENCLAW_COMPAT_DEVICE_IDENTITY_STORAGE_KEY = 'openclaw-device-identity-v1';

export type OpenClawCompatibilityDiscoveryResult = {
  found: boolean;
  gatewayUrl: string | null;
  binaryFound: boolean;
  binaryPath: string | null;
  message: string;
};

function normalizeOpenClawCompatibilityScheduleState(rawState: string | null | undefined, enabled: boolean): string {
  const normalized = rawState?.trim().toLowerCase();
  if (!normalized) {
    return enabled ? 'idle' : 'paused';
  }

  if (['disabled', 'paused', 'inactive'].includes(normalized)) {
    return 'paused';
  }
  if (['enabled', 'scheduled', 'ready', 'waiting', 'pending', 'queued'].includes(normalized)) {
    return 'idle';
  }
  if (['running', 'executing', 'in_progress'].includes(normalized)) {
    return 'running';
  }
  if (['awaiting_approval', 'approval_required'].includes(normalized)) {
    return 'awaiting_approval';
  }
  if (['completed', 'complete', 'succeeded', 'success'].includes(normalized)) {
    return 'completed';
  }
  if (['failed', 'error', 'errored'].includes(normalized)) {
    return 'failed';
  }
  return normalized;
}

function normalizeOpenClawCompatibilityCronJob(job: EngineCronJob, index: number): EngineCronJob {
  const enabled = typeof job.enabled === 'boolean'
    ? job.enabled
    : !['disabled', 'paused', 'inactive'].includes(job.state?.trim().toLowerCase?.() ?? '');

  return {
    ...job,
    id: job.id?.trim() || `compat-schedule-${index + 1}`,
    name: job.name?.trim() || `Scheduled job ${index + 1}`,
    schedule: job.schedule?.trim() || 'Unavailable',
    enabled,
    state: normalizeOpenClawCompatibilityScheduleState(job.state, enabled),
  };
}

export class OpenClawCompatibilityEngineClient implements EngineRuntimeClient {
  private readonly gatewayClient = new OpenClawGatewayClient();

  readonly providerId = OPENCLAW_COMPAT_ENGINE_RUNTIME_DESCRIPTOR.providerId;
  readonly runtimeKind = OPENCLAW_COMPAT_ENGINE_RUNTIME_DESCRIPTOR.runtimeKind;
  readonly transport = OPENCLAW_COMPAT_ENGINE_RUNTIME_DESCRIPTOR.transport;

  connect(options: EngineConnectOptions): Promise<void> {
    return this.gatewayClient.connect({
      gatewayUrl: options.endpointUrl,
      token: options.accessToken,
      password: options.password,
    });
  }

  disconnect(): void {
    this.gatewayClient.disconnect();
  }

  isConnected(): boolean {
    return this.gatewayClient.isConnected();
  }

  setConnectionHandler(handler: (connected: boolean, message: string) => void) {
    this.gatewayClient.setConnectionHandler(handler);
  }

  setEventHandler(handler: (event: OpenClawCompatibilityEventFrame) => void) {
    this.gatewayClient.setEventHandler((event: unknown) => {
      if (!event || typeof event !== 'object' || (event as { type?: unknown }).type !== 'event') {
        return;
      }
      const frame = event as {
        type: 'event';
        event: string;
        payload?: unknown;
        seq?: number;
        stateVersion?: Record<string, unknown>;
      };
      handler({
        type: 'event',
        event: frame.event,
        payload: normalizeOpenClawCompatibilityEventPayload(frame.event, frame.payload),
        seq: frame.seq,
        stateVersion: frame.stateVersion,
      });
    });
  }

  getActiveSessionKey(): Promise<string> {
    return this.gatewayClient.getActiveSessionKey();
  }

  createChatSession(): Promise<string> {
    return this.gatewayClient.createChatSession();
  }

  createCoworkSession(): Promise<string> {
    return this.gatewayClient.createCoworkSession();
  }

  sendChat(sessionKey: string, text: string): Promise<{ sessionKey: string }> {
    return this.gatewayClient.sendChat(sessionKey, text);
  }

  resolveSessionKey(preferredKey?: string): Promise<string> {
    return this.gatewayClient.resolveSessionKey(preferredKey);
  }

  getHistory(sessionKey: string, limit?: number): Promise<EngineChatMessage[]> {
    return this.gatewayClient.getHistory(sessionKey, limit) as Promise<EngineChatMessage[]>;
  }

  listModels(): Promise<EngineModelChoice[]> {
    return this.gatewayClient.listModels() as Promise<EngineModelChoice[]>;
  }

  getSessionModel(sessionKey: string): Promise<string | null> {
    return this.gatewayClient.getSessionModel(sessionKey);
  }

  listSessions(limit?: number): Promise<EngineSessionSummary[]> {
    return this.gatewayClient.listSessions(limit) as Promise<EngineSessionSummary[]>;
  }

  setSessionModel(sessionKey: string, modelValue: string | null): Promise<void> {
    return this.gatewayClient.setSessionModel(sessionKey, modelValue);
  }

  setSessionTitle(sessionKey: string, title: string | null): Promise<void> {
    return this.gatewayClient.setSessionTitle(sessionKey, title);
  }

  deleteSession(sessionKey: string): Promise<void> {
    return this.gatewayClient.deleteSession(sessionKey);
  }

  listCronJobs(): Promise<EngineCronJob[]> {
    return this.gatewayClient
      .listCronJobs()
      .then((jobs) => (jobs as EngineCronJob[]).map(normalizeOpenClawCompatibilityCronJob));
  }

  fetchToolsCatalog(): Promise<EngineToolsCatalog> {
    return this.gatewayClient.fetchToolsCatalog() as Promise<EngineToolsCatalog>;
  }

  listWorkspaceFiles(relativePath?: string): Promise<EngineWorkspaceListResult> {
    return this.gatewayClient.listWorkspaceFiles(relativePath) as Promise<EngineWorkspaceListResult>;
  }

  readWorkspaceFile(relativePath: string): Promise<EngineWorkspaceReadResult> {
    return this.gatewayClient.readWorkspaceFile(relativePath) as Promise<EngineWorkspaceReadResult>;
  }

  statWorkspaceFile(relativePath: string): Promise<EngineWorkspaceStatResult> {
    return this.gatewayClient.statWorkspaceFile(relativePath) as Promise<EngineWorkspaceStatResult>;
  }

  renameWorkspaceFile(oldPath: string, newPath: string): Promise<void> {
    return this.gatewayClient.renameWorkspaceFile(oldPath, newPath);
  }

  deleteWorkspaceFile(path: string): Promise<void> {
    return this.gatewayClient.deleteWorkspaceFile(path);
  }

  writeWorkspaceFile(path: string, content: string): Promise<void> {
    return this.gatewayClient.writeWorkspaceFile(path, content);
  }
}

export type OpenClawCompatibilityConnectOptions = EngineConnectOptions;
export type OpenClawCompatibilityChatMessage = EngineChatMessage;
export type OpenClawCompatibilityModelChoice = EngineModelChoice;
export type OpenClawCompatibilityCronJob = EngineCronJob;
export type OpenClawCompatibilitySessionSummary = EngineSessionSummary;
export type OpenClawCompatibilityToolEntry = EngineToolEntry;
export type OpenClawCompatibilityToolsCatalog = EngineToolsCatalog;
export type OpenClawCompatibilityErrorDetails = {
  code?: string;
  requestId?: string;
  canRetryWithDeviceToken?: boolean;
  reason?: string;
  [key: string]: unknown;
};
export type OpenClawCompatibilityEventFrame = {
  type: 'event';
  event: string;
  payload?: unknown;
  seq?: number;
  stateVersion?: Record<string, unknown>;
};

export function getOpenClawCompatibilityRequestError(error: unknown): GatewayRequestError | null {
  return error instanceof GatewayRequestError ? error : null;
}

export function readOpenClawCompatibilityError(error: unknown): EngineErrorInfo | null {
  const compatibilityError = getOpenClawCompatibilityRequestError(error);
  if (!compatibilityError) {
    return null;
  }

  const details = compatibilityError.details as Record<string, unknown> | undefined;
  const requestId =
    (typeof details?.requestId === 'string' && details.requestId) ||
    (typeof details?.request_id === 'string' && details.request_id) ||
    (typeof details?.pairingRequestId === 'string' && details.pairingRequestId) ||
    undefined;

  return {
    message: compatibilityError.message,
    code: compatibilityError.code,
    requestId,
  };
}

export function buildOpenClawCompatibilityPairingHint(requestId?: string): string {
  return requestId
    ? `Approve with: openclaw devices approve ${requestId}`
    : 'Approve the pending request on the runtime host.';
}

export function buildOpenClawCompatibilityAdminPairingHint(requestId?: string): string {
  return requestId
    ? `openclaw devices approve ${requestId}`
    : 'openclaw devices list then openclaw devices approve <requestId>';
}

export function describeOpenClawCompatibilityConnectFailure(info: EngineErrorInfo): {
  pairingRequired: boolean;
  pairingRequestId: string | null;
  healthMessage: string;
  statusMessage: string;
} {
  const pairingRequired =
    info.code === 'PAIRING_REQUIRED' ||
    /pairing.required/i.test(info.message);

  if (pairingRequired) {
    const approvalHint = ` ${buildOpenClawCompatibilityPairingHint(info.requestId)}`;
    return {
      pairingRequired: true,
      pairingRequestId: info.requestId ?? null,
      healthMessage: `Pairing required.${approvalHint}`,
      statusMessage: `Pairing required.${approvalHint}`,
    };
  }

  const offlineMessage = info.message || 'Runtime is offline or unreachable.';
  return {
    pairingRequired: false,
    pairingRequestId: null,
    healthMessage: offlineMessage,
    statusMessage: offlineMessage,
  };
}

export function describeOpenClawCompatibilityResetPairingFailure(info: EngineErrorInfo): {
  pairingRequired: boolean;
  pairingRequestId: string | null;
  healthMessage: string;
  statusMessage: string;
} {
  const pairingRequired =
    info.code === 'PAIRING_REQUIRED' ||
    /pairing.required/i.test(info.message);

  if (pairingRequired) {
    const approvalHint = buildOpenClawCompatibilityAdminPairingHint(info.requestId);
    return {
      pairingRequired: true,
      pairingRequestId: info.requestId ?? null,
      healthMessage: 'New pairing request created. Approve it with admin scope.',
      statusMessage: `New pairing request created. Approve with admin scope: ${approvalHint}`,
    };
  }

  const message = info.message || 'Failed to reset pairing.';
  return {
    pairingRequired: false,
    pairingRequestId: null,
    healthMessage: message,
    statusMessage: message,
  };
}

export function buildOpenClawCompatibilityChatDispatchStatus(sessionKey: string): string {
  return `Message sent to the current OpenClaw compatibility runtime (session: ${sessionKey}). Waiting for streaming events...`;
}

export { GatewayRequestError as OpenClawCompatibilityRequestError };

function normalizeOpenClawCompatibilityEventPayload(eventName: string, payload: unknown): unknown {
  if (eventName !== 'chat' || !payload || typeof payload !== 'object') {
    return payload;
  }

  const record = payload as Record<string, unknown>;
  const normalized: Record<string, unknown> = { ...record };
  const message = normalizeOpenClawCompatibilityMessage(normalized.message ?? normalized);

  normalized.message = message;

  if (typeof normalized.sessionKey !== 'string' && typeof normalized.session_key === 'string') {
    normalized.sessionKey = normalized.session_key;
  }
  if (typeof normalized.runId !== 'string' && typeof normalized.run_id === 'string') {
    normalized.runId = normalized.run_id;
  }
  if (typeof normalized.errorMessage !== 'string' && typeof normalized.error_message === 'string') {
    normalized.errorMessage = normalized.error_message;
  }

  if (normalized.requestedActions === undefined) {
    normalized.requestedActions =
      normalized.relay_actions
      ?? normalized.relayActions
      ?? message.relay_actions
      ?? message.relayActions;
  }

  if (normalized.activityItems === undefined) {
    normalized.activityItems =
      normalized.relay_activity
      ?? normalized.relayActivity
      ?? message.relay_activity
      ?? message.relayActivity;
  }

  return normalized;
}

function normalizeOpenClawCompatibilityMessage(message: unknown): Record<string, unknown> {
  if (!message || typeof message !== 'object') {
    return {};
  }

  const record = message as Record<string, unknown>;
  const normalized: Record<string, unknown> = { ...record };

  if (typeof normalized.sessionKey !== 'string' && typeof normalized.session_key === 'string') {
    normalized.sessionKey = normalized.session_key;
  }
  if (typeof normalized.runId !== 'string' && typeof normalized.run_id === 'string') {
    normalized.runId = normalized.run_id;
  }
  if (typeof normalized.errorMessage !== 'string' && typeof normalized.error_message === 'string') {
    normalized.errorMessage = normalized.error_message;
  }

  return normalized;
}
