import type {
  EngineChatMessage,
  EngineConnectOptions,
  EngineCronJob,
  EngineModelChoice,
  EngineRuntimeClient,
  EngineRuntimeDescriptor,
  EngineSessionSummary,
  EngineToolsCatalog,
  EngineWorkspaceListResult,
  EngineWorkspaceReadResult,
  EngineWorkspaceStatResult,
} from './engine-runtime-types.js';
import type { GatewayDiscoveryResult } from '../app-types.js';
import {
  OpenClawGatewayClient,
  type GatewayChatMessage,
  type GatewayConnectOptions,
  type GatewayCronJob,
  type GatewayErrorDetails,
  type GatewayModelChoice,
  type GatewaySessionSummary,
  type GatewayToolEntry,
  type GatewayToolsCatalog,
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

export type OpenClawCompatibilityDiscoveryResult = GatewayDiscoveryResult;

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
        payload: frame.payload,
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
    return this.gatewayClient.listCronJobs() as Promise<EngineCronJob[]>;
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

export type OpenClawCompatibilityConnectOptions = GatewayConnectOptions;
export type OpenClawCompatibilityChatMessage = GatewayChatMessage;
export type OpenClawCompatibilityModelChoice = GatewayModelChoice;
export type OpenClawCompatibilityCronJob = GatewayCronJob;
export type OpenClawCompatibilitySessionSummary = GatewaySessionSummary;
export type OpenClawCompatibilityToolEntry = GatewayToolEntry;
export type OpenClawCompatibilityToolsCatalog = GatewayToolsCatalog;
export type OpenClawCompatibilityErrorDetails = GatewayErrorDetails;
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

export { GatewayRequestError as OpenClawCompatibilityRequestError };
