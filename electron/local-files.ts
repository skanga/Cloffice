import { app, dialog, shell, type IpcMain } from 'electron';
import crypto from 'node:crypto';
import path from 'node:path';
import { promises as fs } from 'node:fs';

import type {
  LocalExplorerSelection,
  LocalFileApplyResult,
  LocalFileAppendResult,
  LocalFileCreateResult,
  LocalFileDeleteResult,
  LocalFileExistsResult,
  LocalFileListItem,
  LocalFileListResult,
  LocalFilePlanAction,
  LocalFilePlanResult,
  LocalFileReadResult,
  LocalFileRenameResult,
  LocalFileStatResult,
} from '../src/app-types.js';

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

const MAX_READ_FILE_BYTES = 256 * 1024;
const MAX_LIST_DIR_ITEMS = 200;
const BLOCKED_BASENAMES = new Set(['desktop.ini', 'thumbs.db']);
const localExplorerRoots = new Map<string, string>();

export function isPathInside(rootPath: string, targetPath: string): boolean {
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

export function formatDatePrefix(timestampMs: number): string {
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

export async function ensurePathAllowed(rootPath: string): Promise<string> {
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
    const relativeCategoryPath = category === 'Other' ? normalizedFileName : `${category}/${normalizedFileName}`;
    const destinationPath = path.join(root, relativeCategoryPath);
    if (path.resolve(currentPath) === path.resolve(destinationPath)) {
      continue;
    }
    actions.push({
      id: crypto.randomUUID(),
      fromPath: entry.name,
      toPath: relativeCategoryPath,
      category,
      operation: path.dirname(relativeCategoryPath) === '.' ? 'rename' : 'move',
    });
  }

  return {
    rootPath: root,
    actions,
  };
}

async function uniqueDestinationPath(destinationPath: string): Promise<string> {
  const extension = path.extname(destinationPath);
  const baseName = path.basename(destinationPath, extension);
  const parentDir = path.dirname(destinationPath);

  let attempt = 1;
  let candidate = destinationPath;
  while (true) {
    try {
      await fs.access(candidate);
      attempt += 1;
      candidate = path.join(parentDir, `${baseName}-${attempt}${extension}`);
    } catch {
      return candidate;
    }
  }
}

async function applyFolderOrganizationPlan(rootPath: string, actions: LocalFilePlanAction[]): Promise<LocalFileApplyResult> {
  const root = await ensurePathAllowed(rootPath);
  let applied = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const action of actions) {
    try {
      const fromPath = path.resolve(root, normalizeRelativePath(action.fromPath));
      const toPath = path.resolve(root, normalizeRelativePath(action.toPath));
      if (!isPathInside(root, fromPath) || !isPathInside(root, toPath)) {
        throw new Error('Paths must remain inside working folder.');
      }
      if (isHiddenOrBlockedPath(path.relative(root, toPath))) {
        throw new Error('Target path is hidden or blocked.');
      }

      await assertTargetPathAllowed(root, toPath, 'Target path must remain inside working folder.');
      const finalDestination = await uniqueDestinationPath(toPath);
      await fs.mkdir(path.dirname(finalDestination), { recursive: true });
      await fs.rename(fromPath, finalDestination);
      applied += 1;
    } catch (error) {
      skipped += 1;
      errors.push(error instanceof Error ? error.message : 'Unknown organize plan error.');
    }
  }

  return { applied, skipped, errors };
}

export async function registerLocalExplorer(rootPath: string): Promise<LocalExplorerSelection> {
  const normalizedRoot = await ensurePathAllowed(rootPath);
  const explorerId = crypto.randomUUID();
  localExplorerRoots.set(explorerId, normalizedRoot);
  return {
    explorerId,
    rootPath: normalizedRoot,
  };
}

export async function requireLocalExplorerRoot(explorerId: string): Promise<string> {
  const rootPath = localExplorerRoots.get(explorerId.trim());
  if (!rootPath) {
    throw new Error('The selected folder is no longer authorized in this session. Re-select it before continuing.');
  }
  return ensurePathAllowed(rootPath);
}

