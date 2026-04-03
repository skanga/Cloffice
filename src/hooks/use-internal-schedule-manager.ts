import { useCallback, useState, type MutableRefObject } from 'react';

import type {
  ChatMessage,
  CoworkProject,
  EngineProviderId,
  ScheduledJob,
} from '@/app-types';
import type { EngineDraftConfig } from '@/lib/engine-config';
import type { EngineClientInstance } from '@/lib/engine-client';
import type { DesktopBridge } from '@/lib/desktop-bridge';
import {
  buildEngineScheduleExportDocument,
  createEngineCoworkScheduleWithStatus,
  createEngineScheduleWithStatus,
  deleteEngineScheduleWithStatus,
  duplicateEngineScheduleWithStatus,
  importEngineSchedulesWithStatus,
  loadEngineScheduledJobsWithStatus,
  parseEngineScheduleImportDocument,
  runEngineScheduleNowWithStatus,
  updateEngineScheduleWithStatus,
} from '@/lib/engine-schedule-controller';
import { engineConnectOptionsFromDraft } from '@/lib/engine-config';
import {
  buildMissingCoworkPromptForScheduleStatus,
} from '@/lib/engine-runtime-status';
import { buildRuntimeClientUnavailableStatus } from '@/lib/engine-session-status';

type UseInternalScheduleManagerParams = {
  activeProject: CoworkProject | null;
  bridge: DesktopBridge | null | undefined;
  configReady: boolean;
  coworkDraftPrompt: string;
  coworkMessages: ChatMessage[];
  coworkModel: string;
  engineClientRef: MutableRefObject<EngineClientInstance | null>;
  getCurrentEngineDraft: () => EngineDraftConfig;
  onOpenScheduledPage: () => void;
  providerId: EngineProviderId;
  setStatus: (message: string) => void;
  workingFolderExplorerIdRef: MutableRefObject<string>;
};

function resolveScheduledJobIntervalMinutes(job: ScheduledJob): number {
  if (typeof job.intervalMinutes === 'number' && Number.isFinite(job.intervalMinutes)) {
    return Math.max(1, Math.round(job.intervalMinutes));
  }

  const legacyIntervalMatch = job.schedule.match(/every\s+(\d+)\s+minute/i);
  if (legacyIntervalMatch) {
    const parsedInterval = Number.parseInt(legacyIntervalMatch[1] ?? '', 10);
    if (Number.isFinite(parsedInterval)) {
      return Math.max(1, parsedInterval);
    }
  }

  return 1;
}

