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
    clearHistory?: boolean;
  }) => Promise<unknown>;
  deleteInternalPromptSchedule?: (id: string) => Promise<void>;
  runInternalPromptScheduleNow?: (id: string) => Promise<unknown>;
};

export type EngineScheduleCreateInput = {
  kind: 'chat' | 'cowork';
  prompt: string;
  name?: string;
  intervalMinutes?: number;
  rootPath?: string;
  projectId?: string;
  projectTitle?: string;
  model?: string | null;
};

export type EngineScheduleTransferRecord = {
  kind: 'chat' | 'cowork';
  name: string;
  prompt: string;
  intervalMinutes: number;
  enabled: boolean;
  model?: string | null;
  projectId?: string;
  projectTitle?: string;
  rootPath?: string;
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
    projectId: kind === 'cowork' ? params.schedule.projectId ?? params.activeProject?.id ?? undefined : undefined,
    projectTitle: kind === 'cowork' ? params.schedule.projectTitle ?? params.activeProject?.name ?? undefined : undefined,
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
    clearHistory?: boolean;
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
  if (params.payload.clearHistory) {
    return 'Cleared internal schedule history.';
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
    clearHistory?: boolean;
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

export async function duplicateEngineScheduleWithStatus(params: {
  providerId: EngineProviderId;
  bridge: InternalScheduleBridge | null | undefined;
  schedule: {
    kind?: 'chat' | 'cowork';
    name: string;
    prompt?: string;
    model?: string | null;
    intervalMinutes?: number;
  };
  activeProject: CoworkProject | null;
  rootPath?: string;
}): Promise<{ message: string; shouldReloadScheduledJobs: boolean }> {
  const result = await createEngineScheduleWithStatus({
    providerId: params.providerId,
    bridge: params.bridge,
    schedule: {
      kind: params.schedule.kind === 'cowork' ? 'cowork' : 'chat',
      name: `${params.schedule.name} copy`,
      prompt: params.schedule.prompt ?? '',
      intervalMinutes: params.schedule.intervalMinutes ?? 1,
      rootPath: params.schedule.kind === 'cowork' ? params.rootPath : undefined,
      model: params.schedule.model ?? null,
    },
    activeProject: params.activeProject,
  });
  return {
    ...result,
    message: result.shouldReloadScheduledJobs ? 'Duplicated internal schedule.' : result.message,
  };
}

export async function runEngineScheduleNowWithStatus(params: {
  bridge: InternalScheduleBridge | null | undefined;
  scheduleId: string;
}): Promise<{ message: string; shouldReloadScheduledJobs: boolean }> {
  try {
    if (!params.bridge?.runInternalPromptScheduleNow) {
      throw new Error('Run-now is available in the internal desktop runtime only.');
    }
    await params.bridge.runInternalPromptScheduleNow(params.scheduleId);
    return {
      message: 'Started internal schedule run.',
      shouldReloadScheduledJobs: true,
    };
  } catch (error) {
    return {
      message: error instanceof Error ? error.message : 'Unable to start internal schedule run.',
      shouldReloadScheduledJobs: false,
    };
  }
}

export function buildEngineScheduleExportDocument(jobs: ScheduledJob[]): string {
  const schedules: EngineScheduleTransferRecord[] = jobs.map((job) => ({
    kind: job.kind === 'cowork' ? 'cowork' : 'chat',
    name: job.name,
    prompt: job.prompt ?? '',
    intervalMinutes: job.intervalMinutes ?? 1,
    enabled: job.enabled,
    ...(job.model ? { model: job.model } : {}),
    ...(job.projectId ? { projectId: job.projectId } : {}),
    ...(job.projectTitle ? { projectTitle: job.projectTitle } : {}),
    ...(job.rootPath ? { rootPath: job.rootPath } : {}),
  }));
  return JSON.stringify({
    version: 1,
    exportedAt: new Date().toISOString(),
    schedules,
  }, null, 2);
}

export function parseEngineScheduleImportDocument(content: string): EngineScheduleTransferRecord[] {
  const parsed = JSON.parse(content) as { schedules?: unknown };
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.schedules)) {
    throw new Error('Schedule import file is invalid.');
  }
  return parsed.schedules.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') {
      return [];
    }
    const candidate = entry as Record<string, unknown>;
    const name = typeof candidate.name === 'string' ? candidate.name.trim() : '';
    const prompt = typeof candidate.prompt === 'string' ? candidate.prompt.trim() : '';
    if (!name || !prompt) {
      return [];
    }
    const intervalMinutes =
      Number.isFinite(candidate.intervalMinutes) && Number(candidate.intervalMinutes) >= 1
        ? Math.max(1, Math.round(Number(candidate.intervalMinutes)))
        : 1;
    return [{
      kind: candidate.kind === 'cowork' ? 'cowork' : 'chat',
      name,
      prompt,
      intervalMinutes,
      enabled: candidate.enabled !== false,
      ...(typeof candidate.model === 'string' && candidate.model.trim() ? { model: candidate.model.trim() } : {}),
      ...(typeof candidate.projectId === 'string' && candidate.projectId.trim() ? { projectId: candidate.projectId.trim() } : {}),
      ...(typeof candidate.projectTitle === 'string' && candidate.projectTitle.trim() ? { projectTitle: candidate.projectTitle.trim() } : {}),
      ...(typeof candidate.rootPath === 'string' && candidate.rootPath.trim() ? { rootPath: candidate.rootPath.trim() } : {}),
    }];
  });
}

export async function importEngineSchedulesWithStatus(params: {
  providerId: EngineProviderId;
  bridge: InternalScheduleBridge | null | undefined;
  schedules: EngineScheduleTransferRecord[];
  activeProject: CoworkProject | null;
}): Promise<{ message: string; shouldReloadScheduledJobs: boolean }> {
  if (!params.schedules.length) {
    return {
      message: 'No valid schedules found in the import file.',
      shouldReloadScheduledJobs: false,
    };
  }
  if (params.providerId !== 'internal' || !params.bridge?.createInternalPromptSchedule) {
    return {
      message: 'Schedule import is available in the internal desktop runtime only.',
      shouldReloadScheduledJobs: false,
    };
  }
  let imported = 0;
  for (const schedule of params.schedules) {
    const created = await params.bridge.createInternalPromptSchedule({
      kind: schedule.kind,
      prompt: schedule.prompt,
      name: schedule.name,
      intervalMinutes: schedule.intervalMinutes,
      projectId: schedule.kind === 'cowork' ? schedule.projectId ?? params.activeProject?.id ?? undefined : undefined,
      projectTitle: schedule.kind === 'cowork' ? schedule.projectTitle ?? params.activeProject?.name ?? undefined : undefined,
      rootPath: schedule.kind === 'cowork' ? schedule.rootPath?.trim() || undefined : undefined,
      model: schedule.model?.trim() || null,
    }) as ScheduledJob;
    if (!schedule.enabled && params.bridge.updateInternalPromptSchedule) {
      await params.bridge.updateInternalPromptSchedule(created.id, { enabled: false });
    }
    imported += 1;
  }
  return {
    message: `Imported ${imported} schedule${imported === 1 ? '' : 's'}.`,
    shouldReloadScheduledJobs: imported > 0,
  };
}
