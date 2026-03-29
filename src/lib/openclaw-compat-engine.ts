import type { EngineRuntimeKind, EngineTransport } from '../app-types.js';
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
export class OpenClawCompatibilityEngineClient extends OpenClawGatewayClient {
  readonly runtimeKind: EngineRuntimeKind = 'openclaw-compat';
  readonly transport: EngineTransport = 'websocket-gateway';

  setEventHandler(handler: (event: OpenClawCompatibilityEventFrame) => void) {
    super.setEventHandler((event: unknown) => {
      if (!event || typeof event !== 'object' || (event as { type?: unknown }).type !== 'event') {
        return;
      }
      handler(event as OpenClawCompatibilityEventFrame);
    });
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
};
export { GatewayRequestError as OpenClawCompatibilityRequestError };
