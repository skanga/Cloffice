import { readFile } from 'node:fs/promises';
import path from 'node:path';

const repoRoot = process.cwd();
const electronMainPath = path.join(repoRoot, 'electron', 'main.ts');
const promptControllerPath = path.join(repoRoot, 'src', 'lib', 'engine-cowork-prompt-controller.ts');
const safetyPolicyPath = path.join(repoRoot, 'src', 'lib', 'safety-policy.ts');
const filesystemConnectorPath = path.join(repoRoot, 'src', 'lib', 'connectors', 'filesystem.ts');
const preloadPath = path.join(repoRoot, 'electron', 'preload.cts');
const connectorHostPath = path.join(repoRoot, 'electron', 'connector-host.ts');
const localFilesPath = path.join(repoRoot, 'electron', 'local-files.ts');
const useAuthPath = path.join(repoRoot, 'src', 'hooks', 'use-auth.ts');
const windowManagementPath = path.join(repoRoot, 'electron', 'window-management.ts');
const appPath = path.join(repoRoot, 'src', 'App.tsx');
const fileServicePath = path.join(repoRoot, 'src', 'lib', 'file-service.ts');
const filesPagePath = path.join(repoRoot, 'src', 'features', 'workspace', 'files-page.tsx');
const onboardingPagePath = path.join(repoRoot, 'src', 'features', 'auth', 'onboarding-page.tsx');
const settingsPagePath = path.join(repoRoot, 'src', 'features', 'settings', 'settings-page.tsx');
const scheduledPagePath = path.join(repoRoot, 'src', 'features', 'workspace', 'scheduled-page.tsx');
const connectorRegistryPath = path.join(repoRoot, 'src', 'lib', 'connectors', 'registry.ts');
const chatUtilsPath = path.join(repoRoot, 'src', 'lib', 'chat-utils.ts');

