import {
  createDefaultAppConfig,
  DEFAULT_ENGINE_PROVIDER_ID,
  DEFAULT_OPENCLAW_COMPAT_ENDPOINT_URL,
  EMPTY_INTERNAL_PROVIDER_CONFIG,
  appConfigFromEngineDraft,
  buildEngineDraftConfig,
  engineConnectOptionsFromDraft,
  engineDraftFromAppConfig,
  normalizeEngineEndpointUrl,
  parseStoredEngineConfig,
  type InternalProviderConfig,
} from './lib/engine-config';
import { engineConnectionMatchesAppConfig, engineConnectionMatchesDraft, parseStoredEngineConnectionProfile, serializeEngineConnectionProfile } from './lib/engine-connection-profiles';
import { getDesktopBridge } from './lib/desktop-bridge';
import { Suspense, lazy, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { flushSync } from 'react-dom';

import type {
  AppConfig,
  ChatActivityItem,
  ChatMessage,
  ChatModelOption,
  CoworkArtifact,
  CoworkProgressStage,
  CoworkProgressStep,
  CoworkProjectTask,
  CoworkProjectTaskStatus,
  CoworkProject,
   CoworkRunPhase,
   EngineConnectionProfile,
   EngineProviderId,
   EngineActionExecutionResult,
   EngineRequestedAction,
   HealthCheckResult,
   LocalActionReceipt,
  LocalFilePlanAction,
  PendingApprovalAction,
  ProjectPathReference,
  ProjectKnowledgeItem,
  ScheduledJob,
  TaskState,
} from './app-types';
import { AppSidebar } from './components/layout/app-sidebar';
import { AppTitlebar } from './components/layout/app-titlebar';
import { Button } from './components/ui/button';
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from './components/ui/command';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './components/ui/dialog';
import { Input } from './components/ui/input';
import { SidebarProvider } from './components/ui/sidebar';
import { ScrollArea } from './components/ui/scroll-area';
import { createEngineClient, type EngineClientInstance } from './lib/engine-client';
import {
  canManageEngineSchedules,
  createEngineCoworkScheduleWithStatus,
  deleteEngineScheduleWithStatus,
  describeEngineScheduleAccess,
  loadEngineScheduledJobsWithStatus,
  updateEngineScheduleWithStatus,
} from './lib/engine-schedule-controller';
import {
  buildEngineChatDispatchStatus,
  buildEngineConnectSuccessHealthMessage,
  buildEngineResetPairingSuccess,
  describeEngineConnectFailure,
  describeEngineResetPairingFailure,
  shouldRestoreInternalApprovalRecovery,
} from './lib/engine-connection-status';
import {
  buildApprovalRejectReasonRequiredStatus,
  buildCoworkEmptyPromptStatus,
  buildCoworkSendFailureStatus,
  buildLoadedPreviousCoworkPromptStatus,
  buildMissingCoworkSessionKeyError,
  buildMissingPreviousCoworkPromptStatus,
  buildRecoveredApprovalAwaitingStatus,
  buildRecoveredApprovalContinuationFailureStatus,
  buildRecoveredApprovalContinuationUnavailableStatus,
  buildRecoveredApprovalSubmittingProgressDetails,
  buildRecoveredApprovalSubmittingRunStatus,
  resolveCoworkDisconnectedState,
  resolveCoworkResetState,
  resolveCoworkSendingState,
  resolveCoworkWaitingForStreamState,
} from './lib/engine-cowork-status';
import {
  buildBridgeUnavailableConfigurationStatus,
  buildConfigurationLoadedStatus,
  buildConfigurationSavedConnectingStatus,
  buildDeletedEngineConnectionStatus,
  buildEngineConnectionNameRequiredStatus,
  buildFailedToSaveConfigurationStatus,
  buildLoadedEngineConnectionStatus,
  buildLoadedLocalConfigurationStatus,
  buildLoadedLocalFallbackConfigurationStatus,
  buildSavedEngineConnectionStatus,
  buildSavingAndConnectingStatus,
  buildUnableToLoadConfigurationStatus,
  buildUpdatedEngineConnectionStatus,
} from './lib/engine-config-status';
import {
  buildArtifactOpenBridgeUnavailableStatus,
  buildArtifactOpenFailureStatus,
  buildArtifactOpenedStatus,
  buildBrowserSandboxFolderSelectedStatus,
  buildCreateFileBridgeUnavailableStatus,
  buildCreateFileFailureStatus,
  buildCreatedFileStatus,
  buildFolderPickerFailureStatus,
  buildLocalActionSmokeFailedStatus,
  buildLocalActionSmokePassedStatus,
  buildLocalActionSmokeUnavailableStatus,
  buildLocalFileOrganizerUnavailableStatus,
  buildLocalPlanAppliedStatus,
  buildLocalPlanApplyFailureStatus,
  buildLocalPlanApplyPreconditionStatus,
  buildLocalPlanCreationFailureStatus,
  buildLocalPlanReadyStatus,
  buildMissingCoworkPromptForSkillStatus,
  buildNoFolderSelectedStatus,
  buildRelativeFilePathRequiredStatus,
  buildSaveSkillBridgeUnavailableStatus,
  buildSaveSkillFailureStatus,
  buildSavedSkillDraftStatus,
  buildWindowCloseFailureStatus,
  buildWindowControlsUnavailableStatus,
  buildWindowMinimizeFailureStatus,
  buildWindowResizeFailureStatus,
  buildWindowSystemMenuFailureStatus,
  buildWorkingFolderRequiredStatus,
  buildWorkingFolderSelectedStatus,
} from './lib/engine-local-status';
import {
  buildKnowledgeDeletedStatus,
  buildKnowledgeSavedStatus,
  buildKnowledgeTitleAndContentRequiredStatus,
  buildProjectCreatedStatus,
  buildProjectDeletedStatus,
  buildProjectNameAndWorkspaceRequiredStatus,
  buildProjectNameRequiredStatus,
  buildProjectSelectedStatus,
  buildProjectUpdatedStatus,
  buildRecentTitleEmptyStatus,
} from './lib/engine-project-status';
import {
  buildDeletedRecentSessionStatus,
  buildInvalidSessionKeyStatus,
  buildLoadedSessionStatus,
  buildLoadingRecentSessionStatus,
  buildMissingActiveSessionError,
  buildMissingCreatedSessionKeyError,
  buildNoActiveChatSessionError,
  buildOpenedRecentSessionStatus,
  buildPendingCoworkModelSelectionStatus,
  buildRenamedRecentSessionStatus,
  buildRuntimeClientUnavailableStatus,
  buildSessionOperationFailureStatus,
  buildSessionModelResetStatus,
  buildSessionModelUpdatedStatus,
  buildSessionReadyStatus,
  buildStartedNewChatStatus,
  buildUnableToResolveActiveSessionError,
} from './lib/engine-session-status';
import { createFileService, LocalFileService } from './lib/file-service';
import { buildMemoryContext, loadMemoryEntries } from './lib/memory-context';
import {
  OPENCLAW_COMPAT_DEVICE_IDENTITY_STORAGE_KEY,
} from './lib/openclaw-compat-engine';
import { accumulateTodayUsage, addUsage, loadTodayUsage, parseUsageFromPayload } from './lib/token-usage';
import { loadSafetyScopes } from './lib/safety-policy';
import { registerConnector, hydrateConnectors } from './lib/connectors';
import { createFilesystemConnector } from './lib/connectors/filesystem';
import { createShellConnector } from './lib/connectors/shell';
import { createWebFetchConnector } from './lib/connectors/web-fetch';

import { OnboardingPage } from './features/auth/onboarding-page';
import { useAuth } from './hooks/use-auth';
import { usePreferences } from './hooks/use-preferences';
import {
  type ChatThread,
  type PersistedRecents,
  type RecentWorkspaceEntry,
  RELAY_RECENTS_KEY,
  DEFAULT_CHAT_THREAD_TITLE,
  DEFAULT_COWORK_THREAD_TITLE,
  normalizeSessionKey,
  getThreadIdForSession,
  toRecentSidebarLabel,
  toRecentSidebarItems,
  mergeChatThreads,
  loadPersistedRecents,
  deriveThreadTitleFromMessages,
  toFallbackThreadTitle,
  isCustomChatThreadTitle,
  findMatchingSessionKey,
  buildOutboundChatPrompt,
  readEngineError,
  normalizeCoworkMessage,
} from './lib/chat-utils';
  import {
    buildEngineActionExecutionResult,
    deriveEngineSessionArtifacts,
    getEngineSessionMessageIds,
    getEngineSessionResult,
    isEngineSessionError,
    isEngineSessionStreaming,
    parseEngineChatEvent,
    resolveEngineCoworkApprovalTransition,
    resolveEngineCoworkStreamingTransition,
  } from './lib/engine-session-events';
import {
  applyEngineCoworkStreamMessageUpdate,
  appendEngineCoworkActivityMessage,
  appendEngineCoworkSystemMessage,
  applyEngineCoworkFinalMessageUpdate,
  deriveEngineActionRunKey,
  executeEngineCoworkActionExecution,
  resolveEngineCoworkFailureApplication,
  resolveEngineCoworkApprovalApplication,
  resolveEngineCoworkNoActionCommit,
  resolveEngineCoworkReceiptCommit,
} from './lib/engine-run-coordinator';
import {
  buildInternalApprovalRecoveryFlow,
  type InternalApprovalRecoveryFlow,
} from './lib/internal-approval-recovery';
import type { InternalEngineCoworkContinuationRequest } from './lib/internal-engine-bridge';
import { buildEngineActionInstruction } from './lib/engine-action-protocol';
import {
  isInternalEngineProvider,
  isOpenClawCompatibilityProvider,
} from './lib/engine-provider-registry';

const ChatPage = lazy(() => import('./features/chat/chat-page').then((module) => ({ default: module.ChatPage })));
const CoworkPage = lazy(() => import('./features/cowork/cowork-page').then((module) => ({ default: module.CoworkPage })));
const ProjectPage = lazy(() => import('./features/cowork/project-page').then((module) => ({ default: module.ProjectPage })));
const SettingsPage = lazy(() => import('./features/settings/settings-page').then((module) => ({ default: module.SettingsPage })));
const ActivityPage = lazy(() => import('./features/workspace/activity-page').then((module) => ({ default: module.ActivityPage })));
const FilesPage = lazy(() => import('./features/workspace/files-page').then((module) => ({ default: module.FilesPage })));
const MemoryPage = lazy(() => import('./features/workspace/memory-page').then((module) => ({ default: module.MemoryPage })));
const SafetyPage = lazy(() => import('./features/workspace/safety-page').then((module) => ({ default: module.SafetyPage })));
const ScheduledPage = lazy(() => import('./features/workspace/scheduled-page').then((module) => ({ default: module.ScheduledPage })));

const LOCAL_CONFIG_KEY = 'relay.config';
const GATEWAY_CONNECTIONS_STORAGE_KEY = 'relay.gateway.connections.v1';
const COWORK_PROJECTS_STORAGE_KEY = 'relay.cowork.projects.v1';
const COWORK_ACTIVE_PROJECT_STORAGE_KEY = 'relay.cowork.projects.active.v1';
const COWORK_TASKS_STORAGE_KEY = 'relay.cowork.tasks.v1';
const COWORK_PROJECT_KNOWLEDGE_STORAGE_KEY = 'relay.cowork.project.knowledge.v1';
const COWORK_WEB_SEARCH_MODE_STORAGE_KEY = 'relay.cowork.websearch.v1';
const CHAT_DRAFT_STORAGE_KEY = 'relay.chat.draft.v1';
const COWORK_DRAFT_STORAGE_KEY = 'relay.cowork.draft.v1';

type AppPage = 'chat' | 'cowork' | 'project' | 'files' | 'local-files' | 'activity' | 'memory' | 'scheduled' | 'safety' | 'settings';
type SettingsSection = 'Profile' | 'Appearance' | 'System Prompt' | 'Gateway' | 'Connectors' | 'Account' | 'Privacy' | 'Developer';

const COWORK_SEND_SPINNER_MS = 300;
const MAX_LOCAL_ACTIONS_PER_RUN = 20;
const APPROVAL_TIMEOUT_MS = 5 * 60 * 1000;
const COWORK_CONTEXT_CONNECTORS = ['Web search', 'Desktop files', 'Runtime tools'];

const COWORK_PROGRESS_SEQUENCE: Array<{ stage: CoworkProgressStage; label: string }> = [
  { stage: 'planning', label: 'Planning' },
  { stage: 'decomposition', label: 'Decomposition' },
  { stage: 'executing_workstreams', label: 'Executing workstreams' },
  { stage: 'synthesizing_outputs', label: 'Synthesizing outputs' },
  { stage: 'deliverables', label: 'Deliverables' },
];

function createInitialCoworkProgressSteps(): CoworkProgressStep[] {
  return COWORK_PROGRESS_SEQUENCE.map((item) => ({
    stage: item.stage,
    label: item.label,
    status: 'pending',
  }));
}

type ApprovalResolverEntry = {
  resolve: (value: { approved: boolean; reason?: string; expired?: boolean }) => void;
  timeoutId: ReturnType<typeof setTimeout>;
};

type RelayE2EPendingApprovalInput = Partial<PendingApprovalAction> & {
  actionType?: PendingApprovalAction['actionType'];
};

type RelayE2EBridge = {
  enqueuePendingApproval: (input?: RelayE2EPendingApprovalInput) => string;
  clearPendingApprovals: () => void;
  getPendingApprovals: () => PendingApprovalAction[];
};

type CoworkRunProjectContext = {
  projectId: string;
  projectTitle: string;
  rootFolder: string;
  startedAt: number;
};

type CoworkTaskQueueEntry = {
  taskId: string;
  runId?: string;
  status: CoworkProjectTaskStatus;
};

function validateProjectRelativePath(inputPath: string, options?: { allowEmpty?: boolean }): { ok: true } | { ok: false; reason: string } {
  const raw = (inputPath ?? '').trim();
  if (!raw) {
    return options?.allowEmpty ? { ok: true } : { ok: false, reason: 'Path is required.' };
  }

  const normalized = raw.replace(/\\/g, '/');
  if (/[\u0000-\u001F]/.test(normalized)) {
    return { ok: false, reason: 'Path contains invalid control characters.' };
  }
  if (normalized.startsWith('/') || normalized.startsWith('~/') || /^[a-zA-Z]:\//.test(normalized)) {
    return { ok: false, reason: 'Absolute paths are not allowed for project-bound actions.' };
  }

  if (normalized === '.' || normalized === './') {
    return { ok: false, reason: 'A concrete relative path is required.' };
  }

  const segments = normalized.split('/').filter((segment) => segment.length > 0);
  if (segments.some((segment) => segment === '..' || segment === '.')) {
    return { ok: false, reason: 'Parent directory traversal is not allowed.' };
  }

  return { ok: true };
}

function extractProjectFileMentions(inputText: string): string[] {
  if (!inputText) {
    return [];
  }

  const mentions = new Set<string>();
  const quotedPattern = /@project:"([^"]+)"/g;
  let quotedMatch: RegExpExecArray | null;
  while ((quotedMatch = quotedPattern.exec(inputText)) !== null) {
    const nextPath = quotedMatch[1]?.trim();
    if (nextPath) {
      mentions.add(nextPath);
    }
  }

  const unquotedPattern = /@project\/([^\s,;]+)/g;
  let unquotedMatch: RegExpExecArray | null;
  while ((unquotedMatch = unquotedPattern.exec(inputText)) !== null) {
    const nextPath = unquotedMatch[1]?.trim();
    if (nextPath) {
      mentions.add(nextPath);
    }
  }

  return Array.from(mentions);
}

