import type { CoworkProject, EngineProviderId, ScheduledJob } from '../app-types';
import type { EngineConnectOptions, EngineRuntimeClient } from './engine-runtime-types';

type InternalScheduleBridge = {
  createInternalPromptSchedule?: (payload: {
    kind?: 'chat' | 'cowork';
    prompt: string;
    name?: string;
    intervalMinutes?: number;
    projectId?: string;
    projectTitle?: string;
    rootPath?: string;
    model?: string | null;
  }) => Promise<unknown>;
  updateInternalPromptSchedule?: (id: string, payload: {
    enabled?: boolean;
    intervalMinutes?: number;
  }) => Promise<unknown>;
  deleteInternalPromptSchedule?: (id: string) => Promise<void>;
};

export async function loadEngineScheduledJobs(
  client: EngineRuntimeClient,
  connectOptions: EngineConnectOptions,
): Promise<ScheduledJob[]> {
  await client.connect(connectOptions);
  return client.listCronJobs();
}

export function canManageEngineSchedules(
  providerId: EngineProviderId,
  bridge: InternalScheduleBridge | null | undefined,
): boolean {
  return providerId === 'internal' && Boolean(bridge?.updateInternalPromptSchedule) && Boolean(bridge?.deleteInternalPromptSchedule);
}

export async function createEngineCoworkSchedule(params: {
  providerId: EngineProviderId;
  bridge: InternalScheduleBridge | null | undefined;
  prompt: string;
  activeProject: CoworkProject | null;
  rootPath?: string;
  model?: string | null;
}): Promise<{ message: string; shouldOpenScheduledPage: boolean; shouldReloadScheduledJobs: boolean }> {
  const prompt = params.prompt.trim();
  if (!prompt) {
    throw new Error('No cowork prompt available to schedule.');
  }

  if (params.providerId === 'internal' && params.bridge?.createInternalPromptSchedule) {
    await params.bridge.createInternalPromptSchedule({
      kind: 'cowork',
      prompt,
      name: 'Scheduled cowork prompt',
      projectId: params.activeProject?.id ?? undefined,
      projectTitle: params.activeProject?.name ?? undefined,
      rootPath: params.rootPath?.trim() || undefined,
      intervalMinutes: 1,
      model: params.model?.trim() || null,
    });
    return {
      message: 'Created an internal one-minute schedule from the current task prompt.',
      shouldOpenScheduledPage: true,
      shouldReloadScheduledJobs: true,
    };
  }

  return {
    message: 'Opened Schedule. Create a cron job for this task prompt from your runtime scheduler.',
    shouldOpenScheduledPage: true,
    shouldReloadScheduledJobs: false,
  };
}

export async function updateEngineSchedule(params: {
  bridge: InternalScheduleBridge | null | undefined;
  scheduleId: string;
  payload: {
    enabled?: boolean;
    intervalMinutes?: number;
  };
}): Promise<string> {
  if (!params.bridge?.updateInternalPromptSchedule) {
    throw new Error('Internal schedule controls are available in the Electron desktop app only.');
  }

  await params.bridge.updateInternalPromptSchedule(params.scheduleId, params.payload);
  if (typeof params.payload.enabled === 'boolean') {
    return params.payload.enabled ? 'Resumed internal schedule.' : 'Paused internal schedule.';
  }
  if (params.payload.intervalMinutes) {
    return `Updated internal schedule cadence to every ${params.payload.intervalMinutes} minute${params.payload.intervalMinutes === 1 ? '' : 's'}.`;
  }
  return 'Updated internal schedule.';
}

export async function deleteEngineSchedule(params: {
  bridge: InternalScheduleBridge | null | undefined;
  scheduleId: string;
}): Promise<string> {
  if (!params.bridge?.deleteInternalPromptSchedule) {
    throw new Error('Internal schedule controls are available in the Electron desktop app only.');
  }

  await params.bridge.deleteInternalPromptSchedule(params.scheduleId);
  return 'Deleted internal schedule.';
}