async function readText(filePath) {
  return readFile(filePath, 'utf8');
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertIncludesAll(content, snippets, label) {
  const missing = snippets.filter((snippet) => !content.includes(snippet));
  if (missing.length > 0) {
    throw new Error(`Missing required safety snippets in ${label}: ${missing.join(', ')}`);
  }
}

function assertExcludesAll(content, snippets, label) {
  const present = snippets.filter((snippet) => content.includes(snippet));
  if (present.length > 0) {
    throw new Error(`Unexpected insecure snippets present in ${label}: ${present.join(', ')}`);
  }
}

function extractFunctionBlock(source, functionName) {
  const signatures = [`async function ${functionName}(`, `function ${functionName}(`];
  let start = -1;
  for (const signature of signatures) {
    start = source.indexOf(signature);
    if (start >= 0) {
      break;
    }
  }
  if (start < 0) {
    throw new Error(`Could not find function: ${functionName}`);
  }

  const nextAsync = source.indexOf('\nasync function ', start + 1);
  const nextSync = source.indexOf('\nfunction ', start + 1);
  const candidates = [nextAsync, nextSync].filter((index) => index >= 0);
  const end = candidates.length > 0 ? Math.min(...candidates) : source.length;
  return source.slice(start, end);
}

function extractSection(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  if (start < 0) {
    throw new Error(`Could not find section start: ${startMarker}`);
  }
  const end = source.indexOf(endMarker, start);
  if (end < 0) {
    throw new Error(`Could not find section end: ${endMarker}`);
  }
  return source.slice(start, end);
}

function assertFunctionContains(source, functionName, snippets) {
  const block = extractFunctionBlock(source, functionName);
  assertIncludesAll(block, snippets, `function ${functionName}`);
}

async function run() {
  const [
    electronMain,
    promptController,
    safetyPolicy,
    filesystemConnector,
    preloadFile,
    connectorHostFile,
    localFilesFile,
    useAuthFile,
    windowManagementFile,
    appFile,
    fileServiceFile,
    filesPageFile,
    onboardingPageFile,
    settingsPageFile,
    scheduledPageFile,
    connectorRegistryFile,
    chatUtilsFile,
  ] = await Promise.all([
    readText(electronMainPath),
    readText(promptControllerPath),
    readText(safetyPolicyPath),
    readText(filesystemConnectorPath),
    readText(preloadPath),
    readText(connectorHostPath),
    readText(localFilesPath),
    readText(useAuthPath),
    readText(windowManagementPath),
    readText(appPath),
    readText(fileServicePath),
    readText(filesPagePath),
    readText(onboardingPagePath),
    readText(settingsPagePath),
    readText(scheduledPagePath),
    readText(connectorRegistryPath),
    readText(chatUtilsPath),
  ]);

  // Project-relative path validation now lives in the prompt controller.
  assertIncludesAll(promptController, [
    'export function validateProjectRelativePath(',
    "return options?.allowEmpty ? { ok: true } : { ok: false, reason: 'Path is required.' };",
    "return { ok: false, reason: 'Path contains invalid control characters.' };",
    "return { ok: false, reason: 'Absolute paths are not allowed for project-bound actions.' };",
    "return { ok: false, reason: 'Parent directory traversal is not allowed.' };",
  ], 'src/lib/engine-cowork-prompt-controller.ts');

  // Safety policy includes all file handling scopes + action mapping.
  assertIncludesAll(
    safetyPolicy,
    [
      "id: 'file-read'",
      "id: 'file-list'",
      "id: 'file-create'",
      "id: 'file-modify'",
      "id: 'file-delete'",
      "id: 'file-move'",
      "create_file: 'file-create'",
      "append_file: 'file-modify'",
      "read_file: 'file-read'",
      "list_dir: 'file-list'",
      "exists: 'file-read'",
      "rename: 'file-move'",
      "delete: 'file-delete'",
    ],
    'src/lib/safety-policy.ts',
  );

  // Filesystem connector actions remain aligned with safety scopes.
  assertIncludesAll(
    filesystemConnector,
    [
      "id: 'filesystem.read_file'",
      "scopeId: 'file-read'",
      "id: 'filesystem.create_file'",
      "scopeId: 'file-create'",
      "id: 'filesystem.append_file'",
      "scopeId: 'file-modify'",
      "id: 'filesystem.list_dir'",
      "scopeId: 'file-list'",
      "id: 'filesystem.exists'",
      "id: 'filesystem.rename'",
      "scopeId: 'file-move'",
      "id: 'filesystem.delete'",
      "scopeId: 'file-delete'",
    ],
    'src/lib/connectors/filesystem.ts',
  );

  // Electron-side file operation safety checks.
  assertFunctionContains(localFilesFile, 'writeFileInFolder', [
    'normalizeRelativePath(relativePath)',
    'isHiddenOrBlockedPath(normalizedRelativePath)',
    'isPathInside(root, resolvedTargetPath)',
    'assertTargetPathAllowed(root, resolvedTargetPath',
  ]);

  assertFunctionContains(localFilesFile, 'readFileInFolder', [
    'normalizeRelativePath(relativePath)',
    'isHiddenOrBlockedPath(normalizedRelativePath)',
    'isPathInside(root, resolvedTargetPath)',
    'assertTargetPathAllowed(root, resolvedTargetPath',
    'stats.size > MAX_READ_FILE_BYTES',
  ]);

  assertFunctionContains(localFilesFile, 'appendFileInFolder', [
    'normalizeRelativePath(relativePath)',
    'isHiddenOrBlockedPath(normalizedRelativePath)',
    'isPathInside(root, resolvedTargetPath)',
    'assertTargetPathAllowed(root, resolvedTargetPath',
  ]);

  assertFunctionContains(localFilesFile, 'listDirInFolder', [
    'normalizeRelativePath(relativePath ?? \'\')',
    'isPathInside(root, resolvedTargetPath)',
    'assertTargetPathAllowed(root, resolvedTargetPath',
    'isHiddenOrBlockedPath(entry.name)',
    'truncated: entries.length > items.length',
  ]);

  assertFunctionContains(localFilesFile, 'existsInFolder', [
    'normalizeRelativePath(relativePath)',
    'isHiddenOrBlockedPath(normalizedRelativePath)',
    'isPathInside(root, resolvedTargetPath)',
    'assertTargetPathAllowed(root, resolvedTargetPath',
    "kind: 'none'",
  ]);

  assertFunctionContains(localFilesFile, 'renameInFolder', [
    'normalizeRelativePath(oldRelative)',
    'normalizeRelativePath(newRelative)',
    'isHiddenOrBlockedPath(normalizedOld) || isHiddenOrBlockedPath(normalizedNew)',
    'isPathInside(root, resolvedOld) || !isPathInside(root, resolvedNew)',
    'assertTargetPathAllowed(root, resolvedOld',
    'assertTargetPathAllowed(root, resolvedNew',
  ]);

  assertFunctionContains(localFilesFile, 'deleteInFolder', [
    'normalizeRelativePath(relativePath)',
    'isHiddenOrBlockedPath(normalizedRelativePath)',
    'isPathInside(root, resolved)',
    'assertTargetPathAllowed(root, resolved',
    'fs.rm(resolved, { recursive: true, force: false })',
  ]);

  assertFunctionContains(localFilesFile, 'statInFolder', [
    'normalizeRelativePath(relativePath)',
    'isPathInside(root, resolved)',
    'assertTargetPathAllowed(root, resolved',
  ]);

  // Shared helpers that support symlink / traversal protections.
  assertIncludesAll(
    localFilesFile,
    [
      'function isPathInside(rootPath: string, targetPath: string): boolean',
      'function isHiddenOrBlockedPath(targetPath: string): boolean',
      'async function resolveNearestExistingAncestorPath(',
      'async function assertTargetPathAllowed(',
      "throw new Error('Symbolic links are blocked for local file actions.')",
    ],
    'electron/local-files.ts',
  );

  // Connector host primitives remain available only behind the development bridge.
  const developmentBridgeBlock = extractSection(
    preloadFile,
    'if (enableDevelopmentBridge) {',
    "contextBridge.exposeInMainWorld('cloffice', desktopBridgeApi);",
  );
  const productionBridgeBlock = extractSection(
    preloadFile,
    'const desktopBridgeApi = {',
    'if (enableDevelopmentBridge) {',
  );

  assertIncludesAll(
    developmentBridgeBlock,
    [
      'shellExec: (rootPath: string, command: string, timeoutMs?: number)',
      'webFetch: (',
      'options?: { method?: string; headers?: Record<string, string>; body?: string },',
      "ipcRenderer.invoke('connector:shell-exec', {",
      "ipcRenderer.invoke('connector:web-fetch', {",
    ],
    'electron/preload.cts development bridge block',
  );

  assertExcludesAll(
    productionBridgeBlock,
    [
      'shellExec: (rootPath: string, command: string, timeoutMs?: number)',
      'webFetch: (',
      "ipcRenderer.invoke('connector:shell-exec', {",
      "ipcRenderer.invoke('connector:web-fetch', {",
    ],
    'electron/preload.cts production bridge block',
  );

  assertIncludesAll(
    connectorHostFile,
    [
      "ipcMain.handle('connector:shell-exec'",
      "ipcMain.handle('connector:web-fetch'",
      'Shell working directory must be inside a currently selected local folder.',
      'Only http/https URLs are allowed',
    ],
    'electron/connector-host.ts',
  );

  // Auth tokens must not be persisted in renderer storage.
  assertExcludesAll(
    useAuthFile,
    [
      'writeLocalStorageItem(AUTH_LOCAL_STORAGE_KEY',
      'writeSessionStorageItem(AUTH_SESSION_STORAGE_KEY',
      'const serialized = JSON.stringify(session);',
    ],
    'src/hooks/use-auth.ts',
  );

  // External links must be kept out of the privileged renderer process.
  assertIncludesAll(
    windowManagementFile,
    [
      "window.webContents.setWindowOpenHandler(({ url }) => {",
      "return { action: 'deny' };",
      "window.webContents.on('will-navigate', (event, url) => {",
      'shell.openExternal(url)',
    ],
    'electron/window-management.ts',
  );

  // App shell text must stay free of the mojibake that previously broke shortcuts
  // comments and markdown export output.
  assertIncludesAll(
    appFile,
    [
      '// Ctrl+N -> new chat / new task',
      '// Ctrl+K -> open search',
      '// Ctrl+Shift+S -> settings',
      "const markdown = `# Chat Export - ${new Date().toLocaleDateString()}\\n\\n${lines.join('\\n\\n---\\n\\n')}\\n`;",
    ],
    'src/App.tsx',
  );

  assertExcludesAll(
    appFile,
    ['Ã', 'Â', 'â€', 'â€¢', 'â€”', '�'],
    'src/App.tsx',
  );

  for (const [label, content] of [
    ['src/features/auth/onboarding-page.tsx', onboardingPageFile],
    ['src/features/settings/settings-page.tsx', settingsPageFile],
    ['src/features/workspace/scheduled-page.tsx', scheduledPageFile],
    ['src/lib/connectors/registry.ts', connectorRegistryFile],
    ['src/lib/chat-utils.ts', chatUtilsFile],
  ]) {
    assertExcludesAll(
      content,
      ['Ã', 'Â', 'â€', 'â€¢', 'â€”', '�'],
      label,
    );
  }

  // Deprecated remote-runtime compatibility paths must stay removed from the live
  // filesystem service and Files page UI.
  assertIncludesAll(
    fileServiceFile,
    [
      'Desktop filesystem abstraction backed by the Electron bridge.',
      'constructor(private readonly explorerId: string) {}',
      'export class LocalFileService implements FileService {',
      'export function createFileService(explorerId: string): FileService {',
      'return new LocalFileService(explorerId);',
    ],
    'src/lib/file-service.ts',
  );

  assertExcludesAll(
    fileServiceFile,
    [
      'RemoteFileService',
      'WorkspaceRpcUnsupportedError',
      'isRemoteUrl(',
      'workspace.*',
      'compatibility plugin',
      "readonly mode:",
      "'remote'",
    ],
    'src/lib/file-service.ts',
  );

  assertIncludesAll(
    preloadFile,
    [
      'const enableDevelopmentBridge =',
      'Object.assign(desktopBridgeApi, {',
      "ipcRenderer.invoke('engine-config:get') as Promise<DesktopBridgeEngineConfig>",
      "ipcRenderer.invoke('engine-config:save', draft) as Promise<DesktopBridgeEngineConfig>",
      'createInternalPromptSchedule: (payload: { kind?: \'chat\' | \'cowork\'; prompt: string; name?: string; intervalMinutes?: number; projectId?: string; projectTitle?: string; explorerId?: string; model?: string | null }) =>',
      "selectFolder: (initialPath?: string) => ipcRenderer.invoke('local:select-folder', initialPath)",
      'explorerId',
      "ipcRenderer.invoke('local:create-file-in-folder', {",
      "ipcRenderer.invoke('local:list-dir-in-folder', {",
    ],
    'electron/preload.cts',
  );

  assertExcludesAll(
    preloadFile,
    [
      'healthCheck: (baseUrl: string)',
      'checkRuntimeHealth: async (baseUrl: string)',
      "ipcRenderer.invoke('backend:health-check'",
    ],
    'electron/preload.cts',
  );

  assertIncludesAll(
    electronMain,
    [
      'async function readDesktopBridgeEngineConfig(): Promise<DesktopBridgeEngineConfig>',
      'async function writeEngineConfigDraft(draft: unknown): Promise<DesktopBridgeEngineConfig>',
      'prepareEngineConfigWrite(normalizedDraft);',
      'async function normalizePromptScheduleCreatePayload(payload: unknown): Promise<{',
      'await resolveLocalExplorerRoot(normalizeRequiredString(explorerId, \'prompt schedule payload explorerId\', 256))',
      'const validatePendingApprovalFlow = async (flow: unknown): Promise<InternalApprovalRecoveryFlow> => {',
      'Pending approval flow root path must be inside a currently selected local folder.',
      'const canonicalizeContinuationPayload = async (payload: unknown): Promise<InternalEngineCoworkContinuationRequest> => {',
      'Cowork continuation payload does not match the saved approval flow.',
      'registerWindowIpcHandlers(ipcMain);',
      'registerScopedLocalFileIpcHandlers(ipcMain);',
      'await createAppWindow({ isDev, delay });',
      "ipcMain.handle('engine-config:get', async () => readDesktopBridgeEngineConfig());",
      "ipcMain.handle('engine-config:save', async (_event, draft: unknown) => writeEngineConfigDraft(draft));",
      'normalizeRuntimeRetentionPolicyPayload(payload)',
    ],
    'electron/main.ts',
  );

  assertExcludesAll(
    electronMain,
    [
      'async function runHealthCheck(endpointUrl: string)',
      "ipcMain.handle('backend:health-check'",
    ],
    'electron/main.ts',
  );

  assertIncludesAll(
    localFilesFile,
    [
      'export async function registerLocalExplorer(rootPath: string): Promise<LocalExplorerSelection>',
      'export async function requireLocalExplorerRoot(explorerId: string): Promise<string>',
      'export function isPathWithinRegisteredExplorerRoots(targetPath: string): boolean {',
      'if (!isPathWithinRegisteredExplorerRoots(resolved)) {',
      'Target path must be inside a currently selected local folder.',
      'export function registerLocalFileIpcHandlers(ipcMain: IpcMain): void {',
      'return registerLocalExplorer(result.filePaths[0]);',
      'const rootPath = await requireLocalExplorerRoot(explorerId);',
    ],
    'electron/local-files.ts',
  );

  assertIncludesAll(
    windowManagementFile,
    [
      'export async function createAppWindow(params: {',
      "window.webContents.setWindowOpenHandler(({ url }) => {",
      "window.webContents.on('will-navigate', (event, url) => {",
      'export function registerWindowIpcHandlers(ipcMain: IpcMain): void {',
    ],
    'electron/window-management.ts',
  );

  assertExcludesAll(
    preloadFile,
    [
      'function parseDesktopBridgeEngineConfig(',
      'function prepareDesktopBridgeEngineConfigWrite(',
      'preparedWrite.activeEntry',
      'projectTitle?: string; rootPath?: string; model?: string | null }) =>',
    ],
    'electron/preload.cts',
  );

  assertExcludesAll(
    filesPageFile,
    [
      'WorkspaceRpcUnsupportedError',
      'remoteUnsupported',
      'isRemote',
      'remote server',
      'legacy runtime',
      'Workspace access unavailable',
    ],
    'src/features/workspace/files-page.tsx',
  );

  assertExcludesAll(
    electronMain,
    [
      "ipcMain.handle('engine-config:save', async (_event, entry: unknown) => writeRawConfigEntry(entry));",
    ],
    'electron/main.ts',
  );

  console.log('File handling and safety smoke checks passed.');
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