async function writeFileInFolder(
  rootPath: string,
  relativePath: string,
  content: string,
  options?: { overwrite?: boolean },
): Promise<LocalFileCreateResult> {
  const root = await ensurePathAllowed(rootPath);
  const normalizedRelativePath = normalizeRelativePath(relativePath);
  if (!normalizedRelativePath) throw new Error('A relative file path is required.');
  if (isHiddenOrBlockedPath(normalizedRelativePath)) throw new Error('Hidden or protected paths are blocked.');

  const resolvedTargetPath = path.resolve(root, normalizedRelativePath);
  if (!isPathInside(root, resolvedTargetPath)) {
    throw new Error('Path must remain inside working folder.');
  }
  await assertTargetPathAllowed(root, resolvedTargetPath, 'Path must remain inside working folder.');

  let created = false;
  try {
    await fs.access(resolvedTargetPath);
    if (!options?.overwrite) {
      throw new Error('File already exists. Set overwrite to true to replace it.');
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
      created = true;
    } else if (!options?.overwrite) {
      throw error;
    }
  }

  await fs.mkdir(path.dirname(resolvedTargetPath), { recursive: true });
  await fs.writeFile(resolvedTargetPath, content, 'utf8');
  return {
    filePath: resolvedTargetPath,
    created: created || Boolean(options?.overwrite),
  };
}

export async function readFileInFolder(rootPath: string, relativePath: string): Promise<LocalFileReadResult> {
  const root = await ensurePathAllowed(rootPath);
  const normalizedRelativePath = normalizeRelativePath(relativePath);
  if (!normalizedRelativePath) throw new Error('A relative file path is required.');
  if (isHiddenOrBlockedPath(normalizedRelativePath)) throw new Error('Hidden or protected paths are blocked.');

  const resolvedTargetPath = path.resolve(root, normalizedRelativePath);
  if (!isPathInside(root, resolvedTargetPath)) {
    throw new Error('Path must remain inside working folder.');
  }
  await assertTargetPathAllowed(root, resolvedTargetPath, 'Path must remain inside working folder.');

  const stats = await fs.stat(resolvedTargetPath);
  if (!stats.isFile()) {
    throw new Error('Target path is not a file.');
  }
  if (stats.size > MAX_READ_FILE_BYTES) {
    throw new Error(`File exceeds the ${MAX_READ_FILE_BYTES} byte read limit.`);
  }

  return {
    filePath: resolvedTargetPath,
    content: await fs.readFile(resolvedTargetPath, 'utf8'),
  };
}

async function appendFileInFolder(rootPath: string, relativePath: string, content: string): Promise<LocalFileAppendResult> {
  const root = await ensurePathAllowed(rootPath);
  const normalizedRelativePath = normalizeRelativePath(relativePath);
  if (!normalizedRelativePath) throw new Error('A relative file path is required.');
  if (isHiddenOrBlockedPath(normalizedRelativePath)) throw new Error('Hidden or protected paths are blocked.');

  const resolvedTargetPath = path.resolve(root, normalizedRelativePath);
  if (!isPathInside(root, resolvedTargetPath)) {
    throw new Error('Path must remain inside working folder.');
  }
  await assertTargetPathAllowed(root, resolvedTargetPath, 'Path must remain inside working folder.');

  await fs.mkdir(path.dirname(resolvedTargetPath), { recursive: true });
  await fs.appendFile(resolvedTargetPath, content, 'utf8');
  return {
    filePath: resolvedTargetPath,
    appended: true,
    bytesAppended: Buffer.byteLength(content, 'utf8'),
  };
}

export async function listDirInFolder(rootPath: string, relativePath?: string): Promise<LocalFileListResult> {
  const root = await ensurePathAllowed(rootPath);
  const normalizedRelativePath = normalizeRelativePath(relativePath ?? '');
  const resolvedTargetPath = normalizedRelativePath ? path.resolve(root, normalizedRelativePath) : root;
  if (resolvedTargetPath !== root && !isPathInside(root, resolvedTargetPath)) {
    throw new Error('Path must remain inside working folder.');
  }
  await assertTargetPathAllowed(root, resolvedTargetPath, 'Path must remain inside working folder.');

  const stats = await fs.stat(resolvedTargetPath);
  if (!stats.isDirectory()) {
    throw new Error('Target path is not a directory.');
  }

  const entries = await fs.readdir(resolvedTargetPath, { withFileTypes: true });
  const items: LocalFileListItem[] = [];
  for (const entry of entries) {
    if (items.length >= MAX_LIST_DIR_ITEMS) {
      break;
    }
    if (isHiddenOrBlockedPath(entry.name)) {
      continue;
    }
    const entryPath = path.join(resolvedTargetPath, entry.name);
    const entryStat = await fs.stat(entryPath);
    items.push({
      path: normalizedRelativePath ? `${normalizedRelativePath}/${entry.name}`.replaceAll('\\', '/') : entry.name,
      kind: entry.isDirectory() ? 'directory' : 'file',
      size: entry.isDirectory() ? undefined : entryStat.size,
      modifiedMs: entryStat.mtimeMs,
    });
  }

  return {
    rootPath: root,
    items,
    truncated: entries.length > items.length,
  };
}

