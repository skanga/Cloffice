import { app, BrowserWindow, dialog, ipcMain, Menu, Notification, session, shell } from 'electron';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { exec, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import os from 'node:os';
import crypto from 'node:crypto';

const execAsync = promisify(exec);
import type {
  AppConfig,
  HealthCheckResult,
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
  GatewayDiscoveryResult,
} from '../src/app-types.js';
import { describeInternalEngineShell } from '../src/lib/internal-engine-placeholder.js';
import type { EngineChatMessage, EngineConnectOptions, EngineModelChoice, EngineSessionSummary } from '../src/lib/engine-runtime-types.js';
import type { InternalEngineRuntimeInfo, InternalEngineSendChatResult } from '../src/lib/internal-engine-bridge.js';
import type { ChatActivityItem, EngineRequestedAction } from '../src/app-types.js';

const execFileAsync = promisify(execFile);

const defaultConfig: AppConfig = {
  gatewayUrl: 'ws://127.0.0.1:18789',
  gatewayToken: '',
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
  const modelChoices: EngineModelChoice[] = Object.entries(modelBehaviors).map(([value, behavior]) => ({
    value,
    label: behavior.label,
  }));
  const mainSessionKey = 'internal:main';
  const maxSessionHistory = 80;
  let activeSessionKey: string | null = null;
  const sessions = new Map<string, {
    key: string;
    kind: string;
    title?: string;
    model: string | null;
    messages: EngineChatMessage[];
    updatedAt: number;
  }>();

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
  const resolveModelValue = (value: string | null | undefined) => (
    value && value in modelBehaviors ? value : defaultModel
  );
  const getModelBehavior = (value: string | null | undefined) => modelBehaviors[resolveModelValue(value)];
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
  const formatCoworkFoundationResponse = (text: string, sessionKey: string) => {
    const normalized = text.replace(/\s+/g, ' ').trim() || 'the current cowork task';
    const proposedActions = {
      engine_actions: [
        {
          id: 'inspect-project',
          type: 'list_dir',
          path: '.',
        },
      ],
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
      'Current limitation: internal cowork foundations only emit read-only inspection actions in this phase.',
      '```json',
      JSON.stringify(proposedActions, null, 2),
      '```',
    ].join('\n');
  };
  const buildCoworkFoundationActions = (): EngineRequestedAction[] => [
    {
      id: 'inspect-project',
      type: 'list_dir',
      path: '.',
    },
  ];
  const buildCoworkFoundationActivityItems = (): ChatActivityItem[] => [
    {
      id: 'internal-cowork-approval',
      label: 'Internal cowork requested approval for read-only project inspection.',
      details: 'The internal engine is requesting a scoped directory listing before attempting deeper task execution.',
      tone: 'neutral',
    },
  ];
  const formatInternalAssistantText = (
    model: string,
    text: string,
    sessionKey: string,
    historyLength: number,
    kind: string,
  ) => {
    const normalized = text.trim() || 'No prompt text supplied.';
    if (kind === 'cowork') {
      return formatCoworkFoundationResponse(normalized, sessionKey);
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
      model: kind === 'cowork' ? 'internal/dev-planner' : defaultModel,
      messages: [] as EngineChatMessage[],
      updatedAt: now(),
    };
    sessions.set(normalizedKey, created);
    return created;
  };

  ensureSession(mainSessionKey, 'main');
  activeSessionKey = mainSessionKey;

  return {
    getStatus() {
      return shellStatus;
    },
    async connect(_options: EngineConnectOptions): Promise<void> {
      if (!shellStatus.availableInBuild) {
        connected = false;
        throw unavailable();
      }
      connected = true;
      activeSessionKey = mainSessionKey;
      ensureSession(mainSessionKey, 'main');
      await fs.mkdir(runtimeHome, { recursive: true });
    },
    async disconnect(): Promise<void> {
      connected = false;
    },
    async getActiveSessionKey(): Promise<string> {
      requireConnected();
      activeSessionKey = ensureSession(mainSessionKey, 'main').key;
      return activeSessionKey;
    },
    async getRuntimeInfo(): Promise<InternalEngineRuntimeInfo> {
      return {
        status: shellStatus,
        runtimeHome,
        serviceVersion: app.getVersion(),
        serviceName,
        connected,
        readiness: !shellStatus.availableInBuild ? 'unavailable' : connected ? 'ready' : 'idle',
        sessionCount: sessions.size,
        activeSessionKey,
        defaultModel,
      };
    },
    async createChatSession(): Promise<string> {
      requireConnected();
      const key = `internal:chat:${crypto.randomUUID()}`;
      activeSessionKey = ensureSession(key, 'chat').key;
      return activeSessionKey;
    },
    async createCoworkSession(): Promise<string> {
      requireConnected();
      const key = `internal:cowork:${crypto.randomUUID()}`;
      activeSessionKey = ensureSession(key, 'cowork').key;
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
      return modelChoices;
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
      const session = ensureSession(
        sessionKey,
        sessionKey.startsWith('internal:cowork:') ? 'cowork' : 'chat',
      );
      const nextModel = resolveModelValue(modelValue && modelValue.trim() ? modelValue.trim() : defaultModel);
      const previousModel = resolveModelValue(session.model);
      session.model = nextModel;
      if (previousModel !== nextModel) {
        appendSystemMessage(session.messages, `Mode switched to ${getModelBehavior(nextModel).label}.`);
        trimSessionHistory(session);
      }
      session.updatedAt = now();
    },
    async setSessionTitle(sessionKey: string, title: string | null): Promise<void> {
      requireConnected();
      const session = ensureSession(
        sessionKey,
        sessionKey.startsWith('internal:cowork:') ? 'cowork' : 'chat',
      );
      session.title = title && title.trim() ? normalizeSessionTitle(title) : undefined;
      session.updatedAt = now();
    },
    async deleteSession(sessionKey: string): Promise<void> {
      requireConnected();
      if (sessionKey === mainSessionKey) {
        const mainSession = ensureSession(mainSessionKey, 'main');
        sessions.set(mainSessionKey, {
          ...mainSession,
          title: 'Main chat',
          messages: [],
          updatedAt: now(),
        });
        activeSessionKey = mainSessionKey;
        return;
      }
      sessions.delete(sessionKey);
      if (activeSessionKey === sessionKey) {
        activeSessionKey = mainSessionKey;
      }
    },
    async getHistory(sessionKey: string, limit = 50): Promise<EngineChatMessage[]> {
      requireConnected();
      return ensureSession(
        sessionKey,
        sessionKey === mainSessionKey ? 'main' : sessionKey.startsWith('internal:cowork:') ? 'cowork' : 'chat',
      ).messages.slice(-limit);
    },
    async sendChat(sessionKey: string, text: string): Promise<InternalEngineSendChatResult> {
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
      const requestedActions = session.kind === 'cowork' ? buildCoworkFoundationActions() : [];
      const activityItems = session.kind === 'cowork' ? buildCoworkFoundationActivityItems() : [];
      const assistantMessage: EngineChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        text: formatInternalAssistantText(nextModel, text, session.key, session.messages.length + 2, session.kind),
      };
      session.messages.push(userMessage, assistantMessage);
      trimSessionHistory(session);
      session.updatedAt = now();
      activeSessionKey = session.key;
      if (!session.title) {
        session.title = inferSessionTitle(session.key, text, nextModel);
      }
      return {
        sessionKey: session.key,
        runId: crypto.randomUUID(),
        assistantMessage,
        model: nextModel,
        historyLength: session.messages.length,
        sessionTitle: session.title,
        providerId: 'internal',
        runtimeKind: 'internal',
        sessionKind: session.kind,
        requestedActions,
        activityItems,
        engineActionPhase: requestedActions.length > 0 ? 'approval_required' : 'none',
        engineActionMode: requestedActions.length > 0 ? 'read-only' : 'none',
      };
    },
    isConnected() {
      return connected;
    },
  };
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

/**
 * Transitional config path retained for compatibility with existing Relay/OpenClaw installs.
 * TODO(engine-migration): move to a Cloffice-owned engine config file with explicit migration.
 */
const configPath = () => path.join(app.getPath('userData'), 'openclaw-config.json');

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
  const parentDir = path.dirname(targetPath);
  const nearestExistingParent = await resolveNearestExistingAncestorPath(parentDir);
  await assertRealPathInsideRoot(rootRealPath, nearestExistingParent, message);

  try {
    const stat = await fs.lstat(targetPath);
    if (stat.isSymbolicLink()) {
      throw new Error('Symbolic links are blocked for local file actions.');
    }
    await assertRealPathInsideRoot(rootRealPath, targetPath, message);
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
  const normalized = normalizeRelativePath(relativePath);
  if (!normalized) throw new Error('A path is required.');
  if (path.isAbsolute(normalized)) throw new Error('Use a relative path.');
  if (isHiddenOrBlockedPath(normalized)) throw new Error('Path blocked by safety rules.');
  const resolved = path.resolve(root, normalized);
  if (!isPathInside(root, resolved)) throw new Error('Path must remain inside working folder.');
  await assertTargetPathAllowed(root, resolved, 'Path must remain inside working folder.');
  const stat = await fs.stat(resolved);
  return {
    path: resolved,
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

async function readConfig(): Promise<AppConfig> {
  try {
    const raw = await fs.readFile(configPath(), 'utf8');
    const parsed = JSON.parse(raw) as Partial<AppConfig> & { baseUrl?: string; mode?: string };
    const inferredGatewayUrl =
      parsed.gatewayUrl ??
      (parsed.baseUrl
        ? parsed.baseUrl.replace(/^https?:\/\//, (value) => (value === 'https://' ? 'wss://' : 'ws://'))
        : defaultConfig.gatewayUrl);

    return {
      gatewayUrl: inferredGatewayUrl,
      gatewayToken: parsed.gatewayToken ?? defaultConfig.gatewayToken,
    };
  } catch {
    return defaultConfig;
  }
}

async function writeConfig(config: AppConfig): Promise<AppConfig> {
  const normalizedGatewayUrl = config.gatewayUrl.trim();

  const normalized = {
    gatewayUrl: normalizedGatewayUrl,
    gatewayToken: config.gatewayToken.trim(),
  };

  await fs.mkdir(path.dirname(configPath()), { recursive: true });
  await fs.writeFile(configPath(), JSON.stringify(normalized, null, 2), 'utf8');
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
// Gateway auto-discovery
// ---------------------------------------------------------------------------

const DEFAULT_PORTS = [18789, 18790];

async function probeGatewayHealth(port: number): Promise<boolean> {
  const candidates = [`http://127.0.0.1:${port}/health`, `http://127.0.0.1:${port}/`];
  for (const url of candidates) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2000);
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);
      if (response.ok) return true;
    } catch {
      continue;
    }
  }
  return false;
}

function getOpenClawBinaryCandidates(): string[] {
  const home = os.homedir();
  const isWindows = process.platform === 'win32';
  const bin = isWindows ? 'openclaw.exe' : 'openclaw';

  const paths: string[] = [
    // Standard install location
    path.join(home, '.openclaw', 'bin', bin),
    // Legacy Relay-managed location
    path.join(home, '.relay', 'openclaw', bin),
  ];

  if (!isWindows) {
    paths.push(
      path.join('/usr', 'local', 'bin', 'openclaw'),
      path.join(home, '.local', 'bin', 'openclaw'),
    );
  }

  return paths;
}

async function findBinaryOnPath(): Promise<string | null> {
  const command = process.platform === 'win32' ? 'where' : 'which';
  // On Windows, npm global binaries are .cmd wrappers — try that first
  const names = process.platform === 'win32' ? ['openclaw.cmd', 'openclaw'] : ['openclaw'];
  for (const name of names) {
    try {
      const { stdout } = await execFileAsync(command, [name], { timeout: 3000 });
      const firstLine = stdout.trim().split(/\r?\n/)[0];
      if (firstLine) return firstLine;
    } catch {
      // not found, try next variant
    }
  }
  return null;
}

async function findBinaryOnDisk(): Promise<string | null> {
  for (const candidate of getOpenClawBinaryCandidates()) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      continue;
    }
  }
  return findBinaryOnPath();
}

