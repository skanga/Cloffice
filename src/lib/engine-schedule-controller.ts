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
    name?: string;
    prompt?: string;
    model?: string | null;
  }) => Promise<unknown>;
  deleteInternalPromptSchedule?: (id: string) => Promise<void>;
};

export type EngineScheduleCreateInput = {
  kind: 'chat' | 'cowork';
  prompt: string;
  name?: string;
  intervalMinutes?: number;
  rootPath?: string;
  model?: string | null;
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

export function describeEngineScheduleAccess(
  providerId: EngineProviderId,
  bridge: InternalScheduleBridge | null | undefined,
): {
  canManage: boolean;
  modeLabel: 'Read-write' | 'Read-only';
  helperText: string;
} {
  const canManage = canManageEngineSchedules(providerId, bridge);
  if (canManage) {
    return {
      canManage: true,
      modeLabel: 'Read-write',
      helperText: 'This runtime supports schedule pause, resume, retime, and delete controls.',
    };
  }

  return {
    canManage: false,
    modeLabel: 'Read-only',
    helperText: 'This runtime exposes schedule rows for inspection only. Create or edit cron jobs from the runtime that owns them.',
  };
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

export async function createEngineSchedule(params: {
  providerId: EngineProviderId;
  bridge: InternalScheduleBridge | null | undefined;
  schedule: EngineScheduleCreateInput;
  activeProject: CoworkProject | null;
}): Promise<{ message: string; shouldReloadScheduledJobs: boolean }> {
  const prompt = params.schedule.prompt.trim();
  if (!prompt) {
    throw new Error('Schedule prompt is required.');
  }

  if (params.providerId !== 'internal' || !params.bridge?.createInternalPromptSchedule) {
    throw new Error('Direct schedule creation is available in the internal desktop runtime only.');
  }

  const kind = params.schedule.kind;
  const intervalMinutes = params.schedule.intervalMinutes ?? 1;
  const name = params.schedule.name?.trim() || (kind === 'cowork' ? 'Scheduled cowork prompt' : 'Scheduled chat prompt');

  await params.bridge.createInternalPromptSchedule({
    kind,
    prompt,
    name,
    projectId: kind === 'cowork' ? params.activeProject?.id ?? undefined : undefined,
    projectTitle: kind === 'cowork' ? params.activeProject?.name ?? undefined : undefined,
    rootPath: kind === 'cowork' ? params.schedule.rootPath?.trim() || undefined : undefined,
    intervalMinutes,
    model: params.schedule.model?.trim() || null,
  });

  return {
    message: `Created internal ${kind} schedule for every ${intervalMinutes} minute${intervalMinutes === 1 ? '' : 's'}.`,
    shouldReloadScheduledJobs: true,
  };
}

export async function createEngineScheduleWithStatus(params: {
  providerId: EngineProviderId;
  bridge: InternalScheduleBridge | null | undefined;
  schedule: EngineScheduleCreateInput;
  activeProject: CoworkProject | null;
}): Promise<{ message: string; shouldReloadScheduledJobs: boolean }> {
  try {
    return await createEngineSchedule(params);
  } catch (error) {
    return {
      message: error instanceof Error ? error.message : 'Unable to create internal schedule.',
      shouldReloadScheduledJobs: false,
    };
  }
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
    name?: string;
    prompt?: string;
    model?: string | null;
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
  if (typeof params.payload.name === 'string' || typeof params.payload.prompt === 'string' || params.payload.model !== undefined) {
    return 'Updated internal schedule details.';
  }
  return 'Updated internal schedule.';
}

export async function updateEngineScheduleWithStatus(params: {
  bridge: InternalScheduleBridge | null | undefined;
  scheduleId: string;
  payload: {
    enabled?: boolean;
    intervalMinutes?: number;
    name?: string;
    prompt?: string;
    model?: string | null;
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