export async function existsInFolder(rootPath: string, relativePath: string): Promise<LocalFileExistsResult> {
  const root = await ensurePathAllowed(rootPath);
  const normalizedRelativePath = normalizeRelativePath(relativePath);
  if (!normalizedRelativePath) throw new Error('A relative path is required.');
  if (isHiddenOrBlockedPath(normalizedRelativePath)) throw new Error('Hidden or protected paths are blocked.');

  const resolvedTargetPath = path.resolve(root, normalizedRelativePath);
  if (!isPathInside(root, resolvedTargetPath)) {
    throw new Error('Path must remain inside working folder.');
  }
  await assertTargetPathAllowed(root, resolvedTargetPath, 'Path must remain inside working folder.');

  try {
    const stat = await fs.stat(resolvedTargetPath);
    return {
      path: resolvedTargetPath,
      exists: true,
      kind: stat.isDirectory() ? 'directory' : 'file',
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
      return {
        path: resolvedTargetPath,
        exists: false,
        kind: 'none',
      };
    }
    throw error;
  }
}

async function renameInFolder(rootPath: string, oldRelative: string, newRelative: string): Promise<LocalFileRenameResult> {
  const root = await ensurePathAllowed(rootPath);
  const normalizedOld = normalizeRelativePath(oldRelative);
  const normalizedNew = normalizeRelativePath(newRelative);
  if (!normalizedOld || !normalizedNew) throw new Error('Both source and target paths are required.');
  if (isHiddenOrBlockedPath(normalizedOld) || isHiddenOrBlockedPath(normalizedNew)) throw new Error('Hidden or protected paths are blocked.');

  const resolvedOld = path.resolve(root, normalizedOld);
  const resolvedNew = path.resolve(root, normalizedNew);
  if (!isPathInside(root, resolvedOld) || !isPathInside(root, resolvedNew)) throw new Error('Paths must remain inside working folder.');
  await assertTargetPathAllowed(root, resolvedOld, 'Path must remain inside working folder.');
  await assertTargetPathAllowed(root, resolvedNew, 'Path must remain inside working folder.');
  await fs.mkdir(path.dirname(resolvedNew), { recursive: true });
  await fs.rename(resolvedOld, resolvedNew);
  return {
    oldPath: resolvedOld,
    newPath: resolvedNew,
    renamed: true,
  };
}

async function deleteInFolder(rootPath: string, relativePath: string): Promise<LocalFileDeleteResult> {
  const root = await ensurePathAllowed(rootPath);
  const normalizedRelativePath = normalizeRelativePath(relativePath);
  if (!normalizedRelativePath) throw new Error('A relative path is required.');
  if (isHiddenOrBlockedPath(normalizedRelativePath)) throw new Error('Hidden or protected paths are blocked.');

  const resolved = path.resolve(root, normalizedRelativePath);
  if (!isPathInside(root, resolved)) throw new Error('Path must remain inside working folder.');
  await assertTargetPathAllowed(root, resolved, 'Path must remain inside working folder.');
  await fs.rm(resolved, { recursive: true, force: false });
  return {
    path: resolved,
    deleted: true,
  };
}

