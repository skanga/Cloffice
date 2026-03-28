import type { AppConfig, EngineConnectionProfile, EngineProviderId } from '@/app-types';

export type StoredEngineConnectionProfile = {
  id: string;
  name: string;
  gatewayUrl: string;
  gatewayToken: string;
  providerId?: EngineProviderId;
  createdAt: number;
  updatedAt: number;
  lastUsedAt?: number;
};

export function parseStoredEngineConnectionProfile(entry: unknown): EngineConnectionProfile | null {
  if (!entry || typeof entry !== 'object') {
    return null;
  }

  const record = entry as Record<string, unknown>;
  const id = typeof record.id === 'string' ? record.id.trim() : '';
  const name = typeof record.name === 'string' ? record.name.trim() : '';
  const endpointUrl = typeof record.gatewayUrl === 'string' ? record.gatewayUrl.trim() : '';
  const accessToken = typeof record.gatewayToken === 'string' ? record.gatewayToken : '';
  const providerId = record.providerId === 'internal' ? 'internal' : 'openclaw-compat';
  const createdAt = typeof record.createdAt === 'number' ? record.createdAt : Date.now();
  const updatedAt = typeof record.updatedAt === 'number' ? record.updatedAt : createdAt;
  const lastUsedAt = typeof record.lastUsedAt === 'number' ? record.lastUsedAt : undefined;

  if (!id || !name || !endpointUrl) {
    return null;
  }

  return {
    id,
    name,
    endpointUrl,
    accessToken,
    providerId,
    createdAt,
    updatedAt,
    lastUsedAt,
  };
}

export function serializeEngineConnectionProfile(profile: EngineConnectionProfile): StoredEngineConnectionProfile {
  return {
    id: profile.id,
    name: profile.name,
    gatewayUrl: profile.endpointUrl,
    gatewayToken: profile.accessToken,
    providerId: profile.providerId,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
    lastUsedAt: profile.lastUsedAt,
  };
}

export function engineConnectionMatchesAppConfig(profile: EngineConnectionProfile, config: AppConfig): boolean {
  return profile.endpointUrl === config.gatewayUrl.trim() && profile.accessToken === (config.gatewayToken ?? '');
}