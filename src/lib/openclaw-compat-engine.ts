import type { EngineRuntimeKind, EngineTransport } from '@/app-types';
import {
  OpenClawGatewayClient,
  type EngineChatMessage,
  type EngineConnectOptions,
  type EngineCronJob,
  type EngineModelChoice,
  type EngineSessionSummary,
  type EngineToolEntry,
  type EngineToolsCatalog,
  GatewayRequestError,
} from './openclaw-gateway-client';

/**
 * Transitional app-boundary adapter for the current OpenClaw runtime path.
 *
 * This keeps the low-level WebSocket transport in `openclaw-gateway-client.ts`
 * while giving the rest of the app a single compatibility module to depend on
 * until the internal provider-neutral engine replaces it.
 */
export class OpenClawCompatibilityEngineClient extends OpenClawGatewayClient {
  readonly runtimeKind: EngineRuntimeKind = 'openclaw-compat';
  readonly transport: EngineTransport = 'websocket-gateway';
}

export type OpenClawCompatibilityConnectOptions = EngineConnectOptions;
export type OpenClawCompatibilityChatMessage = EngineChatMessage;
export type OpenClawCompatibilityModelChoice = EngineModelChoice;
export type OpenClawCompatibilityCronJob = EngineCronJob;
export type OpenClawCompatibilitySessionSummary = EngineSessionSummary;
export type OpenClawCompatibilityToolEntry = EngineToolEntry;
export type OpenClawCompatibilityToolsCatalog = EngineToolsCatalog;
export { GatewayRequestError as OpenClawCompatibilityRequestError };
