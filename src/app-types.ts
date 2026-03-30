/**
 * Transitional runtime config. Gateway keys are intentionally retained until
 * Cloffice ships its internal engine config migration.
 */
export type AppConfig = {
  gatewayUrl: string;
  gatewayToken: string;
};

export type EngineConnectionProfile = {
  id: string;
  name: string;
  endpointUrl: string;
  accessToken: string;
  providerId: EngineProviderId;
  createdAt: number;
  updatedAt: number;
  lastUsedAt?: number;
};

export type EngineChatEventState = 'delta' | 'final' | 'aborted' | 'error';

export type EngineSessionResultStatus = 'completed' | 'aborted' | 'failed';

export type EngineSessionEvent = {
  sessionKey: string;
  runId: string;
  state: EngineChatEventState;
  role: ChatMessage['role'];
  text: string;
  visibleText: string;
  model?: string;
  errorMessage: string | null;
  payload: Record<string, unknown>;
};

export type EngineSessionResult = {
  sessionKey: string;
  runId: string;
  status: EngineSessionResultStatus;
  statusMessage: string;
  model?: string;
  payload: Record<string, unknown>;
};

export type EngineRequestedAction =
  | {
      id: string | undefined;
      type: 'create_file';
      path: string;
      content: string;
      overwrite?: boolean;
    }
  | {
      id: string | undefined;
      type: 'append_file';
      path: string;
      content: string;
    }
  | {
      id: string | undefined;
      type: 'read_file';
      path: string;
    }
  | {
      id: string | undefined;
      type: 'list_dir';
      path: string | undefined;
    }
    | {
        id: string | undefined;
        type: 'exists';
        path: string;
      }
    | {
        id: string | undefined;
        type: 'stat';
        path: string;
      }
    | {
        id: string | undefined;
        type: 'rename';
        path: string;
        newPath: string;
    }
  | {
      id: string | undefined;
      type: 'delete';
      path: string;
    }
  | {
      id: string | undefined;
      type: 'shell_exec';
      path: string;
      command: string;
      timeoutMs?: number;
    }
  | {
      id: string | undefined;
      type: 'web_fetch';
      path: string;
      url: string;
      method?: string;
      body?: string;
      contentType?: string;
    };

export type EngineActionExecutionResult = {
  summary: string;
  okCount: number;
  errorCount: number;
  receipts: LocalActionReceipt[];
  previews: string[];
  errors: string[];
  activityItems: ChatActivityItem[];
  receiptMessage: ChatMessage;
};

export type HealthCheckResult = {
  ok: boolean;
  status?: number;
  message: string;
};

export type MessageUsage = {
  inputTokens: number;
  outputTokens: number;
  model?: string;
  costUsd?: number;
};

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  text: string;
  meta?: ChatMessageMeta;
  usage?: MessageUsage;
};

export type ChatActivityTone = 'neutral' | 'success' | 'danger';

export type ChatActivityItem = {
  id: string;
  label: string;
  details?: string;
  tone: ChatActivityTone;
};

export type ChatMessageMeta =
  | {
      kind: 'activity';
      items: ChatActivityItem[];
    };

export type ChatModelOption = {
  value: string;
  label: string;
};

export type ScheduledJob = {
  id: string;
  name: string;
  schedule: string;
  enabled: boolean;
  state: string;
  nextRunAt: string | null;
  lastRunAt: string | null;
  lastRunId?: string;
  lastRunStatus?: string;
  lastRunSummary?: string;
  pendingApprovalCount?: number;
  pendingApprovalSummary?: string;
  lastArtifactSummary?: string;
  lastArtifactReceiptCount?: number;
  lastArtifactErrorCount?: number;
};

export type LocalFilePlanAction = {
  id: string;
  fromPath: string;
  toPath: string;
  category: string;
  operation: 'move' | 'rename';
};

export type LocalFilePlanResult = {
  rootPath: string;
  actions: LocalFilePlanAction[];
};

export type LocalFileApplyResult = {
  applied: number;
  skipped: number;
  errors: string[];
};

export type LocalFileCreateResult = {
  filePath: string;
  created: boolean;
};

export type LocalFileReadResult = {
  filePath: string;
  content: string;
};

export type LocalFileAppendResult = {
  filePath: string;
  appended: boolean;
  bytesAppended: number;
};

export type LocalFileListItem = {
  path: string;
  kind: 'file' | 'directory';
  size?: number;
  modifiedMs?: number;
};

export type LocalFileListResult = {
  rootPath: string;
  items: LocalFileListItem[];
  truncated: boolean;
};

export type LocalFileExistsResult = {
  path: string;
  exists: boolean;
  kind: 'file' | 'directory' | 'none';
};

