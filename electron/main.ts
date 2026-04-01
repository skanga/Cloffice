import { app, BrowserWindow, dialog, ipcMain, Menu, Notification, safeStorage, session, shell } from 'electron';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import crypto from 'node:crypto';

const execAsync = promisify(exec);
import type {
  AppConfig,
  HealthCheckResult,
  LocalActionReceipt,
  LocalFileApplyResult,
  LocalFileAppendResult,
  LocalFileCreateResult,
  LocalFileDeleteResult,
  LocalFileExistsResult,
  LocalFileListResult,
  LocalFilePlanAction,
  LocalFilePlanResult,
  LocalFileReadResult,
  LocalFileRenameResult,
  LocalFileStatResult,
} from '../src/app-types.js';
import { describeInternalEngineShell } from '../src/lib/internal-engine-placeholder.js';
import type { EngineChatMessage, EngineConnectOptions, EngineCronJob, EngineModelChoice, EngineSessionSummary } from '../src/lib/engine-runtime-types.js';
import { EMPTY_INTERNAL_PROVIDER_CONFIG, parseStoredEngineConfig, type InternalProviderConfig } from '../src/lib/engine-config.js';
import type {
  InternalEngineCoworkContinuationRequest,
  InternalEngineCoworkNormalizationProbeResult,
  InternalEngineCoworkPromptProbeResult,
  InternalEngineRuntimeInfo,
  InternalEnginePendingApprovalDecision,
  InternalEnginePendingApprovalDecisionResult,
  InternalEngineRunRecord,
  InternalEngineSendChatResult,
} from '../src/lib/internal-engine-bridge.js';
import type { ChatActivityItem, EngineRequestedAction } from '../src/app-types.js';
import {
  applyInternalApprovalRecoveryDecision,
  buildInternalApprovalRecoveryFlow,
  type InternalApprovalRecoveryFlow,
} from '../src/lib/internal-approval-recovery.js';
import {
  createPendingEngineApprovalAction,
  type EngineApprovalLoopContext,
} from '../src/lib/engine-approval-orchestrator.js';
import {
  buildInternalEngineActionInstruction,
  parseEngineActivityItems,
  parseEngineRequestedActions,
  stripEngineActionPayloadFromText,
} from '../src/lib/engine-action-protocol.js';
import {
  buildInternalProviderCatalog,
  isProviderBackedInternalModel,
  sendInternalProviderChat,
  testInternalProviderConnection,
  type InternalChatProviderId,
  type InternalProviderConnectionTestResult,
  type InternalProviderStatus,
} from '../src/lib/internal-provider-adapter.js';

const defaultConfig: AppConfig = {
  gatewayUrl: 'internal://dev-runtime',
  gatewayToken: '',
};

const CLOFFICE_CONFIG_FILE = 'cloffice-config.json';
const LEGACY_ENGINE_CONFIG_FILE = 'openclaw-config.json';
const PROVIDER_SECRETS_FILE = 'cloffice-provider-secrets.json';

type StoredInternalProviderSecrets = Pick<InternalProviderConfig, 'openaiApiKey' | 'anthropicApiKey' | 'geminiApiKey'>;
type StoredProviderSecretsEnvelope = {
  version: 1;
  mode: 'safeStorage' | 'plaintext-fallback';
  payload: string;
};

const EMPTY_INTERNAL_PROVIDER_SECRETS: StoredInternalProviderSecrets = {
  openaiApiKey: '',
  anthropicApiKey: '',
  geminiApiKey: '',
};

