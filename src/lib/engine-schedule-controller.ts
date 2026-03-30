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

export async function loadEngineScheduledJobsWithStatus(
  client: EngineRuntimeClient,
  connectOptions: EngineConnectOptions,
): Promise<{ jobs: ScheduledJob[]; errorMessage: string | null }> {
  try {
    const jobs = await loadEngineScheduledJobs(client, connectOptions);
    return { jobs, errorMessage: null };
  } catch (error) {
    return {
      jobs: [],
      errorMessage: error instanceof Error ? error.message : 'Unable to load scheduled jobs.',
    };
  }
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

export async function createEngineCoworkScheduleWithStatus(params: {
  providerId: EngineProviderId;
  bridge: InternalScheduleBridge | null | undefined;
  prompt: string;
  activeProject: CoworkProject | null;
  rootPath?: string;
  model?: string | null;
}): Promise<{
  message: string;
  shouldOpenScheduledPage: boolean;
  shouldReloadScheduledJobs: boolean;
}> {
  try {
    return await createEngineCoworkSchedule(params);
  } catch (error) {
    return {
      message: error instanceof Error ? error.message : 'Unable to create internal schedule.',
      shouldOpenScheduledPage: false,
      shouldReloadScheduledJobs: false,
    };
  }
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

export async function updateEngineScheduleWithStatus(params: {
  bridge: InternalScheduleBridge | null | undefined;
  scheduleId: string;
  payload: {
    enabled?: boolean;
    intervalMinutes?: number;
  };
}): Promise<{ message: string; shouldReloadScheduledJobs: boolean }> {
  try {
    const message = await updateEngineSchedule(params);
    return { message, shouldReloadScheduledJobs: true };
  } catch (error) {
    return {
      message: error instanceof Error ? error.message : 'Unable to update internal schedule.',
      shouldReloadScheduledJobs: false,
    };
  }
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

export async function deleteEngineScheduleWithStatus(params: {
  bridge: InternalScheduleBridge | null | undefined;
  scheduleId: string;
}): Promise<{ message: string; shouldReloadScheduledJobs: boolean }> {
  try {
    const message = await deleteEngineSchedule(params);
    return { message, shouldReloadScheduledJobs: true };
  } catch (error) {
    return {
      message: error instanceof Error ? error.message : 'Unable to delete internal schedule.',
      shouldReloadScheduledJobs: false,
    };
  }
}