export function useInternalScheduleManager(params: UseInternalScheduleManagerParams) {
  const {
    activeProject,
    bridge,
    configReady,
    coworkDraftPrompt,
    coworkMessages,
    coworkModel,
    engineClientRef,
    getCurrentEngineDraft,
    onOpenScheduledPage,
    providerId,
    setStatus,
    workingFolderExplorerIdRef,
  } = params;
  const [scheduledJobs, setScheduledJobs] = useState<ScheduledJob[]>([]);
  const [scheduledLoading, setScheduledLoading] = useState(false);
  const [scheduleHistoryRetentionLimit, setScheduleHistoryRetentionLimit] = useState(6);

  const loadScheduledJobs = useCallback(async () => {
    if (!configReady) {
      return;
    }

    const client = engineClientRef.current;
    if (!client) {
      setStatus(buildRuntimeClientUnavailableStatus());
      return;
    }

    setScheduledLoading(true);
    try {
      const result = await loadEngineScheduledJobsWithStatus(
        client,
        engineConnectOptionsFromDraft(getCurrentEngineDraft()),
      );
      setScheduledJobs(result.jobs);
      if (bridge?.getInternalScheduleHistoryRetentionLimit && providerId === 'internal') {
        const nextLimit = await bridge.getInternalScheduleHistoryRetentionLimit();
        setScheduleHistoryRetentionLimit(nextLimit);
      }
      if (result.errorMessage) {
        setStatus(result.errorMessage);
      }
    } finally {
      setScheduledLoading(false);
    }
  }, [bridge, configReady, engineClientRef, getCurrentEngineDraft, providerId, setStatus]);

  const handleScheduleCoworkRun = useCallback(() => {
    const latestUserPrompt =
      [...coworkMessages].reverse().find((message) => message.role === 'user')?.text?.trim()
      || coworkDraftPrompt.trim();
    if (!latestUserPrompt) {
      setStatus(buildMissingCoworkPromptForScheduleStatus());
      return;
    }

    void createEngineCoworkScheduleWithStatus({
      providerId,
      bridge,
      prompt: latestUserPrompt,
      activeProject,
      explorerId: workingFolderExplorerIdRef.current,
      model: coworkModel,
    }).then((result) => {
      if (result.shouldOpenScheduledPage) {
        onOpenScheduledPage();
      }
      setStatus(result.message);
      if (result.shouldReloadScheduledJobs) {
        void loadScheduledJobs();
      }
    });
  }, [
    activeProject,
    bridge,
    coworkDraftPrompt,
    coworkMessages,
    coworkModel,
    loadScheduledJobs,
    onOpenScheduledPage,
    providerId,
    setStatus,
    workingFolderExplorerIdRef,
  ]);

  const handleUpdateInternalPromptSchedule = useCallback(async (
    scheduleId: string,
    payload: {
      enabled?: boolean;
      intervalMinutes?: number;
      name?: string;
      prompt?: string;
      model?: string | null;
      clearHistory?: boolean;
    },
  ) => {
    const result = await updateEngineScheduleWithStatus({
      bridge,
      scheduleId,
      payload,
    });
    if (result.shouldReloadScheduledJobs) {
      await loadScheduledJobs();
    }
    setStatus(result.message);
  }, [bridge, loadScheduledJobs, setStatus]);

  const handleDeleteInternalPromptSchedule = useCallback(async (scheduleId: string) => {
    const result = await deleteEngineScheduleWithStatus({
      bridge,
      scheduleId,
    });
    if (result.shouldReloadScheduledJobs) {
      await loadScheduledJobs();
    }
    setStatus(result.message);
  }, [bridge, loadScheduledJobs, setStatus]);

  const handleDuplicateInternalPromptSchedule = useCallback(async (job: ScheduledJob) => {
    const result = await duplicateEngineScheduleWithStatus({
      providerId,
      bridge,
      schedule: {
        kind: job.kind,
        name: job.name,
        prompt: job.prompt,
        model: job.model ?? null,
        intervalMinutes: resolveScheduledJobIntervalMinutes(job),
      },
      activeProject,
      explorerId: workingFolderExplorerIdRef.current,
    });
    if (result.shouldReloadScheduledJobs) {
      await loadScheduledJobs();
    }
    setStatus(result.message);
  }, [activeProject, bridge, loadScheduledJobs, providerId, setStatus, workingFolderExplorerIdRef]);

  const handleRunInternalPromptScheduleNow = useCallback(async (scheduleId: string) => {
    const result = await runEngineScheduleNowWithStatus({
      bridge,
      scheduleId,
    });
    if (result.shouldReloadScheduledJobs) {
      await loadScheduledJobs();
    }
    setStatus(result.message);
  }, [bridge, loadScheduledJobs, setStatus]);

  const handleBulkToggleInternalPromptSchedules = useCallback(async (scheduleIds: string[], enabled: boolean) => {
    for (const scheduleId of scheduleIds) {
      await updateEngineScheduleWithStatus({
        bridge,
        scheduleId,
        payload: { enabled },
      });
    }
    await loadScheduledJobs();
    setStatus(
      enabled
        ? `Resumed ${scheduleIds.length} internal schedule${scheduleIds.length === 1 ? '' : 's'}.`
        : `Paused ${scheduleIds.length} internal schedule${scheduleIds.length === 1 ? '' : 's'}.`,
    );
  }, [bridge, loadScheduledJobs, setStatus]);

  const handleBulkDuplicateInternalPromptSchedules = useCallback(async (jobs: ScheduledJob[]) => {
    for (const job of jobs) {
      await duplicateEngineScheduleWithStatus({
        providerId,
        bridge,
        schedule: {
          kind: job.kind,
          name: job.name,
          prompt: job.prompt,
          model: job.model ?? null,
          intervalMinutes: job.intervalMinutes,
        },
        activeProject,
        explorerId: workingFolderExplorerIdRef.current,
      });
    }
    await loadScheduledJobs();
    setStatus(`Duplicated ${jobs.length} internal schedule${jobs.length === 1 ? '' : 's'}.`);
  }, [activeProject, bridge, loadScheduledJobs, providerId, setStatus, workingFolderExplorerIdRef]);

  const handleBulkRunInternalPromptSchedulesNow = useCallback(async (scheduleIds: string[]) => {
    for (const scheduleId of scheduleIds) {
      await runEngineScheduleNowWithStatus({
        bridge,
        scheduleId,
      });
    }
    await loadScheduledJobs();
    setStatus(`Started ${scheduleIds.length} internal schedule${scheduleIds.length === 1 ? '' : 's'}.`);
  }, [bridge, loadScheduledJobs, setStatus]);

  const handleBulkClearInternalPromptScheduleHistory = useCallback(async (scheduleIds: string[]) => {
    for (const scheduleId of scheduleIds) {
      await updateEngineScheduleWithStatus({
        bridge,
        scheduleId,
        payload: { clearHistory: true },
      });
    }
    await loadScheduledJobs();
    setStatus(`Cleared history for ${scheduleIds.length} internal schedule${scheduleIds.length === 1 ? '' : 's'}.`);
  }, [bridge, loadScheduledJobs, setStatus]);

  const handleSetInternalScheduleHistoryRetentionLimit = useCallback(async (limit: number) => {
    if (!bridge?.setInternalScheduleHistoryRetentionLimit) {
      setStatus(buildRuntimeClientUnavailableStatus());
      return;
    }
    const nextLimit = await bridge.setInternalScheduleHistoryRetentionLimit(limit);
    setScheduleHistoryRetentionLimit(nextLimit);
    await loadScheduledJobs();
    setStatus(`Keeping the most recent ${nextLimit} schedule history entr${nextLimit === 1 ? 'y' : 'ies'} per schedule.`);
  }, [bridge, loadScheduledJobs, setStatus]);

  const handleBulkDeleteInternalPromptSchedules = useCallback(async (scheduleIds: string[]) => {
    for (const scheduleId of scheduleIds) {
      await deleteEngineScheduleWithStatus({
        bridge,
        scheduleId,
      });
    }
    await loadScheduledJobs();
    setStatus(`Deleted ${scheduleIds.length} internal schedule${scheduleIds.length === 1 ? '' : 's'}.`);
  }, [bridge, loadScheduledJobs, setStatus]);

  const handleExportInternalPromptSchedules = useCallback(async (jobs: ScheduledJob[]) => {
    const documentText = buildEngineScheduleExportDocument(jobs);
    const blob = new Blob([documentText], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `cloffice-schedules-${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setStatus(`Exported ${jobs.length} schedule${jobs.length === 1 ? '' : 's'}.`);
  }, [setStatus]);

  const handleExportCurrentInternalPromptSchedules = useCallback(async () => {
    const client = engineClientRef.current;
    if (!client) {
      setStatus(buildRuntimeClientUnavailableStatus());
      return;
    }
    const result = await loadEngineScheduledJobsWithStatus(
      client,
      engineConnectOptionsFromDraft(getCurrentEngineDraft()),
    );
    if (result.errorMessage) {
      setStatus(result.errorMessage);
      return;
    }
    await handleExportInternalPromptSchedules(result.jobs);
  }, [engineClientRef, getCurrentEngineDraft, handleExportInternalPromptSchedules, setStatus]);

  const handleImportInternalPromptSchedules = useCallback(async (content: string) => {
    let schedules;
    try {
      schedules = parseEngineScheduleImportDocument(content);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Unable to import schedules.');
      return;
    }
    const result = await importEngineSchedulesWithStatus({
      providerId,
      bridge,
      schedules,
      activeProject,
      explorerId: workingFolderExplorerIdRef.current,
    });
    if (result.shouldReloadScheduledJobs) {
      await loadScheduledJobs();
    }
    setStatus(result.message);
  }, [activeProject, bridge, loadScheduledJobs, providerId, setStatus, workingFolderExplorerIdRef]);

  const handleCreateInternalPromptSchedule = useCallback(async (payload: {
    kind: 'chat' | 'cowork';
    prompt: string;
    name?: string;
    intervalMinutes?: number;
    model?: string | null;
  }) => {
    const result = await createEngineScheduleWithStatus({
      providerId,
      bridge,
      schedule: {
        ...payload,
        explorerId: payload.kind === 'cowork' ? workingFolderExplorerIdRef.current : undefined,
      },
      activeProject,
    });
    if (result.shouldReloadScheduledJobs) {
      await loadScheduledJobs();
    }
    setStatus(result.message);
  }, [activeProject, bridge, loadScheduledJobs, providerId, setStatus, workingFolderExplorerIdRef]);

  return {
    handleBulkClearInternalPromptScheduleHistory,
    handleBulkDeleteInternalPromptSchedules,
    handleBulkDuplicateInternalPromptSchedules,
    handleBulkRunInternalPromptSchedulesNow,
    handleBulkToggleInternalPromptSchedules,
    handleCreateInternalPromptSchedule,
    handleDeleteInternalPromptSchedule,
    handleDuplicateInternalPromptSchedule,
    handleExportCurrentInternalPromptSchedules,
    handleExportInternalPromptSchedules,
    handleImportInternalPromptSchedules,
    handleRunInternalPromptScheduleNow,
    handleScheduleCoworkRun,
    handleSetInternalScheduleHistoryRetentionLimit,
    handleUpdateInternalPromptSchedule,
    loadScheduledJobs,
    scheduleHistoryRetentionLimit,
    scheduledJobs,
    scheduledLoading,
  };
}
