import type { EngineDiscoveryResult } from '@/app-types';

/**
 * App-boundary helpers for the current runtime discovery result.
 *
 * The underlying compatibility discovery shape still uses `gatewayUrl`.
 * Keep that detail confined here until the runtime discovery contract is migrated.
 */
export function getEngineDiscoveryEndpoint(result: EngineDiscoveryResult): string | null {
  return result.gatewayUrl;
}