export async function statInFolder(rootPath: string, relativePath: string): Promise<LocalFileStatResult> {
  const root = await ensurePathAllowed(rootPath);
  const normalizedRelativePath = normalizeRelativePath(relativePath);
  const resolved = normalizedRelativePath ? path.resolve(root, normalizedRelativePath) : root;
  if (resolved !== root && !isPathInside(root, resolved)) throw new Error('Path must remain inside working folder.');
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

export function isPathWithinRegisteredExplorerRoots(targetPath: string): boolean {
  const resolved = path.resolve(targetPath);
  return Array.from(localExplorerRoots.values()).some((rootPath) => {
    const resolvedRoot = path.resolve(rootPath);
    return resolved === resolvedRoot || isPathInside(resolvedRoot, resolved);
  });
}

async function openLocalPath(targetPath: string): Promise<{ ok: boolean; error?: string }> {
  const normalized = typeof targetPath === 'string' ? targetPath.trim() : '';
  if (!normalized) {
    throw new Error('A path is required.');
  }

  const resolved = path.resolve(normalized);
  await fs.access(resolved);

  if (!isPathWithinRegisteredExplorerRoots(resolved)) {
    throw new Error('Target path must be inside a currently selected local folder.');
  }

  const openError = await shell.openPath(resolved);
  if (openError) {
    return { ok: false, error: openError };
  }

  return { ok: true };
}

export function registerLocalFileIpcHandlers(ipcMain: IpcMain): void {
  ipcMain.handle('local:downloads-path', () => app.getPath('downloads'));
  ipcMain.handle('local:authorize-folder-e2e', async (_event, rootPath: string) => registerLocalExplorer(rootPath));
  ipcMain.handle('local:select-folder', async (_event, initialPath?: string) => {
    const result = await dialog.showOpenDialog({
      title: 'Choose your working folder',
      properties: ['openDirectory', 'createDirectory'],
      defaultPath: initialPath && initialPath.trim() ? initialPath : app.getPath('documents'),
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    return registerLocalExplorer(result.filePaths[0]);
  });
  ipcMain.handle('local:plan-organize-folder', async (_event, explorerId: string) => {
    const rootPath = await requireLocalExplorerRoot(explorerId);
    return planFolderOrganization(rootPath);
  });
  ipcMain.handle('local:apply-organize-folder-plan', async (_event, payload: { explorerId: string; actions: LocalFilePlanAction[] }) => {
    const { explorerId, actions } = payload;
    const rootPath = await requireLocalExplorerRoot(explorerId);
    return applyFolderOrganizationPlan(rootPath, actions);
  });
  ipcMain.handle('local:create-file-in-folder', async (_event, payload: { explorerId: string; relativePath: string; content: string; overwrite?: boolean }) => {
    const { explorerId, relativePath, content, overwrite } = payload;
    const rootPath = await requireLocalExplorerRoot(explorerId);
    return writeFileInFolder(rootPath, relativePath, content, { overwrite });
  });
  ipcMain.handle('local:append-file-in-folder', async (_event, payload: { explorerId: string; relativePath: string; content: string }) => {
    const { explorerId, relativePath, content } = payload;
    const rootPath = await requireLocalExplorerRoot(explorerId);
    return appendFileInFolder(rootPath, relativePath, content);
  });
  ipcMain.handle('local:read-file-in-folder', async (_event, payload: { explorerId: string; relativePath: string }) => {
    const { explorerId, relativePath } = payload;
    const rootPath = await requireLocalExplorerRoot(explorerId);
    return readFileInFolder(rootPath, relativePath);
  });
  ipcMain.handle('local:list-dir-in-folder', async (_event, payload: { explorerId: string; relativePath?: string }) => {
    const { explorerId, relativePath } = payload;
    const rootPath = await requireLocalExplorerRoot(explorerId);
    return listDirInFolder(rootPath, relativePath);
  });
  ipcMain.handle('local:exists-in-folder', async (_event, payload: { explorerId: string; relativePath: string }) => {
    const { explorerId, relativePath } = payload;
    const rootPath = await requireLocalExplorerRoot(explorerId);
    return existsInFolder(rootPath, relativePath);
  });
  ipcMain.handle('local:rename-in-folder', async (_event, payload: { explorerId: string; oldRelative: string; newRelative: string }) => {
    const { explorerId, oldRelative, newRelative } = payload;
    const rootPath = await requireLocalExplorerRoot(explorerId);
    return renameInFolder(rootPath, oldRelative, newRelative);
  });
  ipcMain.handle('local:delete-in-folder', async (_event, payload: { explorerId: string; relativePath: string }) => {
    const { explorerId, relativePath } = payload;
    const rootPath = await requireLocalExplorerRoot(explorerId);
    return deleteInFolder(rootPath, relativePath);
  });
  ipcMain.handle('local:stat-in-folder', async (_event, payload: { explorerId: string; relativePath: string }) => {
    const { explorerId, relativePath } = payload;
    const rootPath = await requireLocalExplorerRoot(explorerId);
    return statInFolder(rootPath, relativePath);
  });
  ipcMain.handle('local:open-path', async (_event, payload: { targetPath: string }) => {
    return openLocalPath(payload.targetPath);
  });
}