async function discoverGateway(): Promise<GatewayDiscoveryResult> {
  // Step 1: Probe default ports for a running gateway
  for (const port of DEFAULT_PORTS) {
    const alive = await probeGatewayHealth(port);
    if (alive) {
      return {
        found: true,
        gatewayUrl: `ws://127.0.0.1:${port}`,
        binaryFound: true,
        binaryPath: null,
        message: `OpenClaw compatibility runtime detected on port ${port}.`,
      };
    }
  }

  // Step 2: No running gateway — check if binary is installed
  const binaryPath = await findBinaryOnDisk();
  if (binaryPath) {
    return {
      found: false,
      gatewayUrl: null,
      binaryFound: true,
      binaryPath,
      message: `OpenClaw compatibility binary found at ${binaryPath} but no runtime is running.`,
    };
  }

  // Step 3: Nothing found
  return {
    found: false,
    gatewayUrl: null,
    binaryFound: false,
    binaryPath: null,
    message: 'No local OpenClaw compatibility runtime detected.',
  };
}

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
  ipcMain.handle('internal-engine:status', async () => internalEngineService.getStatus());
  ipcMain.handle('internal-engine:get-runtime-info', async () => internalEngineService.getRuntimeInfo());
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
  ipcMain.handle('internal-engine:send-chat', async (_event, sessionKey: string, text: string) => internalEngineService.sendChat(sessionKey, text));
  ipcMain.handle('backend:health-check', async (_event, baseUrl: string) => runHealthCheck(baseUrl));
  ipcMain.handle('gateway:discover', async () => discoverGateway());
  ipcMain.handle('plugin:check-workspace', async () => {
    const binaryPath = await findBinaryOnDisk();
    if (!binaryPath) return { installed: false, error: 'OpenClaw compatibility binary not found.' };
    try {
      const { stdout } = await execFileAsync(binaryPath, ['plugins', 'list'], {
        timeout: 10_000,
        shell: process.platform === 'win32',
      });
      return { installed: stdout.includes('openclaw-relay-workspace') };
    } catch {
      return { installed: false };
    }
  });
  ipcMain.handle('plugin:install-workspace', async () => {
    const binaryPath = await findBinaryOnDisk();
    if (!binaryPath) {
      return { ok: false as const, error: 'OpenClaw compatibility binary not found on this system.' };
    }
    try {
      const { stdout, stderr } = await execFileAsync(
        binaryPath,
        ['plugins', 'install', '@seventeenlabs/openclaw-relay-workspace'],
        { timeout: 60_000, shell: process.platform === 'win32' },
      );
      return { ok: true as const, output: stdout || stderr };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false as const, error: msg };
    }
  });
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