export type LocalFileRenameResult = {
  oldPath: string;
  newPath: string;
  renamed: boolean;
};

export type LocalFileDeleteResult = {
  path: string;
  deleted: boolean;
};

export type LocalFileStatResult = {
  path: string;
  kind: 'file' | 'directory';
  size: number;
  createdMs: number;
  modifiedMs: number;
};

/** Compatibility runtime discovery result for the current OpenClaw-based path. */
export type GatewayDiscoveryResult = {
  /** A running gateway was found and responded to a health check. */
  found: boolean;
  /** The WebSocket URL of the discovered gateway (e.g. ws://127.0.0.1:18789). */
  gatewayUrl: string | null;
  /** An OpenClaw binary was found on disk but no gateway is running. */
  binaryFound: boolean;
  /** Filesystem path to the discovered binary, if any. */
  binaryPath: string | null;
  /** Human-readable summary of what was detected. */
  message: string;
};

export type EngineRuntimeKind = 'openclaw-compat' | 'internal';
export type EngineTransport = 'websocket-gateway' | 'internal-ipc';
export type EngineProviderId = 'openclaw-compat' | 'internal';

export type LocalActionType = 'create_file' | 'append_file' | 'read_file' | 'list_dir' | 'exists' | 'stat' | 'rename' | 'delete' | 'shell_exec' | 'web_fetch';

export type LocalActionReceipt = {
  id: string;
  type: LocalActionType;
  path: string;
  status: 'ok' | 'error';
  errorCode?: string;
  message?: string;
};

export type TaskState = 'idle' | 'planned';

export type CoworkProjectTaskStatus =
  | 'queued'
  | 'running'
  | 'needs_approval'
  | 'approved'
  | 'rejected'
  | 'completed'
  | 'failed';

export type CoworkProjectTask = {
  id: string;
  projectId: string;
  projectTitle: string;
  sessionKey: string;
  runId?: string;
  prompt: string;
  status: CoworkProjectTaskStatus;
  summary?: string;
  outcome?: string;
  createdAt: number;
  updatedAt: number;
};

export type CoworkRunPhase = 'idle' | 'sending' | 'streaming' | 'completed' | 'error';

export type CoworkProgressStage =
  | 'planning'
  | 'decomposition'
  | 'executing_workstreams'
  | 'synthesizing_outputs'
  | 'deliverables';

export type CoworkProgressStepStatus = 'pending' | 'active' | 'completed' | 'blocked';

export type CoworkProgressStep = {
  stage: CoworkProgressStage;
  label: string;
  status: CoworkProgressStepStatus;
  details?: string;
};

export type CoworkArtifact = {
  id: string;
  runId?: string;
  label: string;
  path: string;
  kind: 'file' | 'summary';
  status: 'ok' | 'error';
  source?: 'create_file' | 'append_file' | 'read_file';
  updatedAt: number;
};

export type SafetyRiskLevel = 'low' | 'medium' | 'high' | 'critical';

export type SafetyPermissionScope = {
  id: string;
  name: string;
  description: string;
  riskLevel: SafetyRiskLevel;
  enabled: boolean;
  requiresApproval: boolean;
};

export type PendingApprovalAction = {
  id: string;
  runId: string;
  actionId: string;
  actionType: LocalActionType;
  projectId?: string;
  projectTitle?: string;
  projectRootFolder?: string;
  path: string;
  scopeId: string;
  scopeName: string;
  riskLevel: SafetyRiskLevel;
  summary: string;
  preview?: string;
  createdAt: number;
};

export type CoworkProject = {
  id: string;
  name: string;
  description?: string;
  instructions?: string;
  workspaceFolder: string;
  createdAt: number;
  updatedAt: number;
};

export type ProjectKnowledgeItem = {
  id: string;
  projectId: string;
  title: string;
  content: string;
  createdAt: number;
  updatedAt: number;
};

export type ProjectPathReference = {
  path: string;
  kind: 'file' | 'directory';
};

export type MemoryEntry = {
  id: string;
  category: 'about-me' | 'rules' | 'knowledge' | 'reflection';
  title: string;
  content: string;
  tags: string[];
  createdAt: number;
  updatedAt: number;
};

export type UserPreferences = {
  fullName: string;
  displayName: string;
  role: string;
  responsePreferences: string;
  systemPrompt: string;
  injectMemory: boolean;
  theme: 'light' | 'auto' | 'dark';
  /**
   * Persisted values retained for compatibility with existing Relay installs.
   * The UI may label the elay style as Cloffice.
   */
  style: 'claude' | 'relay';
  language: 'en' | 'de';
};