function loadCoworkProjects(): CoworkProject[] {
  try {
    const raw = localStorage.getItem(COWORK_PROJECTS_STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((entry): CoworkProject | null => {
        if (!entry || typeof entry !== 'object') {
          return null;
        }
        const record = entry as Record<string, unknown>;
        const id = typeof record.id === 'string' ? record.id.trim() : '';
        const name = typeof record.name === 'string' ? record.name.trim() : '';
        const description = typeof record.description === 'string' ? record.description.trim() : '';
        const instructionsRaw = typeof record.instructions === 'string' ? record.instructions.trim() : '';
        const workspaceFolder = typeof record.workspaceFolder === 'string' ? record.workspaceFolder.trim() : '';
        const createdAt = typeof record.createdAt === 'number' ? record.createdAt : Date.now();
        const updatedAt = typeof record.updatedAt === 'number' ? record.updatedAt : createdAt;
        if (!id || !name || !workspaceFolder) {
          return null;
        }
        return {
          id,
          name,
          description: description || undefined,
          instructions: instructionsRaw || description || undefined,
          workspaceFolder,
          createdAt,
          updatedAt,
        };
      })
      .filter((project): project is CoworkProject => project !== null)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

function loadEngineConnectionProfiles(): EngineConnectionProfile[] {
  try {
    const raw = localStorage.getItem(GATEWAY_CONNECTIONS_STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map(parseStoredEngineConnectionProfile)
      .filter((profile): profile is EngineConnectionProfile => profile !== null)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

function persistEngineConnectionProfiles(profiles: EngineConnectionProfile[]) {
  localStorage.setItem(
    GATEWAY_CONNECTIONS_STORAGE_KEY,
    JSON.stringify(profiles.map(serializeEngineConnectionProfile)),
  );
}

function loadActiveCoworkProjectId(): string {
  try {
    const raw = localStorage.getItem(COWORK_ACTIVE_PROJECT_STORAGE_KEY);
    return typeof raw === 'string' ? raw.trim() : '';
  } catch {
    return '';
  }
}

function loadCoworkTasks(): CoworkProjectTask[] {
  try {
    const raw = localStorage.getItem(COWORK_TASKS_STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((entry): CoworkProjectTask | null => {
        if (!entry || typeof entry !== 'object') {
          return null;
        }

        const record = entry as Record<string, unknown>;
        const id = typeof record.id === 'string' ? record.id.trim() : '';
        const projectId = typeof record.projectId === 'string' ? record.projectId.trim() : '';
        const projectTitle = typeof record.projectTitle === 'string' ? record.projectTitle.trim() : '';
        const sessionKey = typeof record.sessionKey === 'string' ? record.sessionKey.trim() : '';
        const runId = typeof record.runId === 'string' ? record.runId.trim() : undefined;
        const prompt = typeof record.prompt === 'string' ? record.prompt : '';
        const status = typeof record.status === 'string' ? (record.status as CoworkProjectTaskStatus) : 'queued';
        const summary = typeof record.summary === 'string' ? record.summary : undefined;
        const outcome = typeof record.outcome === 'string' ? record.outcome : undefined;
        const createdAt = typeof record.createdAt === 'number' ? record.createdAt : Date.now();
        const updatedAt = typeof record.updatedAt === 'number' ? record.updatedAt : createdAt;

        if (!id || !projectId || !sessionKey || !prompt) {
          return null;
        }

        return {
          id,
          projectId,
          projectTitle,
          sessionKey,
          runId,
          prompt,
          status,
          summary,
          outcome,
          createdAt,
          updatedAt,
        };
      })
      .filter((item): item is CoworkProjectTask => item !== null)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 250);
  } catch {
    return [];
  }
}

function loadDraft(storageKey: string): string {
  try {
    const raw = localStorage.getItem(storageKey);
    return typeof raw === 'string' ? raw : '';
  } catch {
    return '';
  }
}

function loadProjectKnowledgeItems(): ProjectKnowledgeItem[] {
  try {
    const raw = localStorage.getItem(COWORK_PROJECT_KNOWLEDGE_STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((entry): ProjectKnowledgeItem | null => {
        if (!entry || typeof entry !== 'object') {
          return null;
        }
        const record = entry as Record<string, unknown>;
        const id = typeof record.id === 'string' ? record.id.trim() : '';
        const projectId = typeof record.projectId === 'string' ? record.projectId.trim() : '';
        const title = typeof record.title === 'string' ? record.title.trim() : '';
        const content = typeof record.content === 'string' ? record.content.trim() : '';
        const createdAt = typeof record.createdAt === 'number' ? record.createdAt : Date.now();
        const updatedAt = typeof record.updatedAt === 'number' ? record.updatedAt : createdAt;
        if (!id || !projectId || !title || !content) {
          return null;
        }
        return {
          id,
          projectId,
          title,
          content,
          createdAt,
          updatedAt,
        };
      })
      .filter((item): item is ProjectKnowledgeItem => item !== null)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

declare global {
  interface Window {
    relayE2E?: RelayE2EBridge;
  }
}









export default function App() {
  /* -- Initialize connectors once ---------------------------------------- */
  useMemo(() => {
    registerConnector(createFilesystemConnector());
    registerConnector(createShellConnector());
    registerConnector(createWebFetchConnector());
    hydrateConnectors();
  }, []);

  const bridge = getDesktopBridge();
  const engineClientRef = useRef<EngineClientInstance | null>(null);
  const activeSessionKeyRef = useRef('');
  const coworkSessionKeyRef = useRef('');
  const workingFolderRef = useRef('');
  const chatLoadRequestRef = useRef(0);
  const coworkLoadRequestRef = useRef(0);
  const skipNextChatEffectLoadRef = useRef(false);
  const threadMessageCache = useRef<Map<string, ChatMessage[]>>(new Map());
  const coworkMessageCache = useRef<Map<string, ChatMessage[]>>(new Map());
  const executedCoworkActionRunsRef = useRef<Set<string>>(new Set());
  const approvalResolversRef = useRef<Map<string, ApprovalResolverEntry>>(new Map());
  const internalApprovalRecoveryFlowsRef = useRef<Map<string, InternalApprovalRecoveryFlow>>(new Map());
  const pendingCoworkRunContextsRef = useRef<Map<string, CoworkRunProjectContext[]>>(new Map());
  const resolvedCoworkRunContextsRef = useRef<Map<string, CoworkRunProjectContext>>(new Map());
  const pendingCoworkTaskQueueRef = useRef<Map<string, CoworkTaskQueueEntry[]>>(new Map());

  const [config, setConfig] = useState<AppConfig>(() => createDefaultAppConfig());
  const [configReady, setConfigReady] = useState(false);
  const [draftEngineUrl, setDraftEngineUrl] = useState(DEFAULT_OPENCLAW_COMPAT_ENDPOINT_URL);
  const [draftEngineToken, setDraftEngineToken] = useState('');
  const [draftEngineProviderId, setDraftEngineProviderId] = useState<EngineProviderId>(DEFAULT_ENGINE_PROVIDER_ID);
  const [draftInternalProviderConfig, setDraftInternalProviderConfig] = useState<InternalProviderConfig>(EMPTY_INTERNAL_PROVIDER_CONFIG);
  const [engineConnections, setEngineConnections] = useState<EngineConnectionProfile[]>(() => loadEngineConnectionProfiles());
  const [health, setHealth] = useState<HealthCheckResult | null>(null);
  const [status, setStatus] = useState('Loading configuration...');
  const { preferences, updatePreferences } = usePreferences();
  const {
    authSession,
    authenticating,
    authError,
    guestMode,
    onboardingComplete,
    canUseAppShell,
    userIdentityLabel,
    usageModeLabel,
    handleLogin,
    handleLogout,
    handleContinueAsGuest,
    completeOnboarding,
  } = useAuth({ onStatusChange: setStatus });
  const needsOnboarding = !onboardingComplete;
  const [sendingChat, setSendingChat] = useState(false);
  const [awaitingChatStream, setAwaitingChatStream] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [coworkMessages, setCoworkMessages] = useState<ChatMessage[]>([]);
  const [chatThreads, setChatThreads] = useState<ChatThread[]>(() => loadPersistedRecents().chatThreads ?? []);
  const [coworkThreads, setCoworkThreads] = useState<ChatThread[]>(() => loadPersistedRecents().coworkThreads ?? []);

  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(false);
  const [pairingRequestId, setPairingRequestId] = useState<string | null>(null);
  const [focusedInternalRunId, setFocusedInternalRunId] = useState<string | null>(null);
  const [focusedScheduledJobId, setFocusedScheduledJobId] = useState<string | null>(null);
  const [activeMenuItem, setActiveMenuItem] = useState('');
  const [activePage, setActivePage] = useState<AppPage>('cowork');
  const [settingsSection, setSettingsSection] = useState<SettingsSection>('Profile');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [chatDraftPrompt, setChatDraftPrompt] = useState(() => loadDraft(CHAT_DRAFT_STORAGE_KEY));
  const [coworkDraftPrompt, setCoworkDraftPrompt] = useState(() => loadDraft(COWORK_DRAFT_STORAGE_KEY));
  const [workingFolder, setWorkingFolder] = useState('/Downloads');
  const [coworkProjects, setCoworkProjects] = useState<CoworkProject[]>(() => loadCoworkProjects());
  const [activeCoworkProjectId, setActiveCoworkProjectId] = useState(() => loadActiveCoworkProjectId());
  const [coworkTasks, setCoworkTasks] = useState<CoworkProjectTask[]>(() => loadCoworkTasks());
  const [projectKnowledgeItems, setProjectKnowledgeItems] = useState<ProjectKnowledgeItem[]>(() => loadProjectKnowledgeItems());
  const [taskState, setTaskState] = useState<TaskState>('idle');
  const [localPlanActions, setLocalPlanActions] = useState<LocalFilePlanAction[]>([]);
  const [localPlanLoading, setLocalPlanLoading] = useState(false);
  const [localApplyLoading, setLocalApplyLoading] = useState(false);
  const [localFileDraftPath, setLocalFileDraftPath] = useState('notes/todo.md');
  const [localFileDraftContent, setLocalFileDraftContent] = useState('');
  const [localFileCreateLoading, setLocalFileCreateLoading] = useState(false);
  const [localPlanRootPath, setLocalPlanRootPath] = useState('');
  const [isMaximized, setIsMaximized] = useState(false);
  const [activeSessionKey, setActiveSessionKey] = useState('');
  const [coworkSessionKey, setCoworkSessionKey] = useState('');
  const [chatModels, setChatModels] = useState<ChatModelOption[]>([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [coworkModels, setCoworkModels] = useState<ChatModelOption[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [changingModel, setChangingModel] = useState(false);
  const [changingCoworkModel, setChangingCoworkModel] = useState(false);
  const [scheduledJobs, setScheduledJobs] = useState<ScheduledJob[]>([]);
  const [scheduledLoading, setScheduledLoading] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [recentRenameTarget, setRecentRenameTarget] = useState<RecentWorkspaceEntry | null>(null);
  const [recentRenameValue, setRecentRenameValue] = useState('');
  const [recentDeleteTarget, setRecentDeleteTarget] = useState<RecentWorkspaceEntry | null>(null);
  const [recentActionBusy, setRecentActionBusy] = useState(false);
  const [coworkResetKey, setCoworkResetKey] = useState(0);
  const [coworkRightPanelOpen, setCoworkRightPanelOpen] = useState(true);
  const [coworkSending, setCoworkSending] = useState(false);
  const [coworkAwaitingStream, setCoworkAwaitingStream] = useState(false);
  const [coworkStreamingText, setCoworkStreamingText] = useState('');
  const [coworkModel, setCoworkModel] = useState('');
  const [coworkRunPhase, setCoworkRunPhase] = useState<CoworkRunPhase>('idle');
  const [coworkRunStatus, setCoworkRunStatus] = useState('Ready for a new task.');
  const [coworkWebSearchEnabled, setCoworkWebSearchEnabled] = useState<boolean>(() => {
    try {
      return localStorage.getItem(COWORK_WEB_SEARCH_MODE_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });
  const [coworkProjectPathReferences, setCoworkProjectPathReferences] = useState<ProjectPathReference[]>([]);
  const [localActionReceipts, setLocalActionReceipts] = useState<LocalActionReceipt[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<PendingApprovalAction[]>([]);
  const [coworkProgressSteps, setCoworkProgressSteps] = useState<CoworkProgressStep[]>(() => createInitialCoworkProgressSteps());
  const [coworkArtifacts, setCoworkArtifacts] = useState<CoworkArtifact[]>([]);
  const [localActionSmokeRunning, setLocalActionSmokeRunning] = useState(false);
  const [engineConnected, setEngineConnected] = useState(false);
  const [sessionUsage, setSessionUsage] = useState(() => loadTodayUsage());

  const handleChatPromptChange = useCallback((value: string) => {
    setChatDraftPrompt(value);
  }, []);

  const handleCoworkPromptChange = useCallback((value: string) => {
    setCoworkDraftPrompt(value);
  }, []);

  const fileService = useMemo(
    () => createFileService(engineClientRef.current, draftEngineUrl, Boolean(bridge)),
    // Re-create when connection state or URL changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [draftEngineUrl, engineConnected, bridge],
  );

  const localFileService = useMemo(
    () => (bridge ? new LocalFileService() : null),
    [bridge],
  );

  const recentChatItems = toRecentSidebarItems(chatThreads, 'chat');
  const recentCoworkItems = toRecentSidebarItems(coworkThreads, 'cowork');
  const isCoworkSidebarContext = ['cowork', 'project', 'files', 'local-files', 'activity', 'memory', 'scheduled', 'safety'].includes(activePage);
  const recentItems = isCoworkSidebarContext ? recentCoworkItems : recentChatItems;
  const activeCoworkProject = useMemo(
    () => coworkProjects.find((project) => project.id === activeCoworkProjectId) ?? null,
    [coworkProjects, activeCoworkProjectId],
  );
  const visibleCoworkTasks = useMemo(() => {
    if (!activeCoworkProjectId) {
      return [] as CoworkProjectTask[];
    }
    return coworkTasks
      .filter((task) => task.projectId === activeCoworkProjectId)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 25);
  }, [activeCoworkProjectId, coworkTasks]);
  const latestVisibleCoworkTaskPrompt = visibleCoworkTasks[0]?.prompt?.trim() ?? '';

  const visiblePendingApprovals = useMemo(() => {
    if (!activeCoworkProjectId) {
      return [] as PendingApprovalAction[];
    }

    return pendingApprovals
      .filter((approval) => approval.projectId === activeCoworkProjectId)
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [activeCoworkProjectId, pendingApprovals]);
  const visibleProjectKnowledge = useMemo(() => {
    if (!activeCoworkProjectId) {
      return [] as ProjectKnowledgeItem[];
    }
    return projectKnowledgeItems
      .filter((item) => item.projectId === activeCoworkProjectId)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 40);
  }, [activeCoworkProjectId, projectKnowledgeItems]);
  const visibleProjectArtifacts = useMemo(() => {
    const runIds = new Set(visibleCoworkTasks.map((task) => task.runId).filter((runId): runId is string => typeof runId === 'string' && runId.length > 0));
    if (runIds.size === 0) {
      return coworkArtifacts.slice(0, 40);
    }
    return coworkArtifacts.filter((artifact) => !artifact.runId || runIds.has(artifact.runId)).slice(0, 40);
  }, [coworkArtifacts, visibleCoworkTasks]);
  const selectedEngineConnectionId = useMemo(() => {
    const currentDraft = buildEngineDraftConfig({
      providerId: draftEngineProviderId,
      endpointUrl: normalizeEngineEndpointUrl(draftEngineUrl),
      accessToken: draftEngineToken,
    });
    return engineConnections.find((profile) => engineConnectionMatchesDraft(profile, currentDraft))?.id ?? null;
  }, [draftEngineProviderId, draftEngineToken, draftEngineUrl, engineConnections]);

  const contextFolders = useMemo(() => {
    const folders = [activeCoworkProject?.workspaceFolder?.trim() || '', workingFolder.trim()].filter(Boolean);
    return Array.from(new Set(folders));
  }, [activeCoworkProject?.workspaceFolder, workingFolder]);

  const contextDocuments = useMemo(() => {
    const docs = localActionReceipts
      .filter((entry) => entry.status === 'ok' && (entry.type === 'read_file' || entry.type === 'create_file' || entry.type === 'append_file'))
      .map((entry) => entry.path)
      .filter(Boolean);
    return Array.from(new Set(docs)).slice(0, 8);
  }, [localActionReceipts]);

  const projectMemoryItems = useMemo(() => {
    const items = [
      ...contextDocuments,
      ...(activeCoworkProject?.description ? [activeCoworkProject.description] : []),
    ].map((item) => item.trim()).filter(Boolean);
    return Array.from(new Set(items)).slice(0, 8);
  }, [activeCoworkProject?.description, contextDocuments]);

  const filesTouched = useMemo(
    () =>
      coworkArtifacts
        .filter((artifact) => artifact.kind === 'file')
        .slice(0, 8),
    [coworkArtifacts],
  );

  const setCoworkProgressStage = (
    stage: CoworkProgressStage,
    options?: { details?: string; blocked?: boolean; completeThrough?: boolean },
  ) => {
    const targetIndex = COWORK_PROGRESS_SEQUENCE.findIndex((item) => item.stage === stage);
    if (targetIndex < 0) {
      return;
    }

    setCoworkProgressSteps((current) =>
      current.map((step, index) => {
        const isTarget = index === targetIndex;
        const shouldCompleteEarlier = options?.completeThrough ? index <= targetIndex : index < targetIndex;

        if (options?.blocked && isTarget) {
          return {
            ...step,
            status: 'blocked',
            details: options?.details ?? step.details,
          };
        }

        if (shouldCompleteEarlier) {
          return {
            ...step,
            status: 'completed',
            details: isTarget && options?.details ? options.details : step.details,
          };
        }

        if (isTarget) {
          return {
            ...step,
            status: options?.completeThrough ? 'completed' : 'active',
            details: options?.details ?? step.details,
          };
        }

        return {
          ...step,
          status: step.status === 'blocked' ? 'pending' : 'pending',
          details: index > targetIndex ? undefined : step.details,
        };
      }),
    );
  };

  const resetCoworkProgress = (details?: string) => {
    setCoworkProgressSteps(
      COWORK_PROGRESS_SEQUENCE.map((item, index) => ({
        stage: item.stage,
        label: item.label,
        status: index === 0 ? 'active' : 'pending',
        details: index === 0 ? details : undefined,
      })),
    );
  };

  const recordCoworkArtifactsFromReceipts = (receipts: LocalActionReceipt[], runId: string) => {
    const artifactReceipts = receipts.filter((receipt) =>
      receipt.type === 'create_file' || receipt.type === 'append_file' || receipt.type === 'read_file',
    );

    if (artifactReceipts.length === 0) {
      return;
    }

    const now = Date.now();
    setCoworkArtifacts((current) => {
      const next = [...current];
      for (const receipt of artifactReceipts) {
        const key = `${runId}:${receipt.path}:${receipt.type}`;
        const existingIndex = next.findIndex((artifact) => artifact.id === key);
        const artifact: CoworkArtifact = {
          id: key,
          runId,
          label: receipt.path.split('/').pop() || receipt.path,
          path: receipt.path,
          kind: 'file',
          status: receipt.status,
          source:
            receipt.type === 'create_file' || receipt.type === 'append_file' || receipt.type === 'read_file'
              ? receipt.type
              : undefined,
          updatedAt: now,
        };

        if (existingIndex >= 0) {
          next[existingIndex] = artifact;
        } else {
          next.unshift(artifact);
        }
      }

      return next.slice(0, 40);
    });
  };

  const setCoworkTaskStatus = (
    taskId: string,
    status: CoworkProjectTaskStatus,
    options?: { summary?: string; outcome?: string; runId?: string },
  ) => {
    const now = Date.now();
    setCoworkTasks((current) =>
      current.map((task) =>
        task.id === taskId
          ? {
              ...task,
              status,
              runId: options?.runId ?? task.runId,
              summary: options?.summary ?? task.summary,
              outcome: options?.outcome ?? task.outcome,
              updatedAt: now,
            }
          : task,
      ),
    );
  };

  const queueCoworkTask = (sessionKey: string, entry: CoworkTaskQueueEntry) => {
    const normalized = normalizeSessionKey(sessionKey);
    if (!normalized) {
      return;
    }

    const queue = pendingCoworkTaskQueueRef.current.get(normalized) ?? [];
    pendingCoworkTaskQueueRef.current.set(normalized, [...queue, entry]);
  };

  const resolveCoworkTaskForRun = (sessionKey: string, runId: string): CoworkTaskQueueEntry | null => {
    const normalized = normalizeSessionKey(sessionKey);
    if (!normalized) {
      return null;
    }

    const queue = pendingCoworkTaskQueueRef.current.get(normalized) ?? [];
    if (queue.length === 0) {
      return null;
    }

    let index = queue.findIndex((item) => item.runId === runId);
    if (index < 0) {
      index = queue.findIndex((item) => !item.runId);
    }
    if (index < 0) {
      index = 0;
    }

    const selected = queue[index];
    const updated: CoworkTaskQueueEntry = {
      ...selected,
      runId,
    };
    queue[index] = updated;
    pendingCoworkTaskQueueRef.current.set(normalized, queue);
    return updated;
  };

  const finalizeCoworkTaskRun = (sessionKey: string, taskId: string) => {
    const normalized = normalizeSessionKey(sessionKey);
    if (!normalized) {
      return;
    }

    const queue = pendingCoworkTaskQueueRef.current.get(normalized) ?? [];
    const next = queue.filter((entry) => entry.taskId !== taskId);
    if (next.length > 0) {
      pendingCoworkTaskQueueRef.current.set(normalized, next);
    } else {
      pendingCoworkTaskQueueRef.current.delete(normalized);
    }
  };

  const enqueueCoworkRunContext = (sessionKey: string, context: CoworkRunProjectContext) => {
    const normalizedSessionKey = normalizeSessionKey(sessionKey);
    if (!normalizedSessionKey) {
      return;
    }

    const currentQueue = pendingCoworkRunContextsRef.current.get(normalizedSessionKey) ?? [];
    pendingCoworkRunContextsRef.current.set(normalizedSessionKey, [...currentQueue, context]);
  };

  const resolveCoworkRunContext = (sessionKey: string, runId: string): CoworkRunProjectContext => {
    const normalizedSessionKey = normalizeSessionKey(sessionKey);
    const runKey = `${normalizedSessionKey || 'unknown'}:${runId}`;
    const cached = resolvedCoworkRunContextsRef.current.get(runKey);
    if (cached) {
      return cached;
    }

    const currentQueue = normalizedSessionKey ? pendingCoworkRunContextsRef.current.get(normalizedSessionKey) ?? [] : [];
    const nextFromQueue = currentQueue.shift();
    if (normalizedSessionKey) {
      if (currentQueue.length > 0) {
        pendingCoworkRunContextsRef.current.set(normalizedSessionKey, currentQueue);
      } else {
        pendingCoworkRunContextsRef.current.delete(normalizedSessionKey);
      }
    }

    const fallback: CoworkRunProjectContext = {
      projectId: activeCoworkProject?.id ?? '',
      projectTitle: activeCoworkProject?.name ?? '',
      rootFolder: workingFolderRef.current,
      startedAt: Date.now(),
    };
    const resolved = nextFromQueue ?? fallback;
    resolvedCoworkRunContextsRef.current.set(runKey, resolved);
    return resolved;
  };

  const commitActiveSessionKey = (nextSessionKey: string) => {
    const normalized = normalizeSessionKey(nextSessionKey);
    activeSessionKeyRef.current = normalized;
    setActiveSessionKey(normalized);
    return normalized;
  };

  const commitCoworkSessionKey = (nextSessionKey: string) => {
    const normalized = normalizeSessionKey(nextSessionKey);
    coworkSessionKeyRef.current = normalized;
    setCoworkSessionKey(normalized);
    return normalized;
  };

  const upsertChatThread = (sessionKey: string, options?: { title?: string; touchedAt?: number }) => {
    const normalizedSessionKey = normalizeSessionKey(sessionKey);
    if (!normalizedSessionKey) {
      return;
    }

    const incomingTitle = options?.title ? toRecentSidebarLabel(options.title) : '';
    const touchedAt = options?.touchedAt;

    setChatThreads((current) => {
      const existing = current.find((thread) => thread.sessionKey === normalizedSessionKey);
      // Keep recents list message-driven: don't create a new chat thread without
      // any usable title signal (typically first user message/history).
      if (!existing && !incomingTitle) {
        return current;
      }

      const canReplaceTitle = !existing || !existing.title || existing.title === DEFAULT_CHAT_THREAD_TITLE;
      const fallbackTitle = toFallbackThreadTitle(normalizedSessionKey, 'chat');
      const title = canReplaceTitle && incomingTitle ? incomingTitle : existing?.title || fallbackTitle;
      const updatedAt = touchedAt ?? existing?.updatedAt ?? Date.now();

      const nextThread: ChatThread = {
        id: getThreadIdForSession(normalizedSessionKey),
        sessionKey: normalizedSessionKey,
        title,
        updatedAt,
      };

      return mergeChatThreads(current, [nextThread]);
    });
  };

  const upsertCoworkThread = (sessionKey: string, options?: { title?: string; touchedAt?: number }) => {
    const normalizedSessionKey = normalizeSessionKey(sessionKey);
    if (!normalizedSessionKey) {
      return;
    }

    const incomingTitle = options?.title ? toRecentSidebarLabel(options.title) : '';
    const touchedAt = options?.touchedAt;

    setCoworkThreads((current) => {
      const existing = current.find((thread) => thread.sessionKey === normalizedSessionKey);
      const canReplaceTitle = !existing || !existing.title || existing.title === DEFAULT_COWORK_THREAD_TITLE;
      const fallbackTitle = toFallbackThreadTitle(normalizedSessionKey, 'cowork');
      const title = canReplaceTitle && incomingTitle ? incomingTitle : existing?.title || fallbackTitle;
      const updatedAt = touchedAt ?? existing?.updatedAt ?? Date.now();

      const nextThread: ChatThread = {
        id: getThreadIdForSession(normalizedSessionKey),
        sessionKey: normalizedSessionKey,
        title,
        updatedAt,
      };

      return mergeChatThreads(current, [nextThread]);
    });
  };

  const renameThread = (sessionKey: string, title: string, kind: 'chat' | 'cowork') => {
    const normalizedSessionKey = normalizeSessionKey(sessionKey);
    const normalizedTitle = toRecentSidebarLabel(title);
    if (!normalizedSessionKey || !normalizedTitle) {
      return;
    }

    const apply = (current: ChatThread[]) => {
      const existing = current.find((thread) => thread.sessionKey === normalizedSessionKey);
      if (!existing) {
        return current;
      }
      const nextThread: ChatThread = {
        ...existing,
        title: normalizedTitle,
        updatedAt: Date.now(),
      };
      return mergeChatThreads(current, [nextThread]);
    };

    if (kind === 'cowork') {
      setCoworkThreads(apply);
    } else {
      setChatThreads(apply);
    }
  };

  const removeThread = (sessionKey: string, kind: 'chat' | 'cowork') => {
    const normalizedSessionKey = normalizeSessionKey(sessionKey);
    if (!normalizedSessionKey) {
      return;
    }

    if (kind === 'cowork') {
      setCoworkThreads((current) => current.filter((thread) => thread.sessionKey !== normalizedSessionKey));
      coworkMessageCache.current.delete(normalizedSessionKey);
      if (coworkSessionKeyRef.current === normalizedSessionKey) {
        commitCoworkSessionKey('');
        setCoworkMessages([]);
      }
      return;
    }

    setChatThreads((current) => current.filter((thread) => thread.sessionKey !== normalizedSessionKey));
    threadMessageCache.current.delete(normalizedSessionKey);
    if (activeSessionKeyRef.current === normalizedSessionKey) {
      commitActiveSessionKey('');
      setChatMessages([]);
      setAwaitingChatStream(false);
      handleChatPromptChange('');
    }
  };

  const pushLocalActionReceipts = (entries: LocalActionReceipt[]) => {
    if (entries.length === 0) {
      return;
    }

    setLocalActionReceipts((current) => [...entries, ...current].slice(0, 30));
  };

  const resolvePendingApproval = (
    approvalId: string,
    decision: { approved: boolean; reason?: string; expired?: boolean },
  ) => {
    setPendingApprovals((current) => current.filter((item) => item.id !== approvalId));

    const resolver = approvalResolversRef.current.get(approvalId);
    if (!resolver) {
      return;
    }

    clearTimeout(resolver.timeoutId);
    approvalResolversRef.current.delete(approvalId);
    resolver.resolve(decision);
  };

  const writeInternalApprovalRecoveryFlows = (flows: InternalApprovalRecoveryFlow[]) => {
    const nextMap = new Map<string, InternalApprovalRecoveryFlow>();
    for (const flow of flows) {
      nextMap.set(flow.currentApproval.id, flow);
    }
    internalApprovalRecoveryFlowsRef.current = nextMap;
  };

  const syncRecoveredApprovalCards = (flows: InternalApprovalRecoveryFlow[]) => {
    const currentRecoveredIds = new Set(internalApprovalRecoveryFlowsRef.current.keys());
    setPendingApprovals((current) => {
      const next = current.filter((item) => !currentRecoveredIds.has(item.id));
      for (const flow of flows) {
        if (!next.some((item) => item.id === flow.currentApproval.id)) {
          next.push(flow.currentApproval);
        }
      }
      return next;
    });
  };

  const restoreInternalApprovalRecoveryFlows = async () => {
    const bridge = getDesktopBridge();
    const flows = await bridge?.listInternalPendingApprovals?.() ?? [];
    writeInternalApprovalRecoveryFlows(flows);
    syncRecoveredApprovalCards(flows);
  };

  const clearRecoveredApprovalCards = () => {
    const recoveredIds = new Set(internalApprovalRecoveryFlowsRef.current.keys());
    if (recoveredIds.size === 0) {
      return;
    }
    setPendingApprovals((current) => current.filter((item) => !recoveredIds.has(item.id)));
  };

  const persistInternalApprovalRecoveryFlow = async (flow: InternalApprovalRecoveryFlow) => {
    const bridge = getDesktopBridge();
    await bridge?.saveInternalPendingApproval?.(flow);
  };

  const clearInternalApprovalRecoveryFlow = async (runId: string) => {
    const bridge = getDesktopBridge();
    await bridge?.clearInternalPendingApproval?.(runId);
    const flows = Array.from(internalApprovalRecoveryFlowsRef.current.values())
      .filter((entry) => entry.runId !== runId);
    const currentRecoveredIds = new Set(internalApprovalRecoveryFlowsRef.current.keys());
    if (currentRecoveredIds.size > 0) {
      writeInternalApprovalRecoveryFlows(flows);
      syncRecoveredApprovalCards(flows);
    }
  };

  const continueRecoveredInternalApprovalFlow = async (
    approvalId: string,
    decision: { approved: boolean; reason?: string; expired?: boolean },
  ) => {
    const flow = internalApprovalRecoveryFlowsRef.current.get(approvalId);
    if (!flow) {
      return false;
    }

    setPendingApprovals((current) => current.filter((item) => item.id !== approvalId));
    const bridge = getDesktopBridge();
    const next = await bridge?.applyInternalPendingApprovalDecision?.(flow.runId, decision);
    if (!next || next.kind === 'missing') {
      return false;
    }

    if (next.kind === 'next') {
      const flows = [
        ...Array.from(internalApprovalRecoveryFlowsRef.current.values()).filter((entry) => entry.runId !== flow.runId),
        next.flow,
      ];
      writeInternalApprovalRecoveryFlows(flows);
      syncRecoveredApprovalCards(flows);
      setStatus(buildRecoveredApprovalAwaitingStatus(next.flow.currentApproval.summary));
      return true;
    }

    await clearInternalApprovalRecoveryFlow(flow.runId);
    const client = engineClientRef.current as EngineClientInstance & {
      continueCoworkRun?: (payload: InternalEngineCoworkContinuationRequest) => Promise<unknown>;
    } | null;

    if (!client?.continueCoworkRun) {
      setStatus(buildRecoveredApprovalContinuationUnavailableStatus());
      return true;
    }

    setCoworkRunStatus(buildRecoveredApprovalSubmittingRunStatus());
    setCoworkProgressStage('executing_workstreams', {
      details: buildRecoveredApprovalSubmittingProgressDetails(),
    });

    try {
      await client.continueCoworkRun(next.payload);
    } catch (error) {
      const info = readEngineError(error);
      setStatus(buildRecoveredApprovalContinuationFailureStatus(info.message));
    }
    return true;
  };

  const requestActionApproval = (request: PendingApprovalAction) => {
    setPendingApprovals((current) => [...current, request]);

    return new Promise<{ approved: boolean; reason?: string; expired?: boolean }>((resolve) => {
      const timeoutId = setTimeout(() => {
        resolvePendingApproval(request.id, {
          approved: false,
          reason: 'Approval request timed out.',
          expired: true,
        });
      }, APPROVAL_TIMEOUT_MS);

      approvalResolversRef.current.set(request.id, {
        resolve,
        timeoutId,
      });
    });
  };

  const handleApprovePendingAction = (approvalId: string) => {
    if (internalApprovalRecoveryFlowsRef.current.has(approvalId)) {
      void continueRecoveredInternalApprovalFlow(approvalId, { approved: true });
      return;
    }
    resolvePendingApproval(approvalId, { approved: true });
  };

  const handleRejectPendingAction = (approvalId: string, reason: string) => {
    const trimmedReason = reason.trim();
    if (!trimmedReason) {
      setStatus(buildApprovalRejectReasonRequiredStatus());
      return;
    }

    if (internalApprovalRecoveryFlowsRef.current.has(approvalId)) {
      void continueRecoveredInternalApprovalFlow(approvalId, {
        approved: false,
        reason: trimmedReason,
      });
      return;
    }

    resolvePendingApproval(approvalId, {
      approved: false,
      reason: trimmedReason,
    });
  };

  useEffect(() => {
    if (!import.meta.env.DEV) {
      return;
    }

    const relayE2E: RelayE2EBridge = {
      enqueuePendingApproval: (input) => {
        const now = Date.now();
        const id = input?.id?.trim() || `e2e-approval-${now}`;
        const entry: PendingApprovalAction = {
          id,
          runId: input?.runId?.trim() || 'e2e-run',
          actionId: input?.actionId?.trim() || `e2e-action-${now}`,
          actionType: input?.actionType ?? 'create_file',
          path: input?.path?.trim() || 'notes/e2e.md',
          scopeId: input?.scopeId?.trim() || 'workspace.write',
          scopeName: input?.scopeName?.trim() || 'Workspace write',
          riskLevel: input?.riskLevel ?? 'high',
          summary: input?.summary?.trim() || 'Create notes/e2e.md',
          preview: input?.preview,
          createdAt: input?.createdAt ?? now,
        };

        setPendingApprovals((current) => [...current, entry]);
        return id;
      },
      clearPendingApprovals: () => {
        setPendingApprovals([]);
      },
      getPendingApprovals: () => pendingApprovals,
    };

    window.relayE2E = relayE2E;

    return () => {
      delete window.relayE2E;
    };
  }, [pendingApprovals]);

  const rekeyChatThread = (fromSessionKey: string, toSessionKey: string) => {
    const from = normalizeSessionKey(fromSessionKey);
    const to = normalizeSessionKey(toSessionKey);
    if (!from || !to || from === to) {
      return;
    }

    setChatThreads((current) => {
      const source = current.find((thread) => thread.sessionKey === from);
      const target = current.find((thread) => thread.sessionKey === to);
      if (!source && !target) {
        return current;
      }

      const merged: ChatThread = {
        id: getThreadIdForSession(to),
        sessionKey: to,
        title:
          target?.title && target.title !== DEFAULT_CHAT_THREAD_TITLE
            ? target.title
            : source?.title || target?.title || DEFAULT_CHAT_THREAD_TITLE,
        updatedAt: Math.max(source?.updatedAt ?? 0, target?.updatedAt ?? 0, Date.now()),
      };

      const remaining = current.filter((thread) => thread.sessionKey !== from && thread.sessionKey !== to);
      return mergeChatThreads(remaining, [merged]);
    });
  };

  const loadRecentChatsFromBackend = async (client: EngineClientInstance) => {
    const sessions = await client.listSessions(100);

    const filtered = sessions.filter((session) => {
      const normalized = normalizeSessionKey(session.key);
      return !!normalized;
    });

    const existingSessionKeys = new Set(
      filtered.map((session) => normalizeSessionKey(session.key).toLowerCase()).filter(Boolean),
    );

    const threadsOrNull = await Promise.all(
      filtered.slice(0, 20).map(async (session, index) => {
        const sessionTitle = session.title ? toRecentSidebarLabel(session.title) : '';
        if (sessionTitle) {
          return {
            id: getThreadIdForSession(session.key),
            sessionKey: session.key,
            title: sessionTitle,
            updatedAt: Date.now() - index,
          } satisfies ChatThread;
        }

        try {
          const history = await client.getHistory(session.key, 30);
          const titleFromHistory = deriveThreadTitleFromMessages(history);
          if (!titleFromHistory) {
            return null;
          }

          return {
            id: getThreadIdForSession(session.key),
            sessionKey: session.key,
            title: titleFromHistory,
            updatedAt: Date.now() - index,
          } satisfies ChatThread;
        } catch {
          return null;
        }
      }),
    );

    const threads = threadsOrNull.filter((thread): thread is ChatThread => thread !== null);
    setChatThreads((current) => {
      const validCurrent = current.filter((thread) =>
        existingSessionKeys.has(normalizeSessionKey(thread.sessionKey).toLowerCase()),
      );

      const incomingPreservingCustomTitles = threads.map((thread) => {
        const existing = validCurrent.find(
          (entry) => normalizeSessionKey(entry.sessionKey).toLowerCase() === normalizeSessionKey(thread.sessionKey).toLowerCase(),
        );
        if (existing && isCustomChatThreadTitle(existing.title, existing.sessionKey)) {
          return {
            ...thread,
            title: existing.title,
            updatedAt: Math.max(thread.updatedAt, existing.updatedAt),
          } satisfies ChatThread;
        }

        return thread;
      });

      return mergeChatThreads(validCurrent, incomingPreservingCustomTitles);
    });

    // Keep cowork recents consistent with live runtime sessions too.
    setCoworkThreads((current) =>
      current.filter((thread) => existingSessionKeys.has(normalizeSessionKey(thread.sessionKey).toLowerCase())),
    );
  };

  useEffect(() => {
    const payload: PersistedRecents = {
      chatThreads,
      coworkThreads,
    };
    try {
      localStorage.setItem(RELAY_RECENTS_KEY, JSON.stringify(payload));
    } catch {
      // ignore localStorage quota/privacy failures
    }
  }, [chatThreads, coworkThreads]);

  useEffect(() => {
    try {
      localStorage.setItem(COWORK_PROJECTS_STORAGE_KEY, JSON.stringify(coworkProjects));
    } catch {
      // ignore persistence failures
    }
  }, [coworkProjects]);

  useEffect(() => {
    try {
      localStorage.setItem(COWORK_TASKS_STORAGE_KEY, JSON.stringify(coworkTasks.slice(0, 250)));
    } catch {
      // ignore persistence failures
    }
  }, [coworkTasks]);

  useEffect(() => {
    try {
      localStorage.setItem(COWORK_PROJECT_KNOWLEDGE_STORAGE_KEY, JSON.stringify(projectKnowledgeItems.slice(0, 500)));
    } catch {
      // ignore persistence failures
    }
  }, [projectKnowledgeItems]);

  useEffect(() => {
    try {
      localStorage.setItem(COWORK_WEB_SEARCH_MODE_STORAGE_KEY, coworkWebSearchEnabled ? 'true' : 'false');
    } catch {
      // ignore persistence failures
    }
  }, [coworkWebSearchEnabled]);

  useEffect(() => {
    try {
      localStorage.setItem(CHAT_DRAFT_STORAGE_KEY, chatDraftPrompt);
    } catch {
      // ignore persistence failures
    }
  }, [chatDraftPrompt]);

  useEffect(() => {
    try {
      localStorage.setItem(COWORK_DRAFT_STORAGE_KEY, coworkDraftPrompt);
    } catch {
      // ignore persistence failures
    }
  }, [coworkDraftPrompt]);

  useEffect(() => {
    try {
      if (activeCoworkProjectId) {
        localStorage.setItem(COWORK_ACTIVE_PROJECT_STORAGE_KEY, activeCoworkProjectId);
      } else {
        localStorage.removeItem(COWORK_ACTIVE_PROJECT_STORAGE_KEY);
      }
    } catch {
      // ignore persistence failures
    }
  }, [activeCoworkProjectId]);

  useEffect(() => {
    if (!activeCoworkProjectId) {
      return;
    }

    const exists = coworkProjects.some((project) => project.id === activeCoworkProjectId);
    if (exists) {
      return;
    }

    setActiveCoworkProjectId(coworkProjects[0]?.id ?? '');
  }, [activeCoworkProjectId, coworkProjects]);

  useEffect(() => {
    if (coworkProjects.length === 0) {
      setCoworkTasks([]);
      return;
    }

    const validProjectIds = new Set(coworkProjects.map((project) => project.id));
    setCoworkTasks((current) => current.filter((task) => validProjectIds.has(task.projectId)));
  }, [coworkProjects]);

  useEffect(() => {
    if (!activeCoworkProject) {
      return;
    }

    const nextFolder = activeCoworkProject.workspaceFolder.trim();
    if (!nextFolder || nextFolder === workingFolder.trim()) {
      return;
    }

    setWorkingFolder(nextFolder);
    workingFolderRef.current = nextFolder;
  }, [activeCoworkProject, workingFolder]);

  useEffect(() => {
    let cancelled = false;

    const loadProjectFileReferences = async () => {
      const rootPath = activeCoworkProject?.workspaceFolder?.trim() ?? '';
      if (!rootPath || !bridge?.listDirInFolder) {
        setCoworkProjectPathReferences([]);
        return;
      }

      const MAX_ITEMS = 500;
      const MAX_DEPTH = 4;
      const MAX_DIR_VISITS = 120;
      const queue: Array<{ relPath: string; depth: number }> = [{ relPath: '', depth: 0 }];
      const pathRefs: ProjectPathReference[] = [];
      let directoryVisits = 0;

      while (queue.length > 0 && pathRefs.length < MAX_ITEMS && directoryVisits < MAX_DIR_VISITS) {
        const next = queue.shift();
        if (!next) {
          break;
        }

        let listing: Awaited<ReturnType<NonNullable<typeof bridge.listDirInFolder>>>;
        try {
          listing = await bridge.listDirInFolder(rootPath, next.relPath);
        } catch {
          break;
        }

        directoryVisits += 1;
        const sortedItems = [...listing.items].sort((a, b) => a.path.localeCompare(b.path, undefined, { sensitivity: 'base' }));

        for (const item of sortedItems) {
          pathRefs.push({
            path: item.path,
            kind: item.kind,
          });
          if (pathRefs.length >= MAX_ITEMS) {
            break;
          }

          if (item.kind === 'file') {
            continue;
          }

          if (item.kind === 'directory' && next.depth + 1 < MAX_DEPTH && directoryVisits + queue.length < MAX_DIR_VISITS) {
            queue.push({ relPath: item.path, depth: next.depth + 1 });
          }
        }
      }

      if (cancelled) {
        return;
      }

      const deduped = new Map<string, ProjectPathReference>();
      for (const item of pathRefs) {
        const key = `${item.kind}:${item.path}`;
        if (!deduped.has(key)) {
          deduped.set(key, item);
        }
      }

      setCoworkProjectPathReferences(
        Array.from(deduped.values())
          .sort((a, b) => {
            if (a.kind !== b.kind) {
              return a.kind === 'directory' ? -1 : 1;
            }
            return a.path.localeCompare(b.path, undefined, { sensitivity: 'base' });
          })
          .slice(0, MAX_ITEMS),
      );
    };

    void loadProjectFileReferences();

    return () => {
      cancelled = true;
    };
  }, [activeCoworkProject?.id, activeCoworkProject?.workspaceFolder, bridge]);

  const loadChatSession = async (sessionKeyInput: string, statusMessage?: string) => {
    const client = engineClientRef.current;
    if (!client) {
      return;
    }

    const requestedSessionKey = normalizeSessionKey(sessionKeyInput);
    if (!requestedSessionKey) {
      setStatus(buildInvalidSessionKeyStatus('chat'));
      return;
    }
    commitActiveSessionKey(requestedSessionKey);
    const requestId = chatLoadRequestRef.current + 1;
    chatLoadRequestRef.current = requestId;

    try {
      await client.connect(engineConnectOptionsFromDraft(getCurrentEngineDraft()));

      let resolvedSessionKey = requestedSessionKey;
      let history: ChatMessage[];

      try {
        const [loadedHistory] = await Promise.all([
          client.getHistory(resolvedSessionKey, 30),
          loadModelsForSession(client, resolvedSessionKey),
        ]);
        history = loadedHistory;
      } catch (error) {
        const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
        const isMissingSession = message.includes('no session found') || message.includes('no sendable session found');
        if (!isMissingSession) {
          throw error;
        }

        let retrySessionKey = '';
        try {
          const liveSessions = await client.listSessions(200);
          const liveKeys = liveSessions.map((session) => session.key);
          retrySessionKey = findMatchingSessionKey(liveKeys, resolvedSessionKey) ?? '';
        } catch {
          // fallback below
        }

        if (!retrySessionKey) {
          retrySessionKey = normalizeSessionKey(await client.resolveSessionKey(resolvedSessionKey));
        }

        if (!retrySessionKey) {
          throw error;
        }

        resolvedSessionKey = retrySessionKey;
        if (resolvedSessionKey !== requestedSessionKey) {
          rekeyChatThread(requestedSessionKey, resolvedSessionKey);
        }

        const [loadedHistory] = await Promise.all([
          client.getHistory(resolvedSessionKey, 30),
          loadModelsForSession(client, resolvedSessionKey),
        ]);
        history = loadedHistory;
      }

      if (requestId !== chatLoadRequestRef.current) {
        return;
      }

      commitActiveSessionKey(resolvedSessionKey);

      setChatMessages(history);
      if (history.length > 0) {
        threadMessageCache.current.set(resolvedSessionKey, history);
      }
      const titleFromHistory = deriveThreadTitleFromMessages(history);
      upsertChatThread(resolvedSessionKey, {
        title: titleFromHistory || undefined,
      });

      if (statusMessage) {
        setStatus(buildLoadedSessionStatus({
          scope: 'chat',
          prefix: statusMessage,
          titleFromHistory: titleFromHistory || undefined,
          hasMessages: history.length > 0,
          fallbackTitle: toFallbackThreadTitle(resolvedSessionKey, 'chat'),
        }));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to load chat session.';
      const normalizedMessage = message.toLowerCase();
      const isMissingSession =
        normalizedMessage.includes('no session found') ||
        normalizedMessage.includes('no sendable session found') ||
        normalizedMessage.includes('session not found');
      if (isMissingSession) {
        removeThread(requestedSessionKey, 'chat');
      }
      setStatus(message);
    }
  };

  const loadCoworkSession = async (sessionKeyInput: string, statusMessage?: string) => {
    const client = engineClientRef.current;
    if (!client) {
      return;
    }

    const requestedSessionKey = normalizeSessionKey(sessionKeyInput);
    if (!requestedSessionKey) {
      setStatus(buildInvalidSessionKeyStatus('cowork'));
      return;
    }

    commitCoworkSessionKey(requestedSessionKey);
    const requestId = coworkLoadRequestRef.current + 1;
    coworkLoadRequestRef.current = requestId;

    try {
      await client.connect(engineConnectOptionsFromDraft(getCurrentEngineDraft()));

      const history = await client.getHistory(requestedSessionKey, 50);
      const normalizedHistory = history.map(normalizeCoworkMessage);

      if (requestId !== coworkLoadRequestRef.current) {
        return;
      }

      void loadCoworkModels(client, requestedSessionKey);

      setCoworkMessages(normalizedHistory);
      if (normalizedHistory.length > 0) {
        coworkMessageCache.current.set(requestedSessionKey, normalizedHistory);
      }

      const titleFromHistory = deriveThreadTitleFromMessages(normalizedHistory);
      upsertCoworkThread(requestedSessionKey, {
        title: titleFromHistory || undefined,
      });

      if (statusMessage) {
        setStatus(buildLoadedSessionStatus({
          scope: 'cowork',
          prefix: statusMessage,
          titleFromHistory: titleFromHistory || undefined,
          fallbackTitle: toFallbackThreadTitle(requestedSessionKey, 'cowork'),
        }));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to load cowork session.';
      setStatus(message);
    }
  };

  const ensureConnectedClient = async (client: EngineClientInstance) => {
    await client.connect(engineConnectOptionsFromDraft(getCurrentEngineDraft()));
  };

  const getOrResolveSession = async (client: EngineClientInstance) => {
    try {
      const sessionKey = normalizeSessionKey(await client.getActiveSessionKey());
      if (!sessionKey) {
        throw new Error(buildMissingActiveSessionError());
      }

      commitActiveSessionKey(sessionKey);
      await loadRecentChatsFromBackend(client);
      setStatus(buildSessionReadyStatus(sessionKey));
      return sessionKey;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(buildUnableToResolveActiveSessionError(message));
    }
  };

  const ensureActiveChatSession = async (
    client: EngineClientInstance,
    options?: { createIfMissing?: boolean },
  ) => {
    await ensureConnectedClient(client);

    const current = normalizeSessionKey(activeSessionKeyRef.current);
    if (current) {
      commitActiveSessionKey(current);
      return current;
    }

    if (options?.createIfMissing) {
      const sessionKey = normalizeSessionKey(await client.createChatSession());
      if (!sessionKey) {
        throw new Error(buildMissingCreatedSessionKeyError());
      }
      commitActiveSessionKey(sessionKey);
      await loadRecentChatsFromBackend(client);
      setStatus(buildSessionReadyStatus(sessionKey));
      return sessionKey;
    }

    throw new Error(buildNoActiveChatSessionError());
  };

  const loadModelsForSession = async (client: EngineClientInstance, sessionKey?: string | null) => {
    if (!client.isConnected()) {
      setChatModels([]);
      setSelectedModel('');
      return;
    }

    setModelsLoading(true);
    try {
      const [choices, currentModel] = await Promise.all([
        client.listModels(),
        sessionKey ? client.getSessionModel(sessionKey).catch(() => null) : Promise.resolve(null),
      ]);

      setChatModels(choices.map((model) => ({ value: model.value, label: model.label })));
      setSelectedModel(currentModel ?? '');
    } catch {
      setChatModels([]);
      setSelectedModel('');
    } finally {
      setModelsLoading(false);
    }
  };

  const loadCoworkModels = async (client: EngineClientInstance, sessionKey?: string) => {
    if (!client.isConnected()) {
      setCoworkModels([]);
      if (sessionKey) {
        setCoworkModel('');
      }
      return;
    }

    setModelsLoading(true);
    try {
      const [choices, currentModel] = await Promise.all([
        client.listModels(),
        sessionKey ? client.getSessionModel(sessionKey).catch(() => null) : Promise.resolve(null),
      ]);

      setCoworkModels(choices.map((model) => ({ value: model.value, label: model.label })));
      if (sessionKey) {
        setCoworkModel(currentModel ?? '');
      } else {
        setCoworkModel((current) => current || choices[0]?.value || '');
      }
    } catch {
      setCoworkModels([]);
      if (sessionKey) {
        setCoworkModel('');
      }
    } finally {
      setModelsLoading(false);
    }
  };

  const loadLocalConfig = () => {
    try {
      const raw = localStorage.getItem(LOCAL_CONFIG_KEY);
      if (!raw) {
        return null;
      }

        return parseStoredEngineConfig(JSON.parse(raw), DEFAULT_OPENCLAW_COMPAT_ENDPOINT_URL);
    } catch {
      return null;
    }
  };

  const persistLocalConfig = (nextConfig: AppConfig) => {
    localStorage.setItem(LOCAL_CONFIG_KEY, JSON.stringify(nextConfig));
  };

  const updateEngineConnections = useCallback((updater: (prev: EngineConnectionProfile[]) => EngineConnectionProfile[]) => {
    setEngineConnections((prev) => {
      const next = updater(prev);
      persistEngineConnectionProfiles(next);
      return next;
    });
  }, [draftEngineProviderId]);

  const getCurrentEngineDraft = useCallback(
    () =>
        buildEngineDraftConfig({
          providerId: draftEngineProviderId,
          endpointUrl: normalizeEngineEndpointUrl(draftEngineUrl),
          accessToken: draftEngineToken,
          internalProviderConfig: draftInternalProviderConfig,
        }),
    [draftEngineProviderId, draftEngineToken, draftEngineUrl, draftInternalProviderConfig],
  );

  const markEngineConnectionLastUsed = useCallback((connectedConfig: AppConfig) => {
    const now = Date.now();

    updateEngineConnections((prev) =>
      prev.map((profile) =>
        engineConnectionMatchesAppConfig(profile, connectedConfig)
          ? { ...profile, lastUsedAt: now, updatedAt: now }
          : profile,
      ),
    );
  }, [updateEngineConnections]);

  const handleSelectEngineConnection = useCallback((connectionId: string) => {
    const profile = engineConnections.find((entry) => entry.id === connectionId);
    if (!profile) {
      return;
    }

    const selectedEngineDraft = buildEngineDraftConfig({
      providerId: profile.providerId,
      endpointUrl: profile.endpointUrl,
      accessToken: profile.accessToken,
      internalProviderConfig: draftInternalProviderConfig,
    });
    setDraftEngineUrl(selectedEngineDraft.endpointUrl);
    setDraftEngineToken(selectedEngineDraft.accessToken);
    setDraftEngineProviderId(selectedEngineDraft.providerId);
    setStatus(buildLoadedEngineConnectionStatus(profile.name));
  }, [draftInternalProviderConfig, engineConnections]);

  const handleSaveEngineConnection = useCallback((name: string) => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setStatus(buildEngineConnectionNameRequiredStatus());
      return;
    }

      const normalizedUrl = normalizeEngineEndpointUrl(draftEngineUrl);
      const now = Date.now();

    updateEngineConnections((prev) => {
      const duplicateByName = prev.find((entry) => entry.name.toLowerCase() === trimmedName.toLowerCase());
      if (duplicateByName) {
        return prev
          .map((entry) =>
            entry.id === duplicateByName.id
              ? {
                  ...entry,
                  name: trimmedName,
                  endpointUrl: normalizedUrl,
                  accessToken: draftEngineToken,
                  providerId: draftEngineProviderId,
                  updatedAt: now,
                }
              : entry,
          )
          .sort((a, b) => b.updatedAt - a.updatedAt);
      }

      const id =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `conn-${now}-${Math.random().toString(36).slice(2, 9)}`;

      return [
        {
          id,
          name: trimmedName,
          endpointUrl: normalizedUrl,
          accessToken: draftEngineToken,
          providerId: draftEngineProviderId,
          createdAt: now,
          updatedAt: now,
        },
        ...prev,
      ];
    });

    setStatus(buildSavedEngineConnectionStatus(trimmedName));
  }, [draftEngineProviderId, draftEngineToken, draftEngineUrl, updateEngineConnections]);

  const handleOverwriteEngineConnection = useCallback((connectionId: string) => {
      const normalizedUrl = normalizeEngineEndpointUrl(draftEngineUrl);
      const now = Date.now();

    updateEngineConnections((prev) =>
      prev
        .map((entry) =>
          entry.id === connectionId
            ? {
                ...entry,
                endpointUrl: normalizedUrl,
                accessToken: draftEngineToken,
                providerId: draftEngineProviderId,
                updatedAt: now,
              }
            : entry,
        )
        .sort((a, b) => b.updatedAt - a.updatedAt),
    );

    setStatus(buildUpdatedEngineConnectionStatus());
  }, [draftEngineProviderId, draftEngineToken, draftEngineUrl, updateEngineConnections]);

  const handleDeleteEngineConnection = useCallback((connectionId: string) => {
    updateEngineConnections((prev) => prev.filter((entry) => entry.id !== connectionId));
    setStatus(buildDeletedEngineConnectionStatus());
  }, [updateEngineConnections]);

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const mod = event.ctrlKey || event.metaKey;
      if (!mod) return;

      // Ctrl+N ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¾ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â new chat / new task
      if (event.key === 'n') {
        event.preventDefault();
        if (activePage === 'cowork') {
          setCoworkMessages([]);
          setCoworkAwaitingStream(false);
          setCoworkStreamingText('');
          setCoworkRunPhase('idle');
          setCoworkRunStatus('Ready for a new task.');
          setLocalPlanActions([]);
          handleCoworkPromptChange('');
          setStatus('Ready for a new task.');
          setCoworkResetKey((c) => c + 1);
        } else {
          void handleStartNewChat();
        }
        return;
      }

      // Ctrl+K ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¾ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â open search
      if (event.key === 'k') {
        event.preventDefault();
        setSearchOpen((prev) => !prev);
        if (!searchOpen) {
          setSearchQuery('');
          setActiveMenuItem('Search');
        }
        return;
      }

      // Ctrl+Shift+S ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¾ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â settings
      if (event.key === 'S' && event.shiftKey) {
        event.preventDefault();
        setActivePage('settings');
        return;
      }

      // Ctrl+, settings (common IDE shortcut)
      if (event.key === ',') {
        event.preventDefault();
        setActivePage('settings');
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activePage, searchOpen]);


  useEffect(() => {
    if (!bridge) {
      const localConfig = loadLocalConfig();
      if (localConfig) {
        setConfig(localConfig.appConfig);
        setDraftEngineUrl(localConfig.engineDraft.endpointUrl);
        setDraftEngineToken(localConfig.engineDraft.accessToken);
        setDraftEngineProviderId(localConfig.engineDraft.providerId);
        setDraftInternalProviderConfig(localConfig.engineDraft.internalProviderConfig);
        setStatus(buildLoadedLocalConfigurationStatus());
      } else {
        setStatus(buildBridgeUnavailableConfigurationStatus());
      }
      setConfigReady(true);
      return;
    }

    let cancelled = false;

    bridge
      .getConfig()
      .then(async (storedConfig) => {
        if (cancelled) {
          return;
        }

        const storedEngineConfig = bridge.getEngineConfig
          ? await bridge.getEngineConfig()
          : {
              appConfig: storedConfig,
              engineDraft: engineDraftFromAppConfig(storedConfig),
              storageVersion: 1 as const,
            };
        setConfig(storedEngineConfig.appConfig);
        setDraftEngineUrl(storedEngineConfig.engineDraft.endpointUrl);
        setDraftEngineToken(storedEngineConfig.engineDraft.accessToken);
        setDraftEngineProviderId(storedEngineConfig.engineDraft.providerId);
        setDraftInternalProviderConfig(storedEngineConfig.engineDraft.internalProviderConfig);
        setStatus(buildConfigurationLoadedStatus());
        setConfigReady(true);
      })
      .catch(() => {
        if (cancelled) {
          return;
        }

        const localConfig = loadLocalConfig();
        if (localConfig) {
          setConfig(localConfig.appConfig);
          setDraftEngineUrl(localConfig.engineDraft.endpointUrl);
          setDraftEngineToken(localConfig.engineDraft.accessToken);
          setDraftEngineProviderId(localConfig.engineDraft.providerId);
          setDraftInternalProviderConfig(localConfig.engineDraft.internalProviderConfig);
          setStatus(buildLoadedLocalFallbackConfigurationStatus());
        } else {
          setStatus(buildUnableToLoadConfigurationStatus());
        }
        setConfigReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, [bridge]);

  useEffect(() => {
    if (!bridge?.isWindowMaximized) {
      return;
    }

    bridge
      .isWindowMaximized()
      .then((value) => setIsMaximized(value))
      .catch(() => {
        setIsMaximized(false);
      });
  }, [bridge]);

  useEffect(() => {
    if (!bridge?.getDownloadsPath) {
      return;
    }

    let cancelled = false;
    bridge
      .getDownloadsPath()
      .then((downloadsPath) => {
        if (!cancelled && typeof downloadsPath === 'string' && downloadsPath.trim()) {
          setWorkingFolder(downloadsPath);
        }
      })
      .catch(() => {
        // keep existing default
      });

    return () => {
      cancelled = true;
    };
  }, [bridge]);

  useEffect(() => {
    activeSessionKeyRef.current = normalizeSessionKey(activeSessionKey);
  }, [activeSessionKey]);

  useEffect(() => {
    coworkSessionKeyRef.current = normalizeSessionKey(coworkSessionKey);
  }, [coworkSessionKey]);

  useEffect(() => {
    workingFolderRef.current = workingFolder.trim();
  }, [workingFolder]);

  useLayoutEffect(() => {
    const client = createEngineClient(draftEngineProviderId);
    client.setConnectionHandler((connected, message) => {
      if (engineClientRef.current !== client) {
        return;
      }
      setStatus(message);
      setEngineConnected(connected);
    });
    client.setEventHandler((event) => {
      if (engineClientRef.current !== client) {
        return;
      }
      const chatEvent = parseEngineChatEvent(event, `evt-${Date.now()}`);
      if (chatEvent) {
        const { payload, sessionKey: eventSessionKey, runId, text, visibleText, role } = chatEvent;
        const sessionResult = getEngineSessionResult(chatEvent);
        const isCoworkEvent = !!eventSessionKey && eventSessionKey === coworkSessionKeyRef.current;

        if (isCoworkEvent) {
          if (sessionResult?.status === 'failed' && isEngineSessionError(chatEvent)) {
            setCoworkAwaitingStream(false);
            setCoworkRunPhase('error');
            const resolvedErrorMessage = sessionResult.statusMessage || 'Cowork stream failed.';
            const failureApplication = resolveEngineCoworkFailureApplication(resolvedErrorMessage);
            setCoworkRunStatus(failureApplication.runStatus);
            setCoworkProgressStage('executing_workstreams', {
              blocked: true,
              details: failureApplication.progressDetails,
            });
            setStatus(failureApplication.runStatus);
            const taskEntry = resolveCoworkTaskForRun(eventSessionKey || coworkSessionKeyRef.current, runId);
            if (taskEntry) {
              setCoworkTaskStatus(taskEntry.taskId, failureApplication.taskStatus, {
                runId,
                summary: failureApplication.taskSummary,
                outcome: failureApplication.taskOutcome,
              });
              finalizeCoworkTaskRun(eventSessionKey || coworkSessionKeyRef.current, taskEntry.taskId);
            }
            return;
          }

          if (isEngineSessionStreaming(chatEvent)) {
            setCoworkAwaitingStream(false);
            setCoworkRunPhase('streaming');
            const streamingTransition = resolveEngineCoworkStreamingTransition(chatEvent);
            setCoworkRunStatus(streamingTransition.runStatus);
            setCoworkProgressStage('executing_workstreams', {
              details: streamingTransition.progressDetails,
            });
            setCoworkStreamingText(visibleText);
            const taskEntry = resolveCoworkTaskForRun(eventSessionKey || coworkSessionKeyRef.current, runId);
            if (taskEntry) {
              setCoworkTaskStatus(taskEntry.taskId, streamingTransition.taskStatus, {
                runId,
                summary: streamingTransition.taskSummary,
              });
            }
            const { streamId } = getEngineSessionMessageIds('cowork', runId);
            setCoworkMessages((current) => {
              const next = applyEngineCoworkStreamMessageUpdate({
                current,
                streamId,
                role,
                visibleText,
              });
              if (eventSessionKey) {
                coworkMessageCache.current.set(eventSessionKey, next);
              }
              return next;
            });
            return;
          }

          if (sessionResult && sessionResult.status !== 'failed') {
            setCoworkAwaitingStream(false);
            setCoworkRunPhase('completed');
            setCoworkRunStatus(sessionResult.status === 'aborted' ? 'Cowork run ended early.' : 'Cowork run completed.');
            setCoworkProgressStage('synthesizing_outputs', {
              details: 'Synthesizing output from completed workstreams.',
            });
            setCoworkStreamingText(visibleText);
            const { streamId, finalId, activityId } = getEngineSessionMessageIds('cowork', runId);
            const activeModel = chatEvent.model;
            const coworkUsage = parseUsageFromPayload(payload, activeModel);
            const {
              requestedActions,
              activityItems,
              hasRequestedActions,
              hasStructuredActivity,
              actionPhase,
              actionMode,
              providerId,
              executionResult,
            } = deriveEngineSessionArtifacts(chatEvent);
            const internalExecution = isInternalEngineProvider(providerId) ? executionResult : null;
            if (coworkUsage) {
              accumulateTodayUsage(coworkUsage);
              setSessionUsage((prev) => addUsage(prev, coworkUsage));
            }
            setCoworkMessages((current) => {
              const next = applyEngineCoworkFinalMessageUpdate({
                current,
                streamId,
                finalId,
                role,
                visibleText,
                usage: coworkUsage,
                hasRequestedActions,
                hasStructuredActivity,
              });
              if (eventSessionKey) {
                coworkMessageCache.current.set(eventSessionKey, next);
              }
              return next;
            });

            if (!hasRequestedActions && hasStructuredActivity) {
              setCoworkMessages((current) => {
                const next = appendEngineCoworkActivityMessage({
                  current,
                  activityId,
                  activityItems,
                });
                if (eventSessionKey) {
                  coworkMessageCache.current.set(eventSessionKey, next);
                }
                return next;
              });
            }
            if (eventSessionKey) {
              upsertCoworkThread(eventSessionKey, {
                touchedAt: Date.now(),
              });
            }

            const actionRunKey = deriveEngineActionRunKey(eventSessionKey, runId);
            const runContext = resolveCoworkRunContext(eventSessionKey || coworkSessionKeyRef.current, runId);
            const taskEntry = resolveCoworkTaskForRun(eventSessionKey || coworkSessionKeyRef.current, runId);
            const postCoworkActionReceipt = (result: ReturnType<typeof buildEngineActionExecutionResult>) => {
              const receiptCommit = resolveEngineCoworkReceiptCommit({
                result,
                hasTaskEntry: Boolean(taskEntry),
              });
              setCoworkRunStatus(receiptCommit.runStatus);
              setCoworkProgressStage('deliverables', {
                completeThrough: true,
                details: receiptCommit.progressDetails,
              });
              setStatus(receiptCommit.runStatus);
              pushLocalActionReceipts(receiptCommit.receipts);
              recordCoworkArtifactsFromReceipts(receiptCommit.receipts, runId);

              if (taskEntry && receiptCommit.taskCommit) {
                setCoworkTaskStatus(taskEntry.taskId, receiptCommit.taskCommit.taskStatus, {
                  runId,
                  summary: receiptCommit.taskCommit.taskSummary,
                  outcome: receiptCommit.taskCommit.taskOutcome,
                });
                if (receiptCommit.taskCommit.shouldFinalize) {
                  finalizeCoworkTaskRun(eventSessionKey || coworkSessionKeyRef.current, taskEntry.taskId);
                }
              }

              setCoworkMessages((current) => {
                const next = appendEngineCoworkSystemMessage({
                  current,
                  message: receiptCommit.message,
                });
                if (eventSessionKey) {
                  coworkMessageCache.current.set(eventSessionKey, next);
                }
                return next;
              });
            };
            const approvalTransition = resolveEngineCoworkApprovalTransition({
              hasRequestedActions,
              actionPhase,
              actionMode,
            });
            if (approvalTransition) {
              const approvalApplication = resolveEngineCoworkApprovalApplication(approvalTransition);
              setCoworkRunStatus(approvalApplication.runStatus);
              setCoworkProgressStage('executing_workstreams', {
                details: approvalApplication.progressDetails,
              });
              if (taskEntry) {
                setCoworkTaskStatus(taskEntry.taskId, approvalApplication.taskStatus, {
                  runId,
                  summary: approvalApplication.taskSummary,
                });
              }
            }
            if (taskEntry && requestedActions.length === 0 && !internalExecution) {
              const noActionCommit = resolveEngineCoworkNoActionCommit({
                visibleText,
                projectTitle: runContext.projectTitle,
                runId,
                rootPath: runContext.rootFolder,
                hasTaskEntry: true,
              });
              if (noActionCommit.taskCommit) {
                setCoworkTaskStatus(taskEntry.taskId, noActionCommit.taskCommit.taskStatus, {
                  runId,
                  summary: noActionCommit.taskCommit.taskSummary,
                  outcome: noActionCommit.taskCommit.taskOutcome,
                });
              }
            }
            if (
              requestedActions.length > 0 &&
              !executedCoworkActionRunsRef.current.has(actionRunKey)
            ) {
              executedCoworkActionRunsRef.current.add(actionRunKey);
              void (async () => {
                const executionOutcome = await executeEngineCoworkActionExecution({
                  requestedActions,
                  providerId,
                  actionMode,
                  runId,
                  eventSessionKey,
                  currentCoworkSessionKey: coworkSessionKeyRef.current,
                  runContext,
                  continueCoworkRun: 'continueCoworkRun' in client
                    ? (client as EngineClientInstance & {
                        continueCoworkRun?: (payload: {
                          sessionKey: string;
                          runId: string;
                          rootPath: string;
                          approvedActions: EngineRequestedAction[];
                          rejectedActions: { id: string; actionId: string; actionType: EngineRequestedAction['type']; path: string; approved: false; reason?: string }[];
                        }) => Promise<unknown>;
                      }).continueCoworkRun?.bind(client)
                    : undefined,
                  bridge,
                  maxActionsPerRun: MAX_LOCAL_ACTIONS_PER_RUN,
                  safetyScopes: loadSafetyScopes(runContext.projectId || undefined),
                  requestApproval: requestActionApproval,
                  validateProjectRelativePath,
                  onRunStatus: setCoworkRunStatus,
                  onProgress: (details) => {
                    setCoworkProgressStage('executing_workstreams', { details });
                  },
                  onTaskStatus: taskEntry
                    ? (status, summary, outcome) => {
                        setCoworkTaskStatus(taskEntry.taskId, status, {
                          runId,
                          summary,
                          outcome,
                        });
                      }
                    : undefined,
                  onInternalApprovalCheckpoint: ({ request, sessionKey, rootPath, context, requestedActions: boundedActions, currentIndex, approvedActions, rejectedActions }) => {
                    void persistInternalApprovalRecoveryFlow(
                      buildInternalApprovalRecoveryFlow({
                        sessionKey,
                        rootPath,
                        context,
                        requestedActions: boundedActions,
                        currentIndex,
                        approvedActions,
                        rejectedActions,
                        currentApproval: request,
                      }),
                    );
                  },
                  onInternalApprovalFlowComplete: (completedRunId) => {
                    void clearInternalApprovalRecoveryFlow(completedRunId);
                  },
                });
                if (executionOutcome.kind === 'continued') {
                  return;
                }

                postCoworkActionReceipt(executionOutcome.result);
                if (executionOutcome.notification && bridge?.notify) {
                  bridge.notify(executionOutcome.notification.title, executionOutcome.notification.body).catch(() => {
                    /* notification failure is non-critical */
                  });
                }
              })();
            } else if (internalExecution) {
              postCoworkActionReceipt(
                buildEngineActionExecutionResult({
                  runId,
                  receipts: internalExecution.receipts,
                  previews: internalExecution.previews,
                  errors: internalExecution.errors,
                  projectTitle: runContext.projectTitle,
                  rootPath: runContext.rootFolder || '(not set)',
                }),
              );
            } else if (requestedActions.length === 0) {
              const noActionCommit = resolveEngineCoworkNoActionCommit({
                visibleText,
                projectTitle: runContext.projectTitle,
                runId,
                rootPath: runContext.rootFolder,
                hasTaskEntry: Boolean(taskEntry),
              });
              setCoworkProgressStage('deliverables', {
                completeThrough: true,
                details: noActionCommit.progressDetails,
              });
              if (taskEntry && noActionCommit.taskCommit) {
                setCoworkTaskStatus(taskEntry.taskId, noActionCommit.taskCommit.taskStatus, {
                  runId,
                  summary: noActionCommit.taskCommit.taskSummary,
                  outcome: noActionCommit.taskCommit.taskOutcome,
                });
                if (noActionCommit.taskCommit.shouldFinalize) {
                  finalizeCoworkTaskRun(eventSessionKey || coworkSessionKeyRef.current, taskEntry.taskId);
                }

                if (bridge?.notify) {
                  bridge.notify(noActionCommit.notificationTitle, noActionCommit.notificationBody).catch(() => {});
                }
              }

              setCoworkMessages((current) => {
                const next = appendEngineCoworkSystemMessage({
                  current,
                  message: noActionCommit.message,
                });
                if (eventSessionKey) {
                  coworkMessageCache.current.set(eventSessionKey, next);
                }
                return next;
              });
            }
            return;
          }
        }

        if (eventSessionKey && eventSessionKey !== activeSessionKeyRef.current) {
          const previousActive = normalizeSessionKey(activeSessionKeyRef.current);
          if (previousActive) {
            rekeyChatThread(previousActive, eventSessionKey);
            const cachedMessages = threadMessageCache.current.get(previousActive);
            if (cachedMessages) {
              threadMessageCache.current.set(eventSessionKey, cachedMessages);
              threadMessageCache.current.delete(previousActive);
            }
          }
          commitActiveSessionKey(eventSessionKey);
        }

        if (sessionResult?.status === 'failed' && isEngineSessionError(chatEvent)) {
          setAwaitingChatStream(false);
          setStatus(sessionResult.statusMessage || 'Chat stream failed.');
          return;
        }

        if (isEngineSessionStreaming(chatEvent)) {
          setAwaitingChatStream(false);
          const { streamId } = getEngineSessionMessageIds('chat', runId);
          setChatMessages((current) => {
            const index = current.findIndex((entry) => entry.id === streamId);
            if (index >= 0) {
              const next = [...current];
              next[index] = { ...next[index], text, role };
              return next;
            }
            return [...current, { id: streamId, role, text }];
          });
          return;
        }

        if (sessionResult && sessionResult.status !== 'failed' && text) {
          setAwaitingChatStream(false);
          const { streamId, finalId } = getEngineSessionMessageIds('chat', runId);
          const activeModel = chatEvent.model;
          const usage = parseUsageFromPayload(payload, activeModel);
          if (usage) {
            accumulateTodayUsage(usage);
            setSessionUsage((prev) => addUsage(prev, usage));
          }
          setChatMessages((current) => {
            const withoutStream = current.filter((entry) => entry.id !== streamId);
            if (withoutStream.some((entry) => entry.id === finalId)) {
              return withoutStream;
            }
            const finalMsg = { id: finalId, role, text, ...(usage ? { usage } : {}) };
            const next = [...withoutStream, finalMsg];
            const cacheKey = activeSessionKeyRef.current;
            if (cacheKey) {
              threadMessageCache.current.set(cacheKey, next);
            }
            return next;
          });

          if (eventSessionKey) {
            upsertChatThread(eventSessionKey, {
              touchedAt: Date.now(),
            });
          }
        }
      }
    });

    engineClientRef.current = client;
    return () => {
      for (const entry of approvalResolversRef.current.values()) {
        clearTimeout(entry.timeoutId);
      }
      approvalResolversRef.current.clear();
      engineClientRef.current?.disconnect();
      engineClientRef.current = null;
    };
  }, [draftEngineProviderId]);

  useEffect(() => {
    if (!configReady) {
      return;
    }

    const client = engineClientRef.current;
    if (!client) {
      return;
    }

    let cancelled = false;
      const runtimeEndpointUrl = normalizeEngineEndpointUrl(config.gatewayUrl);
      const runtimeAccessToken = config.gatewayToken ?? '';

    void client
      .connect({
        endpointUrl: runtimeEndpointUrl,
        accessToken: runtimeAccessToken,
      })
      .then(async () => {
        if (cancelled) {
          return;
        }
        setEngineConnected(true);
        setHealth({ ok: true, message: buildEngineConnectSuccessHealthMessage(runtimeEndpointUrl) });
        markEngineConnectionLastUsed({ gatewayUrl: runtimeEndpointUrl, gatewayToken: runtimeAccessToken });
        if (shouldRestoreInternalApprovalRecovery(draftEngineProviderId)) {
          await restoreInternalApprovalRecoveryFlows();
        } else {
          clearRecoveredApprovalCards();
        }
        if (!onboardingComplete) {
          completeOnboarding();
        }
        try {
          await loadRecentChatsFromBackend(client);
          await loadModelsForSession(client, normalizeSessionKey(activeSessionKeyRef.current));
        } catch (error) {
          if (cancelled) {
            return;
          }
          const message = error instanceof Error ? error.message : 'Connected to runtime, but failed to refresh recent chats.';
          setStatus(message);
        }
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        setEngineConnected(false);
        const info = readEngineError(error);
        const description = describeEngineConnectFailure(draftEngineProviderId, info);
        setPairingRequestId(description.pairingRequestId);
        setHealth({ ok: false, message: description.healthMessage });
        setStatus(description.statusMessage);
      });

    return () => {
      cancelled = true;
    };
  }, [draftEngineProviderId, config.gatewayToken, config.gatewayUrl, onboardingComplete, configReady, markEngineConnectionLastUsed]);

  useEffect(() => {
    if (activePage !== 'chat') {
      return;
    }

    const normalized = normalizeSessionKey(activeSessionKey);
    if (!normalized) {
      return;
    }

    if (skipNextChatEffectLoadRef.current) {
      skipNextChatEffectLoadRef.current = false;
      return;
    }

    void loadChatSession(normalized, undefined);
  }, [activePage, activeSessionKey]);

  const handleSave = async (event: FormEvent) => {
    event.preventDefault();

      const nextEngineDraft = buildEngineDraftConfig({
        providerId: draftEngineProviderId,
        endpointUrl: normalizeEngineEndpointUrl(draftEngineUrl),
        accessToken: draftEngineToken,
        internalProviderConfig: draftInternalProviderConfig,
      });
    const nextConfig = appConfigFromEngineDraft(nextEngineDraft);

    setSaving(true);
    setStatus(buildSavingAndConnectingStatus());
    setPairingRequestId(null);

    // Persist config
    if (bridge) {
      try {
        const savedEngineConfig = bridge.saveEngineConfig
          ? await bridge.saveEngineConfig(nextEngineDraft)
          : {
              appConfig: await bridge.saveConfig(nextConfig),
              engineDraft: nextEngineDraft,
              storageVersion: 1 as const,
            };
        flushSync(() => {
          setConfig(savedEngineConfig.appConfig);
          setDraftEngineUrl(savedEngineConfig.engineDraft.endpointUrl);
          setDraftEngineToken(savedEngineConfig.engineDraft.accessToken);
          setDraftEngineProviderId(savedEngineConfig.engineDraft.providerId);
          setDraftInternalProviderConfig(savedEngineConfig.engineDraft.internalProviderConfig);
        });
        persistLocalConfig(savedEngineConfig.appConfig);
      } catch {
        setStatus(buildFailedToSaveConfigurationStatus());
        setSaving(false);
        return;
      }
    } else {
      flushSync(() => {
        setConfig(nextConfig);
        setDraftEngineUrl(nextEngineDraft.endpointUrl);
        setDraftEngineToken(nextEngineDraft.accessToken);
        setDraftEngineProviderId(nextEngineDraft.providerId);
        setDraftInternalProviderConfig(nextEngineDraft.internalProviderConfig);
      });
      persistLocalConfig(nextConfig);
    }

    try {
      setStatus(buildConfigurationSavedConnectingStatus());
    } finally {
      setSaving(false);
    }
  };

  const handleResetPairing = async () => {
    const client = engineClientRef.current;
    if (!client) {
      setStatus(buildRuntimeClientUnavailableStatus());
      return;
    }

    setChecking(true);
    setPairingRequestId(null);
    setStatus('Resetting local device identity and requesting fresh pairing...');

    try {
      client.disconnect();
      const clientWithReset = client as EngineClientInstance & {
        resetDeviceIdentity?: () => void;
      };
      if (typeof clientWithReset.resetDeviceIdentity === 'function') {
        clientWithReset.resetDeviceIdentity();
      } else {
        // Fallback for stale runtime instances that predate resetDeviceIdentity().
        localStorage.removeItem(OPENCLAW_COMPAT_DEVICE_IDENTITY_STORAGE_KEY);
      }
      await client.connect(engineConnectOptionsFromDraft(getCurrentEngineDraft()));

      const sessionKey = normalizeSessionKey(activeSessionKeyRef.current);
      if (sessionKey) {
        commitActiveSessionKey(sessionKey);
      }
      setEngineConnected(true);
      const success = buildEngineResetPairingSuccess(draftEngineProviderId, getCurrentEngineDraft().endpointUrl);
      setHealth({ ok: true, message: success.healthMessage });
      setStatus(success.statusMessage);
    } catch (error) {
      console.error('[Cloffice] reset pairing error:', error);
      setEngineConnected(false);
      const info = readEngineError(error);
      const description = describeEngineResetPairingFailure(draftEngineProviderId, info);
      setPairingRequestId(description.pairingRequestId);
      setHealth({ ok: false, message: description.healthMessage });
      setStatus(description.statusMessage);
    } finally {
      setChecking(false);
    }
  };

  const handlePlanTask = async (event: FormEvent) => {
    event.preventDefault();
    if (!engineConnected) {
      const disconnected = resolveCoworkDisconnectedState();
      setStatus(disconnected.statusMessage);
      setCoworkAwaitingStream(false);
      setCoworkSending(false);
      setCoworkRunPhase(disconnected.runPhase);
      setCoworkRunStatus(disconnected.runStatus);
      return;
    }
    workingFolderRef.current = workingFolder.trim();
    setCoworkSending(true);
    setCoworkAwaitingStream(false);
    setCoworkStreamingText('');
    const sendingState = resolveCoworkSendingState();
    setCoworkRunPhase(sendingState.runPhase);
    setCoworkRunStatus(sendingState.runStatus);
    resetCoworkProgress(sendingState.progressDetails ?? 'Interpreting goal and building a task plan.');

    const text = coworkDraftPrompt.trim();
    if (!text) {
      setStatus(buildCoworkEmptyPromptStatus());
      setCoworkSending(false);
      return;
    }

    // Clear the composer immediately so submit feedback matches user expectation.
    handleCoworkPromptChange('');

    const client = engineClientRef.current;
    if (!client) {
      setStatus(buildRuntimeClientUnavailableStatus());
      setCoworkSending(false);
      return;
    }

    try {
      await ensureConnectedClient(client);

      let sessionKey = normalizeSessionKey(coworkSessionKeyRef.current);
      if (!sessionKey) {
        sessionKey = normalizeSessionKey(await client.createCoworkSession());
        if (!sessionKey) {
          throw new Error(buildMissingCoworkSessionKeyError());
        }
        commitCoworkSessionKey(sessionKey);
      }

      const now = Date.now();
      const queuedTaskId = `task-${now}-${Math.random().toString(36).slice(2, 8)}`;
      const projectId = activeCoworkProject?.id ?? 'unscoped';
      const projectTitle = activeCoworkProject?.name ?? 'Unscoped';

      setCoworkTasks((current) => {
        const next: CoworkProjectTask = {
          id: queuedTaskId,
          projectId,
          projectTitle,
          sessionKey,
          prompt: text,
          status: 'queued',
          summary: 'Task queued for execution.',
          createdAt: now,
          updatedAt: now,
        };
        return [next, ...current].slice(0, 250);
      });
      queueCoworkTask(sessionKey, {
        taskId: queuedTaskId,
        status: 'queued',
      });

      setTaskState('planned');
      setCoworkAwaitingStream(true);
      const outboundMessageId = `cowork-user-${Date.now()}`;
      setCoworkMessages((current) => {
        const next = [...current, { id: outboundMessageId, role: 'user' as const, text }];
        coworkMessageCache.current.set(sessionKey, next);
        return next;
      });
      upsertCoworkThread(sessionKey, {
        title: text,
        touchedAt: Date.now(),
      });

      if (coworkModel.trim()) {
        await client.setSessionModel(sessionKey, coworkModel.trim());
      }

      const folderContext = workingFolderRef.current;
      const selectedKindByPath = new Map(
        coworkProjectPathReferences.map((entry) => [entry.path, entry.kind] as const),
      );
      const referencedProjectPaths = Array.from(new Set(extractProjectFileMentions(text))).slice(0, 8);
      let referencedProjectFilesContext = '';
      if (referencedProjectPaths.length > 0 && folderContext) {
        const snippets: string[] = [];
        const MAX_FILE_CHARS = 8_000;
        const MAX_FOLDER_LIST_ITEMS = 40;

        for (const rawPath of referencedProjectPaths) {
          const mentionsDirectory = /\/+$/.test(rawPath) || selectedKindByPath.get(rawPath) === 'directory';
          const relPath = rawPath.replace(/\/+$/, '').trim();
          if (!relPath) {
            continue;
          }

          const validated = validateProjectRelativePath(relPath);
          if (!validated.ok) {
            snippets.push(`- ${relPath}: skipped (${validated.reason})`);
            continue;
          }

          if (mentionsDirectory && bridge?.listDirInFolder) {
            try {
              const listing = await bridge.listDirInFolder(folderContext, relPath);
              const listed = listing.items
                .slice(0, MAX_FOLDER_LIST_ITEMS)
                .map((item) => `- ${item.kind === 'directory' ? '[dir]' : '[file]'} ${item.path}`)
                .join('\n');
              const truncated = listing.items.length > MAX_FOLDER_LIST_ITEMS ? '\n- ...truncated...' : '';
              snippets.push(`### ${relPath}/\n${listed || '- (empty)'}${truncated}`);
            } catch (error) {
              const message = error instanceof Error ? error.message : 'Failed to list folder';
              snippets.push(`- ${relPath}/: list failed (${message})`);
            }
            continue;
          }

          if (!bridge?.readFileInFolder) {
            snippets.push(`- ${relPath}: read unavailable in this mode`);
            continue;
          }

          try {
            const fileResult = await bridge.readFileInFolder(folderContext, relPath);
            const fullContent = fileResult.content ?? '';
            const snippet = fullContent.slice(0, MAX_FILE_CHARS);
            const truncated = fullContent.length > MAX_FILE_CHARS ? '\n[...truncated...]' : '';
            snippets.push(`### ${relPath}\n\`\`\`\n${snippet}${truncated}\n\`\`\``);
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to read file';
            snippets.push(`- ${relPath}: read failed (${message})`);
          }
        }

        if (snippets.length > 0) {
          referencedProjectFilesContext = `Referenced project files:\n${snippets.join('\n\n')}`;
        }
      }

      setCoworkTaskStatus(queuedTaskId, 'running', {
        summary: 'Sending task to cowork.',
      });

      enqueueCoworkRunContext(sessionKey, {
        projectId: activeCoworkProject?.id ?? '',
        projectTitle: activeCoworkProject?.name ?? '',
        rootFolder: folderContext,
        startedAt: Date.now(),
      });
      const relayFileInstruction = buildEngineActionInstruction(client.providerId);
      const projectKnowledgeContext = activeCoworkProject
        ? projectKnowledgeItems
            .filter((item) => item.projectId === activeCoworkProject.id)
            .slice(0, 8)
            .map((item) => `- ${item.title}: ${item.content}`)
            .join('\n')
        : '';
      const webSearchInstruction = coworkWebSearchEnabled
        ? [
            'Web search mode is enabled.',
            'For requests requiring up-to-date or external information, use web tools and provide citations.',
            'Always include a Sources section with markdown links for any factual claims from external sources.',
          ].join('\n')
        : '';
      const coworkMemoryContext = preferences.injectMemory
        ? buildMemoryContext(loadMemoryEntries(), preferences.systemPrompt)
        : preferences.systemPrompt.trim();
      const outboundMessage = [
        coworkMemoryContext,
        activeCoworkProject ? `Project context: ${activeCoworkProject.name}` : '',
        projectKnowledgeContext ? `Project knowledge:\n${projectKnowledgeContext}` : '',
        folderContext ? `Working folder context: ${folderContext}` : '',
        referencedProjectFilesContext,
        webSearchInstruction,
        relayFileInstruction,
        '',
        text,
      ]
        .filter((part) => part.length > 0)
        .join('\n\n');

      const waitingState = resolveCoworkWaitingForStreamState();
      setCoworkRunPhase(waitingState.runPhase);
      setCoworkRunStatus(waitingState.runStatus);
      setCoworkProgressStage('decomposition', {
        details: waitingState.progressDetails ?? 'Splitting work into substeps and selecting tools.',
      });
      setStatus(waitingState.statusMessage);
      await client.sendChat(sessionKey, outboundMessage);
      await new Promise((resolve) => setTimeout(resolve, COWORK_SEND_SPINNER_MS));
    } catch (error) {
      setCoworkAwaitingStream(false);
      setCoworkRunPhase('error');
      const message = error instanceof Error ? error.message : buildCoworkSendFailureStatus();
      setCoworkRunStatus(message);
      setCoworkProgressStage('planning', {
        blocked: true,
        details: message,
      });
      setStatus(message);
      // Restore the prompt for quick retry when send/setup fails,
      // but do not overwrite a newer prompt the user already started typing.
      setCoworkDraftPrompt((current) => (current.trim() ? current : text));
    } finally {
      setCoworkSending(false);
    }
  };

  const handleCreateLocalPlan = async () => {
    if (!bridge?.planOrganizeFolder) {
      setStatus(buildLocalFileOrganizerUnavailableStatus());
      return;
    }

    const rootPath = workingFolder.trim();
    if (!rootPath) {
      setStatus(buildWorkingFolderRequiredStatus());
      return;
    }

    setLocalPlanLoading(true);
    try {
      const plan = await bridge.planOrganizeFolder(rootPath);
      setLocalPlanActions(plan.actions);
      setLocalPlanRootPath(plan.rootPath);
      setStatus(buildLocalPlanReadyStatus(plan.actions.length, plan.rootPath));
    } catch (error) {
      const message = error instanceof Error ? error.message : buildLocalPlanCreationFailureStatus();
      setStatus(message);
      setLocalPlanActions([]);
      setLocalPlanRootPath('');
    } finally {
      setLocalPlanLoading(false);
    }
  };

  const handlePickWorkingFolder = async (): Promise<string | undefined> => {
    if (!bridge?.selectFolder) {
      const input = document.createElement('input');
      input.type = 'file';
      input.setAttribute('webkitdirectory', '');
      input.setAttribute('directory', '');

      const selected = await new Promise<string>((resolve) => {
        input.onchange = () => {
          resolve(input.files?.[0]?.webkitRelativePath?.split('/')?.[0] ?? '');
        };
        input.click();
      });

      if (!selected) {
        setStatus(buildNoFolderSelectedStatus());
        return undefined;
      }

      setWorkingFolder(selected);
      setStatus(buildBrowserSandboxFolderSelectedStatus(selected));
      return selected;
    }

    try {
      const selected = await bridge.selectFolder(workingFolder);
      if (selected && selected.trim()) {
        setWorkingFolder(selected);
        setStatus(buildWorkingFolderSelectedStatus(selected));
        return selected;
      }
      return undefined;
    } catch (error) {
      const message = error instanceof Error ? error.message : buildFolderPickerFailureStatus();
      setStatus(message);
      return undefined;
    }
  };

  const handleOpenCoworkArtifact = async (artifact: CoworkArtifact) => {
    if (!bridge?.openPath) {
      setStatus(buildArtifactOpenBridgeUnavailableStatus());
      return;
    }

    try {
      const result = await bridge.openPath(artifact.path);
      if (!result.ok) {
        throw new Error(result.error || 'Unable to open artifact path.');
      }

      setStatus(buildArtifactOpenedStatus(artifact.path));
    } catch (error) {
      const message = error instanceof Error ? error.message : buildArtifactOpenFailureStatus();
      setStatus(message);
    }
  };

  const handleSaveCoworkRunAsSkill = async () => {
    if (!bridge?.createFileInFolder) {
      setStatus(buildSaveSkillBridgeUnavailableStatus());
      return;
    }

    const rootPath = workingFolder.trim();
    if (!rootPath) {
      setStatus(buildWorkingFolderRequiredStatus());
      return;
    }

    const latestUserPrompt = [...coworkMessages].reverse().find((message) => message.role === 'user')?.text?.trim() || coworkDraftPrompt.trim();
    if (!latestUserPrompt) {
      setStatus(buildMissingCoworkPromptForSkillStatus());
      return;
    }

    const latestAssistantOutput = [...coworkMessages].reverse().find((message) => message.role === 'assistant')?.text?.trim() || '';
    const timestamp = new Date();
    const safeStamp = `${timestamp.getFullYear()}${String(timestamp.getMonth() + 1).padStart(2, '0')}${String(timestamp.getDate()).padStart(2, '0')}-${String(timestamp.getHours()).padStart(2, '0')}${String(timestamp.getMinutes()).padStart(2, '0')}${String(timestamp.getSeconds()).padStart(2, '0')}`;
    const relativePath = `.relay/skills/cowork-skill-${safeStamp}.md`;
    const touched = filesTouched.map((item) => `- ${item.path}`).join('\n');

    const skillDoc = [
      '# Cowork Skill Draft',
      '',
      `- Created: ${timestamp.toISOString()}`,
      `- Session: ${coworkSessionKey || '(none)'}`,
      '',
      '## Intent',
      latestUserPrompt,
      '',
      '## Files Touched',
      touched || '- (none)',
      '',
      '## Latest Assistant Output',
      latestAssistantOutput || '(none)',
    ].join('\n');

    try {
      const result = await bridge.createFileInFolder(rootPath, relativePath, skillDoc, false);
      setCoworkArtifacts((current) => [
        {
          id: `skill-${Date.now()}`,
          label: result.filePath.split(/[\\/]/).pop() || result.filePath,
          path: result.filePath,
          kind: 'summary' as const,
          status: 'ok' as const,
          updatedAt: Date.now(),
        },
        ...current,
      ].slice(0, 40));
      setStatus(buildSavedSkillDraftStatus(result.filePath));
    } catch (error) {
      const message = error instanceof Error ? error.message : buildSaveSkillFailureStatus();
      setStatus(message);
    }
  };

  const handleScheduleCoworkRun = () => {
    const latestUserPrompt = [...coworkMessages].reverse().find((message) => message.role === 'user')?.text?.trim() || coworkDraftPrompt.trim();
    if (!latestUserPrompt) {
      setStatus('No cowork prompt available to schedule.');
      return;
    }
    void createEngineCoworkScheduleWithStatus({
      providerId: draftEngineProviderId,
      bridge,
      prompt: latestUserPrompt,
      activeProject: activeCoworkProject,
      rootPath: workingFolderRef.current,
      model: coworkModel,
    })
      .then((result) => {
        if (result.shouldOpenScheduledPage) {
          setActivePage('scheduled');
        }
        setStatus(result.message);
        if (result.shouldReloadScheduledJobs) {
          void loadScheduledJobs();
        }
      });
  };

  const handleUpdateInternalPromptSchedule = async (scheduleId: string, payload: {
    enabled?: boolean;
    intervalMinutes?: number;
  }) => {
    const result = await updateEngineScheduleWithStatus({
      bridge,
      scheduleId,
      payload,
    });
    if (result.shouldReloadScheduledJobs) {
      await loadScheduledJobs();
    }
    setStatus(result.message);
  };

  const handleDeleteInternalPromptSchedule = async (scheduleId: string) => {
    const result = await deleteEngineScheduleWithStatus({
      bridge,
      scheduleId,
    });
    if (result.shouldReloadScheduledJobs) {
      await loadScheduledJobs();
    }
    setStatus(result.message);
  };

  const handlePickWorkingFolderForProject = async (): Promise<string | undefined> => {
    const selected = await handlePickWorkingFolder();
    return selected?.trim() ? selected.trim() : undefined;
  };

  const handleApplyLocalPlan = async () => {
    if (!bridge?.applyOrganizeFolderPlan) {
      setStatus(buildLocalFileOrganizerUnavailableStatus());
      return;
    }

    if (!localPlanRootPath || localPlanActions.length === 0) {
      setStatus(buildLocalPlanApplyPreconditionStatus());
      return;
    }

    setLocalApplyLoading(true);
    try {
      const result = await bridge.applyOrganizeFolderPlan(localPlanRootPath, localPlanActions);
      setStatus(buildLocalPlanAppliedStatus(result.applied, result.skipped, result.errors.length > 0));
      setLocalPlanActions([]);
    } catch (error) {
      const message = error instanceof Error ? error.message : buildLocalPlanApplyFailureStatus();
      setStatus(message);
    } finally {
      setLocalApplyLoading(false);
    }
  };

  const handleWorkingFolderChange = (value: string) => {
    setWorkingFolder(value);
    const normalized = value.trim();
    workingFolderRef.current = normalized;

    if (!activeCoworkProjectId || !normalized) {
      return;
    }

    setCoworkProjects((current) =>
      current.map((project) =>
        project.id === activeCoworkProjectId
          ? {
              ...project,
              workspaceFolder: normalized,
              updatedAt: Date.now(),
            }
          : project,
      ),
    );
  };

  const handleSelectCoworkProject = (projectId: string) => {
    const normalizedProjectId = projectId.trim();
    setActiveCoworkProjectId(normalizedProjectId);

    if (!normalizedProjectId) {
      return;
    }

    const selected = coworkProjects.find((project) => project.id === normalizedProjectId);
    if (!selected) {
      return;
    }

    if (selected.workspaceFolder.trim()) {
      setWorkingFolder(selected.workspaceFolder);
      workingFolderRef.current = selected.workspaceFolder.trim();
    }
    setStatus(buildProjectSelectedStatus(selected.name));
  };

  const handleCreateCoworkProject = (name: string, workspaceFolder: string, description?: string, instructions?: string) => {
    const normalizedName = name.trim();
    const normalizedFolder = workspaceFolder.trim();
    const normalizedDescription = description?.trim() ?? '';
    const normalizedInstructions = instructions?.trim() ?? '';
    if (!normalizedName || !normalizedFolder) {
      setStatus(buildProjectNameAndWorkspaceRequiredStatus());
      return;
    }

    const projectId =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `project-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const now = Date.now();
    const nextProject: CoworkProject = {
      id: projectId,
      name: normalizedName,
      description: normalizedDescription || undefined,
      instructions: normalizedInstructions || undefined,
      workspaceFolder: normalizedFolder,
      createdAt: now,
      updatedAt: now,
    };

    setCoworkProjects((current) => [nextProject, ...current]);
    setActiveCoworkProjectId(projectId);
    setWorkingFolder(normalizedFolder);
    workingFolderRef.current = normalizedFolder;
    setStatus(buildProjectCreatedStatus(normalizedName));
  };

  const handleRenameCoworkProject = (projectId: string, name: string, description?: string, instructions?: string) => {
    const normalizedProjectId = projectId.trim();
    const normalizedName = name.trim();
    const normalizedDescription = description?.trim() ?? '';
    const normalizedInstructions = instructions?.trim() ?? '';
    if (!normalizedProjectId || !normalizedName) {
      setStatus(buildProjectNameRequiredStatus());
      return;
    }

    let renamedProjectName = '';
    setCoworkProjects((current) =>
      current.map((project) => {
        if (project.id !== normalizedProjectId) {
          return project;
        }

        renamedProjectName = normalizedName;
        return {
          ...project,
          name: normalizedName,
          description: normalizedDescription || undefined,
          instructions: normalizedInstructions || undefined,
          updatedAt: Date.now(),
        };
      }),
    );

    if (renamedProjectName) {
      setStatus(buildProjectUpdatedStatus(renamedProjectName));
    }
  };

  const handleUpdateCoworkProject = (projectId: string, name: string, workspaceFolder: string, description?: string, instructions?: string) => {
    const normalizedProjectId = projectId.trim();
    const normalizedName = name.trim();
    const normalizedFolder = workspaceFolder.trim();
    const normalizedDescription = description?.trim() ?? '';
    const normalizedInstructions = instructions?.trim() ?? '';
    if (!normalizedProjectId || !normalizedName || !normalizedFolder) {
      setStatus(buildProjectNameAndWorkspaceRequiredStatus());
      return;
    }

    let updatedProjectName = '';
    let updatedProjectFolder = '';
    setCoworkProjects((current) =>
      current.map((project) => {
        if (project.id !== normalizedProjectId) {
          return project;
        }

        updatedProjectName = normalizedName;
        updatedProjectFolder = normalizedFolder;
        return {
          ...project,
          name: normalizedName,
          description: normalizedDescription || undefined,
          instructions: normalizedInstructions || undefined,
          workspaceFolder: normalizedFolder,
          updatedAt: Date.now(),
        };
      }),
    );

    if (normalizedProjectId === activeCoworkProjectId && updatedProjectFolder) {
      setWorkingFolder(updatedProjectFolder);
      workingFolderRef.current = updatedProjectFolder;
    }

    if (updatedProjectName) {
      setStatus(buildProjectUpdatedStatus(updatedProjectName));
    }
  };

  const handleAddProjectKnowledge = (projectId: string, title: string, content: string) => {
    const normalizedProjectId = projectId.trim();
    const normalizedTitle = title.trim();
    const normalizedContent = content.trim();
    if (!normalizedProjectId || !normalizedTitle || !normalizedContent) {
      setStatus(buildKnowledgeTitleAndContentRequiredStatus());
      return;
    }

    const now = Date.now();
    const id =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `knowledge-${now}-${Math.random().toString(16).slice(2)}`;

    setProjectKnowledgeItems((current) => [
      {
        id,
        projectId: normalizedProjectId,
        title: normalizedTitle,
        content: normalizedContent,
        createdAt: now,
        updatedAt: now,
      },
      ...current,
    ].slice(0, 500));
    setStatus(buildKnowledgeSavedStatus(normalizedTitle));
  };

  const handleDeleteProjectKnowledge = (knowledgeId: string) => {
    const normalizedId = knowledgeId.trim();
    if (!normalizedId) {
      return;
    }
    setProjectKnowledgeItems((current) => current.filter((item) => item.id !== normalizedId));
    setStatus(buildKnowledgeDeletedStatus());
  };

  const handleDeleteCoworkProject = (projectId: string) => {
    const normalizedProjectId = projectId.trim();
    if (!normalizedProjectId) {
      return;
    }

    let deletedProjectName = '';
    setCoworkProjects((current) => {
      const target = current.find((project) => project.id === normalizedProjectId);
      if (target) {
        deletedProjectName = target.name;
      }
      return current.filter((project) => project.id !== normalizedProjectId);
    });
    setProjectKnowledgeItems((current) => current.filter((item) => item.projectId !== normalizedProjectId));

    if (activeCoworkProjectId === normalizedProjectId) {
      setActiveCoworkProjectId('');
    }

    setStatus(buildProjectDeletedStatus(deletedProjectName || undefined));
  };

  const handleCreateFileInWorkingFolder = async () => {
    if (!bridge?.createFileInFolder) {
      setStatus(buildCreateFileBridgeUnavailableStatus());
      return;
    }

    const rootPath = workingFolder.trim();
    const relativePath = localFileDraftPath.trim();
    if (!rootPath) {
      setStatus(buildWorkingFolderRequiredStatus());
      return;
    }

    if (!relativePath) {
      setStatus(buildRelativeFilePathRequiredStatus());
      return;
    }

    setLocalFileCreateLoading(true);
    try {
      const result = await bridge.createFileInFolder(rootPath, relativePath, localFileDraftContent);
      setStatus(buildCreatedFileStatus(result.filePath));
    } catch (error) {
      const message = error instanceof Error ? error.message : buildCreateFileFailureStatus();
      setStatus(message);
    } finally {
      setLocalFileCreateLoading(false);
    }
  };

  const handleRunLocalActionSmokeTest = async () => {
    if (!bridge) {
      setStatus(buildLocalActionSmokeUnavailableStatus());
      return;
    }

    const rootPath = workingFolder.trim();
    if (!rootPath) {
      setStatus(buildWorkingFolderRequiredStatus());
      return;
    }

    const relativePath = 'relay-smoke-test.md';
    setLocalActionSmokeRunning(true);

    const receipts: LocalActionReceipt[] = [];
    const errors: string[] = [];

    try {
      if (bridge.createFileInFolder) {
        await bridge.createFileInFolder(rootPath, relativePath, '# Relay Smoke Test\n', true);
        receipts.push({ id: 'smoke-create', type: 'create_file', path: relativePath, status: 'ok' });
      }

      if (bridge.appendFileInFolder) {
        await bridge.appendFileInFolder(rootPath, relativePath, '\nAppended line from smoke test.\n');
        receipts.push({ id: 'smoke-append', type: 'append_file', path: relativePath, status: 'ok' });
      }

      if (bridge.readFileInFolder) {
        const readResult = await bridge.readFileInFolder(rootPath, relativePath);
        receipts.push({
          id: 'smoke-read',
          type: 'read_file',
          path: readResult.filePath,
          status: 'ok',
          message: `Read ${readResult.content.length} chars`,
        });
      }

      if (bridge.existsInFolder) {
        const exists = await bridge.existsInFolder(rootPath, relativePath);
        receipts.push({
          id: 'smoke-exists',
          type: 'exists',
          path: exists.path,
          status: exists.exists ? 'ok' : 'error',
          errorCode: exists.exists ? undefined : 'NOT_FOUND',
          message: exists.exists ? exists.kind : 'none',
        });
      }

      if (bridge.listDirInFolder) {
        const listing = await bridge.listDirInFolder(rootPath, '');
        receipts.push({
          id: 'smoke-list',
          type: 'list_dir',
          path: '.',
          status: 'ok',
          message: `Listed ${listing.items.length} item${listing.items.length === 1 ? '' : 's'}`,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown smoke test failure.';
      errors.push(message);
      receipts.push({
        id: 'smoke-error',
        type: 'exists',
        path: relativePath,
        status: 'error',
        errorCode: 'SMOKE_FAILED',
        message,
      });
    } finally {
      pushLocalActionReceipts(receipts);
      if (errors.length > 0) {
        setStatus(buildLocalActionSmokeFailedStatus(errors[0]));
      } else {
        setStatus(buildLocalActionSmokePassedStatus(rootPath, relativePath));
      }
      setLocalActionSmokeRunning(false);
    }
  };

  const handleSendChat = async (event: FormEvent) => {
    event.preventDefault();
    if (!engineConnected) {
      setStatus('Runtime disconnected. Connect in Settings > Engine to send chat messages.');
      setAwaitingChatStream(false);
      setSendingChat(false);
      return;
    }

    const text = chatDraftPrompt.trim();
    if (!text) {
      setStatus('Type a message before sending.');
      return;
    }

    const client = engineClientRef.current;
    if (!client) {
      setStatus(buildRuntimeClientUnavailableStatus());
      return;
    }

    setSendingChat(true);
    setAwaitingChatStream(false);
    handleChatPromptChange('');

    try {
      const shouldCreateFreshSession = chatMessages.length === 0;

      let sessionKey = '';
      if (shouldCreateFreshSession) {
        await ensureConnectedClient(client);
        sessionKey = normalizeSessionKey(await client.createChatSession());
        if (!sessionKey) {
          throw new Error(buildMissingCreatedSessionKeyError());
        }
        // Avoid loading history immediately after creating a fresh session,
        // which can race and overwrite the optimistic first user message.
        skipNextChatEffectLoadRef.current = true;
        commitActiveSessionKey(sessionKey);
      } else {
        sessionKey = await ensureActiveChatSession(client, { createIfMissing: true });
      }

      setChatMessages((current) => {
        const next = [...current, { id: `local-${Date.now()}`, role: 'user' as const, text }];
        threadMessageCache.current.set(sessionKey, next);
        return next;
      });

      upsertChatThread(sessionKey, {
        title: text,
        touchedAt: Date.now(),
      });

      const rawOutbound = buildOutboundChatPrompt(text, chatMessages);
      const chatMemoryContext = preferences.injectMemory
        ? buildMemoryContext(loadMemoryEntries(), preferences.systemPrompt)
        : preferences.systemPrompt.trim();
      const outboundMessage = chatMemoryContext
        ? `${chatMemoryContext}\n\n${rawOutbound}`
        : rawOutbound;
      setAwaitingChatStream(true);
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
          const sent = await client.sendChat(sessionKey, outboundMessage);
          sessionKey = sent.sessionKey;
          break;
        } catch (error) {
          const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
          const isMissing = message.includes('no session found') || message.includes('no sendable session found');
          if (!isMissing || attempt === 3) {
            throw error;
          }
          setStatus(`Send retry ${attempt}/3: session=${sessionKey} failed (${message}). Resolving session...`);
          sessionKey = await getOrResolveSession(client);
        }
      }

      commitActiveSessionKey(sessionKey);
      setStatus(buildEngineChatDispatchStatus(draftEngineProviderId, sessionKey));
    } catch (error) {
      setAwaitingChatStream(false);
      const message = error instanceof Error ? error.message : 'Failed to send chat message.';
      setStatus(message);
    } finally {
      setSendingChat(false);
    }
  };

  const handleModelChange = async (nextModelValue: string) => {
    const previousModel = selectedModel;
    setSelectedModel(nextModelValue);

    const client = engineClientRef.current;
    if (!client) {
      setStatus(buildRuntimeClientUnavailableStatus());
      setSelectedModel(previousModel);
      return;
    }

    setChangingModel(true);
    try {
      const sessionKey = await ensureActiveChatSession(client, { createIfMissing: true });
      await client.setSessionModel(sessionKey, nextModelValue || null);
      setStatus(
        nextModelValue
          ? buildSessionModelUpdatedStatus({ scope: 'chat', sessionKey, modelValue: nextModelValue })
          : buildSessionModelResetStatus({ scope: 'chat', sessionKey }),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : buildSessionOperationFailureStatus('update_model', 'chat');
      setStatus(message);
      setSelectedModel(previousModel);
    } finally {
      setChangingModel(false);
    }
  };

  const handleCoworkModelChange = async (nextModelValue: string) => {
    const previousModel = coworkModel;
    setCoworkModel(nextModelValue);

    const client = engineClientRef.current;
    if (!client) {
      setStatus(buildRuntimeClientUnavailableStatus());
      setCoworkModel(previousModel);
      return;
    }

    const sessionKey = normalizeSessionKey(coworkSessionKeyRef.current);
    if (!sessionKey) {
      setStatus(buildPendingCoworkModelSelectionStatus(nextModelValue));
      return;
    }

    setChangingCoworkModel(true);
    try {
      await ensureConnectedClient(client);
      await client.setSessionModel(sessionKey, nextModelValue || null);
      setStatus(
        nextModelValue
          ? buildSessionModelUpdatedStatus({ scope: 'cowork', sessionKey, modelValue: nextModelValue })
          : buildSessionModelResetStatus({ scope: 'cowork', sessionKey }),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : buildSessionOperationFailureStatus('update_model', 'cowork');
      setStatus(message);
      setCoworkModel(previousModel);
    } finally {
      setChangingCoworkModel(false);
    }
  };

  const handleStartNewChat = async () => {
    const client = engineClientRef.current;
    if (!client) {
      setStatus(buildRuntimeClientUnavailableStatus());
      return;
    }

    // Save current chat messages before switching
    const currentKey = activeSessionKeyRef.current;
    if (currentKey) {
      const currentMessages = chatMessages;
      if (currentMessages.length > 0) {
        threadMessageCache.current.set(currentKey, currentMessages);
      }
    }

    setChatMessages([]);
    setAwaitingChatStream(false);
    handleChatPromptChange('');

    try {
      await ensureConnectedClient(client);
      const sessionKey = normalizeSessionKey(await client.createChatSession());
      if (!sessionKey) {
        throw new Error(buildMissingCreatedSessionKeyError());
      }
      commitActiveSessionKey(sessionKey);
      setActivePage('chat');
      setStatus(buildStartedNewChatStatus(sessionKey));
      void loadModelsForSession(client, sessionKey);

    } catch (error) {
      const message = error instanceof Error ? error.message : buildSessionOperationFailureStatus('create_chat');
      setStatus(message);
    }
  };

  const handleOpenRecentChat = (sessionKey: string) => {
    const normalized = sessionKey.trim();
    if (!normalized) {
      return;
    }

    // Save current chat messages before switching
    const currentKey = activeSessionKeyRef.current;
    if (currentKey) {
      setChatMessages((current) => {
        if (current.length > 0) {
          threadMessageCache.current.set(currentKey, current);
        }
        return current;
      });
    }

    setActivePage('chat');
    commitActiveSessionKey(normalized);
    handleChatPromptChange('');
    setAwaitingChatStream(false);

    // Restore from local cache first
    const cached = threadMessageCache.current.get(normalized);
    if (cached && cached.length > 0) {
      setChatMessages(cached);
      const titleFromCache = deriveThreadTitleFromMessages(cached);
      setStatus(buildOpenedRecentSessionStatus('chat', titleFromCache || undefined));
      skipNextChatEffectLoadRef.current = true;
      return;
    }

    // Fall back to runtime history
    setChatMessages([]);
    setAwaitingChatStream(false);
    setStatus(buildLoadingRecentSessionStatus('chat'));
    skipNextChatEffectLoadRef.current = true;
    void loadChatSession(normalized, 'Opened chat');
  };

  const handleOpenRecentCowork = (sessionKey: string) => {
    const normalized = sessionKey.trim();
    if (!normalized) {
      return;
    }

    setActivePage('cowork');
    commitCoworkSessionKey(normalized);
    handleCoworkPromptChange('');
    setCoworkAwaitingStream(false);
    setCoworkRunPhase('idle');
    setCoworkRunStatus('Opened previous cowork session.');

    const cached = coworkMessageCache.current.get(normalized);
    if (cached && cached.length > 0) {
      setCoworkMessages(cached);
      const titleFromCache = deriveThreadTitleFromMessages(cached);
      setStatus(buildOpenedRecentSessionStatus('cowork', titleFromCache || undefined));
      return;
    }

    setCoworkMessages([]);
    setStatus(buildLoadingRecentSessionStatus('cowork'));
    void loadCoworkSession(normalized, 'Opened task');
  };

  const handleRenameRecentItem = (item: RecentWorkspaceEntry) => {
    setRecentRenameTarget(item);
    setRecentRenameValue(item.label);
  };

  const handleConfirmRenameRecentItem = async () => {
    if (!recentRenameTarget) {
      return;
    }

    const currentLabel = recentRenameTarget.label.trim();
    const nextTitle = toRecentSidebarLabel(recentRenameValue);
    if (!nextTitle) {
      setStatus(buildRecentTitleEmptyStatus());
      return;
    }

    if (nextTitle === currentLabel) {
      setRecentRenameTarget(null);
      setRecentRenameValue('');
      return;
    }

    const client = engineClientRef.current;
    setRecentActionBusy(true);
    try {
      if (client) {
        try {
          await ensureConnectedClient(client);
          await client.setSessionTitle(recentRenameTarget.sessionKey, nextTitle);
        } catch {
          setStatus(buildSessionOperationFailureStatus('sync_title'));
        }
      }

      renameThread(recentRenameTarget.sessionKey, nextTitle, recentRenameTarget.kind);
      setStatus(buildRenamedRecentSessionStatus(recentRenameTarget.kind));
      setRecentRenameTarget(null);
      setRecentRenameValue('');
    } finally {
      setRecentActionBusy(false);
    }
  };

  const handleDeleteRecentItem = (item: RecentWorkspaceEntry) => {
    setRecentDeleteTarget(item);
  };

  const handleConfirmDeleteRecentItem = async () => {
    if (!recentDeleteTarget) {
      return;
    }

    const client = engineClientRef.current;
    if (!client) {
      setStatus(buildRuntimeClientUnavailableStatus());
      return;
    }

    setRecentActionBusy(true);
    try {
      await ensureConnectedClient(client);
      await client.deleteSession(recentDeleteTarget.sessionKey);
      removeThread(recentDeleteTarget.sessionKey, recentDeleteTarget.kind);
      setStatus(buildDeletedRecentSessionStatus(recentDeleteTarget.kind));
      setRecentDeleteTarget(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : buildSessionOperationFailureStatus('delete');
      setStatus(message);
    } finally {
      setRecentActionBusy(false);
    }
  };

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
      if (result.errorMessage) {
        setStatus(result.errorMessage);
      }
    } finally {
      setScheduledLoading(false);
    }
  }, [configReady, draftEngineProviderId, getCurrentEngineDraft]);

  useEffect(() => {
    if (activePage !== 'cowork' && activePage !== 'scheduled') {
      return;
    }

    void loadScheduledJobs();
    const client = engineClientRef.current;
    if (client && activePage === 'cowork' && configReady) {
      const sessionKey = normalizeSessionKey(coworkSessionKeyRef.current);
      if (client.isConnected()) {
        void loadCoworkModels(client, sessionKey || undefined);
      } else {
        void ensureConnectedClient(client)
          .then(() => loadCoworkModels(client, sessionKey || undefined))
          .catch(() => {
            setCoworkModels([]);
          });
      }
    }
  }, [activePage, configReady, engineConnected, loadScheduledJobs]);

  useEffect(() => {
    if (!shouldRestoreInternalApprovalRecovery(draftEngineProviderId) || !engineConnected) {
      return;
    }
    void restoreInternalApprovalRecoveryFlows();
    const intervalId = window.setInterval(() => {
      void restoreInternalApprovalRecoveryFlows();
    }, 5000);
    return () => {
      window.clearInterval(intervalId);
    };
  }, [draftEngineProviderId, engineConnected]);

  useEffect(() => {
    setActiveMenuItem('');
  }, [activePage]);

  const handleMinimize = async () => {
    if (!bridge?.minimizeWindow) {
      setStatus(buildWindowControlsUnavailableStatus());
      return;
    }

    try {
      await bridge.minimizeWindow();
    } catch {
      setStatus(buildWindowMinimizeFailureStatus());
    }
  };

  const handleToggleMaximize = async () => {
    if (!bridge?.toggleMaximizeWindow) {
      setStatus(buildWindowControlsUnavailableStatus());
      return;
    }

    try {
      const nextState = await bridge.toggleMaximizeWindow();
      setIsMaximized(nextState);
    } catch {
      setStatus(buildWindowResizeFailureStatus());
    }
  };

  const handleClose = async () => {
    if (bridge?.closeWindow) {
      try {
        await bridge.closeWindow();
        return;
      } catch {
        setStatus(buildWindowCloseFailureStatus());
      }
    }

    window.close();
  };

  const handleShowSystemMenu = async (x: number, y: number) => {
    if (!bridge?.showSystemMenu) {
      return;
    }

    try {
      await bridge.showSystemMenu(x, y);
    } catch {
      setStatus(buildWindowSystemMenuFailureStatus());
    }
  };

  const handleCompleteOnboarding = () => {
    completeOnboarding();
    setActivePage('chat');
  };

  const handleStartNewTask = () => {
    setActivePage('cowork');
    handleCoworkPromptChange('');
    setTaskState('idle');
    commitCoworkSessionKey('');
    setCoworkMessages([]);
    setCoworkAwaitingStream(false);
    setCoworkStreamingText('');
    const resetState = resolveCoworkResetState();
    setCoworkRunPhase(resetState.runPhase);
    setCoworkRunStatus(resetState.runStatus);
    setLocalPlanActions([]);
    setLocalPlanRootPath('');
    setPendingApprovals([]);
    setStatus(resetState.statusMessage);
    setCoworkResetKey((current) => current + 1);
  };

  const handleRerunLastCoworkTask = () => {
    if (!latestVisibleCoworkTaskPrompt) {
      setStatus(buildMissingPreviousCoworkPromptStatus());
      return;
    }
    setActivePage('cowork');
    handleCoworkPromptChange(latestVisibleCoworkTaskPrompt);
    setStatus(buildLoadedPreviousCoworkPromptStatus());
  };

  const pageLoadingFallback = (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
      Loading page...
    </div>
  );
  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const allThreadsForSearch = [
    ...chatThreads.map((t) => ({ ...t, label: t.title, kind: 'chat' as const })),
    ...coworkThreads.map((t) => ({ ...t, label: t.title, kind: 'cowork' as const })),
  ];
  const searchCandidates = (normalizedSearchQuery ? allThreadsForSearch : recentItems).map((item) => ({
    id: item.id,
    sessionKey: item.sessionKey,
    label: ('title' in item ? item.title : item.label) as string,
    updatedAt: ('updatedAt' in item ? item.updatedAt : undefined) as number | undefined,
    kind: ('kind' in item ? item.kind : 'chat') as 'chat' | 'cowork',
  }));
  const matchingChats = normalizedSearchQuery
    ? searchCandidates.filter((thread) => thread.label.toLowerCase().includes(normalizedSearchQuery))
    : searchCandidates;

  const handleSearchOpenChange = (nextOpen: boolean) => {
    setSearchOpen(nextOpen);
    if (nextOpen) {
      setSearchQuery('');
      setActiveMenuItem('Search');
      return;
    }
    setActiveMenuItem('');
  };

  const handleExportChat = useCallback(() => {
    if (chatMessages.length === 0) return;
    const lines = chatMessages.map((m) => {
      const speaker = m.role === 'user' ? 'You' : m.role === 'system' ? 'System' : 'Assistant';
      return `## ${speaker}\n\n${m.text}`;
    });
    const markdown = `# Chat Export ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¾ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ${new Date().toLocaleDateString()}\n\n${lines.join('\n\n---\n\n')}\n`;
    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cloffice-chat-${activeSessionKey || 'export'}-${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }, [chatMessages, activeSessionKey]);

  return (
    <div className="grid h-full grid-rows-[44px_minmax(0,1fr)] overflow-hidden">
      <AppTitlebar
        sidebarOpen={sidebarOpen}
        activePage={activePage}
        coworkRightPanelOpen={coworkRightPanelOpen}
        isMaximized={isMaximized}
        usageModeLabel={usageModeLabel}
        engineConnected={engineConnected}
        coworkRunPhase={coworkRunPhase}
        coworkRunStatus={coworkRunStatus}
        coworkProgressSteps={coworkProgressSteps}
        coworkFilesTouchedCount={filesTouched.length}
        coworkSessionKey={coworkSessionKey}
        onSaveRunAsSkill={handleSaveCoworkRunAsSkill}
        onScheduleRun={handleScheduleCoworkRun}
        minimal={needsOnboarding || !canUseAppShell}
        onToggleSidebar={() => setSidebarOpen((current) => !current)}
        onToggleCoworkRightPanel={() => setCoworkRightPanelOpen((current) => !current)}
        onSelectPage={setActivePage}
        onMinimize={handleMinimize}
        onToggleMaximize={handleToggleMaximize}
        onClose={handleClose}
        onShowSystemMenu={handleShowSystemMenu}
        onOpenEngineSettings={() => {
          setActivePage('settings');
          setSettingsSection('Gateway');
        }}
      />

      {needsOnboarding ? (
        <OnboardingPage
          draftEngineProviderId={draftEngineProviderId}
          draftEngineUrl={draftEngineUrl}
          draftEngineToken={draftEngineToken}
          health={health}
          saving={saving}
          pairingRequestId={pairingRequestId}
          onDraftEngineProviderIdChange={setDraftEngineProviderId}
          onDraftEngineUrlChange={setDraftEngineUrl}
          onDraftEngineTokenChange={setDraftEngineToken}
          onSave={handleSave}
          onComplete={handleCompleteOnboarding}
        />
      ) : (
        <SidebarProvider
          className={`grid h-full overflow-hidden transition-[grid-template-columns] duration-200 ${
            sidebarOpen ? 'grid-cols-[280px_minmax(0,1fr)]' : 'grid-cols-[64px_minmax(0,1fr)]'
          }`}
        >
          <AppSidebar
            sidebarOpen={sidebarOpen}
            activeMenuItem={activeMenuItem}
            activePage={activePage}
            activeSessionKey={activeSessionKey}
            activeCoworkSessionKey={coworkSessionKey}
            userEmail={userIdentityLabel}
            guestMode={guestMode}
            language={preferences.language}
            settingsSection={settingsSection}
            recentItems={recentItems}
            coworkProjects={coworkProjects}
            activeCoworkProjectId={activeCoworkProjectId}
            workingFolder={workingFolder}
            scheduledItems={scheduledJobs}
            scheduledLoading={scheduledLoading}
            sessionUsage={sessionUsage}
            onSelectRecentItem={(item) => {
              if (item.kind === 'cowork') {
                handleOpenRecentCowork(item.sessionKey);
                return;
              }
              handleOpenRecentChat(item.sessionKey);
            }}
            onRenameRecentItem={handleRenameRecentItem}
            onDeleteRecentItem={handleDeleteRecentItem}
            onSelectCoworkProject={handleSelectCoworkProject}
            onCreateCoworkProject={handleCreateCoworkProject}
            onRenameCoworkProject={handleRenameCoworkProject}
            onDeleteCoworkProject={handleDeleteCoworkProject}
            onPickWorkingFolder={handlePickWorkingFolderForProject}
            onStartNewChat={handleStartNewChat}
            onStartNewTask={handleStartNewTask}
            onSelectMenuItem={setActiveMenuItem}
            onSelectPage={(page) => setActivePage(page)}
            onOpenSearch={() => handleSearchOpenChange(true)}
            onOpenSettings={() => setActivePage('settings')}
            onSettingsSectionChange={setSettingsSection}
            onLanguageChange={(language) => updatePreferences({ language })}
            onLogout={handleLogout}
          />

          <main className="relative min-h-0 overflow-hidden p-0">
            <Dialog
              open={Boolean(recentRenameTarget)}
              onOpenChange={(nextOpen) => {
                if (!nextOpen && !recentActionBusy) {
                  setRecentRenameTarget(null);
                  setRecentRenameValue('');
                }
              }}
            >
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Rename {recentRenameTarget?.kind === 'cowork' ? 'task' : 'chat'}</DialogTitle>
                  <DialogDescription>
                    Set a custom title for this recent item.
                  </DialogDescription>
                </DialogHeader>
                <Input
                  value={recentRenameValue}
                  onChange={(event) => setRecentRenameValue(event.target.value)}
                  placeholder="Enter title"
                  autoFocus
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      if (!recentActionBusy) {
                        void handleConfirmRenameRecentItem();
                      }
                    }
                  }}
                />
                <DialogFooter>
                  <DialogClose render={<Button variant="outline" disabled={recentActionBusy} />}>Cancel</DialogClose>
                  <Button type="button" onClick={() => void handleConfirmRenameRecentItem()} disabled={recentActionBusy}>
                    Save
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Dialog
              open={Boolean(recentDeleteTarget)}
              onOpenChange={(nextOpen) => {
                if (!nextOpen && !recentActionBusy) {
                  setRecentDeleteTarget(null);
                }
              }}
            >
              <DialogContent>
                <DialogHeader>
                  <DialogTitle className="text-red-600 dark:text-red-400">Delete recent session</DialogTitle>
                  <DialogDescription>
                    Delete {recentDeleteTarget?.kind === 'cowork' ? 'task' : 'chat'} "{recentDeleteTarget?.label}" and all of its messages?
                    This action cannot be undone.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <DialogClose render={<Button variant="outline" disabled={recentActionBusy} />}>Cancel</DialogClose>
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={() => void handleConfirmDeleteRecentItem()}
                    disabled={recentActionBusy}
                  >
                    Delete
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <CommandDialog
              open={searchOpen}
              onOpenChange={handleSearchOpenChange}
              title="Search"
              description="Search chats and projects"
              className="w-[min(980px,94vw)] max-w-none"
            >
              <Command>
                <CommandInput
                  placeholder="Search chats and projects"
                  value={searchQuery}
                  onValueChange={setSearchQuery}
                />
                <CommandList>
                  <CommandEmpty>No results found.</CommandEmpty>
                  <CommandGroup>
                    {matchingChats.map((thread) => (
                      <CommandItem
                        key={thread.id}
                        value={thread.label}
                        onSelect={() => {
                          if (thread.kind === 'cowork') {
                            handleOpenRecentCowork(thread.sessionKey);
                          } else {
                            handleOpenRecentChat(thread.sessionKey);
                          }
                          handleSearchOpenChange(false);
                        }}
                        className="flex items-center justify-between gap-3"
                      >
                        <span className="truncate">{thread.label}</span>
                        {'updatedAt' in thread && typeof thread.updatedAt === 'number' ? (
                          <span className="text-xs text-muted-foreground">
                            {new Date(thread.updatedAt).toLocaleDateString()}
                          </span>
                        ) : null}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </CommandDialog>
            <Suspense fallback={pageLoadingFallback}>
              {activePage === 'cowork' ? (
                <CoworkPage
                  key={`cowork-${coworkResetKey}`}
                  projectTitle={activeCoworkProject?.name || 'No project selected'}
                  projectSelected={Boolean(activeCoworkProject)}
                  projectInstructions={activeCoworkProject?.instructions || ''}
                  scheduledCount={scheduledJobs.length}
                  canRerunLastTask={Boolean(latestVisibleCoworkTaskPrompt)}
                  taskPrompt={coworkDraftPrompt}
                  messages={coworkMessages}
                  rightPanelOpen={coworkRightPanelOpen}
                  awaitingStream={coworkAwaitingStream}
                  artifacts={coworkArtifacts}
                  onOpenArtifact={handleOpenCoworkArtifact}
                  onScheduleRun={handleScheduleCoworkRun}
                  onRerunLastTask={handleRerunLastCoworkTask}
                  selectedModel={coworkModel}
                  models={coworkModels}
                  modelsLoading={modelsLoading}
                  changingModel={changingCoworkModel}
                  pendingApprovals={visiblePendingApprovals}
                  projectTasks={visibleCoworkTasks}
                  sending={coworkSending}
                  runPhase={coworkRunPhase}
                  runStatus={coworkRunStatus}
                  streamingText={coworkStreamingText}
                  engineConnected={engineConnected}
                  webSearchEnabled={coworkWebSearchEnabled}
                  projectPathReferences={coworkProjectPathReferences}
                  onOpenEngineSettings={() => {
                    setActivePage('settings');
                    setSettingsSection('Gateway');
                  }}
                  onTaskPromptChange={handleCoworkPromptChange}
                  onModelChange={handleCoworkModelChange}
                  onWebSearchEnabledChange={setCoworkWebSearchEnabled}
                  onSubmit={handlePlanTask}
                  onApprovePendingAction={handleApprovePendingAction}
                  onRejectPendingAction={handleRejectPendingAction}
                />
              ) : activePage === 'project' ? (
                <ProjectPage
                  project={activeCoworkProject}
                  tasks={visibleCoworkTasks}
                  scheduledCount={scheduledJobs.length}
                  pendingApprovalsCount={visiblePendingApprovals.length}
                  artifacts={visibleProjectArtifacts}
                  projectKnowledge={visibleProjectKnowledge}
                  webSearchEnabled={coworkWebSearchEnabled}
                  onPickFolder={handlePickWorkingFolderForProject}
                  onUpdateProject={handleUpdateCoworkProject}
                  onOpenArtifact={handleOpenCoworkArtifact}
                  onAddKnowledge={handleAddProjectKnowledge}
                  onDeleteKnowledge={handleDeleteProjectKnowledge}
                  onWebSearchEnabledChange={setCoworkWebSearchEnabled}
                  onSelectPage={(page) => setActivePage(page)}
                />
              ) : activePage === 'files' ? (
                engineConnected ? (
                  <FilesPage
                    workingFolder={workingFolder}
                    desktopBridgeAvailable={Boolean(bridge)}
                    onPickFolder={handlePickWorkingFolder}
                    fileService={fileService}
                    localFileService={localFileService}
                    engineUrl={draftEngineUrl}
                    root="workspace"
                  />
                ) : (
                  <section className="grid h-full place-items-center p-6">
                    <div className="w-full max-w-xl rounded-2xl border border-border bg-card p-6 text-center">
                      <h2 className="text-lg font-semibold">Runtime disconnected</h2>
                      <p className="mt-2 font-sans text-sm text-muted-foreground">
                        Connect the current runtime to view workspace contents.
                      </p>
                      <Button type="button" className="mt-4" onClick={() => setActivePage('settings')}>
                        Open Engine Settings
                      </Button>
                    </div>
                  </section>
                )
              ) : activePage === 'local-files' ? (
                engineConnected ? (
                  <FilesPage
                    workingFolder={workingFolder}
                    desktopBridgeAvailable={Boolean(bridge)}
                    onPickFolder={handlePickWorkingFolder}
                    fileService={fileService}
                    localFileService={localFileService}
                    engineUrl={draftEngineUrl}
                    root="working-folder"
                  />
                ) : (
                  <section className="grid h-full place-items-center p-6">
                    <div className="w-full max-w-xl rounded-2xl border border-border bg-card p-6 text-center">
                      <h2 className="text-lg font-semibold">Runtime disconnected</h2>
                      <p className="mt-2 font-sans text-sm text-muted-foreground">
                        Connect the current runtime to view project folder contents.
                      </p>
                      <Button type="button" className="mt-4" onClick={() => setActivePage('settings')}>
                        Open Engine Settings
                      </Button>
                    </div>
                  </section>
                )
              ) : (
                <>
                {activePage === 'chat' && (
                  <ChatPage
                    taskPrompt={chatDraftPrompt}
                    messages={chatMessages}
                    sending={sendingChat}
                    awaitingStream={awaitingChatStream}
                    sessionKey={activeSessionKey}
                    userDisplayName={preferences.displayName || preferences.fullName}
                    models={chatModels}
                    selectedModel={selectedModel}
                    modelsLoading={modelsLoading}
                    changingModel={changingModel}
                    engineConnected={engineConnected}
                    status={status}
                    onTaskPromptChange={handleChatPromptChange}
                    onModelChange={handleModelChange}
                    onSubmit={handleSendChat}
                    onExport={handleExportChat}
                    onNewChat={handleStartNewChat}
                    onClearChat={() => setChatMessages([])}
                    onOpenSettings={() => setActivePage('settings')}
                    onOpenEngineSettings={() => {
                      setActivePage('settings');
                      setSettingsSection('Gateway');
                    }}
                  />
                )}

                {activePage !== 'chat' && (
                  <ScrollArea className="h-full">
                    {activePage === 'activity' && (
                      <ActivityPage
                        chatMessages={chatMessages}
                        coworkMessages={coworkMessages}
                        activeSessionKey={activeSessionKey}
                        coworkSessionKey={coworkSessionKey}
                        engineConnected={engineConnected}
                      />
                    )}

                    {activePage === 'memory' && (
                      <MemoryPage
                        engineConnected={engineConnected}
                      />
                    )}

                    {activePage === 'scheduled' && (
                      (() => {
                        const scheduleAccess = describeEngineScheduleAccess(draftEngineProviderId, bridge);
                        return (
                        <ScheduledPage
                          jobs={scheduledJobs}
                          loading={scheduledLoading}
                          status={status}
                          onRefresh={loadScheduledJobs}
                          scheduleActionsEnabled={scheduleAccess.canManage}
                          scheduleAccessLabel={scheduleAccess.modeLabel}
                          scheduleAccessDescription={scheduleAccess.helperText}
                          onToggleJob={(jobId, enabled) => void handleUpdateInternalPromptSchedule(jobId, { enabled })}
                          onSetJobInterval={(jobId, intervalMinutes) => void handleUpdateInternalPromptSchedule(jobId, { intervalMinutes })}
                          onDeleteJob={(jobId) => void handleDeleteInternalPromptSchedule(jobId)}
                          focusedJobId={focusedScheduledJobId}
                          onOpenRunHistory={(jobId, runId) => {
                          setFocusedScheduledJobId(jobId);
                          setFocusedInternalRunId(runId);
                          setActivePage('settings');
                            setSettingsSection('Developer');
                          }}
                        />
                        );
                      })()
                    )}

                    {activePage === 'safety' && (
                      <SafetyPage
                        engineConnected={engineConnected}
                        projectId={activeCoworkProject?.id}
                        projectTitle={activeCoworkProject?.name}
                      />
                    )}

                    {activePage === 'settings' && (
                      <SettingsPage
                        activeSection={settingsSection}
                        focusedInternalRunId={focusedInternalRunId}
                        focusedScheduledJobId={focusedScheduledJobId}
                        scheduledJobs={scheduledJobs}
                        draftEngineProviderId={draftEngineProviderId}
                        draftEngineUrl={draftEngineUrl}
                        draftEngineToken={draftEngineToken}
                        draftInternalProviderConfig={draftInternalProviderConfig}
                        health={health}
                        status={status}
                        saving={saving}
                        pairingRequestId={pairingRequestId}
                        preferences={preferences}
                        engineConnections={engineConnections}
                        selectedEngineConnectionId={selectedEngineConnectionId}
                        onDraftEngineProviderIdChange={setDraftEngineProviderId}
                        onDraftEngineUrlChange={setDraftEngineUrl}
                        onDraftEngineTokenChange={setDraftEngineToken}
                        onDraftInternalProviderConfigChange={(patch) =>
                          setDraftInternalProviderConfig((current) => ({ ...current, ...patch }))
                        }
                        onSave={handleSave}
                        onSelectEngineConnection={handleSelectEngineConnection}
                        onSaveEngineConnection={handleSaveEngineConnection}
                        onOverwriteEngineConnection={handleOverwriteEngineConnection}
                        onDeleteEngineConnection={handleDeleteEngineConnection}
                        onResetPairing={handleResetPairing}
                        onUpdatePreferences={updatePreferences}
                        onOpenScheduleJob={(jobId) => {
                          setFocusedScheduledJobId(jobId);
                          setActivePage('scheduled');
                        }}
                        onClearScheduleRunFilter={() => setFocusedScheduledJobId(null)}
                      />
                    )}
                  </ScrollArea>
                )}
                </>
              )}
            </Suspense>
          </main>
        </SidebarProvider>
      )}
    </div>
  );
}





