function createInternalEngineMainService() {
  const developerEnabled = !app.isPackaged || process.env.CLOFFICE_ENABLE_INTERNAL_ENGINE === '1';
  const describedShell = describeInternalEngineShell();
  const shellStatus = {
    ...describedShell,
    capabilities: {
      ...describedShell.capabilities,
      connection: developerEnabled,
      sessions: developerEnabled,
      models: developerEnabled,
    },
    availableInBuild: developerEnabled,
    unavailableReason: developerEnabled ? 'Internal engine development path active.' : describedShell.unavailableReason,
  };
  let connected = false;
  const runtimeHome = path.join(app.getPath('userData'), 'internal-engine');
  const serviceName = 'cloffice-internal-engine-shell';
  const defaultModel = 'internal/dev-echo';
  const modelBehaviors: Record<string, {
    label: string;
    historyLimit: number;
    titlePrefix: string;
    bootstrapMessage: string | null;
  }> = {
    'internal/dev-echo': {
      label: 'Internal Dev Echo',
      historyLimit: 80,
      titlePrefix: 'Chat',
      bootstrapMessage: null,
    },
    'internal/dev-brief': {
      label: 'Internal Dev Brief',
      historyLimit: 24,
      titlePrefix: 'Brief',
      bootstrapMessage: 'Brief mode active. Prefer short summaries and concise answers.',
    },
    'internal/dev-planner': {
      label: 'Internal Dev Planner',
      historyLimit: 120,
      titlePrefix: 'Plan',
      bootstrapMessage: 'Planner mode active. Prefer structured plans and explicit next steps.',
    },
  };
  const devModelChoices: EngineModelChoice[] = Object.entries(modelBehaviors).map(([value, behavior]) => ({
    value,
    label: behavior.label,
  }));
  const mainSessionKey = 'internal:main';
  const maxSessionHistory = 80;
  const runtimePersistenceSchemaVersion = 2;
  const defaultRunHistoryRetentionLimit = 120;
  const defaultArtifactHistoryRetentionLimit = 200;
  let activeSessionKey: string | null = null;
  const sessions = new Map<string, {
    key: string;
    kind: string;
    title?: string;
    model: string | null;
    messages: EngineChatMessage[];
    updatedAt: number;
  }>();
  type PersistedInternalEngineSession = {
    key: string;
    kind: string;
    title?: string;
    model: string | null;
    messages: EngineChatMessage[];
    updatedAt: number;
  };
  type PersistedInternalEngineState = {
    version: 1 | 2;
    activeSessionKey: string | null;
    cleanShutdown: boolean;
    lastPersistedAt: number;
    runHistoryRetentionLimit?: number;
    artifactHistoryRetentionLimit?: number;
    sessions: PersistedInternalEngineSession[];
  };
  type PersistedInternalRunStatus =
    | 'running'
    | 'awaiting_approval'
    | 'executing'
    | 'completed'
    | 'blocked'
    | 'interrupted';
  type PersistedInternalRunTimelinePhase =
    | 'submitted'
    | 'awaiting_approval'
    | 'approval_decision'
    | 'executing'
    | 'completed'
    | 'blocked'
    | 'interrupted';
  type PersistedInternalRunTimelineActionRef = {
    actionId: string;
    actionType: EngineRequestedAction['type'];
    path: string;
  };
  type PersistedInternalRunTimelineDecisionRef = {
    approved: boolean;
    reason?: string;
  };
  type PersistedInternalRunTimelineReceiptRef = {
    status: LocalActionReceipt['status'];
    message?: string;
    errorCode?: string;
  };
  type PersistedInternalRunTimelineEntry = {
    id: string;
    at: number;
    phase: PersistedInternalRunTimelinePhase;
    message: string;
    details?: string;
    action?: PersistedInternalRunTimelineActionRef;
    decision?: PersistedInternalRunTimelineDecisionRef;
    receipt?: PersistedInternalRunTimelineReceiptRef;
  };
  type PersistedInternalRunRecord = {
    runId: string;
    scheduleId?: string;
    scheduleName?: string;
    sessionKey: string;
    sessionKind: string;
    model: string;
    providerBacked?: boolean;
    providerPhase?: 'chat' | 'planning' | 'continuation';
    responseSchemaVersion?: number;
    responseNormalization?: 'provider_structured' | 'normalized_sections' | 'synthetic_fallback';
    actionMode: 'none' | 'read-only';
    status: PersistedInternalRunStatus;
    startedAt: number;
    updatedAt: number;
    promptPreview?: string;
    summary?: string;
    interruptedReason?: string;
    artifactId?: string;
    approvedActionCount?: number;
    rejectedActionCount?: number;
    resultSummary?: string;
    timeline?: PersistedInternalRunTimelineEntry[];
  };
  type PersistedInternalRunResponseNormalization =
    NonNullable<PersistedInternalRunRecord['responseNormalization']>;
  type PersistedInternalRunJournal = {
    version: 1;
    runs: PersistedInternalRunRecord[];
  };
  type PersistedInternalArtifactRecord = {
    id: string;
    runId: string;
    sessionKey: string;
    kind: 'cowork_execution';
    createdAt: number;
    receiptCount: number;
    receipts: LocalActionReceipt[];
    previews: string[];
    errors: string[];
    summary?: string;
  };
  type PersistedInternalArtifactJournal = {
    version: 1;
    artifacts: PersistedInternalArtifactRecord[];
  };
  type PersistedInternalPendingApprovalJournal = {
    version: 1;
    flows: InternalApprovalRecoveryFlow[];
  };
  type PersistedInternalScheduleRecord = {
    id: string;
    kind: 'chat' | 'cowork';
    name: string;
    prompt: string;
    schedule: string;
    intervalMinutes: number;
    enabled: boolean;
    state: string;
    nextRunAt: string | null;
    lastRunAt: string | null;
    totalRunCount?: number;
    completedRunCount?: number;
    blockedRunCount?: number;
    approvalWaitCount?: number;
    recentRunHistory?: Array<{
      runId?: string;
      status: string;
      at: string;
      summary?: string;
    }>;
    lastRunId?: string;
    lastRunStatus?: string;
    lastRunSummary?: string;
    lastArtifactSummary?: string;
    lastArtifactReceiptCount?: number;
    lastArtifactErrorCount?: number;
    lastArtifactPreviews?: string[];
    lastArtifactErrors?: string[];
    projectId?: string;
    projectTitle?: string;
    rootPath?: string;
    model?: string;
    lastError?: string;
  };
  type PersistedInternalScheduleJournal = {
    version: 1;
    historyRetentionLimit?: number;
    schedules: PersistedInternalScheduleRecord[];
  };
  const stateFilePath = path.join(runtimeHome, 'state.v1.json');
  const runJournalFilePath = path.join(runtimeHome, 'runs.v1.json');
  const artifactJournalFilePath = path.join(runtimeHome, 'artifacts.v1.json');
  const pendingApprovalJournalFilePath = path.join(runtimeHome, 'pending-approvals.v1.json');
  const scheduleJournalFilePath = path.join(runtimeHome, 'schedules.v1.json');
  let stateLoaded = false;
  let stateWriteChain: Promise<void> = Promise.resolve();
  let stateRestoreStatus: 'fresh' | 'restored' | 'recovered_after_interruption' | 'load_failed' = 'fresh';
  let lastRecoveryNote: string | null = null;
  let interruptedRunCount = 0;
  let storedInternalProviderConfig: InternalProviderConfig = { ...EMPTY_INTERNAL_PROVIDER_CONFIG };
  let providerStatuses: InternalProviderStatus[] = [];
  let providerModelChoices: EngineModelChoice[] = [];
  let lastProviderId: InternalChatProviderId | null = null;
  let lastProviderError: string | null = null;
  const runs = new Map<string, PersistedInternalRunRecord>();
  let artifacts: PersistedInternalArtifactRecord[] = [];
  let pendingApprovalFlows: InternalApprovalRecoveryFlow[] = [];
  let schedules: PersistedInternalScheduleRecord[] = [];
  let runHistoryRetentionLimit = defaultRunHistoryRetentionLimit;
  let artifactHistoryRetentionLimit = defaultArtifactHistoryRetentionLimit;
  let scheduleHistoryRetentionLimit = 6;
  let schedulerTimer: NodeJS.Timeout | null = null;
  const runningScheduleIds = new Set<string>();
  let lastScheduledJobName: string | null = null;
  let lastScheduleError: string | null = null;
  const isReadOnlyInternalAction = (action: EngineRequestedAction) => (
    action.type === 'list_dir'
    || action.type === 'read_file'
    || action.type === 'exists'
    || action.type === 'stat'
  );

  const unavailable = () => new Error(shellStatus.unavailableReason);
  const requireConnected = () => {
    if (!shellStatus.availableInBuild) {
      throw unavailable();
    }
    if (!connected) {
      throw new Error('Internal engine development runtime is not connected.');
    }
  };
  const now = () => Date.now();
  const normalizeRetentionLimit = (value: unknown, fallback: number) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return fallback;
    }
    const normalized = Math.floor(value);
    if (normalized < 1) {
      return fallback;
    }
    return Math.min(normalized, 1000);
  };
  const buildRuntimeRetentionPolicy = () => ({
    schemaVersion: runtimePersistenceSchemaVersion,
    runHistoryRetentionLimit,
    artifactHistoryRetentionLimit,
  });
  const pruneRunJournal = () => {
    const orderedRuns = [...runs.values()].sort((left, right) => left.updatedAt - right.updatedAt);
    const protectedRunIds = new Set(
      orderedRuns
        .filter((run) => run.status === 'running' || run.status === 'awaiting_approval' || run.status === 'executing')
        .map((run) => run.runId),
    );
    const completedRuns = orderedRuns.filter((run) => !protectedRunIds.has(run.runId));
    const retainedCompletedRunIds = new Set(completedRuns.slice(-runHistoryRetentionLimit).map((run) => run.runId));
    const retainedRunIds = new Set([...protectedRunIds, ...retainedCompletedRunIds]);
    for (const runId of [...runs.keys()]) {
      if (!retainedRunIds.has(runId)) {
        runs.delete(runId);
      }
    }
  };
  const pruneArtifactJournal = () => {
    artifacts = [...artifacts]
      .sort((left, right) => left.createdAt - right.createdAt)
      .slice(-artifactHistoryRetentionLimit);
  };
  const enforceRuntimeRetention = () => {
    pruneRunJournal();
    pruneArtifactJournal();
  };
  const refreshProviderCatalog = () => {
    const catalog = buildInternalProviderCatalog(storedInternalProviderConfig);
    providerStatuses = catalog.statuses;
    providerModelChoices = catalog.models.map((model) => ({
      value: model.value,
      label: model.label,
    }));
  };
  const refreshProviderCatalogFromConfig = async () => {
    storedInternalProviderConfig = await readStoredInternalProviderConfig();
    refreshProviderCatalog();
  };
  const listAvailableModels = () => [...devModelChoices, ...providerModelChoices];
  const resolveDefaultModel = () => providerModelChoices[0]?.value ?? defaultModel;
  const resolveCoworkDefaultModel = () => providerModelChoices[0]?.value ?? 'internal/dev-planner';
  const isKnownModel = (value: string | null | undefined) => (
    typeof value === 'string' && listAvailableModels().some((model) => model.value === value)
  );
  const resolveModelValue = (value: string | null | undefined): string => {
    if (typeof value === 'string' && isKnownModel(value)) {
      return value;
    }
    return resolveDefaultModel();
  };
  const getModelBehavior = (value: string | null | undefined) => {
    const resolvedValue = resolveModelValue(value);
    return modelBehaviors[resolvedValue] ?? {
      label: resolvedValue,
      historyLimit: 60,
      titlePrefix: 'Chat',
      bootstrapMessage: null,
    };
  };
  const normalizeSessionTitle = (title: string) => {
    const compact = title.replace(/\s+/g, ' ').trim();
    return compact.length > 48 ? `${compact.slice(0, 45).trimEnd()}...` : compact;
  };
  const inferSessionTitle = (sessionKey: string, text: string, model: string) => {
    if (sessionKey === mainSessionKey) {
      return 'Main chat';
    }
    const behavior = getModelBehavior(model);
    const normalized = normalizeSessionTitle(text);
    if (sessionKey.startsWith('internal:cowork:')) {
      return normalized ? `Task: ${normalized}` : 'Task session';
    }
    return normalized ? `${behavior.titlePrefix}: ${normalized}` : `${behavior.titlePrefix} session`;
  };
  const formatPlannerResponse = (text: string) => {
    const normalized = text.replace(/\s+/g, ' ').trim() || 'the current request';
    return [
      'Internal planner response.',
      '',
      `Goal: ${normalized}`,
      '',
      '1. Clarify the immediate objective and required output.',
      '2. Isolate the smallest runnable change that advances the objective.',
      '3. Identify the next validation or integration step after the change lands.',
    ].join('\n');
  };
  const buildCoworkFoundationActions = (text: string): EngineRequestedAction[] => {
    const normalized = text.replace(/\s+/g, ' ').trim() || 'the current cowork task';
    const wantsMetadata = /\b(metadata|details|timestamps?|size|stat)\b/i.test(normalized);
    return [
      {
        id: 'inspect-project',
        type: 'list_dir',
        path: '.',
      },
      ...(wantsMetadata
        ? [{
            id: 'inspect-root-metadata',
            type: 'stat' as const,
            path: '.',
          }]
        : []),
    ];
  };
  const formatCoworkFoundationResponse = (text: string, sessionKey: string, actions: EngineRequestedAction[]) => {
    const normalized = text.replace(/\s+/g, ' ').trim() || 'the current cowork task';
    const proposedActions = {
      engine_actions: actions,
    };
    return [
      'Internal cowork foundation response.',
      '',
      `Task session: ${sessionKey}`,
      `Task: ${normalized}`,
      '',
      'Planned steps:',
      '1. Restate the task and confirm the intended output.',
      '2. Break the task into a small execution plan.',
      '3. Identify which engine actions would be needed once the internal action runner exists.',
      '',
      'Current limitation: internal cowork foundations only emit safe read-only inspection and metadata actions in this phase.',
      '```json',
      JSON.stringify(proposedActions, null, 2),
      '```',
    ].join('\n');
  };
  const buildCoworkFoundationActivityItems = (actions: EngineRequestedAction[]): ChatActivityItem[] => [
    {
      id: 'internal-cowork-approval',
      label: 'Internal cowork requested approval for read-only project inspection.',
      details: 'The internal engine is requesting a scoped directory listing before attempting deeper task execution.',
      tone: 'neutral',
    },
    ...(actions.some((action) => action.type === 'stat')
      ? [{
          id: 'internal-cowork-metadata',
          label: 'Internal cowork also requested read-only metadata inspection.',
          details: 'The internal engine wants a stat check for the project root before refining the next step.',
          tone: 'neutral' as const,
        }]
      : []),
  ];
  const sanitizeCoworkReadOnlyActions = (
    actions: EngineRequestedAction[],
    options?: { exclude?: Set<string> },
  ): EngineRequestedAction[] => {
    const seen = new Set<string>();
    return actions.filter(isReadOnlyInternalAction).filter((action) => {
      const identity = `${action.type}:${action.path}`;
      if (options?.exclude?.has(identity)) {
        return false;
      }
      if (seen.has(identity)) {
        return false;
      }
      seen.add(identity);
      return true;
    });
  };
  const parseCoworkStructuredSections = (
    text: string,
    allowed: readonly string[],
  ): Partial<Record<string, string>> => {
    const sectionMap = new Map(allowed.map((name) => [name.toLowerCase(), name]));
    const normalized = stripEngineActionPayloadFromText(text).replace(/\r/g, '').trim();
    if (!normalized) {
      return {};
    }
    const lines = normalized.split('\n');
    const sections = new Map<string, string[]>();
    let currentKey: string | null = null;
    for (const rawLine of lines) {
      const line = rawLine.trimEnd();
      const headingMatch = line.match(/^(?:\d+\.\s*)?([A-Za-z][A-Za-z ]*[A-Za-z])\s*:?\s*(.*)$/);
      const sectionKey = headingMatch ? sectionMap.get(headingMatch[1].trim().toLowerCase()) : null;
      if (sectionKey) {
        currentKey = sectionKey;
        const existing = sections.get(sectionKey) ?? [];
        const inlineValue = headingMatch?.[2]?.trim();
        if (inlineValue) {
          existing.push(inlineValue);
        }
        sections.set(sectionKey, existing);
        continue;
      }
      if (!currentKey) {
        continue;
      }
      const existing = sections.get(currentKey) ?? [];
      existing.push(line);
      sections.set(currentKey, existing);
    }
    return Object.fromEntries(
      Array.from(sections.entries())
        .map(([key, value]) => [key, value.join('\n').trim()])
        .filter(([, value]) => value.length > 0),
    );
  };
  const parseCoworkMarkdownSections = (
    text: string,
    allowed: readonly string[],
  ): Partial<Record<string, string>> => {
    const sectionMap = new Map(allowed.map((name) => [name.toLowerCase(), name]));
    const normalized = stripEngineActionPayloadFromText(text).replace(/\r/g, '').trim();
    if (!normalized) {
      return {};
    }
    const lines = normalized.split('\n');
    const sections = new Map<string, string[]>();
    let currentKey: string | null = null;
    for (const rawLine of lines) {
      const line = rawLine.trimEnd();
      const plainLine = line
        .replace(/^\s*[-*]\s*/, '')
        .replace(/^#{1,6}\s*/, '')
        .replace(/^\*\*([^*]+)\*\*:?\s*/, '$1: ')
        .replace(/^__([^_]+)__:?\s*/, '$1: ')
        .trim();
      const headingMatch = plainLine.match(/^(?:\d+\.\s*)?([A-Za-z][A-Za-z ]*[A-Za-z])\s*:?\s*(.*)$/);
      const sectionKey = headingMatch ? sectionMap.get(headingMatch[1].trim().toLowerCase()) : null;
      if (sectionKey) {
        currentKey = sectionKey;
        const existing = sections.get(sectionKey) ?? [];
        const inlineValue = headingMatch?.[2]?.trim();
        if (inlineValue) {
          existing.push(inlineValue);
        }
        sections.set(sectionKey, existing);
        continue;
      }
      if (!currentKey) {
        continue;
      }
      const existing = sections.get(currentKey) ?? [];
      existing.push(line);
      sections.set(currentKey, existing);
    }
    return Object.fromEntries(
      Array.from(sections.entries())
        .map(([key, value]) => [key, value.join('\n').trim()])
        .filter(([, value]) => value.length > 0),
    );
  };
  const inferCoworkStructuredSections = (
    text: string,
    allowed: readonly string[],
  ): Partial<Record<string, string>> => {
    const normalized = stripEngineActionPayloadFromText(text).replace(/\r/g, '').trim();
    if (!normalized) {
      return {};
    }
    const paragraphs = normalized
      .split(/\n\s*\n/)
      .map((part) => part.trim())
      .filter((part) => part.length > 0);
    if (paragraphs.length === 0) {
      return {};
    }

    if (
      allowed.length === 4
      && allowed.includes('Goal')
      && allowed.includes('Plan')
      && allowed.includes('Needed context')
      && allowed.includes('Next step')
    ) {
      const [goal, plan, neededContext, nextStep] = paragraphs;
      return {
        ...(goal ? { Goal: goal } : {}),
        ...(plan ? { Plan: plan } : {}),
        ...(neededContext ? { 'Needed context': neededContext } : {}),
        ...(nextStep ? { 'Next step': nextStep } : {}),
      };
    }

    if (
      allowed.length === 3
      && allowed.includes('Findings')
      && allowed.includes('Recommendation')
      && allowed.includes('Next step')
    ) {
      const [findings, recommendation, nextStep] = paragraphs;
      return {
        ...(findings ? { Findings: findings } : {}),
        ...(recommendation ? { Recommendation: recommendation } : {}),
        ...(nextStep ? { 'Next step': nextStep } : {}),
      };
    }

    return {};
  };
  const resolveCoworkStructuredSections = (
    text: string,
    allowed: readonly string[],
  ): { sections: Partial<Record<string, string>>; matchedHeadings: number } => {
    const plainSections = parseCoworkStructuredSections(text, allowed);
    const markdownSections = parseCoworkMarkdownSections(text, allowed);
    const inferredSections = inferCoworkStructuredSections(text, allowed);
    const mergedSections = {
      ...inferredSections,
      ...markdownSections,
      ...plainSections,
    };
    return {
      sections: mergedSections,
      matchedHeadings: Math.max(Object.keys(plainSections).length, Object.keys(markdownSections).length),
    };
  };
  const formatCoworkActionList = (actions: EngineRequestedAction[]) =>
    actions.length > 0
      ? actions.map((action) => `- ${action.type} ${action.path}`).join('\n')
      : 'None.';
  const formatCoworkReceiptSummary = (receipts: LocalActionReceipt[]) =>
    receipts.length > 0
      ? receipts.map((receipt) => [
          `- ${receipt.type} ${receipt.path}`,
          `  status: ${receipt.status}`,
          ...(receipt.message ? [`  message: ${receipt.message}`] : []),
          ...(receipt.errorCode ? [`  error_code: ${receipt.errorCode}`] : []),
        ].join('\n')).join('\n')
      : 'None.';
  const normalizeProviderBackedCoworkPlanningText = (params: {
    task: string;
    rawText: string;
    requestedActions: EngineRequestedAction[];
  }): { text: string; normalization: PersistedInternalRunResponseNormalization } => {
    const { sections, matchedHeadings } = resolveCoworkStructuredSections(params.rawText, ['Goal', 'Plan', 'Needed context', 'Next step']);
    const normalizedTask = params.task.replace(/\s+/g, ' ').trim() || 'the current cowork task';
    const normalization: PersistedInternalRunResponseNormalization =
      sections['Goal'] && sections['Plan'] && sections['Needed context'] && sections['Next step']
        ? 'provider_structured'
        : matchedHeadings > 0 || Object.keys(sections).length > 1
          ? 'normalized_sections'
          : 'synthetic_fallback';
    const neededContextFallback =
      params.requestedActions.length > 0
        ? `Additional context requested via read-only actions:\n${formatCoworkActionList(params.requestedActions)}`
        : 'No additional context needed before the next implementation step.';
    const nextStepFallback =
      params.requestedActions.length > 0
        ? 'Review the approved read-only results, then refine the implementation recommendation.'
        : 'Proceed with the smallest implementation or refactor step supported by the current context.';
    return {
      text: [
        'Goal:',
        sections['Goal'] || normalizedTask,
        '',
        'Plan:',
        sections['Plan'] || 'Break the task into the smallest defensible implementation step, then validate the expected impact.',
        '',
        'Needed context:',
        sections['Needed context'] || neededContextFallback,
        '',
        'Next step:',
        sections['Next step'] || nextStepFallback,
      ].join('\n'),
      normalization,
    };
  };
  const normalizeProviderBackedCoworkContinuationText = (params: {
    rawText: string;
    execution: {
      receipts: LocalActionReceipt[];
      previews: string[];
      errors: string[];
    };
    requestedActions: EngineRequestedAction[];
  }): { text: string; normalization: PersistedInternalRunResponseNormalization } => {
    const { sections, matchedHeadings } = resolveCoworkStructuredSections(params.rawText, ['Findings', 'Recommendation', 'Next step']);
    const normalization: PersistedInternalRunResponseNormalization =
      sections['Findings'] && sections['Recommendation'] && sections['Next step']
        ? 'provider_structured'
        : matchedHeadings > 0 || Object.keys(sections).length > 1
          ? 'normalized_sections'
          : 'synthetic_fallback';
    const findingsFallback =
      params.execution.previews.length > 0
        ? params.execution.previews.join('\n\n')
        : params.execution.errors.length > 0
          ? params.execution.errors.map((error) => `- ${error}`).join('\n')
          : 'No new execution results were recorded.';
    const recommendationFallback =
      params.execution.errors.length > 0
        ? 'Address the blocking read-only result or narrow the request before proceeding.'
        : 'Use the inspected workspace context to choose the next smallest implementation step.';
    const nextStepFallback =
      params.requestedActions.length > 0
        ? `Approve any newly requested read-only actions if more context is still required:\n${formatCoworkActionList(params.requestedActions)}`
        : 'Proceed with the next implementation or review step based on the findings above.';
    return {
      text: [
        'Findings:',
        sections['Findings'] || findingsFallback,
        '',
        'Recommendation:',
        sections['Recommendation'] || recommendationFallback,
        '',
        'Next step:',
        sections['Next step'] || nextStepFallback,
      ].join('\n'),
      normalization,
    };
  };
  const resolveProviderIdForModel = (modelValue: string | null | undefined): InternalChatProviderId | null => {
    const normalized = typeof modelValue === 'string' ? modelValue.trim() : '';
    if (normalized.startsWith('openai/')) return 'openai';
    if (normalized.startsWith('anthropic/')) return 'anthropic';
    if (normalized.startsWith('gemini/')) return 'gemini';
    return null;
  };
  const buildProviderSpecificCoworkPromptHints = (
    providerId: InternalChatProviderId | null,
    phase: 'planning' | 'continuation',
  ): string[] => {
    if (providerId === 'openai') {
      return phase === 'planning'
        ? [
            'OpenAI-compatible hint: start directly with Goal: and keep all four labels exact.',
            'Use bullets only inside Plan. Keep Goal, Needed context, and Next step as short prose.',
          ]
        : [
            'OpenAI-compatible hint: start directly with Findings: and keep all three labels exact.',
            'Use bullets only inside Findings when summarizing multiple results.',
          ];
    }

    if (providerId === 'anthropic') {
      return phase === 'planning'
        ? [
            'Anthropic hint: do not add a preamble like "Here is the plan". Start immediately with Goal:.',
            'Keep one compact paragraph per section and avoid repeating the label text in the body.',
          ]
        : [
            'Anthropic hint: do not add preambles or closing summaries. Start immediately with Findings:.',
            'Keep Recommendation and Next step to one concise paragraph each.',
          ];
    }

    if (providerId === 'gemini') {
      return phase === 'planning'
        ? [
            'Gemini hint: avoid markdown variants. Use the exact plain-text labels Goal:, Plan:, Needed context:, Next step:.',
            'If you use bullets, place them only under Plan and keep Next step to a single sentence.',
          ]
        : [
            'Gemini hint: avoid markdown variants. Use the exact plain-text labels Findings:, Recommendation:, Next step:.',
            'Keep Recommendation and Next step to a single sentence each unless the execution errors require more detail.',
          ];
    }

    return [];
  };
  const buildProviderBackedCoworkPlanningPrompt = (taskAndContext: string, modelValue: string | null | undefined) => [
    'You are Cloffice Cowork operating in a guarded read-only planning phase.',
    'Respond with concise prose, not filler.',
    'Use plain text only. Do not use markdown headings, bold formatting, tables, or fenced code blocks.',
    'Use this structure in order:',
    'Goal: <one short paragraph>',
    'Plan: <2-4 short bullets or sentences>',
    'Needed context: <say "None." if no more context is needed>',
    'Next step: <one concrete next step>',
    'Only request engine_actions when you need more context to plan accurately.',
    'Supported action types are exactly: list_dir, read_file, exists, stat.',
    'Do not request shell_exec, web_fetch, create_file, append_file, rename, or delete.',
    'Do not repeat the same action unless new information justifies it.',
    'If you do not need more context, say so explicitly in Needed context.',
    'If you request engine_actions, keep the prose complete and still include all four sections.',
    ...buildProviderSpecificCoworkPromptHints(resolveProviderIdForModel(modelValue), 'planning'),
    buildInternalEngineActionInstruction(),
    'Task and project context follows.',
    taskAndContext,
  ].join('\n\n');
  const toInternalActionErrorCode = (message: string): string => {
    const normalized = message.toLowerCase();
    if (normalized.includes('not found') || normalized.includes('enoent')) {
      return 'NOT_FOUND';
    }
    if (normalized.includes('blocked') || normalized.includes('outside') || normalized.includes('traversal')) {
      return 'PROJECT_BOUNDARY_BLOCK';
    }
    if (normalized.includes('permission') || normalized.includes('eacces') || normalized.includes('eperm')) {
      return 'PERMISSION_DENIED';
    }
    return 'ACTION_FAILED';
  };
  const executeApprovedReadOnlyActions = async (
    rootPath: string,
    actions: EngineRequestedAction[],
  ): Promise<{ receipts: LocalActionReceipt[]; previews: string[]; errors: string[] }> => {
    const receipts: LocalActionReceipt[] = [];
    const previews: string[] = [];
    const errors: string[] = [];

    for (let index = 0; index < actions.length; index += 1) {
      const action = actions[index];
      const actionId = action.id || `internal-action-${index + 1}`;
      const actionPath = action.type === 'list_dir' ? (action.path || '.') : action.path;

        try {
          if (action.type === 'list_dir') {
            const result = await listDirInFolder(rootPath, action.path || '');
            const listed = result.items
              .slice(0, 12)
              .map((item) => `${item.kind === 'directory' ? '[dir]' : '[file]'} ${item.path}`);
            previews.push(`Listed: ${action.path || '.'}\n${listed.join('\n') || '(empty directory)'}`);
          } else if (action.type === 'read_file') {
            const result = await readFileInFolder(rootPath, action.path);
            const snippet = result.content.trim();
            previews.push(
              `Read: ${action.path}\n${snippet.length <= 1200 ? (snippet || '(empty)') : `${snippet.slice(0, 1200)}\n... (truncated)`}`,
            );
          } else if (action.type === 'exists') {
            const result = await existsInFolder(rootPath, action.path);
            previews.push(`Exists: ${action.path} -> ${result.exists ? 'yes' : 'no'}`);
          } else if (action.type === 'stat') {
            const result = await statInFolder(rootPath, action.path);
            previews.push(
              [
                `Stat: ${action.path}`,
                `Kind: ${result.kind}`,
                `Size: ${result.size}`,
                `ModifiedMs: ${Math.round(result.modifiedMs)}`,
              ].join('\n'),
            );
          } else {
            throw new Error('Internal action runner currently supports read-only actions only.');
          }

        receipts.push({
          id: actionId,
          type: action.type,
          path: actionPath,
          status: 'ok',
          message: 'Executed through internal runtime read-only action runner.',
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Internal read-only action failed.';
        receipts.push({
          id: actionId,
          type: action.type,
          path: actionPath,
          status: 'error',
          errorCode: toInternalActionErrorCode(message),
          message,
        });
        errors.push(`${actionPath}: ${message}`);
      }
    }

    return {
      receipts,
      previews,
      errors,
    };
  };
  const formatCoworkContinuationResponse = (params: {
    sessionKey: string;
    approvedCount: number;
    rejectedCount: number;
    previews: string[];
    errors: string[];
  }) => {
    const sections: string[] = [
      'Internal cowork continuation response.',
      '',
      `Task session: ${params.sessionKey}`,
      params.approvedCount > 0
        ? `Approved read-only actions executed: ${params.approvedCount}`
        : 'No approved read-only actions were executed.',
    ];

    if (params.rejectedCount > 0) {
      sections.push(`Rejected actions: ${params.rejectedCount}`);
    }

    if (params.previews.length > 0) {
      sections.push('', 'Action results:', ...params.previews);
    }

    if (params.errors.length > 0) {
      sections.push('', 'Errors:', ...params.errors.map((error) => `- ${error}`));
    } else {
      sections.push('', 'Status: cowork continuation completed.');
    }

    return sections.join('\n');
  };
  const formatInternalAssistantText = (
    model: string,
    text: string,
    sessionKey: string,
    historyLength: number,
    kind: string,
  ) => {
    const normalized = text.trim() || 'No prompt text supplied.';
    if (kind === 'cowork') {
      return formatCoworkFoundationResponse(normalized, sessionKey, buildCoworkFoundationActions(normalized));
    }
    if (model === 'internal/dev-brief') {
      return [
        'Internal brief response.',
        '',
        `Session: ${sessionKey}`,
        `History messages: ${historyLength}`,
        '',
        `Summary: ${normalized.slice(0, 220)}`,
      ].join('\n');
    }
    if (model === 'internal/dev-planner') {
      return formatPlannerResponse(normalized);
    }
    return [
      'Internal engine development response.',
      '',
      `Session: ${sessionKey}`,
      `History messages: ${historyLength}`,
      '',
      'Echo:',
      normalized,
    ].join('\n');
  };
  const buildProviderBackedCoworkContinuationPrompt = (params: {
    model: string | null | undefined;
    sessionKey: string;
    approvedActions: EngineRequestedAction[];
    rejectedActions: InternalEngineCoworkContinuationRequest['rejectedActions'];
    execution: {
      receipts: LocalActionReceipt[];
      previews: string[];
      errors: string[];
    };
  }) => [
    'Continue the cowork task using the latest execution results.',
    'Respond with concise prose, not filler.',
    'Use plain text only. Do not use markdown headings, bold formatting, tables, or fenced code blocks.',
    'Use this structure in order:',
    'Findings: <short evidence-based summary>',
    'Recommendation: <best next move given the results>',
    'Next step: <one concrete next step>',
    'You may request additional safe read-only actions only if they are necessary.',
    'Supported action types are exactly: list_dir, read_file, exists, stat.',
    'Do not re-request an action if the current execution results already answered it.',
    'If the current execution results are sufficient, do not request any engine_actions.',
    'If you request engine_actions, keep the prose complete and still include all three sections.',
    ...buildProviderSpecificCoworkPromptHints(resolveProviderIdForModel(params.model), 'continuation'),
    buildInternalEngineActionInstruction(),
    '',
    `Session key: ${params.sessionKey}`,
    `Approved actions executed: ${params.approvedActions.length}`,
    `Rejected actions: ${params.rejectedActions.length}`,
    '',
    'Approved actions:',
    formatCoworkActionList(params.approvedActions),
    '',
    'Rejected actions:',
    params.rejectedActions.length > 0
      ? params.rejectedActions.map((action) => `- ${action.actionType} ${action.path}: ${action.reason || 'Rejected by operator.'}`).join('\n')
      : 'None.',
    '',
    'Execution previews:',
    ...(params.execution.previews.length > 0 ? params.execution.previews : ['(none)']),
    '',
    'Execution receipts:',
    formatCoworkReceiptSummary(params.execution.receipts),
    '',
    'Execution errors:',
    ...(params.execution.errors.length > 0 ? params.execution.errors : ['(none)']),
  ].join('\n');
  const touchSession = (sessionKey: string) => {
    const session = sessions.get(sessionKey);
    if (session) {
      session.updatedAt = now();
    }
  };
  const appendSystemMessage = (messages: EngineChatMessage[], text: string) => {
    messages.push({
      id: crypto.randomUUID(),
      role: 'system',
      text,
    });
  };
  const ensureModeBootstrap = (session: { model: string | null; messages: EngineChatMessage[] }) => {
    const behavior = getModelBehavior(session.model);
    if (
      behavior.bootstrapMessage
      && !session.messages.some((message) => message.role === 'system' && message.text === behavior.bootstrapMessage)
    ) {
      appendSystemMessage(session.messages, behavior.bootstrapMessage);
    }
  };
  const trimSessionHistory = (session: { model: string | null; messages: EngineChatMessage[] }) => {
    const historyLimit = getModelBehavior(session.model).historyLimit ?? maxSessionHistory;
    if (session.messages.length > historyLimit) {
      session.messages.splice(0, session.messages.length - historyLimit);
    }
  };
  const serializeSession = (session: {
    key: string;
    kind: string;
    title?: string;
    model: string | null;
    messages: EngineChatMessage[];
    updatedAt: number;
  }): PersistedInternalEngineSession => ({
    key: session.key,
    kind: session.kind,
    ...(session.title ? { title: session.title } : {}),
    model: resolveModelValue(session.model),
    messages: session.messages.map((message) => ({
      id: typeof message.id === 'string' && message.id.trim() ? message.id : crypto.randomUUID(),
      role: message.role === 'user' || message.role === 'assistant' || message.role === 'system' ? message.role : 'system',
      text: typeof message.text === 'string' ? message.text : '',
    })),
    updatedAt: Number.isFinite(session.updatedAt) ? session.updatedAt : now(),
  });
  const parsePersistedSession = (value: unknown): PersistedInternalEngineSession | null => {
    if (!value || typeof value !== 'object') {
      return null;
    }
    const candidate = value as Record<string, unknown>;
    const key = typeof candidate.key === 'string' && candidate.key.trim() ? candidate.key.trim() : null;
    if (!key) {
      return null;
    }
    const kind = typeof candidate.kind === 'string' && candidate.kind.trim() ? candidate.kind.trim() : 'chat';
    const title = typeof candidate.title === 'string' && candidate.title.trim() ? normalizeSessionTitle(candidate.title) : undefined;
    const model = resolveModelValue(typeof candidate.model === 'string' ? candidate.model : null);
    const updatedAt = Number.isFinite(candidate.updatedAt) ? Number(candidate.updatedAt) : now();
    const messages = Array.isArray(candidate.messages)
      ? candidate.messages.flatMap((entry) => {
          if (!entry || typeof entry !== 'object') {
            return [];
          }
          const message = entry as Record<string, unknown>;
          const role = message.role === 'user' || message.role === 'assistant' || message.role === 'system'
            ? message.role
            : null;
          if (!role) {
            return [];
          }
          return [{
            id: typeof message.id === 'string' && message.id.trim() ? message.id : crypto.randomUUID(),
            role,
            text: typeof message.text === 'string' ? message.text : '',
          } satisfies EngineChatMessage];
        })
      : [];
    return {
      key,
      kind,
      ...(title ? { title } : {}),
      model,
      messages,
      updatedAt,
    };
  };
  const parsePersistedRun = (value: unknown): PersistedInternalRunRecord | null => {
    if (!value || typeof value !== 'object') {
      return null;
    }
    const candidate = value as Record<string, unknown>;
    const runId = typeof candidate.runId === 'string' && candidate.runId.trim() ? candidate.runId.trim() : null;
    const sessionKey =
      typeof candidate.sessionKey === 'string' && candidate.sessionKey.trim() ? candidate.sessionKey.trim() : null;
    if (!runId || !sessionKey) {
      return null;
    }
    const status = candidate.status === 'running'
      || candidate.status === 'awaiting_approval'
      || candidate.status === 'executing'
      || candidate.status === 'completed'
      || candidate.status === 'blocked'
      || candidate.status === 'interrupted'
      ? candidate.status
      : 'completed';
    const timeline = Array.isArray(candidate.timeline)
      ? candidate.timeline.flatMap((entry) => {
          if (!entry || typeof entry !== 'object') {
            return [];
          }
          const timelineEntry = entry as Record<string, unknown>;
          const phase = timelineEntry.phase === 'submitted'
            || timelineEntry.phase === 'awaiting_approval'
            || timelineEntry.phase === 'approval_decision'
            || timelineEntry.phase === 'executing'
            || timelineEntry.phase === 'completed'
            || timelineEntry.phase === 'blocked'
            || timelineEntry.phase === 'interrupted'
            ? timelineEntry.phase
            : null;
          const message =
            typeof timelineEntry.message === 'string' && timelineEntry.message.trim()
              ? timelineEntry.message.trim()
              : null;
          if (!phase || !message) {
            return [];
          }
          return [{
            id: typeof timelineEntry.id === 'string' && timelineEntry.id.trim()
              ? timelineEntry.id.trim()
              : crypto.randomUUID(),
            at: Number.isFinite(timelineEntry.at) ? Number(timelineEntry.at) : now(),
            phase,
            message,
            ...(typeof timelineEntry.details === 'string' && timelineEntry.details.trim()
              ? { details: timelineEntry.details.trim() }
              : {}),
            ...(
              timelineEntry.action
              && typeof timelineEntry.action === 'object'
              && typeof (timelineEntry.action as Record<string, unknown>).actionId === 'string'
              && typeof (timelineEntry.action as Record<string, unknown>).actionType === 'string'
              && typeof (timelineEntry.action as Record<string, unknown>).path === 'string'
                ? {
                    action: {
                      actionId: ((timelineEntry.action as Record<string, unknown>).actionId as string).trim(),
                      actionType: (timelineEntry.action as Record<string, unknown>).actionType as EngineRequestedAction['type'],
                      path: ((timelineEntry.action as Record<string, unknown>).path as string).trim(),
                    } satisfies PersistedInternalRunTimelineActionRef,
                  }
                : {}
            ),
            ...(
              timelineEntry.decision
              && typeof timelineEntry.decision === 'object'
              && typeof (timelineEntry.decision as Record<string, unknown>).approved === 'boolean'
                ? {
                    decision: {
                      approved: (timelineEntry.decision as Record<string, unknown>).approved as boolean,
                      ...(
                        typeof (timelineEntry.decision as Record<string, unknown>).reason === 'string'
                        && ((timelineEntry.decision as Record<string, unknown>).reason as string).trim()
                          ? { reason: ((timelineEntry.decision as Record<string, unknown>).reason as string).trim() }
                          : {}
                      ),
                    } satisfies PersistedInternalRunTimelineDecisionRef,
                  }
                : {}
            ),
            ...(
              timelineEntry.receipt
              && typeof timelineEntry.receipt === 'object'
              && (
                (timelineEntry.receipt as Record<string, unknown>).status === 'ok'
                || (timelineEntry.receipt as Record<string, unknown>).status === 'error'
              )
                ? {
                    receipt: {
                      status: (timelineEntry.receipt as Record<string, unknown>).status as LocalActionReceipt['status'],
                      ...(
                        typeof (timelineEntry.receipt as Record<string, unknown>).message === 'string'
                        && ((timelineEntry.receipt as Record<string, unknown>).message as string).trim()
                          ? { message: ((timelineEntry.receipt as Record<string, unknown>).message as string).trim() }
                          : {}
                      ),
                      ...(
                        typeof (timelineEntry.receipt as Record<string, unknown>).errorCode === 'string'
                        && ((timelineEntry.receipt as Record<string, unknown>).errorCode as string).trim()
                          ? { errorCode: ((timelineEntry.receipt as Record<string, unknown>).errorCode as string).trim() }
                          : {}
                      ),
                    } satisfies PersistedInternalRunTimelineReceiptRef,
                  }
                : {}
            ),
          } satisfies PersistedInternalRunTimelineEntry];
        })
      : undefined;
    return {
      runId,
      ...(typeof candidate.scheduleId === 'string' && candidate.scheduleId.trim()
        ? { scheduleId: candidate.scheduleId.trim() }
        : {}),
      ...(typeof candidate.scheduleName === 'string' && candidate.scheduleName.trim()
        ? { scheduleName: candidate.scheduleName.trim() }
        : {}),
      sessionKey,
      sessionKind: typeof candidate.sessionKind === 'string' && candidate.sessionKind.trim()
        ? candidate.sessionKind.trim()
        : (sessionKey.startsWith('internal:cowork:') ? 'cowork' : 'chat'),
      model: resolveModelValue(typeof candidate.model === 'string' ? candidate.model : resolveDefaultModel()),
      ...(typeof candidate.providerBacked === 'boolean' ? { providerBacked: candidate.providerBacked } : {}),
      ...(candidate.providerPhase === 'chat' || candidate.providerPhase === 'planning' || candidate.providerPhase === 'continuation'
        ? { providerPhase: candidate.providerPhase }
        : {}),
      actionMode: candidate.actionMode === 'read-only' ? 'read-only' : 'none',
      status,
      startedAt: Number.isFinite(candidate.startedAt) ? Number(candidate.startedAt) : now(),
      updatedAt: Number.isFinite(candidate.updatedAt) ? Number(candidate.updatedAt) : now(),
      ...(typeof candidate.promptPreview === 'string' && candidate.promptPreview.trim()
        ? { promptPreview: candidate.promptPreview.trim() }
        : {}),
      ...(typeof candidate.summary === 'string' && candidate.summary.trim()
        ? { summary: candidate.summary.trim() }
        : {}),
      ...(typeof candidate.interruptedReason === 'string' && candidate.interruptedReason.trim()
        ? { interruptedReason: candidate.interruptedReason.trim() }
        : {}),
      ...(typeof candidate.artifactId === 'string' && candidate.artifactId.trim()
        ? { artifactId: candidate.artifactId.trim() }
        : {}),
      ...(Number.isFinite(candidate.approvedActionCount)
        ? { approvedActionCount: Number(candidate.approvedActionCount) }
        : {}),
      ...(Number.isFinite(candidate.rejectedActionCount)
        ? { rejectedActionCount: Number(candidate.rejectedActionCount) }
        : {}),
      ...(typeof candidate.resultSummary === 'string' && candidate.resultSummary.trim()
        ? { resultSummary: candidate.resultSummary.trim() }
        : {}),
      ...(timeline && timeline.length > 0 ? { timeline } : {}),
    };
  };
  const parsePersistedArtifact = (value: unknown): PersistedInternalArtifactRecord | null => {
    if (!value || typeof value !== 'object') {
      return null;
    }
    const candidate = value as Record<string, unknown>;
    const id = typeof candidate.id === 'string' && candidate.id.trim() ? candidate.id.trim() : null;
    const runId = typeof candidate.runId === 'string' && candidate.runId.trim() ? candidate.runId.trim() : null;
    const sessionKey =
      typeof candidate.sessionKey === 'string' && candidate.sessionKey.trim() ? candidate.sessionKey.trim() : null;
    if (!id || !runId || !sessionKey) {
      return null;
    }
    return {
      id,
      runId,
      sessionKey,
      kind: 'cowork_execution',
      createdAt: Number.isFinite(candidate.createdAt) ? Number(candidate.createdAt) : now(),
      receiptCount: Number.isFinite(candidate.receiptCount) ? Number(candidate.receiptCount) : 0,
      receipts: Array.isArray(candidate.receipts) ? candidate.receipts.filter(Boolean) as LocalActionReceipt[] : [],
      previews: Array.isArray(candidate.previews) ? candidate.previews.filter((entry): entry is string => typeof entry === 'string') : [],
      errors: Array.isArray(candidate.errors) ? candidate.errors.filter((entry): entry is string => typeof entry === 'string') : [],
      ...(typeof candidate.summary === 'string' && candidate.summary.trim()
        ? { summary: candidate.summary.trim() }
        : {}),
    };
  };
  const parsePersistedPendingApprovalFlow = (value: unknown): InternalApprovalRecoveryFlow | null => {
    if (!value || typeof value !== 'object') {
      return null;
    }
    const candidate = value as Record<string, unknown>;
    if (
      typeof candidate.runId !== 'string'
      || typeof candidate.sessionKey !== 'string'
      || typeof candidate.rootPath !== 'string'
      || !candidate.context
      || !Array.isArray(candidate.requestedActions)
      || !Array.isArray(candidate.approvedActions)
      || !Array.isArray(candidate.rejectedActions)
      || !candidate.currentApproval
      || !Number.isFinite(candidate.currentIndex)
    ) {
      return null;
    }
    return candidate as unknown as InternalApprovalRecoveryFlow;
  };
  const parsePersistedSchedule = (value: unknown): PersistedInternalScheduleRecord | null => {
    if (!value || typeof value !== 'object') {
      return null;
    }
    const candidate = value as Record<string, unknown>;
    const id = typeof candidate.id === 'string' && candidate.id.trim() ? candidate.id.trim() : null;
    const name = typeof candidate.name === 'string' && candidate.name.trim() ? candidate.name.trim() : null;
    const prompt = typeof candidate.prompt === 'string' && candidate.prompt.trim() ? candidate.prompt.trim() : null;
    if (!id || !name || !prompt) {
      return null;
    }
    const intervalMinutes =
      Number.isFinite(candidate.intervalMinutes) && Number(candidate.intervalMinutes) >= 1
        ? Math.max(1, Math.round(Number(candidate.intervalMinutes)))
        : 1;
    const normalizeDateString = (entry: unknown) =>
      typeof entry === 'string' && entry.trim() ? entry.trim() : null;
      return {
        id,
        kind: candidate.kind === 'cowork' ? 'cowork' : 'chat',
        name,
      prompt,
      schedule:
        typeof candidate.schedule === 'string' && candidate.schedule.trim()
          ? candidate.schedule.trim()
          : `every ${intervalMinutes} minute${intervalMinutes === 1 ? '' : 's'}`,
      intervalMinutes,
      enabled: candidate.enabled !== false,
        state: typeof candidate.state === 'string' && candidate.state.trim() ? candidate.state.trim() : 'idle',
        nextRunAt: normalizeDateString(candidate.nextRunAt),
        lastRunAt: normalizeDateString(candidate.lastRunAt),
        ...(Number.isFinite(candidate.totalRunCount) ? { totalRunCount: Number(candidate.totalRunCount) } : {}),
        ...(Number.isFinite(candidate.completedRunCount) ? { completedRunCount: Number(candidate.completedRunCount) } : {}),
        ...(Number.isFinite(candidate.blockedRunCount) ? { blockedRunCount: Number(candidate.blockedRunCount) } : {}),
        ...(Number.isFinite(candidate.approvalWaitCount) ? { approvalWaitCount: Number(candidate.approvalWaitCount) } : {}),
        ...(Array.isArray(candidate.recentRunHistory)
          ? {
              recentRunHistory: candidate.recentRunHistory
                .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object')
                .map((entry) => ({
                  ...(typeof entry.runId === 'string' && entry.runId.trim() ? { runId: entry.runId.trim() } : {}),
                  status: typeof entry.status === 'string' && entry.status.trim() ? entry.status.trim() : 'unknown',
                  at: typeof entry.at === 'string' && entry.at.trim() ? entry.at.trim() : new Date(0).toISOString(),
                  ...(typeof entry.summary === 'string' && entry.summary.trim() ? { summary: entry.summary.trim() } : {}),
                }))
                .slice(-6),
            }
          : {}),
        ...(typeof candidate.lastRunId === 'string' && candidate.lastRunId.trim() ? { lastRunId: candidate.lastRunId.trim() } : {}),
      ...(typeof candidate.lastRunStatus === 'string' && candidate.lastRunStatus.trim() ? { lastRunStatus: candidate.lastRunStatus.trim() } : {}),
      ...(typeof candidate.lastRunSummary === 'string' && candidate.lastRunSummary.trim() ? { lastRunSummary: candidate.lastRunSummary.trim() } : {}),
      ...(typeof candidate.lastArtifactSummary === 'string' && candidate.lastArtifactSummary.trim() ? { lastArtifactSummary: candidate.lastArtifactSummary.trim() } : {}),
      ...(Number.isFinite(candidate.lastArtifactReceiptCount) ? { lastArtifactReceiptCount: Number(candidate.lastArtifactReceiptCount) } : {}),
      ...(Number.isFinite(candidate.lastArtifactErrorCount) ? { lastArtifactErrorCount: Number(candidate.lastArtifactErrorCount) } : {}),
      ...(Array.isArray(candidate.lastArtifactPreviews)
        ? { lastArtifactPreviews: candidate.lastArtifactPreviews.filter((entry): entry is string => typeof entry === 'string').slice(0, 3) }
        : {}),
      ...(Array.isArray(candidate.lastArtifactErrors)
        ? { lastArtifactErrors: candidate.lastArtifactErrors.filter((entry): entry is string => typeof entry === 'string').slice(0, 3) }
        : {}),
      ...(typeof candidate.projectId === 'string' && candidate.projectId.trim() ? { projectId: candidate.projectId.trim() } : {}),
      ...(typeof candidate.projectTitle === 'string' && candidate.projectTitle.trim() ? { projectTitle: candidate.projectTitle.trim() } : {}),
      ...(typeof candidate.rootPath === 'string' && candidate.rootPath.trim() ? { rootPath: candidate.rootPath.trim() } : {}),
      ...(typeof candidate.model === 'string' && candidate.model.trim() ? { model: candidate.model.trim() } : {}),
      ...(typeof candidate.lastError === 'string' && candidate.lastError.trim() ? { lastError: candidate.lastError.trim() } : {}),
    };
  };
  const buildPersistedState = (): PersistedInternalEngineState => ({
    version: 1,
    activeSessionKey,
    cleanShutdown: connected ? false : true,
    lastPersistedAt: now(),
    sessions: Array.from(sessions.values())
      .sort((left, right) => left.updatedAt - right.updatedAt)
      .map((session) => serializeSession(session)),
  });
  const buildPersistedRunJournal = (): PersistedInternalRunJournal => ({
    version: 1,
    runs: Array.from(runs.values())
      .sort((left, right) => left.updatedAt - right.updatedAt),
  });
  const buildPersistedArtifactJournal = (): PersistedInternalArtifactJournal => ({
    version: 1,
    artifacts,
  });
  const buildPersistedPendingApprovalJournal = (): PersistedInternalPendingApprovalJournal => ({
    version: 1,
    flows: pendingApprovalFlows,
  });
  const buildPersistedScheduleJournal = (): PersistedInternalScheduleJournal => ({
    version: 1,
    historyRetentionLimit: scheduleHistoryRetentionLimit,
    schedules: schedules
      .slice()
      .sort((left, right) => {
        const leftNext = left.nextRunAt ? new Date(left.nextRunAt).getTime() : Number.MAX_SAFE_INTEGER;
        const rightNext = right.nextRunAt ? new Date(right.nextRunAt).getTime() : Number.MAX_SAFE_INTEGER;
        return leftNext - rightNext;
      }),
  });
  const toEngineCronJob = (schedule: PersistedInternalScheduleRecord): EngineCronJob => ({
    ...(schedule.lastRunId
      ? (() => {
          const pendingApprovals = pendingApprovalFlows.filter((flow) => flow.runId === schedule.lastRunId);
          const latestPendingApproval = pendingApprovals[pendingApprovals.length - 1];
          const artifact = artifacts.find((entry) => entry.runId === schedule.lastRunId);
          return {
            ...(pendingApprovals.length > 0 ? { pendingApprovalCount: pendingApprovals.length } : {}),
            ...(latestPendingApproval?.currentApproval?.summary
              ? { pendingApprovalSummary: latestPendingApproval.currentApproval.summary }
              : {}),
            ...(schedule.lastArtifactSummary ? { lastArtifactSummary: schedule.lastArtifactSummary } : artifact?.summary ? { lastArtifactSummary: artifact.summary } : {}),
            ...(typeof schedule.lastArtifactReceiptCount === 'number' ? { lastArtifactReceiptCount: schedule.lastArtifactReceiptCount } : artifact ? { lastArtifactReceiptCount: artifact.receiptCount } : {}),
            ...(typeof schedule.lastArtifactErrorCount === 'number' && schedule.lastArtifactErrorCount > 0
              ? { lastArtifactErrorCount: schedule.lastArtifactErrorCount }
              : artifact && artifact.errors.length > 0
                ? { lastArtifactErrorCount: artifact.errors.length }
                : {}),
            ...(schedule.lastArtifactPreviews?.length ? { lastArtifactPreviews: schedule.lastArtifactPreviews.slice(0, 3) } : artifact && artifact.previews.length > 0 ? { lastArtifactPreviews: artifact.previews.slice(0, 3) } : {}),
            ...(schedule.lastArtifactErrors?.length ? { lastArtifactErrors: schedule.lastArtifactErrors.slice(0, 3) } : artifact && artifact.errors.length > 0 ? { lastArtifactErrors: artifact.errors.slice(0, 3) } : {}),
          };
        })()
      : {}),
    id: schedule.id,
    kind: schedule.kind,
    name: schedule.name,
    prompt: schedule.prompt,
    ...(schedule.model ? { model: schedule.model } : { model: null }),
    intervalMinutes: schedule.intervalMinutes,
    ...(schedule.projectId ? { projectId: schedule.projectId } : {}),
    ...(schedule.projectTitle ? { projectTitle: schedule.projectTitle } : {}),
    ...(schedule.rootPath ? { rootPath: schedule.rootPath } : {}),
    schedule: schedule.schedule,
    enabled: schedule.enabled,
    state: schedule.state,
    nextRunAt: schedule.nextRunAt,
    lastRunAt: schedule.lastRunAt,
    ...(typeof schedule.totalRunCount === 'number' ? { totalRunCount: schedule.totalRunCount } : {}),
    ...(typeof schedule.completedRunCount === 'number' ? { completedRunCount: schedule.completedRunCount } : {}),
    ...(typeof schedule.blockedRunCount === 'number' ? { blockedRunCount: schedule.blockedRunCount } : {}),
    ...(typeof schedule.approvalWaitCount === 'number' ? { approvalWaitCount: schedule.approvalWaitCount } : {}),
    ...(schedule.recentRunHistory?.length
      ? { recentRunHistory: schedule.recentRunHistory.slice(-scheduleHistoryRetentionLimit).reverse() }
      : {}),
    ...(schedule.lastRunId ? { lastRunId: schedule.lastRunId } : {}),
    ...(schedule.lastRunStatus ? { lastRunStatus: schedule.lastRunStatus } : {}),
    ...(schedule.lastRunSummary ? { lastRunSummary: schedule.lastRunSummary } : {}),
  });
  const appendScheduleRunHistory = (
    schedule: PersistedInternalScheduleRecord,
    entry: { runId?: string; status: string; summary?: string },
  ) => {
    const seenRunId = entry.runId
      ? (schedule.recentRunHistory ?? []).some((existing) => existing.runId === entry.runId)
      : false;
    const historyEntry = {
      ...(entry.runId ? { runId: entry.runId } : {}),
      status: entry.status,
      at: new Date().toISOString(),
      ...(entry.summary ? { summary: entry.summary } : {}),
    };
    schedule.recentRunHistory = [...(schedule.recentRunHistory ?? []), historyEntry].slice(-scheduleHistoryRetentionLimit);
    if (!seenRunId) {
      schedule.totalRunCount = (schedule.totalRunCount ?? 0) + 1;
    }
    if (entry.status === 'completed') {
      schedule.completedRunCount = (schedule.completedRunCount ?? 0) + 1;
    } else if (entry.status === 'blocked') {
      schedule.blockedRunCount = (schedule.blockedRunCount ?? 0) + 1;
    } else if (entry.status === 'awaiting_approval') {
      schedule.approvalWaitCount = (schedule.approvalWaitCount ?? 0) + 1;
    }
  };
  const seedScheduleArtifactForE2E = async (id: string) => {
    const schedule = schedules.find((entry) => entry.id === id);
    if (!schedule) {
      throw new Error(`Internal schedule not found: ${id}`);
    }
    const runId = schedule.lastRunId || crypto.randomUUID();
    schedule.lastRunId = runId;
    schedule.lastRunAt = new Date().toISOString();
    schedule.state = 'completed';
    schedule.lastRunStatus = 'completed';
    schedule.lastRunSummary = 'Internal schedule completed with recorded artifact previews.';
    schedule.lastArtifactSummary = 'Internal cowork continuation recorded execution receipts.';
    schedule.lastArtifactReceiptCount = 2;
    schedule.lastArtifactErrorCount = 1;
    schedule.lastArtifactPreviews = [
      'README.md',
      '.gitignore',
    ];
    schedule.lastArtifactErrors = ['One seeded artifact warning for operator triage.'];
    const seededArtifact: PersistedInternalArtifactRecord = {
      id: crypto.randomUUID(),
      runId,
      sessionKey: `internal:scheduled:${schedule.kind}:${schedule.id}`,
      kind: 'cowork_execution',
      createdAt: now(),
      receiptCount: 2,
      receipts: [
        { id: crypto.randomUUID(), type: 'list_dir', path: '.', status: 'ok', message: 'Listed workspace root.' },
        { id: crypto.randomUUID(), type: 'stat', path: '.', status: 'ok', message: 'Read root metadata.' },
      ],
      previews: [...schedule.lastArtifactPreviews],
      errors: [...schedule.lastArtifactErrors],
      summary: schedule.lastArtifactSummary,
    };
    artifacts = [
      ...artifacts.filter((artifact) => artifact.runId !== runId),
      seededArtifact,
    ].sort((left, right) => left.createdAt - right.createdAt).slice(-200);
    await persistState();
    return toEngineCronJob(schedule);
  };
  const latestArtifactSummary = () => {
    const lastArtifact = artifacts[artifacts.length - 1];
    return lastArtifact?.summary ?? null;
  };
  const latestRunTimelineEntry = () => {
    let latest: PersistedInternalRunTimelineEntry | null = null;
    for (const run of runs.values()) {
      const candidate = run.timeline?.[run.timeline.length - 1] ?? null;
      if (!candidate) {
        continue;
      }
      if (!latest || candidate.at > latest.at) {
        latest = candidate;
      }
    }
    return latest;
  };
  const writePersistedState = async (override?: Partial<Pick<PersistedInternalEngineState, 'cleanShutdown'>>): Promise<void> => {
    enforceRuntimeRetention();
    await fs.mkdir(runtimeHome, { recursive: true });
    await fs.writeFile(stateFilePath, JSON.stringify({
      ...buildPersistedState(),
      version: runtimePersistenceSchemaVersion,
      runHistoryRetentionLimit,
      artifactHistoryRetentionLimit,
      ...override,
    }, null, 2), 'utf8');
    await fs.writeFile(runJournalFilePath, JSON.stringify(buildPersistedRunJournal(), null, 2), 'utf8');
    await fs.writeFile(artifactJournalFilePath, JSON.stringify(buildPersistedArtifactJournal(), null, 2), 'utf8');
    await fs.writeFile(pendingApprovalJournalFilePath, JSON.stringify(buildPersistedPendingApprovalJournal(), null, 2), 'utf8');
    await fs.writeFile(scheduleJournalFilePath, JSON.stringify(buildPersistedScheduleJournal(), null, 2), 'utf8');
  };
  const persistState = async (override?: Partial<Pick<PersistedInternalEngineState, 'cleanShutdown'>>): Promise<void> => {
    stateWriteChain = stateWriteChain.then(() => writePersistedState(override));
    await stateWriteChain;
  };
  const appendRecoveryNote = (sessionKey: string, note: string) => {
    const session = ensureSession(
      sessionKey,
      sessionKey === mainSessionKey ? 'main' : sessionKey.startsWith('internal:cowork:') ? 'cowork' : 'chat',
    );
    const alreadyPresent = session.messages.some(
      (message) => message.role === 'system' && message.text === note,
    );
    if (!alreadyPresent) {
      appendSystemMessage(session.messages, note);
      trimSessionHistory(session);
      session.updatedAt = now();
    }
  };
  const previewPrompt = (text: string) => {
    const normalized = text.replace(/\s+/g, ' ').trim();
    if (!normalized) {
      return undefined;
    }
    return normalized.length > 140 ? `${normalized.slice(0, 137).trimEnd()}...` : normalized;
  };
  const upsertRunRecord = (record: PersistedInternalRunRecord) => {
    runs.set(record.runId, record);
  };
  const appendRunTimelineEntry = (
    runId: string,
    entry: Omit<PersistedInternalRunTimelineEntry, 'id' | 'at'> & { at?: number },
  ) => {
    const run = runs.get(runId);
    if (!run) {
      return;
    }
    run.timeline = [
      ...(run.timeline ?? []),
      {
        id: crypto.randomUUID(),
        at: entry.at ?? now(),
        phase: entry.phase,
        message: entry.message,
        ...(entry.details ? { details: entry.details } : {}),
        ...(entry.action ? { action: entry.action } : {}),
        ...(entry.decision ? { decision: entry.decision } : {}),
        ...(entry.receipt ? { receipt: entry.receipt } : {}),
      },
    ].slice(-24);
  };
  const markInterruptedRuns = () => {
    const recoveryReason = 'Recovered after interrupted shutdown before the run completed.';
    interruptedRunCount = 0;
    for (const run of runs.values()) {
      if (run.status === 'running' || run.status === 'awaiting_approval' || run.status === 'executing') {
        run.status = 'interrupted';
        run.updatedAt = now();
        run.interruptedReason = recoveryReason;
        appendRunTimelineEntry(run.runId, {
          phase: 'interrupted',
          message: 'Run marked interrupted during internal runtime recovery.',
          details: recoveryReason,
          at: run.updatedAt,
        });
        interruptedRunCount += 1;
      }
    }
    if (interruptedRunCount > 0) {
      lastRecoveryNote = `Recovered internal runtime state after an interrupted shutdown. ${interruptedRunCount} in-flight run${interruptedRunCount === 1 ? ' was' : 's were'} marked interrupted.`;
    }
  };
  const loadPersistedState = async (): Promise<void> => {
    if (stateLoaded) {
      return;
    }
    await fs.mkdir(runtimeHome, { recursive: true });
    try {
      const raw = await fs.readFile(stateFilePath, 'utf8');
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      sessions.clear();
      const restoredSessions = Array.isArray(parsed.sessions)
        ? parsed.sessions
            .map((entry) => parsePersistedSession(entry))
            .filter((entry): entry is PersistedInternalEngineSession => Boolean(entry))
        : [];
      for (const session of restoredSessions) {
        sessions.set(session.key, session);
      }
      const restoredActiveSessionKey =
        typeof parsed.activeSessionKey === 'string' && parsed.activeSessionKey.trim()
          ? parsed.activeSessionKey.trim()
          : null;
      activeSessionKey = restoredActiveSessionKey && sessions.has(restoredActiveSessionKey)
        ? restoredActiveSessionKey
        : null;
      runHistoryRetentionLimit = normalizeRetentionLimit(parsed.runHistoryRetentionLimit, defaultRunHistoryRetentionLimit);
      artifactHistoryRetentionLimit = normalizeRetentionLimit(parsed.artifactHistoryRetentionLimit, defaultArtifactHistoryRetentionLimit);
      const cleanShutdown = parsed.cleanShutdown === true;
      stateRestoreStatus = restoredSessions.length > 0
        ? cleanShutdown ? 'restored' : 'recovered_after_interruption'
        : 'fresh';
      if (!cleanShutdown && restoredSessions.length > 0) {
        lastRecoveryNote = 'Recovered internal runtime state after an interrupted shutdown. In-flight runs were not resumed.';
      } else {
        lastRecoveryNote = null;
      }
    } catch (error) {
      if (!(error instanceof Error) || !('code' in error) || (error as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.warn('[Cloffice] Failed to load internal engine state, starting with a fresh runtime.', error);
        stateRestoreStatus = 'load_failed';
        lastRecoveryNote = 'Previous internal runtime state could not be loaded. Started with a fresh runtime state.';
      } else {
        stateRestoreStatus = 'fresh';
        lastRecoveryNote = null;
      }
      sessions.clear();
      activeSessionKey = null;
      runHistoryRetentionLimit = defaultRunHistoryRetentionLimit;
      artifactHistoryRetentionLimit = defaultArtifactHistoryRetentionLimit;
    }
    try {
      const rawRuns = await fs.readFile(runJournalFilePath, 'utf8');
      const parsedRuns = JSON.parse(rawRuns) as Record<string, unknown>;
      runs.clear();
      const restoredRuns = Array.isArray(parsedRuns.runs)
        ? parsedRuns.runs
            .map((entry) => parsePersistedRun(entry))
            .filter((entry): entry is PersistedInternalRunRecord => Boolean(entry))
        : [];
      for (const run of restoredRuns) {
        runs.set(run.runId, run);
      }
    } catch (error) {
      if (!(error instanceof Error) || !('code' in error) || (error as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.warn('[Cloffice] Failed to load internal run journal, starting with an empty run journal.', error);
      }
      runs.clear();
    }
    try {
      const rawArtifacts = await fs.readFile(artifactJournalFilePath, 'utf8');
      const parsedArtifacts = JSON.parse(rawArtifacts) as Record<string, unknown>;
      artifacts = Array.isArray(parsedArtifacts.artifacts)
        ? parsedArtifacts.artifacts
            .map((entry) => parsePersistedArtifact(entry))
            .filter((entry): entry is PersistedInternalArtifactRecord => Boolean(entry))
        : [];
    } catch (error) {
      if (!(error instanceof Error) || !('code' in error) || (error as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.warn('[Cloffice] Failed to load internal artifact journal, starting with an empty artifact journal.', error);
      }
      artifacts = [];
    }
    try {
      const rawPendingApprovals = await fs.readFile(pendingApprovalJournalFilePath, 'utf8');
      const parsedPendingApprovals = JSON.parse(rawPendingApprovals) as Record<string, unknown>;
      pendingApprovalFlows = Array.isArray(parsedPendingApprovals.flows)
        ? parsedPendingApprovals.flows
            .map((entry) => parsePersistedPendingApprovalFlow(entry))
            .filter((entry): entry is InternalApprovalRecoveryFlow => Boolean(entry))
        : [];
    } catch (error) {
      if (!(error instanceof Error) || !('code' in error) || (error as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.warn('[Cloffice] Failed to load internal pending approval journal, starting with an empty pending approval journal.', error);
      }
      pendingApprovalFlows = [];
    }
    try {
      const rawSchedules = await fs.readFile(scheduleJournalFilePath, 'utf8');
      const parsedSchedules = JSON.parse(rawSchedules) as Record<string, unknown>;
      scheduleHistoryRetentionLimit =
        Number.isFinite(parsedSchedules.historyRetentionLimit) && Number(parsedSchedules.historyRetentionLimit) >= 1
          ? Math.max(1, Math.round(Number(parsedSchedules.historyRetentionLimit)))
          : 6;
      schedules = Array.isArray(parsedSchedules.schedules)
        ? parsedSchedules.schedules
            .map((entry) => parsePersistedSchedule(entry))
            .filter((entry): entry is PersistedInternalScheduleRecord => Boolean(entry))
        : [];
    } catch (error) {
      if (!(error instanceof Error) || !('code' in error) || (error as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.warn('[Cloffice] Failed to load internal schedule journal, starting with an empty schedule journal.', error);
      }
      schedules = [];
      scheduleHistoryRetentionLimit = 6;
    }

    ensureSession(mainSessionKey, 'main');
    activeSessionKey = activeSessionKey && sessions.has(activeSessionKey) ? activeSessionKey : mainSessionKey;
    if (stateRestoreStatus === 'recovered_after_interruption') {
      markInterruptedRuns();
    } else {
      interruptedRunCount = Array.from(runs.values()).filter((run) => run.status === 'interrupted').length;
    }
    if (lastRecoveryNote) {
      appendRecoveryNote(activeSessionKey || mainSessionKey, lastRecoveryNote);
    }
    enforceRuntimeRetention();
    stateLoaded = true;
  };
  const computeNextRunAt = (intervalMinutes: number, fromTime = now()) =>
    new Date(fromTime + (Math.max(1, intervalMinutes) * 60_000)).toISOString();
  const stopSchedulerLoop = () => {
    if (schedulerTimer) {
      clearInterval(schedulerTimer);
      schedulerTimer = null;
    }
  };
  const runScheduledPrompt = async (schedule: PersistedInternalScheduleRecord) => {
    if (runningScheduleIds.has(schedule.id)) {
      return;
    }
    runningScheduleIds.add(schedule.id);
    schedule.state = 'running';
    schedule.lastError = undefined;
    await persistState();
    const scheduledSessionKey = `internal:scheduled:${schedule.kind}:${schedule.id}`;
    try {
      const session = ensureSession(scheduledSessionKey, schedule.kind);
      if (schedule.model?.trim()) {
        session.model = resolveModelValue(schedule.model.trim());
      }
      const result = await service.sendChat(session.key, schedule.prompt);
      schedule.lastRunId = result.runId;
      const scheduledRun = runs.get(result.runId);
      if (scheduledRun) {
        upsertRunRecord({
          ...scheduledRun,
          scheduleId: schedule.id,
          scheduleName: schedule.name,
        });
      }
        if (schedule.kind === 'cowork' && result.requestedActions && result.requestedActions.length > 0) {
        const approvalContext: EngineApprovalLoopContext = {
          runId: result.runId,
          ...(schedule.projectId?.trim() ? { projectId: schedule.projectId.trim() } : {}),
          ...(schedule.projectTitle?.trim() ? { projectTitle: schedule.projectTitle.trim() } : { projectTitle: schedule.name }),
          ...(schedule.rootPath?.trim() ? { projectRootFolder: schedule.rootPath.trim() } : {}),
          scopeId: 'internal-scheduled-read-only',
          scopeName: 'Internal scheduled read-only actions',
          riskLevel: 'low',
          maxActionsPerRun: result.requestedActions.length,
        };
        pendingApprovalFlows = [
          ...pendingApprovalFlows.filter((flow) => flow.runId !== result.runId),
          buildInternalApprovalRecoveryFlow({
            sessionKey: result.sessionKey,
            rootPath: schedule.rootPath?.trim() || process.cwd(),
            context: approvalContext,
            requestedActions: result.requestedActions,
            currentIndex: 0,
            approvedActions: [],
            rejectedActions: [],
            currentApproval: createPendingEngineApprovalAction({
              action: result.requestedActions[0],
              index: 0,
              context: approvalContext,
            }),
          }),
        ];
        appendRunTimelineEntry(result.runId, {
          phase: 'awaiting_approval',
          message: `Scheduled cowork awaiting approval for ${schedule.name}.`,
        });
          schedule.state = 'awaiting_approval';
          schedule.lastRunStatus = 'awaiting_approval';
          schedule.lastRunSummary = `Awaiting approval for ${result.requestedActions.length} read-only action${result.requestedActions.length === 1 ? '' : 's'}.`;
          appendScheduleRunHistory(schedule, {
            runId: result.runId,
            status: 'awaiting_approval',
            summary: schedule.lastRunSummary,
          });
        } else {
          schedule.state = 'completed';
          schedule.lastRunStatus = 'completed';
          schedule.lastRunSummary = result.assistantMessage.text.replace(/\s+/g, ' ').trim().slice(0, 220);
          appendScheduleRunHistory(schedule, {
            runId: result.runId,
            status: 'completed',
            summary: schedule.lastRunSummary,
          });
        }
      schedule.lastRunAt = new Date().toISOString();
      schedule.nextRunAt = computeNextRunAt(schedule.intervalMinutes);
      lastScheduledJobName = schedule.name;
      lastScheduleError = null;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Scheduled internal prompt run failed.';
      schedule.state = 'blocked';
      schedule.lastError = message;
      schedule.lastRunAt = new Date().toISOString();
      schedule.nextRunAt = computeNextRunAt(schedule.intervalMinutes);
        schedule.lastRunStatus = 'blocked';
        schedule.lastRunSummary = message;
        appendScheduleRunHistory(schedule, {
          status: 'blocked',
          summary: message,
        });
        lastScheduledJobName = schedule.name;
        lastScheduleError = message;
    } finally {
      runningScheduleIds.delete(schedule.id);
      await persistState();
    }
  };
  const runDueSchedules = async () => {
    if (!connected || schedules.length === 0) {
      return;
    }
    const currentTime = now();
    for (const schedule of schedules) {
      if (!schedule.enabled || !schedule.nextRunAt) {
        continue;
      }
      if (schedule.state === 'awaiting_approval' || schedule.state === 'running' || schedule.state === 'executing') {
        continue;
      }
      const dueAt = new Date(schedule.nextRunAt).getTime();
      if (!Number.isFinite(dueAt) || dueAt > currentTime) {
        continue;
      }
      await runScheduledPrompt(schedule);
    }
  };
  const startSchedulerLoop = () => {
    if (schedulerTimer) {
      return;
    }
    schedulerTimer = setInterval(() => {
      void runDueSchedules();
    }, 15_000);
  };

  const ensureSession = (sessionKey: string, kind: string = 'chat') => {
    const normalizedKey = sessionKey.trim() || mainSessionKey;
    const existing = sessions.get(normalizedKey);
    if (existing) {
      touchSession(normalizedKey);
      return existing;
    }
    const created = {
      key: normalizedKey,
      kind,
      title: normalizedKey === mainSessionKey ? 'Main chat' : undefined,
      model: kind === 'cowork' ? resolveCoworkDefaultModel() : resolveDefaultModel(),
      messages: [] as EngineChatMessage[],
      updatedAt: now(),
    };
    sessions.set(normalizedKey, created);
    return created;
  };

  const service = {
    getStatus() {
      return shellStatus;
    },
    async connect(_options: EngineConnectOptions): Promise<void> {
      if (!shellStatus.availableInBuild) {
        connected = false;
        throw unavailable();
      }
      await refreshProviderCatalogFromConfig();
      await loadPersistedState();
      connected = true;
      activeSessionKey = activeSessionKey && sessions.has(activeSessionKey) ? activeSessionKey : mainSessionKey;
      startSchedulerLoop();
      await persistState({ cleanShutdown: false });
    },
    async disconnect(): Promise<void> {
      connected = false;
      stopSchedulerLoop();
      if (stateLoaded) {
        await persistState({ cleanShutdown: true });
      }
    },
    async getActiveSessionKey(): Promise<string> {
      requireConnected();
      activeSessionKey = ensureSession(mainSessionKey, 'main').key;
      return activeSessionKey;
    },
    async getRuntimeInfo(): Promise<InternalEngineRuntimeInfo> {
      await refreshProviderCatalogFromConfig();
      const latestTimelineEntry = latestRunTimelineEntry();
      const providerCoworkRuns = Array.from(runs.values()).filter(
        (run) => run.providerBacked && (run.providerPhase === 'planning' || run.providerPhase === 'continuation'),
      );
      const resolveProviderIdForRun = (run: PersistedInternalRunRecord): InternalChatProviderId | null => {
        const model = typeof run.model === 'string' ? run.model.trim() : '';
        if (model.startsWith('openai/')) return 'openai';
        if (model.startsWith('anthropic/')) return 'anthropic';
        if (model.startsWith('gemini/')) return 'gemini';
        return null;
      };
      const providerCoworkNormalizationByProvider = (
        ['openai', 'anthropic', 'gemini'] as const
      ).map((providerId) => {
        const providerRuns = providerCoworkRuns.filter((run) => resolveProviderIdForRun(run) === providerId);
        return {
          providerId,
          runCount: providerRuns.length,
          structuredCount: providerRuns.filter((run) => run.responseNormalization === 'provider_structured').length,
          normalizedCount: providerRuns.filter((run) => run.responseNormalization === 'normalized_sections').length,
          fallbackCount: providerRuns.filter((run) => run.responseNormalization === 'synthetic_fallback').length,
        };
      }).filter((entry) => entry.runCount > 0);
      const providerCoworkNormalizationTrend = Array.from(
        providerCoworkRuns.reduce((buckets, run) => {
          const date = formatDatePrefix(run.updatedAt || run.startedAt);
          const current = buckets.get(date) ?? {
            date,
            runCount: 0,
            structuredCount: 0,
            normalizedCount: 0,
            fallbackCount: 0,
          };
          current.runCount += 1;
          if (run.responseNormalization === 'provider_structured') {
            current.structuredCount += 1;
          } else if (run.responseNormalization === 'normalized_sections') {
            current.normalizedCount += 1;
          } else if (run.responseNormalization === 'synthetic_fallback') {
            current.fallbackCount += 1;
          }
          buckets.set(date, current);
          return buckets;
        }, new Map<string, {
          date: string;
          runCount: number;
          structuredCount: number;
          normalizedCount: number;
          fallbackCount: number;
        }>()).values(),
      )
        .sort((left, right) => left.date.localeCompare(right.date))
        .slice(-7);
      const providerCoworkStructuredCount = providerCoworkRuns.filter(
        (run) => run.responseNormalization === 'provider_structured',
      ).length;
      const providerCoworkNormalizedCount = providerCoworkRuns.filter(
        (run) => run.responseNormalization === 'normalized_sections',
      ).length;
      const providerCoworkFallbackCount = providerCoworkRuns.filter(
        (run) => run.responseNormalization === 'synthetic_fallback',
      ).length;
      return {
        status: shellStatus,
        runtimeHome,
        serviceVersion: app.getVersion(),
        serviceName,
        connected,
        readiness: !shellStatus.availableInBuild ? 'unavailable' : connected ? 'ready' : 'idle',
        sessionCount: sessions.size,
        runCount: runs.size,
        artifactCount: artifacts.length,
        scheduleCount: schedules.length,
        pendingApprovalCount: pendingApprovalFlows.length,
        interruptedRunCount,
        activeSessionKey,
        defaultModel: resolveDefaultModel(),
        stateRestoreStatus,
        lastRecoveryNote,
        latestArtifactSummary: latestArtifactSummary(),
        latestRunTimelinePhase: latestTimelineEntry?.phase ?? null,
        latestRunTimelineMessage: latestTimelineEntry?.message ?? null,
        chatProviders: providerStatuses,
        providerBackedModelCount: providerModelChoices.length,
        providerCoworkRunCount: providerCoworkRuns.length,
        providerCoworkStructuredCount,
        providerCoworkNormalizedCount,
        providerCoworkFallbackCount,
        providerCoworkNormalizationByProvider,
        providerCoworkNormalizationTrend,
        lastProviderId,
        lastProviderError,
        lastScheduledJobName,
        lastScheduleError,
      };
    },
    async getRunHistory(limit = 10): Promise<InternalEngineRunRecord[]> {
      if (!shellStatus.availableInBuild) {
        return [];
      }
      await loadPersistedState();
      const artifactById = new Map(artifacts.map((artifact) => [artifact.id, artifact]));
      return Array.from(runs.values())
        .sort((left, right) => right.updatedAt - left.updatedAt)
        .slice(0, limit)
        .map((run) => ({
          ...run,
          ...(run.artifactId && artifactById.has(run.artifactId)
            ? { artifact: artifactById.get(run.artifactId)! }
            : {}),
          ...(run.timeline ? { timeline: [...run.timeline].sort((left, right) => left.at - right.at) } : {}),
        }));
    },
    async getRunDetails(runId: string): Promise<InternalEngineRunRecord | null> {
      if (!shellStatus.availableInBuild) {
        return null;
      }
      await loadPersistedState();
      const run = runs.get(runId);
      if (!run) {
        return null;
      }
      const artifact = run.artifactId ? artifacts.find((entry) => entry.id === run.artifactId) ?? null : null;
      return {
        ...run,
        ...(artifact ? { artifact } : {}),
        ...(run.timeline ? { timeline: [...run.timeline].sort((left, right) => left.at - right.at) } : {}),
      };
    },
    async getRuntimeRetentionPolicy() {
      if (!shellStatus.availableInBuild) {
        return buildRuntimeRetentionPolicy();
      }
      await loadPersistedState();
      return buildRuntimeRetentionPolicy();
    },
    async testProviderConnection(
      providerId: InternalChatProviderId,
      configOverride?: Partial<InternalProviderConfig>,
    ): Promise<InternalProviderConnectionTestResult> {
      await refreshProviderCatalogFromConfig();
      return testInternalProviderConnection(providerId, {
        ...storedInternalProviderConfig,
        ...configOverride,
      });
    },
    async debugNormalizeCoworkResponse(payload: {
      phase: 'planning' | 'continuation';
      task?: string;
      rawText: string;
      requestedActions?: EngineRequestedAction[];
      execution?: {
        receipts?: LocalActionReceipt[];
        previews?: string[];
        errors?: string[];
      };
    }): Promise<InternalEngineCoworkNormalizationProbeResult> {
      if (payload.phase === 'planning') {
        const result = normalizeProviderBackedCoworkPlanningText({
          task: payload.task ?? '',
          rawText: payload.rawText,
          requestedActions: payload.requestedActions ?? [],
        });
        return {
          phase: 'planning',
          normalization: result.normalization,
          text: result.text,
        };
      }

      const result = normalizeProviderBackedCoworkContinuationText({
        rawText: payload.rawText,
        requestedActions: payload.requestedActions ?? [],
        execution: {
          receipts: payload.execution?.receipts ?? [],
          previews: payload.execution?.previews ?? [],
          errors: payload.execution?.errors ?? [],
        },
      });
      return {
        phase: 'continuation',
        normalization: result.normalization,
        text: result.text,
      };
    },
    async debugBuildCoworkPrompt(payload: {
      phase: 'planning' | 'continuation';
      model: string;
      taskAndContext?: string;
      sessionKey?: string;
      approvedActions?: EngineRequestedAction[];
      rejectedActions?: InternalEngineCoworkContinuationRequest['rejectedActions'];
      execution?: {
        receipts?: LocalActionReceipt[];
        previews?: string[];
        errors?: string[];
      };
    }): Promise<InternalEngineCoworkPromptProbeResult> {
      const providerId = resolveProviderIdForModel(payload.model);
      if (!providerId) {
        throw new Error(`Unsupported provider-backed cowork model: ${payload.model}`);
      }

      if (payload.phase === 'planning') {
        return {
          phase: 'planning',
          providerId,
          text: buildProviderBackedCoworkPlanningPrompt(payload.taskAndContext ?? '', payload.model),
        };
      }

      return {
        phase: 'continuation',
        providerId,
        text: buildProviderBackedCoworkContinuationPrompt({
          model: payload.model,
          sessionKey: payload.sessionKey ?? 'internal:test-session',
          approvedActions: payload.approvedActions ?? [],
          rejectedActions: payload.rejectedActions ?? [],
          execution: {
            receipts: payload.execution?.receipts ?? [],
            previews: payload.execution?.previews ?? [],
            errors: payload.execution?.errors ?? [],
          },
        }),
      };
    },
    async createChatSession(): Promise<string> {
      requireConnected();
      const key = `internal:chat:${crypto.randomUUID()}`;
      activeSessionKey = ensureSession(key, 'chat').key;
      await persistState();
      return activeSessionKey;
    },
    async createCoworkSession(): Promise<string> {
      requireConnected();
      const key = `internal:cowork:${crypto.randomUUID()}`;
      activeSessionKey = ensureSession(key, 'cowork').key;
      await persistState();
      return activeSessionKey;
    },
    async resolveSessionKey(preferredKey = 'main'): Promise<string> {
      requireConnected();
      if (!preferredKey || preferredKey === 'main') {
        activeSessionKey = mainSessionKey;
        return mainSessionKey;
      }
      activeSessionKey = ensureSession(
        preferredKey,
        preferredKey.startsWith('internal:cowork:') ? 'cowork' : 'chat',
      ).key;
      await persistState();
      return activeSessionKey;
    },
    async listSessions(limit = 200): Promise<EngineSessionSummary[]> {
      requireConnected();
      return Array.from(sessions.values())
        .sort((left, right) => right.updatedAt - left.updatedAt)
        .slice(0, limit)
        .map(({ key, kind, title }) => ({ key, kind, title }));
    },
    async listModels(): Promise<EngineModelChoice[]> {
      requireConnected();
      await refreshProviderCatalogFromConfig();
      return listAvailableModels();
    },
    async listCronJobs(): Promise<EngineCronJob[]> {
      requireConnected();
      return schedules.map(toEngineCronJob);
    },
    async getScheduleHistoryRetentionLimit(): Promise<number> {
      requireConnected();
      return scheduleHistoryRetentionLimit;
    },
    async setRuntimeRetentionPolicy(payload: {
      runHistoryRetentionLimit?: number;
      artifactHistoryRetentionLimit?: number;
    }) {
      await loadPersistedState();
      runHistoryRetentionLimit = normalizeRetentionLimit(payload.runHistoryRetentionLimit, runHistoryRetentionLimit);
      artifactHistoryRetentionLimit = normalizeRetentionLimit(payload.artifactHistoryRetentionLimit, artifactHistoryRetentionLimit);
      enforceRuntimeRetention();
      await persistState();
      return buildRuntimeRetentionPolicy();
    },
    async createPromptSchedule(payload: {
      kind?: 'chat' | 'cowork';
      prompt: string;
      name?: string;
      intervalMinutes?: number;
      projectId?: string;
      projectTitle?: string;
      rootPath?: string;
      model?: string | null;
    }): Promise<EngineCronJob> {
      requireConnected();
      const prompt = payload.prompt.trim();
      if (!prompt) {
        throw new Error('Cannot create an internal schedule without a prompt.');
      }
      const intervalMinutes =
        Number.isFinite(payload.intervalMinutes) && Number(payload.intervalMinutes) >= 1
          ? Math.max(1, Math.round(Number(payload.intervalMinutes)))
          : 1;
      const preview = previewPrompt(prompt) || 'Scheduled prompt';
      const record: PersistedInternalScheduleRecord = {
        id: crypto.randomUUID(),
        kind: payload.kind === 'cowork' ? 'cowork' : 'chat',
        name: payload.name?.trim() || `Scheduled chat: ${preview}`,
        prompt,
        schedule: `every ${intervalMinutes} minute${intervalMinutes === 1 ? '' : 's'}`,
        intervalMinutes,
        enabled: true,
        state: 'idle',
        nextRunAt: computeNextRunAt(intervalMinutes),
        lastRunAt: null,
        ...(payload.projectId?.trim() ? { projectId: payload.projectId.trim() } : {}),
        ...(payload.projectTitle?.trim() ? { projectTitle: payload.projectTitle.trim() } : {}),
        ...(payload.rootPath?.trim() ? { rootPath: payload.rootPath.trim() } : {}),
        ...(payload.model?.trim() ? { model: payload.model.trim() } : {}),
      };
      schedules = [...schedules, record];
      await persistState();
      return toEngineCronJob(record);
    },
    async updatePromptSchedule(
      id: string,
      payload: {
        enabled?: boolean;
        intervalMinutes?: number;
        name?: string;
        prompt?: string;
        model?: string | null;
        clearHistory?: boolean;
      },
    ): Promise<EngineCronJob> {
      requireConnected();
      const schedule = schedules.find((entry) => entry.id === id);
      if (!schedule) {
        throw new Error('Internal schedule not found.');
      }
      if (typeof payload.name === 'string') {
        const nextName = payload.name.trim();
        if (!nextName) {
          throw new Error('Internal schedule name is required.');
        }
        schedule.name = nextName;
      }
      if (typeof payload.prompt === 'string') {
        const nextPrompt = payload.prompt.trim();
        if (!nextPrompt) {
          throw new Error('Internal schedule prompt is required.');
        }
        schedule.prompt = nextPrompt;
      }
      if (payload.model !== undefined) {
        const nextModel = typeof payload.model === 'string' ? payload.model.trim() : '';
        schedule.model = nextModel || undefined;
      }
      if (typeof payload.enabled === 'boolean') {
        schedule.enabled = payload.enabled;
        schedule.state = payload.enabled ? 'idle' : 'paused';
        schedule.nextRunAt = payload.enabled ? computeNextRunAt(schedule.intervalMinutes) : null;
      }
      if (Number.isFinite(payload.intervalMinutes) && Number(payload.intervalMinutes) >= 1) {
        schedule.intervalMinutes = Math.max(1, Math.round(Number(payload.intervalMinutes)));
        schedule.schedule = `every ${schedule.intervalMinutes} minute${schedule.intervalMinutes === 1 ? '' : 's'}`;
        if (schedule.enabled) {
          schedule.nextRunAt = computeNextRunAt(schedule.intervalMinutes);
          schedule.state = 'idle';
        }
      }
      if (payload.clearHistory) {
        schedule.lastRunAt = null;
        schedule.lastRunId = undefined;
        schedule.lastRunStatus = undefined;
        schedule.lastRunSummary = undefined;
        schedule.totalRunCount = 0;
        schedule.completedRunCount = 0;
        schedule.blockedRunCount = 0;
        schedule.approvalWaitCount = 0;
        schedule.recentRunHistory = [];
        schedule.state = schedule.enabled ? 'idle' : 'paused';
        schedule.nextRunAt = schedule.enabled ? computeNextRunAt(schedule.intervalMinutes) : null;
      }
      await persistState();
      return toEngineCronJob(schedule);
    },
    async deletePromptSchedule(id: string): Promise<void> {
      requireConnected();
      schedules = schedules.filter((entry) => entry.id !== id);
      await persistState();
    },
    async runPromptScheduleNow(id: string): Promise<EngineCronJob> {
      requireConnected();
      const schedule = schedules.find((entry) => entry.id === id);
      if (!schedule) {
        throw new Error('Internal schedule not found.');
      }
      if (schedule.state === 'awaiting_approval') {
        throw new Error('Resolve the pending approval before running this schedule again.');
      }
      if (schedule.state === 'running' || schedule.state === 'executing') {
        throw new Error('This internal schedule is already running.');
      }
      await runScheduledPrompt(schedule);
      return toEngineCronJob(schedule);
    },
    async setScheduleHistoryRetentionLimit(limit: number): Promise<number> {
      requireConnected();
      if (!Number.isFinite(limit) || Number(limit) < 1) {
        throw new Error('Schedule history retention limit must be at least 1.');
      }
      scheduleHistoryRetentionLimit = Math.max(1, Math.round(Number(limit)));
      for (const schedule of schedules) {
        if (schedule.recentRunHistory?.length) {
          schedule.recentRunHistory = schedule.recentRunHistory.slice(-scheduleHistoryRetentionLimit);
        }
      }
      await persistState();
      return scheduleHistoryRetentionLimit;
    },
    async seedScheduleArtifactForE2E(id: string): Promise<EngineCronJob> {
      requireConnected();
      return seedScheduleArtifactForE2E(id);
    },
    async getSessionModel(sessionKey: string): Promise<string | null> {
      requireConnected();
      return ensureSession(
        sessionKey,
        sessionKey.startsWith('internal:cowork:') ? 'cowork' : 'chat',
      ).model;
    },
    async setSessionModel(sessionKey: string, modelValue: string | null): Promise<void> {
      requireConnected();
      refreshProviderCatalog();
      const session = ensureSession(
        sessionKey,
        sessionKey.startsWith('internal:cowork:') ? 'cowork' : 'chat',
      );
      const nextModel = resolveModelValue(modelValue && modelValue.trim() ? modelValue.trim() : resolveDefaultModel());
      const previousModel = resolveModelValue(session.model);
      session.model = nextModel;
      if (previousModel !== nextModel) {
        appendSystemMessage(session.messages, `Mode switched to ${getModelBehavior(nextModel).label}.`);
        trimSessionHistory(session);
      }
      session.updatedAt = now();
      await persistState();
    },
    async setSessionTitle(sessionKey: string, title: string | null): Promise<void> {
      requireConnected();
      const session = ensureSession(
        sessionKey,
        sessionKey.startsWith('internal:cowork:') ? 'cowork' : 'chat',
      );
      session.title = title && title.trim() ? normalizeSessionTitle(title) : undefined;
      session.updatedAt = now();
      await persistState();
    },
    async deleteSession(sessionKey: string): Promise<void> {
      requireConnected();
      if (sessionKey === mainSessionKey) {
        const mainSession = ensureSession(mainSessionKey, 'main');
        for (const [runId, run] of runs.entries()) {
          if (run.sessionKey === mainSessionKey) {
            runs.delete(runId);
          }
        }
        artifacts = artifacts.filter((artifact) => artifact.sessionKey !== mainSessionKey);
        pendingApprovalFlows = pendingApprovalFlows.filter((flow) => flow.sessionKey !== mainSessionKey);
        sessions.set(mainSessionKey, {
          ...mainSession,
          title: 'Main chat',
          messages: [],
          updatedAt: now(),
        });
        activeSessionKey = mainSessionKey;
        await persistState();
        return;
      }
      sessions.delete(sessionKey);
      for (const [runId, run] of runs.entries()) {
        if (run.sessionKey === sessionKey) {
          runs.delete(runId);
        }
      }
      artifacts = artifacts.filter((artifact) => artifact.sessionKey !== sessionKey);
      pendingApprovalFlows = pendingApprovalFlows.filter((flow) => flow.sessionKey !== sessionKey);
      if (activeSessionKey === sessionKey) {
        activeSessionKey = mainSessionKey;
      }
      ensureSession(mainSessionKey, 'main');
      await persistState();
    },
    async getHistory(sessionKey: string, limit = 50): Promise<EngineChatMessage[]> {
      requireConnected();
      return ensureSession(
        sessionKey,
        sessionKey === mainSessionKey ? 'main' : sessionKey.startsWith('internal:cowork:') ? 'cowork' : 'chat',
      ).messages.slice(-limit);
    },
    async sendChat(
      sessionKey: string,
      text: string,
      emitEvent?: (frame: {
        type: 'event';
        event: 'chat';
        payload: Record<string, unknown>;
      }) => void,
    ): Promise<InternalEngineSendChatResult> {
      requireConnected();
      const session = ensureSession(
        sessionKey,
        sessionKey === mainSessionKey ? 'main' : sessionKey.startsWith('internal:cowork:') ? 'cowork' : 'chat',
      );
      const nextModel = resolveModelValue(session.model);
      session.model = nextModel;
      ensureModeBootstrap(session);
      const userMessage: EngineChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        text,
      };
      const runId = crypto.randomUUID();
      let requestedActions = session.kind === 'cowork' ? buildCoworkFoundationActions(text) : [];
      let activityItems = session.kind === 'cowork' ? buildCoworkFoundationActivityItems(requestedActions) : [];
      let responseNormalization: PersistedInternalRunRecord['responseNormalization'];
      const providerBackedChat = isProviderBackedInternalModel(nextModel);
      let assistantText: string;
      const streamMessageId = crypto.randomUUID();
      if (providerBackedChat) {
        await refreshProviderCatalogFromConfig();
        try {
          const providerResult = await sendInternalProviderChat(
            nextModel,
            [
              ...session.messages,
              {
                ...userMessage,
                text: session.kind === 'cowork' ? buildProviderBackedCoworkPlanningPrompt(text, nextModel) : text,
              },
            ],
            storedInternalProviderConfig,
            {
              onTextDelta: emitEvent
                ? (deltaText) => {
                    emitEvent({
                      type: 'event',
                      event: 'chat',
                      payload: {
                        providerId: 'internal',
                        runtimeKind: 'internal',
                        sessionKind: session.kind,
                        sessionKey: session.key,
                        runId,
                        model: nextModel,
                        state: 'delta',
                        message: {
                          id: streamMessageId,
                          role: 'assistant',
                          text: stripEngineActionPayloadFromText(deltaText),
                        },
                        requestedActions: [],
                        activityItems: [],
                        engineActionPhase: session.kind === 'cowork' ? 'planning' : 'none',
                        engineActionMode: 'none',
                      },
                    });
                  }
                : undefined,
            },
          );
          lastProviderId = providerResult.providerId;
          lastProviderError = null;
          if (session.kind === 'cowork') {
            requestedActions = sanitizeCoworkReadOnlyActions(parseEngineRequestedActions(providerResult.text));
            const normalizedPlanning = normalizeProviderBackedCoworkPlanningText({
              task: text,
              rawText: providerResult.text,
              requestedActions,
            });
            assistantText = normalizedPlanning.text;
            responseNormalization = normalizedPlanning.normalization;
            activityItems =
              requestedActions.length > 0
                ? buildCoworkFoundationActivityItems(requestedActions)
                : parseEngineActivityItems(providerResult.text);
          } else {
            assistantText = stripEngineActionPayloadFromText(providerResult.text);
          }
        } catch (error) {
          lastProviderError = error instanceof Error ? error.message : 'Provider-backed internal chat failed.';
          throw error;
        }
      } else {
        assistantText = formatInternalAssistantText(nextModel, text, session.key, session.messages.length + 2, session.kind);
      }
      const assistantMessage: EngineChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        text: assistantText,
      };
      session.messages.push(userMessage, assistantMessage);
      trimSessionHistory(session);
      session.updatedAt = now();
      activeSessionKey = session.key;
      if (!session.title) {
        session.title = inferSessionTitle(session.key, text, nextModel);
      }
      upsertRunRecord({
        runId,
        sessionKey: session.key,
        sessionKind: session.kind,
        model: nextModel,
        ...(providerBackedChat ? { providerBacked: true as const } : {}),
        ...(providerBackedChat
          ? { providerPhase: session.kind === 'cowork' ? ('planning' as const) : ('chat' as const) }
          : {}),
        ...(providerBackedChat && session.kind === 'cowork'
          ? {
              responseSchemaVersion: 1 as const,
              responseNormalization: responseNormalization ?? 'synthetic_fallback' as const,
            }
          : {}),
        actionMode: requestedActions.length > 0 ? 'read-only' : 'none',
        status: requestedActions.length > 0 ? 'awaiting_approval' : 'completed',
        startedAt: now(),
        updatedAt: now(),
        ...(previewPrompt(text) ? { promptPreview: previewPrompt(text) } : {}),
        summary: requestedActions.length > 0
          ? providerBackedChat && lastProviderId
            ? `Awaiting operator approval for provider-backed read-only cowork actions via ${lastProviderId}.`
            : 'Awaiting operator approval for internal read-only actions.'
          : providerBackedChat && lastProviderId
            ? session.kind === 'cowork'
              ? `Internal provider cowork planning completed via ${lastProviderId}.`
              : `Internal provider chat completed via ${lastProviderId}.`
            : 'Internal chat run completed.',
        timeline: [
          {
            id: crypto.randomUUID(),
            at: now(),
            phase: 'submitted',
            message: session.kind === 'cowork' ? 'Internal cowork run submitted.' : 'Internal chat run submitted.',
          },
          {
            id: crypto.randomUUID(),
            at: now(),
            phase: requestedActions.length > 0 ? 'awaiting_approval' : 'completed',
            message: requestedActions.length > 0
              ? providerBackedChat && lastProviderId
                ? `Awaiting operator approval for provider-backed read-only cowork actions via ${lastProviderId}.`
                : 'Awaiting operator approval for internal read-only actions.'
              : providerBackedChat && lastProviderId
                ? session.kind === 'cowork'
                  ? `Internal provider cowork planning completed via ${lastProviderId}.`
                  : `Internal provider chat completed via ${lastProviderId}.`
                : 'Internal chat response completed.',
          },
        ],
      });
      interruptedRunCount = Array.from(runs.values()).filter((run) => run.status === 'interrupted').length;
      await persistState();
      return {
        sessionKey: session.key,
        runId,
        assistantMessage,
        model: nextModel,
        historyLength: session.messages.length,
        sessionTitle: session.title,
        providerId: 'internal',
        runtimeKind: 'internal',
        sessionKind: session.kind,
        requestedActions,
        activityItems,
        engineActionPhase: requestedActions.length > 0 ? 'awaiting_approval' : 'completed',
        engineActionMode: requestedActions.length > 0 ? 'read-only' : 'none',
      };
    },
    async continueCoworkRun(
      payload: InternalEngineCoworkContinuationRequest,
      emitEvent?: (frame: {
        type: 'event';
        event: 'chat';
        payload: Record<string, unknown>;
      }) => void,
    ): Promise<InternalEngineSendChatResult & {
      execution: {
        receipts: LocalActionReceipt[];
        previews: string[];
        errors: string[];
      };
    }> {
      requireConnected();
      const session = ensureSession(
        payload.sessionKey,
        payload.sessionKey === mainSessionKey ? 'main' : payload.sessionKey.startsWith('internal:cowork:') ? 'cowork' : 'chat',
      );
      const nextModel = resolveModelValue(session.model);
      session.model = nextModel;
      ensureModeBootstrap(session);
      const existingRun = runs.get(payload.runId);
      if (existingRun) {
        existingRun.status = 'executing';
        existingRun.updatedAt = now();
        existingRun.summary = 'Executing approved internal read-only actions.';
        appendRunTimelineEntry(payload.runId, {
          phase: 'executing',
          message: 'Executing approved internal read-only actions.',
          details: `Approved: ${payload.approvedActions.length}. Rejected: ${payload.rejectedActions.length}.`,
          at: existingRun.updatedAt,
        });
      }
      await persistState();

      await delay(250);

      const approvedExecution = await executeApprovedReadOnlyActions(payload.rootPath, payload.approvedActions);
      const rejectedReceipts: LocalActionReceipt[] = payload.rejectedActions.map((action) => ({
        id: action.actionId || action.id,
        type: action.actionType,
        path: action.path,
        status: 'error',
        errorCode: 'REJECTED_BY_OPERATOR',
        message: action.reason || 'Rejected by operator.',
      }));
      const rejectedErrors = payload.rejectedActions.map((action) => `${action.path}: ${action.reason || 'Rejected by operator.'}`);
      const execution = {
        receipts: [...rejectedReceipts, ...approvedExecution.receipts],
        previews: approvedExecution.previews,
        errors: [...rejectedErrors, ...approvedExecution.errors],
      };
      for (const receipt of execution.receipts) {
        appendRunTimelineEntry(payload.runId, {
          phase: receipt.status === 'error' ? 'blocked' : 'completed',
          message:
            receipt.status === 'error'
              ? `Action ${receipt.type} on ${receipt.path} completed with an error.`
              : `Action ${receipt.type} on ${receipt.path} completed successfully.`,
          action: {
            actionId: receipt.id,
            actionType: receipt.type,
            path: receipt.path,
          },
          receipt: {
            status: receipt.status,
            ...(receipt.message ? { message: receipt.message } : {}),
            ...(receipt.errorCode ? { errorCode: receipt.errorCode } : {}),
          },
        });
      }
      const providerBackedCowork = isProviderBackedInternalModel(nextModel);
      let requestedActions: EngineRequestedAction[] = [];
      let activityItems: ChatActivityItem[] = [];
      let assistantText: string;
      let responseNormalization: PersistedInternalRunRecord['responseNormalization'];
      const streamMessageId = crypto.randomUUID();
      const priorActionIdentities = new Set(
        [
          ...payload.approvedActions.map((action) => `${action.type}:${action.path}`),
          ...payload.rejectedActions.map((action) => `${action.actionType}:${action.path}`),
        ],
      );
      if (providerBackedCowork) {
        await refreshProviderCatalogFromConfig();
        try {
          const providerResult = await sendInternalProviderChat(
            nextModel,
            [
              ...session.messages,
              {
                id: crypto.randomUUID(),
                role: 'user',
                text: buildProviderBackedCoworkContinuationPrompt({
                  model: nextModel,
                  sessionKey: session.key,
                  approvedActions: payload.approvedActions,
                  rejectedActions: payload.rejectedActions,
                  execution,
                }),
              },
            ],
            storedInternalProviderConfig,
            {
              onTextDelta: emitEvent
                ? (deltaText) => {
                    emitEvent({
                      type: 'event',
                      event: 'chat',
                      payload: {
                        providerId: 'internal',
                        runtimeKind: 'internal',
                        sessionKind: session.kind,
                        sessionKey: session.key,
                        runId: payload.runId,
                        model: nextModel,
                        state: 'delta',
                        message: {
                          id: streamMessageId,
                          role: 'assistant',
                          text: stripEngineActionPayloadFromText(deltaText),
                        },
                        requestedActions: [],
                        activityItems: [],
                        engineActionPhase: 'executing',
                        engineActionMode: 'read-only',
                      },
                    });
                  }
                : undefined,
            },
          );
          lastProviderId = providerResult.providerId;
          lastProviderError = null;
          requestedActions = sanitizeCoworkReadOnlyActions(parseEngineRequestedActions(providerResult.text), {
            exclude: priorActionIdentities,
          });
          const normalizedContinuation = normalizeProviderBackedCoworkContinuationText({
            rawText: providerResult.text,
            execution,
            requestedActions,
          });
          assistantText = normalizedContinuation.text;
          responseNormalization = normalizedContinuation.normalization;
          activityItems =
            requestedActions.length > 0
              ? buildCoworkFoundationActivityItems(requestedActions)
              : parseEngineActivityItems(providerResult.text);
        } catch (error) {
          lastProviderError = error instanceof Error ? error.message : 'Provider-backed internal cowork continuation failed.';
          throw error;
        }
      } else {
        assistantText = formatCoworkContinuationResponse({
          sessionKey: session.key,
          approvedCount: payload.approvedActions.length,
          rejectedCount: payload.rejectedActions.length,
          previews: execution.previews,
          errors: execution.errors,
        });
      }
      const assistantMessage: EngineChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        text: assistantText,
      };
      session.messages.push(assistantMessage);
      trimSessionHistory(session);
      session.updatedAt = now();
      activeSessionKey = session.key;
      const continuationBlocked =
        execution.errors.length > 0 && approvedExecution.receipts.every((receipt) => receipt.status === 'error');
      upsertRunRecord({
        runId: payload.runId,
        sessionKey: session.key,
        sessionKind: session.kind,
        model: nextModel,
        ...(providerBackedCowork ? { providerBacked: true as const, providerPhase: 'continuation' as const } : {}),
        ...(providerBackedCowork
          ? {
              responseSchemaVersion: 1 as const,
              responseNormalization: responseNormalization ?? 'synthetic_fallback' as const,
            }
          : {}),
        actionMode: requestedActions.length > 0 ? 'read-only' : 'none',
        status: requestedActions.length > 0 ? 'awaiting_approval' : continuationBlocked ? 'blocked' : 'completed',
        startedAt: existingRun?.startedAt ?? now(),
        updatedAt: now(),
        ...(existingRun?.promptPreview ? { promptPreview: existingRun.promptPreview } : {}),
        summary: requestedActions.length > 0
          ? providerBackedCowork && lastProviderId
            ? `Awaiting operator approval for additional provider-backed read-only cowork actions via ${lastProviderId}.`
            : 'Awaiting operator approval for additional internal read-only actions.'
          : continuationBlocked
            ? 'Internal cowork continuation completed with blocking errors.'
            : providerBackedCowork && lastProviderId
              ? `Internal provider cowork continuation completed via ${lastProviderId}.`
              : 'Internal cowork continuation completed.',
      });
      const artifactId = `artifact:${payload.runId}`;
      const resultSummary =
        execution.errors.length > 0 && approvedExecution.receipts.every((receipt) => receipt.status === 'error')
          ? 'Internal cowork continuation recorded blocking execution errors.'
          : 'Internal cowork continuation recorded execution receipts.';
      const completionPhase = requestedActions.length > 0 ? 'awaiting_approval' : continuationBlocked ? 'blocked' : 'completed';
      artifacts = [
        ...artifacts.filter((artifact) => artifact.runId !== payload.runId),
        {
          id: artifactId,
          runId: payload.runId,
          sessionKey: session.key,
          kind: 'cowork_execution' as const,
          createdAt: now(),
          receiptCount: execution.receipts.length,
          receipts: execution.receipts,
          previews: execution.previews,
          errors: execution.errors,
          summary: resultSummary,
        },
      ].sort((left, right) => left.createdAt - right.createdAt).slice(-200);
      pendingApprovalFlows = pendingApprovalFlows.filter((flow) => flow.runId !== payload.runId);
      interruptedRunCount = Array.from(runs.values()).filter((run) => run.status === 'interrupted').length;
      const runRecord = runs.get(payload.runId);
      const relatedSchedule = runRecord?.scheduleId
        ? schedules.find((entry) => entry.id === runRecord.scheduleId)
        : schedules.find((entry) => entry.lastRunId === payload.runId);
      if (runRecord) {
        runRecord.artifactId = artifactId;
        runRecord.approvedActionCount = payload.approvedActions.length;
        runRecord.rejectedActionCount = payload.rejectedActions.length;
        runRecord.resultSummary = resultSummary;
        appendRunTimelineEntry(payload.runId, {
          phase: completionPhase,
          message: requestedActions.length > 0
            ? providerBackedCowork && lastProviderId
              ? `Awaiting operator approval for additional provider-backed read-only cowork actions via ${lastProviderId}.`
              : 'Awaiting operator approval for additional internal read-only actions.'
            : resultSummary,
          details: `Receipts: ${execution.receipts.length}. Errors: ${execution.errors.length}.`,
          at: now(),
        });
      }
        if (relatedSchedule) {
          relatedSchedule.lastRunId = payload.runId;
          relatedSchedule.lastRunAt = new Date().toISOString();
          relatedSchedule.nextRunAt = computeNextRunAt(relatedSchedule.intervalMinutes);
          relatedSchedule.state = requestedActions.length > 0 ? 'awaiting_approval' : continuationBlocked ? 'blocked' : 'completed';
          relatedSchedule.lastRunStatus = requestedActions.length > 0 ? 'awaiting_approval' : continuationBlocked ? 'blocked' : 'completed';
          relatedSchedule.lastRunSummary = requestedActions.length > 0
            ? `Awaiting approval for ${requestedActions.length} additional read-only action${requestedActions.length === 1 ? '' : 's'}.`
            : resultSummary;
          relatedSchedule.lastArtifactSummary = resultSummary;
          relatedSchedule.lastArtifactReceiptCount = execution.receipts.length;
          relatedSchedule.lastArtifactErrorCount = execution.errors.length;
          relatedSchedule.lastArtifactPreviews = execution.previews.slice(0, 3);
          relatedSchedule.lastArtifactErrors = execution.errors.slice(0, 3);
          relatedSchedule.lastError = continuationBlocked ? execution.errors[0] ?? resultSummary : undefined;
          appendScheduleRunHistory(relatedSchedule, {
            runId: payload.runId,
            status: relatedSchedule.lastRunStatus,
            summary: relatedSchedule.lastRunSummary,
          });
        }
      await persistState();

      return {
        sessionKey: session.key,
        runId: payload.runId,
        assistantMessage,
        model: nextModel,
        historyLength: session.messages.length,
        sessionTitle: session.title,
        providerId: 'internal',
        runtimeKind: 'internal',
        sessionKind: session.kind,
        requestedActions,
        activityItems,
        engineActionPhase: requestedActions.length > 0 ? 'awaiting_approval' : continuationBlocked ? 'blocked' : 'completed',
        engineActionMode: requestedActions.length > 0 ? 'read-only' : 'none',
        execution,
      };
    },
    async listPendingApprovals(): Promise<InternalApprovalRecoveryFlow[]> {
      requireConnected();
      return pendingApprovalFlows;
    },
    async savePendingApproval(flow: InternalApprovalRecoveryFlow): Promise<void> {
      requireConnected();
      pendingApprovalFlows = [
        ...pendingApprovalFlows.filter((entry) => entry.runId !== flow.runId),
        flow,
      ];
      await persistState();
    },
    async clearPendingApproval(runId: string): Promise<void> {
      requireConnected();
      pendingApprovalFlows = pendingApprovalFlows.filter((entry) => entry.runId !== runId);
      await persistState();
    },
    async applyPendingApprovalDecision(
      runId: string,
      decision: InternalEnginePendingApprovalDecision,
    ): Promise<InternalEnginePendingApprovalDecisionResult> {
      requireConnected();
      const flow = pendingApprovalFlows.find((entry) => entry.runId === runId);
      if (!flow) {
        return { kind: 'missing' };
      }

      const next = applyInternalApprovalRecoveryDecision(flow, decision);
      appendRunTimelineEntry(runId, {
        phase: 'approval_decision',
        message: decision.approved
          ? `Approved ${flow.currentApproval.summary}.`
          : `Rejected ${flow.currentApproval.summary}.`,
        ...(decision.approved ? {} : { details: decision.reason || 'Rejected by operator.' }),
        action: {
          actionId: flow.currentApproval.actionId,
          actionType: flow.currentApproval.actionType,
          path: flow.currentApproval.path,
        },
        decision: {
          approved: decision.approved,
          ...(decision.reason ? { reason: decision.reason } : {}),
        },
      });
      if (next.kind === 'next') {
        pendingApprovalFlows = [
          ...pendingApprovalFlows.filter((entry) => entry.runId !== runId),
          next.flow,
        ];
        appendRunTimelineEntry(runId, {
          phase: 'awaiting_approval',
          message: `Awaiting approval for ${next.flow.currentApproval.summary}.`,
        });
        await persistState();
        return next;
      }

      pendingApprovalFlows = pendingApprovalFlows.filter((entry) => entry.runId !== runId);
      await persistState();
      return next;
    },
    isConnected() {
      return connected;
    },
  };
  return service;
}

const extensionCategories: Record<string, string> = {
  '.pdf': 'Documents',
  '.doc': 'Documents',
  '.docx': 'Documents',
  '.txt': 'Documents',
  '.rtf': 'Documents',
  '.md': 'Documents',
  '.xls': 'Spreadsheets',
  '.xlsx': 'Spreadsheets',
  '.csv': 'Spreadsheets',
  '.ppt': 'Presentations',
  '.pptx': 'Presentations',
  '.key': 'Presentations',
  '.png': 'Images',
  '.jpg': 'Images',
  '.jpeg': 'Images',
  '.gif': 'Images',
  '.webp': 'Images',
  '.svg': 'Images',
  '.bmp': 'Images',
  '.zip': 'Archives',
  '.rar': 'Archives',
  '.7z': 'Archives',
  '.tar': 'Archives',
  '.gz': 'Archives',
  '.mp3': 'Audio',
  '.wav': 'Audio',
  '.m4a': 'Audio',
  '.aac': 'Audio',
  '.flac': 'Audio',
  '.mp4': 'Video',
  '.mov': 'Video',
  '.mkv': 'Video',
  '.avi': 'Video',
  '.wmv': 'Video',
  '.js': 'Code',
  '.ts': 'Code',
  '.tsx': 'Code',
  '.jsx': 'Code',
  '.json': 'Code',
  '.py': 'Code',
  '.java': 'Code',
  '.cs': 'Code',
  '.cpp': 'Code',
  '.c': 'Code',
};

const configPath = () => path.join(app.getPath('userData'), CLOFFICE_CONFIG_FILE);
const legacyConfigPath = () => path.join(app.getPath('userData'), LEGACY_ENGINE_CONFIG_FILE);
const providerSecretsPath = () => path.join(app.getPath('userData'), PROVIDER_SECRETS_FILE);

const isDev = !app.isPackaged;
const MAX_READ_FILE_BYTES = 256 * 1024;
const MAX_LIST_DIR_ITEMS = 200;
const BLOCKED_BASENAMES = new Set(['desktop.ini', 'thumbs.db']);

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const isLoopbackHost = (host: string) => host === 'localhost' || host === '127.0.0.1' || host === '::1';

function registerWebSocketOriginRewrite() {
  const filter = {
    urls: ['ws://*/*', 'wss://*/*'],
  };

  // Electron packaged builds run from file:// and may send an origin rejected by gateway allowlists.
  // Rewrite remote WS handshakes to the target host origin so gateway allowlist checks can pass.
  session.defaultSession.webRequest.onBeforeSendHeaders(filter, (details, callback) => {
    try {
      const target = new URL(details.url);
      if (isLoopbackHost(target.hostname)) {
        callback({ requestHeaders: details.requestHeaders });
        return;
      }

      const rewrittenOrigin = `${target.protocol === 'wss:' ? 'https:' : 'http:'}//${target.host}`;
      details.requestHeaders.Origin = rewrittenOrigin;
      details.requestHeaders.origin = rewrittenOrigin;
      callback({ requestHeaders: details.requestHeaders });
    } catch {
      callback({ requestHeaders: details.requestHeaders });
    }
  });
}

function registerDevContentSecurityPolicy() {
  if (!isDev) {
    return;
  }

  const filter = {
    urls: ['http://localhost:5173/*'],
  };

  const csp = [
    "default-src 'self' http://localhost:5173",
    "script-src 'self' 'unsafe-inline' http://localhost:5173",
    "style-src 'self' 'unsafe-inline' http://localhost:5173",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self' http: https: ws: wss:",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
  ].join('; ');

  session.defaultSession.webRequest.onHeadersReceived(filter, (details, callback) => {
    const responseHeaders = details.responseHeaders ?? {};
    responseHeaders['Content-Security-Policy'] = [csp];
    callback({ responseHeaders });
  });
}

function registerProdContentSecurityPolicy() {
  if (isDev) {
    return;
  }

  const filter = { urls: ['file://*/*'] };

  const csp = [
    "default-src 'self' file:",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self' http: https: ws: wss:",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
  ].join('; ');

  session.defaultSession.webRequest.onHeadersReceived(filter, (details, callback) => {
    const responseHeaders = details.responseHeaders ?? {};
    responseHeaders['Content-Security-Policy'] = [csp];
    callback({ responseHeaders });
  });
}

function isPathInside(rootPath: string, targetPath: string): boolean {
  const root = path.resolve(rootPath);
  const target = path.resolve(targetPath);
  const relative = path.relative(root, target);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function isHiddenOrBlockedPath(targetPath: string): boolean {
  const parts = targetPath.split(/[\\/]+/).filter((part) => part.length > 0);
  return parts.some((part) => part.startsWith('.') || BLOCKED_BASENAMES.has(part.toLowerCase()));
}

function normalizeRelativePath(relativePath: string): string {
  const normalized = relativePath.replaceAll('\\', '/').trim();
  if (!normalized || normalized === '.' || normalized === './') {
    return '';
  }
  return normalized;
}

function slugifyName(value: string): string {
  const collapsed = value.trim().replace(/[\s_]+/g, '-').replace(/[^a-zA-Z0-9-]/g, '').replace(/-+/g, '-');
  return collapsed.replace(/^-|-$/g, '').toLowerCase() || 'file';
}

function formatDatePrefix(timestampMs: number): string {
  const date = new Date(timestampMs);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function resolveCategory(fileName: string): string {
  const extension = path.extname(fileName).toLowerCase();
  return extensionCategories[extension] ?? 'Other';
}

async function ensurePathAllowed(rootPath: string): Promise<string> {
  const resolved = path.resolve(rootPath);
  const stats = await fs.stat(resolved);
  if (!stats.isDirectory()) {
    throw new Error('Root path must be a directory.');
  }

  return resolved;
}

async function assertRealPathInsideRoot(rootRealPath: string, candidatePath: string, message: string): Promise<void> {
  const candidateRealPath = await fs.realpath(candidatePath);
  if (!isPathInside(rootRealPath, candidateRealPath)) {
    throw new Error(message);
  }
}

async function resolveNearestExistingAncestorPath(startPath: string): Promise<string> {
  let current = path.resolve(startPath);

  while (true) {
    try {
      await fs.access(current);
      return current;
    } catch {
      const parent = path.dirname(current);
      if (parent === current) {
        return current;
      }
      current = parent;
    }
  }
}

async function assertTargetPathAllowed(rootPath: string, targetPath: string, message: string): Promise<void> {
  const rootRealPath = await fs.realpath(rootPath);
  const normalizedTargetPath = path.resolve(targetPath);
  const parentDir = path.dirname(normalizedTargetPath);
  const nearestExistingParent =
    normalizedTargetPath === path.resolve(rootPath)
      ? rootRealPath
      : await resolveNearestExistingAncestorPath(parentDir);
  await assertRealPathInsideRoot(rootRealPath, nearestExistingParent, message);

  try {
    const stat = await fs.lstat(normalizedTargetPath);
    if (stat.isSymbolicLink()) {
      throw new Error('Symbolic links are blocked for local file actions.');
    }
    await assertRealPathInsideRoot(rootRealPath, normalizedTargetPath, message);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException)?.code;
    if (code === 'ENOENT') {
      return;
    }
    throw error;
  }
}

async function planFolderOrganization(rootPath: string): Promise<LocalFilePlanResult> {
  const root = await ensurePathAllowed(rootPath);
  const entries = await fs.readdir(root, { withFileTypes: true });
  const actions: LocalFilePlanAction[] = [];

  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }

    const currentPath = path.join(root, entry.name);
    const stat = await fs.stat(currentPath);
    const extension = path.extname(entry.name);
    const baseName = path.basename(entry.name, extension);
    const datePrefix = formatDatePrefix(stat.mtimeMs);
    const slug = slugifyName(baseName);
    const normalizedFileName = `${datePrefix}_${slug}${extension.toLowerCase()}`;
    const category = resolveCategory(entry.name);
    const targetPath = path.join(root, category, normalizedFileName);

    if (path.resolve(currentPath) === path.resolve(targetPath)) {
      continue;
    }

    actions.push({
      id: `${entry.name}-${actions.length + 1}`,
      fromPath: currentPath,
      toPath: targetPath,
      category,
      operation: 'move',
    });
  }

  return {
    rootPath: root,
    actions,
  };
}

async function uniqueDestinationPath(destinationPath: string): Promise<string> {
  let candidate = destinationPath;
  let counter = 1;

  while (true) {
    try {
      await fs.access(candidate);
      const parsed = path.parse(destinationPath);
      counter += 1;
      candidate = path.join(parsed.dir, `${parsed.name}-${counter}${parsed.ext}`);
    } catch {
      return candidate;
    }
  }
}

async function applyFolderOrganizationPlan(rootPath: string, actions: LocalFilePlanAction[]): Promise<LocalFileApplyResult> {
  const root = await ensurePathAllowed(rootPath);
  const result: LocalFileApplyResult = {
    applied: 0,
    skipped: 0,
    errors: [],
  };

  for (const action of actions) {
    const fromPath = path.resolve(action.fromPath);
    const toPath = path.resolve(action.toPath);

    if (!isPathInside(root, fromPath) || !isPathInside(root, toPath)) {
      result.skipped += 1;
      result.errors.push(`Skipped out-of-scope action: ${action.fromPath}`);
      continue;
    }

    try {
      await fs.access(fromPath);
    } catch {
      result.skipped += 1;
      continue;
    }

    try {
      await fs.mkdir(path.dirname(toPath), { recursive: true });
      const finalToPath = await uniqueDestinationPath(toPath);
      await fs.rename(fromPath, finalToPath);
      result.applied += 1;
    } catch (error) {
      result.errors.push(error instanceof Error ? error.message : 'Unknown file operation error.');
      result.skipped += 1;
    }
  }

  return result;
}

async function writeFileInFolder(
  rootPath: string,
  relativePath: string,
  content: string,
  options?: { overwrite?: boolean },
): Promise<LocalFileCreateResult> {
  const root = await ensurePathAllowed(rootPath);

  const normalizedRelative = normalizeRelativePath(relativePath);
  if (!normalizedRelative) {
    throw new Error('A file path is required.');
  }

  if (path.isAbsolute(normalizedRelative)) {
    throw new Error('Use a path relative to the working folder.');
  }

  if (isHiddenOrBlockedPath(normalizedRelative)) {
    throw new Error('Target path is blocked by local safety rules.');
  }

  const resolvedTargetPath = path.resolve(root, normalizedRelative);
  if (!isPathInside(root, resolvedTargetPath)) {
    throw new Error('Target file must remain inside the working folder.');
  }

  await assertTargetPathAllowed(root, resolvedTargetPath, 'Target file must remain inside the working folder.');

  await fs.mkdir(path.dirname(resolvedTargetPath), { recursive: true });

  const overwrite = Boolean(options?.overwrite);
  if (!overwrite) {
    try {
      await fs.writeFile(resolvedTargetPath, content, { encoding: 'utf8', flag: 'wx' });
    } catch (error) {
      const code = (error as NodeJS.ErrnoException)?.code;
      if (code === 'EEXIST') {
        throw new Error('A file already exists at that path.');
      }
      throw error;
    }
  } else {
    await fs.writeFile(resolvedTargetPath, content, 'utf8');
  }

  return {
    filePath: resolvedTargetPath,
    created: true,
  };
}

async function readFileInFolder(rootPath: string, relativePath: string): Promise<LocalFileReadResult> {
  const root = await ensurePathAllowed(rootPath);

  const normalizedRelative = normalizeRelativePath(relativePath);
  if (!normalizedRelative) {
    throw new Error('A file path is required.');
  }

  if (path.isAbsolute(normalizedRelative)) {
    throw new Error('Use a path relative to the working folder.');
  }

  const resolvedTargetPath = path.resolve(root, normalizedRelative);
  if (!isPathInside(root, resolvedTargetPath)) {
    throw new Error('Target file must remain inside the working folder.');
  }

  await assertTargetPathAllowed(root, resolvedTargetPath, 'Target file must remain inside the working folder.');

  if (isHiddenOrBlockedPath(normalizedRelative)) {
    throw new Error('Target path is blocked by local safety rules.');
  }

  let stats;
  try {
    stats = await fs.stat(resolvedTargetPath);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException)?.code;
    if (code === 'ENOENT') {
      throw new Error(`File not found: ${resolvedTargetPath}`);
    }
    throw error;
  }
  if (!stats.isFile()) {
    throw new Error('Target path is not a file.');
  }

  if (stats.size > MAX_READ_FILE_BYTES) {
    throw new Error(`File exceeds ${MAX_READ_FILE_BYTES} byte safety limit.`);
  }

  const content = await fs.readFile(resolvedTargetPath, 'utf8');
  return {
    filePath: resolvedTargetPath,
    content,
  };
}

async function appendFileInFolder(rootPath: string, relativePath: string, content: string): Promise<LocalFileAppendResult> {
  const root = await ensurePathAllowed(rootPath);

  const normalizedRelative = normalizeRelativePath(relativePath);
  if (!normalizedRelative) {
    throw new Error('A file path is required.');
  }

  if (path.isAbsolute(normalizedRelative)) {
    throw new Error('Use a path relative to the working folder.');
  }

  if (isHiddenOrBlockedPath(normalizedRelative)) {
    throw new Error('Target path is blocked by local safety rules.');
  }

  const resolvedTargetPath = path.resolve(root, normalizedRelative);
  if (!isPathInside(root, resolvedTargetPath)) {
    throw new Error('Target file must remain inside the working folder.');
  }

  await assertTargetPathAllowed(root, resolvedTargetPath, 'Target file must remain inside the working folder.');

  await fs.mkdir(path.dirname(resolvedTargetPath), { recursive: true });
  await fs.appendFile(resolvedTargetPath, content, 'utf8');
  return {
    filePath: resolvedTargetPath,
    appended: true,
    bytesAppended: Buffer.byteLength(content, 'utf8'),
  };
}

async function resolveExistingPathWithOptionalExtension(requestedPath: string): Promise<string | null> {
  try {
    await fs.access(requestedPath);
    return requestedPath;
  } catch {
    // continue with extension-based lookup
  }

  if (path.extname(requestedPath)) {
    return null;
  }

  const parentDir = path.dirname(requestedPath);
  const requestedBase = path.basename(requestedPath);

  let entries;
  try {
    entries = await fs.readdir(parentDir, { withFileTypes: true });
  } catch {
    return null;
  }

  const candidates = entries
    .filter((entry) => entry.isFile() && path.parse(entry.name).name === requestedBase)
    .map((entry) => path.join(parentDir, entry.name));

  if (candidates.length === 1) {
    return candidates[0];
  }

  if (candidates.length > 1) {
    throw new Error(
      `Ambiguous path "${requestedPath}". Multiple files match this base name: ${candidates
        .map((candidate) => path.basename(candidate))
        .join(', ')}`,
    );
  }

  return null;
}

async function listDirInFolder(rootPath: string, relativePath?: string): Promise<LocalFileListResult> {
  const root = await ensurePathAllowed(rootPath);
  const rootRealPath = await fs.realpath(root);
  const normalizedRelative = normalizeRelativePath(relativePath ?? '');
  if (normalizedRelative && path.isAbsolute(normalizedRelative)) {
    throw new Error('Use a path relative to the working folder.');
  }

  if (normalizedRelative && isHiddenOrBlockedPath(normalizedRelative)) {
    return {
      rootPath: root,
      items: [],
      truncated: false,
    };
  }

  const targetPath = normalizedRelative ? path.resolve(root, normalizedRelative) : root;
  if (!isPathInside(root, targetPath)) {
    throw new Error('Target directory must remain inside the working folder.');
  }

  await assertRealPathInsideRoot(rootRealPath, targetPath, 'Target directory must remain inside the working folder.');

  const stat = await fs.stat(targetPath);
  if (!stat.isDirectory()) {
    throw new Error('Target path is not a directory.');
  }

  const entries = await fs.readdir(targetPath, { withFileTypes: true });
  const items: LocalFileListResult['items'] = [];

  for (const entry of entries) {
    const entryRelative = normalizeRelativePath(path.relative(root, path.join(targetPath, entry.name)));
    if (isHiddenOrBlockedPath(entryRelative)) {
      continue;
    }

    if (items.length >= MAX_LIST_DIR_ITEMS) {
      break;
    }

    const absolute = path.join(targetPath, entry.name);
    if (entry.isDirectory()) {
      items.push({
        path: entryRelative,
        kind: 'directory',
      });
      continue;
    }

    if (entry.isFile()) {
      const fileStat = await fs.stat(absolute);
      items.push({
        path: entryRelative,
        kind: 'file',
        size: fileStat.size,
        modifiedMs: fileStat.mtimeMs,
      });
    }
  }

  return {
    rootPath: root,
    items,
    truncated: entries.length > items.length,
  };
}

async function existsInFolder(rootPath: string, relativePath: string): Promise<LocalFileExistsResult> {
  const root = await ensurePathAllowed(rootPath);
  const rootRealPath = await fs.realpath(root);
  const normalizedRelative = normalizeRelativePath(relativePath);
  if (!normalizedRelative) {
    throw new Error('A file path is required.');
  }

  if (path.isAbsolute(normalizedRelative)) {
    throw new Error('Use a path relative to the working folder.');
  }

  if (isHiddenOrBlockedPath(normalizedRelative)) {
    throw new Error('Target path is blocked by local safety rules.');
  }

  const resolvedTargetPath = path.resolve(root, normalizedRelative);
  if (!isPathInside(root, resolvedTargetPath)) {
    throw new Error('Target path must remain inside the working folder.');
  }

  await assertTargetPathAllowed(root, resolvedTargetPath, 'Target path must remain inside the working folder.');

  try {
    const stat = await fs.stat(resolvedTargetPath);
    await assertRealPathInsideRoot(rootRealPath, resolvedTargetPath, 'Target path must remain inside the working folder.');
    return {
      path: resolvedTargetPath,
      exists: true,
      kind: stat.isDirectory() ? 'directory' : 'file',
    };
  } catch {
    return {
      path: resolvedTargetPath,
      exists: false,
      kind: 'none',
    };
  }
}

async function renameInFolder(rootPath: string, oldRelative: string, newRelative: string): Promise<LocalFileRenameResult> {
  const root = await ensurePathAllowed(rootPath);
  const rootRealPath = await fs.realpath(root);
  const normalizedOld = normalizeRelativePath(oldRelative);
  const normalizedNew = normalizeRelativePath(newRelative);
  if (!normalizedOld || !normalizedNew) throw new Error('Both old and new paths are required.');
  if (path.isAbsolute(normalizedOld) || path.isAbsolute(normalizedNew)) throw new Error('Use relative paths.');
  if (isHiddenOrBlockedPath(normalizedOld) || isHiddenOrBlockedPath(normalizedNew)) throw new Error('Path blocked by safety rules.');
  const resolvedOld = path.resolve(root, normalizedOld);
  const resolvedNew = path.resolve(root, normalizedNew);
  if (!isPathInside(root, resolvedOld) || !isPathInside(root, resolvedNew)) throw new Error('Paths must remain inside working folder.');
  await assertTargetPathAllowed(root, resolvedOld, 'Paths must remain inside working folder.');
  await assertRealPathInsideRoot(rootRealPath, path.dirname(resolvedNew), 'Paths must remain inside working folder.');
  await fs.access(resolvedOld);

  // Prevent silent destination clobber; overwrite must be an explicit delete/create sequence.
  if (path.resolve(resolvedOld) !== path.resolve(resolvedNew)) {
    try {
      await fs.access(resolvedNew);
      throw new Error('A file or directory already exists at the destination path.');
    } catch (error) {
      const code = (error as NodeJS.ErrnoException)?.code;
      if (code !== 'ENOENT') {
        throw error;
      }
    }
  }

  await fs.mkdir(path.dirname(resolvedNew), { recursive: true });
  await fs.rename(resolvedOld, resolvedNew);
  return { oldPath: resolvedOld, newPath: resolvedNew, renamed: true };
}

async function deleteInFolder(rootPath: string, relativePath: string): Promise<LocalFileDeleteResult> {
  const root = await ensurePathAllowed(rootPath);
  const normalized = normalizeRelativePath(relativePath);
  if (!normalized) throw new Error('A path is required.');
  if (path.isAbsolute(normalized)) throw new Error('Use a relative path.');
  if (isHiddenOrBlockedPath(normalized)) throw new Error('Path blocked by safety rules.');
  const resolved = path.resolve(root, normalized);
  if (!isPathInside(root, resolved)) throw new Error('Path must remain inside working folder.');
  await assertTargetPathAllowed(root, resolved, 'Path must remain inside working folder.');
  if (resolved === root) throw new Error('Cannot delete the root folder.');
  const stat = await fs.stat(resolved);
  if (stat.isDirectory()) {
    await fs.rm(resolved, { recursive: true });
  } else {
    await fs.unlink(resolved);
  }
  return { path: resolved, deleted: true };
}

async function statInFolder(rootPath: string, relativePath: string): Promise<LocalFileStatResult> {
  const root = await ensurePathAllowed(rootPath);
  const requestedPath = typeof relativePath === 'string' ? relativePath.trim() : '';
  const normalized = normalizeRelativePath(relativePath);
  const rootMetadataRequested = requestedPath === '.' || requestedPath === './' || requestedPath === '';
  if (!normalized && !rootMetadataRequested) throw new Error('A path is required.');
  if (path.isAbsolute(normalized)) throw new Error('Use a relative path.');
  if (normalized && isHiddenOrBlockedPath(normalized)) throw new Error('Path blocked by safety rules.');
  const resolved = rootMetadataRequested ? root : path.resolve(root, normalized);
  if (resolved !== root && !isPathInside(root, resolved)) throw new Error('Path must remain inside working folder.');
  await assertTargetPathAllowed(root, resolved, 'Path must remain inside working folder.');
  const stat = await fs.stat(resolved);
  return {
    path: rootMetadataRequested ? '.' : resolved,
    kind: stat.isDirectory() ? 'directory' : 'file',
    size: stat.size,
    createdMs: stat.birthtimeMs,
    modifiedMs: stat.mtimeMs,
  };
}

async function openLocalPath(targetPath: string): Promise<{ ok: boolean; error?: string }> {
  const normalized = typeof targetPath === 'string' ? targetPath.trim() : '';
  if (!normalized) {
    throw new Error('A path is required.');
  }

  const resolved = path.resolve(normalized);
  await fs.access(resolved);

  const openError = await shell.openPath(resolved);
  if (openError) {
    return { ok: false, error: openError };
  }

  return { ok: true };
}

function normalizeStoredInternalProviderSecrets(entry: Partial<StoredInternalProviderSecrets> | null | undefined): StoredInternalProviderSecrets {
  return {
    openaiApiKey: typeof entry?.openaiApiKey === 'string' ? entry.openaiApiKey : '',
    anthropicApiKey: typeof entry?.anthropicApiKey === 'string' ? entry.anthropicApiKey : '',
    geminiApiKey: typeof entry?.geminiApiKey === 'string' ? entry.geminiApiKey : '',
  };
}

function extractStoredInternalProviderSecrets(config: Partial<InternalProviderConfig> | null | undefined): StoredInternalProviderSecrets {
  return normalizeStoredInternalProviderSecrets(config);
}

function stripStoredInternalProviderSecrets(
  config: Partial<InternalProviderConfig> | null | undefined,
): InternalProviderConfig {
  return {
    ...EMPTY_INTERNAL_PROVIDER_CONFIG,
    ...config,
    openaiApiKey: '',
    anthropicApiKey: '',
    geminiApiKey: '',
  };
}

function hasStoredInternalProviderSecrets(secrets: StoredInternalProviderSecrets): boolean {
  return Boolean(secrets.openaiApiKey || secrets.anthropicApiKey || secrets.geminiApiKey);
}

function mergeStoredInternalProviderConfig(
  config: Partial<InternalProviderConfig> | null | undefined,
  secrets: StoredInternalProviderSecrets,
): InternalProviderConfig {
  return {
    ...EMPTY_INTERNAL_PROVIDER_CONFIG,
    ...config,
    ...secrets,
  };
}

function extractSecretsFromConfigEntry(entry: unknown): StoredInternalProviderSecrets {
  if (!entry || typeof entry !== 'object') {
    return { ...EMPTY_INTERNAL_PROVIDER_SECRETS };
  }

  const record = entry as Record<string, unknown>;
  if (record.version !== 2 || !record.internalProviderConfig || typeof record.internalProviderConfig !== 'object') {
    return { ...EMPTY_INTERNAL_PROVIDER_SECRETS };
  }

  return extractStoredInternalProviderSecrets(record.internalProviderConfig as Partial<InternalProviderConfig>);
}

function sanitizeConfigEntryForDisk(
  entry: unknown,
): { sanitizedEntry: unknown; secrets: StoredInternalProviderSecrets | null } {
  if (!entry || typeof entry !== 'object') {
    return { sanitizedEntry: entry, secrets: null };
  }

  const record = entry as Record<string, unknown>;
  if (record.version !== 2 || !record.internalProviderConfig || typeof record.internalProviderConfig !== 'object') {
    return { sanitizedEntry: entry, secrets: null };
  }

  const secrets = extractStoredInternalProviderSecrets(record.internalProviderConfig as Partial<InternalProviderConfig>);

  return {
    sanitizedEntry: {
      ...record,
      internalProviderConfig: stripStoredInternalProviderSecrets(record.internalProviderConfig as Partial<InternalProviderConfig>),
    },
    secrets,
  };
}

function hydrateConfigEntryWithSecrets(entry: unknown, secrets: StoredInternalProviderSecrets): unknown {
  if (!entry || typeof entry !== 'object') {
    return entry;
  }

  const record = entry as Record<string, unknown>;
  if (record.version !== 2) {
    return entry;
  }

  const baseConfig =
    record.internalProviderConfig && typeof record.internalProviderConfig === 'object'
      ? (record.internalProviderConfig as Partial<InternalProviderConfig>)
      : undefined;

  return {
    ...record,
    internalProviderConfig: mergeStoredInternalProviderConfig(baseConfig, secrets),
  };
}

async function readJsonFile(targetPath: string): Promise<unknown | null> {
  try {
    const raw = await fs.readFile(targetPath, 'utf8');
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

async function readStoredProviderSecrets(): Promise<StoredInternalProviderSecrets> {
  const entry = await readJsonFile(providerSecretsPath());
  if (!entry || typeof entry !== 'object') {
    return { ...EMPTY_INTERNAL_PROVIDER_SECRETS };
  }

  const envelope = entry as Partial<StoredProviderSecretsEnvelope>;
  if (envelope.version !== 1 || typeof envelope.payload !== 'string') {
    return { ...EMPTY_INTERNAL_PROVIDER_SECRETS };
  }

  try {
    const payload =
      envelope.mode === 'safeStorage' && safeStorage.isEncryptionAvailable()
        ? safeStorage.decryptString(Buffer.from(envelope.payload, 'base64'))
        : Buffer.from(envelope.payload, 'base64').toString('utf8');
    return normalizeStoredInternalProviderSecrets(JSON.parse(payload) as Partial<StoredInternalProviderSecrets>);
  } catch {
    return { ...EMPTY_INTERNAL_PROVIDER_SECRETS };
  }
}

async function writeStoredProviderSecrets(secrets: StoredInternalProviderSecrets): Promise<void> {
  const normalizedSecrets = normalizeStoredInternalProviderSecrets(secrets);
  await fs.mkdir(path.dirname(providerSecretsPath()), { recursive: true });

  if (!hasStoredInternalProviderSecrets(normalizedSecrets)) {
    try {
      await fs.unlink(providerSecretsPath());
    } catch {
      // ignore missing file
    }
    return;
  }

  const plaintext = JSON.stringify(normalizedSecrets);
  const encryptionAvailable = safeStorage.isEncryptionAvailable();
  const payload = encryptionAvailable
    ? safeStorage.encryptString(plaintext).toString('base64')
    : Buffer.from(plaintext, 'utf8').toString('base64');
  const envelope: StoredProviderSecretsEnvelope = {
    version: 1,
    mode: encryptionAvailable ? 'safeStorage' : 'plaintext-fallback',
    payload,
  };

  await fs.writeFile(providerSecretsPath(), JSON.stringify(envelope, null, 2), 'utf8');
}

async function readRawConfigEntry(): Promise<unknown | null> {
  const currentEntry = await readJsonFile(configPath());
  if (currentEntry !== null) {
    return currentEntry;
  }

  const legacyEntry = await readJsonFile(legacyConfigPath());
  if (legacyEntry === null) {
    return null;
  }

  await writeRawConfigEntry(legacyEntry);
  return readJsonFile(configPath());
}

async function writeRawConfigEntry(entry: unknown): Promise<unknown> {
  const { sanitizedEntry, secrets } = sanitizeConfigEntryForDisk(entry);
  await fs.mkdir(path.dirname(configPath()), { recursive: true });
  await fs.writeFile(configPath(), JSON.stringify(sanitizedEntry, null, 2), 'utf8');
  if (secrets !== null) {
    await writeStoredProviderSecrets(secrets);
  }
  return sanitizedEntry;
}

async function readStoredInternalProviderConfig(): Promise<InternalProviderConfig> {
  const rawEntry = await readRawConfigEntry();
  const parsed = parseStoredEngineConfig(rawEntry, defaultConfig.gatewayUrl);
  const secureSecrets = await readStoredProviderSecrets();
  const mergedConfig = mergeStoredInternalProviderConfig(parsed?.engineDraft.internalProviderConfig, secureSecrets);

  const inlineSecrets = extractSecretsFromConfigEntry(rawEntry);
  if (hasStoredInternalProviderSecrets(inlineSecrets)) {
    await writeStoredProviderSecrets(extractStoredInternalProviderSecrets(mergedConfig));
    if (rawEntry !== null) {
      await writeRawConfigEntry(rawEntry);
    }
  }

  return mergedConfig;
}

async function readConfig(): Promise<AppConfig> {
  const parsed = parseStoredEngineConfig(await readRawConfigEntry(), defaultConfig.gatewayUrl);
  return parsed?.appConfig ?? defaultConfig;
}

async function readHydratedEngineConfigEntry(): Promise<unknown | null> {
  const rawEntry = await readRawConfigEntry();
  if (rawEntry === null) {
    return null;
  }

  return hydrateConfigEntryWithSecrets(rawEntry, await readStoredProviderSecrets());
}

async function writeConfig(config: AppConfig): Promise<AppConfig> {
  const normalizedGatewayUrl = config.gatewayUrl.trim();

  const normalized = {
    gatewayUrl: normalizedGatewayUrl,
    gatewayToken: config.gatewayToken.trim(),
  };

  await writeRawConfigEntry(normalized);
  return normalized;
}

async function runHealthCheck(gatewayUrl: string): Promise<HealthCheckResult> {
  const normalizedBaseUrl = gatewayUrl
    .trim()
    .replace(/^wss?:\/\//, (value) => (value === 'wss://' ? 'https://' : 'http://'))
    .replace(/\/$/, '');
  const candidates = ['/health', '/api/health', '/'];

  for (const candidate of candidates) {
    try {
      const response = await fetch(`${normalizedBaseUrl}${candidate}`);
      if (response.ok) {
        return {
          ok: true,
          status: response.status,
          message: `Runtime endpoint reachable at ${candidate}`,
        };
      }

      return {
        ok: false,
        status: response.status,
        message: `Backend responded with status ${response.status} at ${candidate}`,
      };
    } catch {
      continue;
    }
  }

  return {
    ok: false,
    message: 'Unable to reach the configured runtime endpoint. Check the URL, port, and network path.',
  };
}

// ---------------------------------------------------------------------------
async function createWindow() {
  const preloadPath = fileURLToPath(new URL('./preload.cjs', import.meta.url));

  const window = new BrowserWindow({
    width: 1480,
    height: 980,
    minWidth: 1200,
    minHeight: 760,
    backgroundColor: '#f4f3ee',
    title: 'Cloffice',
    frame: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.setMenuBarVisibility(false);
  window.removeMenu();

  if (isDev) {
    const devUrl = 'http://localhost:5173';
    let lastError: unknown;

    for (let attempt = 0; attempt < 12; attempt += 1) {
      try {
        await window.loadURL(devUrl);
        window.webContents.openDevTools({ mode: 'detach' });
        return;
      } catch (error) {
        lastError = error;
        await delay(350);
      }
    }

    throw lastError;
  }

  await window.loadFile(path.join(app.getAppPath(), 'dist', 'index.html'));
}

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  registerWebSocketOriginRewrite();
  registerDevContentSecurityPolicy();
  registerProdContentSecurityPolicy();
  const internalEngineService = createInternalEngineMainService();

  ipcMain.handle('config:get', async () => readConfig());
  ipcMain.handle('config:save', async (_event, config: AppConfig) => writeConfig(config));
  ipcMain.handle('engine-config:get', async () => readHydratedEngineConfigEntry());
  ipcMain.handle('engine-config:save', async (_event, entry: unknown) => writeRawConfigEntry(entry));
  ipcMain.handle('internal-engine:status', async () => internalEngineService.getStatus());
  ipcMain.handle('internal-engine:get-runtime-info', async () => internalEngineService.getRuntimeInfo());
  ipcMain.handle('internal-engine:get-run-history', async (_event, limit?: number) => internalEngineService.getRunHistory(limit));
  ipcMain.handle('internal-engine:get-run-details', async (_event, runId: string) => internalEngineService.getRunDetails(runId));
  ipcMain.handle('internal-engine:get-runtime-retention-policy', async () => internalEngineService.getRuntimeRetentionPolicy());
  ipcMain.handle('internal-engine:connect', async (_event, options: EngineConnectOptions) => internalEngineService.connect(options));
  ipcMain.handle('internal-engine:disconnect', async () => internalEngineService.disconnect());
  ipcMain.handle('internal-engine:get-active-session-key', async () => internalEngineService.getActiveSessionKey());
  ipcMain.handle('internal-engine:create-chat-session', async () => internalEngineService.createChatSession());
  ipcMain.handle('internal-engine:create-cowork-session', async () => internalEngineService.createCoworkSession());
  ipcMain.handle('internal-engine:resolve-session-key', async (_event, preferredKey?: string) => internalEngineService.resolveSessionKey(preferredKey));
  ipcMain.handle('internal-engine:list-sessions', async (_event, limit?: number) => internalEngineService.listSessions(limit));
  ipcMain.handle('internal-engine:list-models', async () => internalEngineService.listModels());
  ipcMain.handle('internal-engine:get-session-model', async (_event, sessionKey: string) => internalEngineService.getSessionModel(sessionKey));
  ipcMain.handle('internal-engine:set-session-model', async (_event, sessionKey: string, modelValue: string | null) => internalEngineService.setSessionModel(sessionKey, modelValue));
  ipcMain.handle('internal-engine:set-session-title', async (_event, sessionKey: string, title: string | null) => internalEngineService.setSessionTitle(sessionKey, title));
  ipcMain.handle('internal-engine:delete-session', async (_event, sessionKey: string) => internalEngineService.deleteSession(sessionKey));
  ipcMain.handle('internal-engine:get-history', async (_event, sessionKey: string, limit?: number) => internalEngineService.getHistory(sessionKey, limit));
  ipcMain.handle('internal-engine:list-cron-jobs', async () => internalEngineService.listCronJobs());
  ipcMain.handle('internal-engine:get-schedule-history-retention-limit', async () => internalEngineService.getScheduleHistoryRetentionLimit());
  ipcMain.handle(
    'internal-engine:create-prompt-schedule',
    async (_event, payload: { kind?: 'chat' | 'cowork'; prompt: string; name?: string; intervalMinutes?: number; rootPath?: string; model?: string | null }) =>
      internalEngineService.createPromptSchedule(payload),
  );
  ipcMain.handle(
    'internal-engine:update-prompt-schedule',
    async (_event, id: string, payload: { enabled?: boolean; intervalMinutes?: number; name?: string; prompt?: string; model?: string | null }) =>
      internalEngineService.updatePromptSchedule(id, payload),
  );
  ipcMain.handle('internal-engine:delete-prompt-schedule', async (_event, id: string) => internalEngineService.deletePromptSchedule(id));
  ipcMain.handle('internal-engine:run-prompt-schedule-now', async (_event, id: string) => internalEngineService.runPromptScheduleNow(id));
  ipcMain.handle(
    'internal-engine:set-runtime-retention-policy',
    async (_event, payload: { runHistoryRetentionLimit?: number; artifactHistoryRetentionLimit?: number }) =>
      internalEngineService.setRuntimeRetentionPolicy(payload),
  );
  ipcMain.handle('internal-engine:set-schedule-history-retention-limit', async (_event, limit: number) =>
    internalEngineService.setScheduleHistoryRetentionLimit(limit));
  ipcMain.handle('internal-engine:seed-schedule-artifact-e2e', async (_event, id: string) => internalEngineService.seedScheduleArtifactForE2E(id));
  ipcMain.handle('internal-engine:send-chat', async (event, sessionKey: string, text: string) =>
    internalEngineService.sendChat(sessionKey, text, (frame) => {
      event.sender.send('internal-engine:event', frame);
    }));
  ipcMain.handle(
    'internal-engine:test-provider-connection',
    async (_event, providerId: InternalChatProviderId, configOverride?: Partial<InternalProviderConfig>) =>
      internalEngineService.testProviderConnection(providerId, configOverride),
  );
  ipcMain.handle(
    'internal-engine:debug-normalize-cowork-response',
    async (
      _event,
      payload: {
        phase: 'planning' | 'continuation';
        task?: string;
        rawText: string;
        requestedActions?: EngineRequestedAction[];
        execution?: {
          receipts?: LocalActionReceipt[];
          previews?: string[];
          errors?: string[];
        };
      },
    ) => internalEngineService.debugNormalizeCoworkResponse(payload),
  );
  ipcMain.handle(
    'internal-engine:debug-build-cowork-prompt',
    async (
      _event,
      payload: {
        phase: 'planning' | 'continuation';
        model: string;
        taskAndContext?: string;
        sessionKey?: string;
        approvedActions?: EngineRequestedAction[];
        rejectedActions?: InternalEngineCoworkContinuationRequest['rejectedActions'];
        execution?: {
          receipts?: LocalActionReceipt[];
          previews?: string[];
          errors?: string[];
        };
      },
    ) => internalEngineService.debugBuildCoworkPrompt(payload),
  );
  ipcMain.handle('internal-engine:continue-cowork-run', async (event, payload: InternalEngineCoworkContinuationRequest) =>
    internalEngineService.continueCoworkRun(payload, (frame) => {
      event.sender.send('internal-engine:event', frame);
    }));
  ipcMain.handle('internal-engine:list-pending-approvals', async () => internalEngineService.listPendingApprovals());
  ipcMain.handle('internal-engine:save-pending-approval', async (_event, flow: InternalApprovalRecoveryFlow) => internalEngineService.savePendingApproval(flow));
  ipcMain.handle('internal-engine:clear-pending-approval', async (_event, runId: string) => internalEngineService.clearPendingApproval(runId));
  ipcMain.handle(
    'internal-engine:apply-pending-approval-decision',
    async (_event, runId: string, decision: InternalEnginePendingApprovalDecision) =>
      internalEngineService.applyPendingApprovalDecision(runId, decision),
  );
  ipcMain.handle('backend:health-check', async (_event, baseUrl: string) => runHealthCheck(baseUrl));
  ipcMain.handle('window:minimize', (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    window?.minimize();
  });
  ipcMain.handle('window:toggle-maximize', (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) {
      return false;
    }

    if (window.isMaximized()) {
      window.unmaximize();
      return false;
    }

    window.maximize();
    return true;
  });
  ipcMain.handle('window:is-maximized', (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    return Boolean(window?.isMaximized());
  });
  ipcMain.handle('window:show-system-menu', (event, position: { x: number; y: number }) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) {
      return;
    }

    const menu = Menu.buildFromTemplate([
      {
        label: 'Restore',
        enabled: window.isMaximized(),
        click: () => window.unmaximize(),
      },
      {
        label: 'Minimize',
        click: () => window.minimize(),
      },
      {
        label: window.isMaximized() ? 'Unmaximize' : 'Maximize',
        click: () => {
          if (window.isMaximized()) {
            window.unmaximize();
            return;
          }
          window.maximize();
        },
      },
      { type: 'separator' },
      {
        label: 'Close',
        click: () => window.close(),
      },
    ]);

    menu.popup({
      window,
      x: Math.round(position.x),
      y: Math.round(position.y),
    });
  });
  ipcMain.handle('window:close', (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    window?.close();
  });
  ipcMain.handle('local:downloads-path', () => app.getPath('downloads'));
  ipcMain.handle('local:select-folder', async (_event, initialPath?: string) => {
    const result = await dialog.showOpenDialog({
      title: 'Select working folder',
      defaultPath: typeof initialPath === 'string' && initialPath.trim() ? initialPath : app.getPath('downloads'),
      properties: ['openDirectory', 'createDirectory'],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    return result.filePaths[0];
  });
  ipcMain.handle('local:plan-organize-folder', async (_event, rootPath: string) => {
    if (typeof rootPath !== 'string' || !rootPath.trim()) {
      throw new Error('A folder path is required.');
    }

    return planFolderOrganization(rootPath);
  });
  ipcMain.handle('local:apply-organize-folder-plan', async (_event, payload: { rootPath: string; actions: LocalFilePlanAction[] }) => {
    if (!payload || typeof payload !== 'object') {
      throw new Error('Invalid apply payload.');
    }

    const rootPath = typeof payload.rootPath === 'string' ? payload.rootPath : '';
    const actions = Array.isArray(payload.actions) ? payload.actions : [];
    if (!rootPath.trim()) {
      throw new Error('A folder path is required.');
    }

    return applyFolderOrganizationPlan(rootPath, actions);
  });
  ipcMain.handle('local:create-file-in-folder', async (_event, payload: { rootPath: string; relativePath: string; content: string; overwrite?: boolean }) => {
    if (!payload || typeof payload !== 'object') {
      throw new Error('Invalid create-file payload.');
    }

    const rootPath = typeof payload.rootPath === 'string' ? payload.rootPath : '';
    const relativePath = typeof payload.relativePath === 'string' ? payload.relativePath : '';
    const content = typeof payload.content === 'string' ? payload.content : '';
    const overwrite = typeof payload.overwrite === 'boolean' ? payload.overwrite : false;

    if (!rootPath.trim()) {
      throw new Error('A folder path is required.');
    }

    return writeFileInFolder(rootPath, relativePath, content, { overwrite });
  });
  ipcMain.handle('local:append-file-in-folder', async (_event, payload: { rootPath: string; relativePath: string; content: string }) => {
    if (!payload || typeof payload !== 'object') {
      throw new Error('Invalid append-file payload.');
    }

    const rootPath = typeof payload.rootPath === 'string' ? payload.rootPath : '';
    const relativePath = typeof payload.relativePath === 'string' ? payload.relativePath : '';
    const content = typeof payload.content === 'string' ? payload.content : '';

    if (!rootPath.trim()) {
      throw new Error('A folder path is required.');
    }

    return appendFileInFolder(rootPath, relativePath, content);
  });
  ipcMain.handle('local:read-file-in-folder', async (_event, payload: { rootPath: string; relativePath: string }) => {
    if (!payload || typeof payload !== 'object') {
      throw new Error('Invalid read-file payload.');
    }

    const rootPath = typeof payload.rootPath === 'string' ? payload.rootPath : '';
    const relativePath = typeof payload.relativePath === 'string' ? payload.relativePath : '';

    if (!rootPath.trim()) {
      throw new Error('A folder path is required.');
    }

    return readFileInFolder(rootPath, relativePath);
  });
  ipcMain.handle('local:list-dir-in-folder', async (_event, payload: { rootPath: string; relativePath?: string }) => {
    if (!payload || typeof payload !== 'object') {
      throw new Error('Invalid list-dir payload.');
    }

    const rootPath = typeof payload.rootPath === 'string' ? payload.rootPath : '';
    const relativePath = typeof payload.relativePath === 'string' ? payload.relativePath : '';
    if (!rootPath.trim()) {
      throw new Error('A folder path is required.');
    }

    return listDirInFolder(rootPath, relativePath);
  });
  ipcMain.handle('local:exists-in-folder', async (_event, payload: { rootPath: string; relativePath: string }) => {
    if (!payload || typeof payload !== 'object') {
      throw new Error('Invalid exists payload.');
    }

    const rootPath = typeof payload.rootPath === 'string' ? payload.rootPath : '';
    const relativePath = typeof payload.relativePath === 'string' ? payload.relativePath : '';
    if (!rootPath.trim()) {
      throw new Error('A folder path is required.');
    }

    return existsInFolder(rootPath, relativePath);
  });
  ipcMain.handle('local:rename-in-folder', async (_event, payload: { rootPath: string; oldRelative: string; newRelative: string }) => {
    if (!payload || typeof payload !== 'object') throw new Error('Invalid rename payload.');
    const rootPath = typeof payload.rootPath === 'string' ? payload.rootPath : '';
    const oldRelative = typeof payload.oldRelative === 'string' ? payload.oldRelative : '';
    const newRelative = typeof payload.newRelative === 'string' ? payload.newRelative : '';
    if (!rootPath.trim()) throw new Error('A folder path is required.');
    return renameInFolder(rootPath, oldRelative, newRelative);
  });
  ipcMain.handle('local:delete-in-folder', async (_event, payload: { rootPath: string; relativePath: string }) => {
    if (!payload || typeof payload !== 'object') throw new Error('Invalid delete payload.');
    const rootPath = typeof payload.rootPath === 'string' ? payload.rootPath : '';
    const relativePath = typeof payload.relativePath === 'string' ? payload.relativePath : '';
    if (!rootPath.trim()) throw new Error('A folder path is required.');
    return deleteInFolder(rootPath, relativePath);
  });
  ipcMain.handle('local:stat-in-folder', async (_event, payload: { rootPath: string; relativePath: string }) => {
    if (!payload || typeof payload !== 'object') throw new Error('Invalid stat payload.');
    const rootPath = typeof payload.rootPath === 'string' ? payload.rootPath : '';
    const relativePath = typeof payload.relativePath === 'string' ? payload.relativePath : '';
    if (!rootPath.trim()) throw new Error('A folder path is required.');
    return statInFolder(rootPath, relativePath);
  });
  ipcMain.handle('local:open-path', async (_event, payload: { targetPath: string }) => {
    if (!payload || typeof payload !== 'object') {
      throw new Error('Invalid open-path payload.');
    }

    const targetPath = typeof payload.targetPath === 'string' ? payload.targetPath : '';
    return openLocalPath(targetPath);
  });

  /* ── Shell exec IPC ─────────────────────────────────────────────────────── */
  ipcMain.handle('local:shell-exec', async (_event, payload: { rootPath: string; command: string; timeoutMs?: number }) => {
    if (!payload || typeof payload !== 'object') throw new Error('Invalid shell-exec payload.');
    const rootPath = typeof payload.rootPath === 'string' ? payload.rootPath.trim() : '';
    const command = typeof payload.command === 'string' ? payload.command.trim() : '';
    const timeoutMs = typeof payload.timeoutMs === 'number' && payload.timeoutMs > 0 ? payload.timeoutMs : 30_000;

    if (!rootPath) throw new Error('A folder path is required.');
    if (!command) throw new Error('A command is required.');

    // Validate rootPath exists
    const rootStat = await fs.stat(rootPath).catch(() => null);
    if (!rootStat?.isDirectory()) throw new Error('Root path is not a valid directory.');

    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd: rootPath,
        timeout: timeoutMs,
        maxBuffer: 1024 * 1024, // 1 MB
        shell: process.platform === 'win32' ? 'cmd.exe' : '/bin/sh',
      });

      return { stdout: stdout || '', stderr: stderr || '', exitCode: 0, timedOut: false };
    } catch (err: unknown) {
      const execErr = err as { stdout?: string; stderr?: string; code?: number | string; killed?: boolean; signal?: string };
      const timedOut = execErr.killed === true || execErr.signal === 'SIGTERM';
      return {
        stdout: typeof execErr.stdout === 'string' ? execErr.stdout : '',
        stderr: typeof execErr.stderr === 'string' ? execErr.stderr : '',
        exitCode: typeof execErr.code === 'number' ? execErr.code : 1,
        timedOut,
      };
    }
  });

  /* ── Web fetch IPC ──────────────────────────────────────────────────────── */
  ipcMain.handle('local:web-fetch', async (_event, payload: { url: string; options?: { method?: string; headers?: Record<string, string>; body?: string } }) => {
    if (!payload || typeof payload !== 'object') throw new Error('Invalid web-fetch payload.');
    const url = typeof payload.url === 'string' ? payload.url.trim() : '';
    if (!url) throw new Error('URL is required.');

    const opts = payload.options ?? {};
    const method = typeof opts.method === 'string' ? opts.method.toUpperCase() : 'GET';

    const fetchOptions: RequestInit = {
      method,
      headers: opts.headers ?? {},
      signal: AbortSignal.timeout(30_000),
    };

    if (method !== 'GET' && method !== 'HEAD' && typeof opts.body === 'string') {
      fetchOptions.body = opts.body;
    }

    const response = await fetch(url, fetchOptions);
    const bodyText = await response.text();
    const maxLen = 100_000;
    const truncated = bodyText.length > maxLen;
    const headersObj: Record<string, string> = {};
    response.headers.forEach((value, key) => { headersObj[key] = value; });

    return {
      status: response.status,
      statusText: response.statusText,
      headers: headersObj,
      body: truncated ? bodyText.slice(0, maxLen) : bodyText,
      truncated,
    };
  });

  /* ── Notification IPC ───────────────────────────────────────────────────── */
  ipcMain.handle('notify', async (_event, payload: { title: string; body?: string }) => {
    if (!payload || typeof payload !== 'object') return { ok: false };
    const title = typeof payload.title === 'string' ? payload.title : 'Cloffice';
    const body = typeof payload.body === 'string' ? payload.body : '';

    if (Notification.isSupported()) {
      const notification = new Notification({ title, body });
      notification.show();
      return { ok: true };
    }
    return { ok: false, message: 'Notifications not supported on this platform.' };
  });

  await createWindow();

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
