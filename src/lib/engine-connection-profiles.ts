import type { AppConfig, EngineConnectionProfile, EngineProviderId } from '@/app-types';
import type { EngineDraftConfig } from './engine-config';
import { accessTokenFromAppConfig, endpointUrlFromAppConfig } from './engine-config';

export type StoredEngineConnectionProfile = {
  id: string;
  name: string;
  endpointUrl: string;
  accessToken: string;
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
  const endpointUrl =
    typeof record.endpointUrl === 'string'
      ? record.endpointUrl.trim()
      : '';
  const accessToken =
    typeof record.accessToken === 'string'
      ? record.accessToken
      : '';
  const providerId = 'internal';
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
    endpointUrl: profile.endpointUrl,
    accessToken: profile.accessToken,
    providerId: profile.providerId,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
    lastUsedAt: profile.lastUsedAt,
  };
}

export function engineConnectionMatchesAppConfig(profile: EngineConnectionProfile, config: AppConfig): boolean {
  return profile.endpointUrl === endpointUrlFromAppConfig(config) && profile.accessToken === accessTokenFromAppConfig(config);
}

export function engineConnectionMatchesDraft(
  profile: EngineConnectionProfile,
  draft: Pick<EngineDraftConfig, 'providerId' | 'endpointUrl' | 'accessToken'>,
): boolean {
  return (
    profile.providerId === draft.providerId &&
    profile.endpointUrl === draft.endpointUrl.trim() &&
    profile.accessToken === draft.accessToken
  );
}
