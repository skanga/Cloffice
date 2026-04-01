import { getDesktopBridge } from './desktop-bridge';
/**
 * Unified file service abstraction.
 *
 * Routes file operations to either the local Electron desktop bridge (`window.cloffice`)
 * or the runtime `workspace.*` RPC surface, depending on
 * the mode selected at construction time.
 *
 * Cloffice can still route through runtime `workspace.*` methods when the workspace
 * root is remote or abstracted behind the engine layer.
 * The agent's file tools (read, write, edit, apply_patch) are agent-side tools
 * invoked by the AI model during chat — they cannot be called directly by operator
 * clients. `tools.catalog` (operator.read scope) returns the available tool list
 * for discovery.  When `workspace.*` RPCs fail, we surface the tool catalog so the
 * UI can show what the agent *can* do and guide the user.
 */

import type { EngineClientInstance } from './engine-client';
import type { EngineToolEntry } from './engine-runtime-types';
import type { LocalFileListItem } from '@/app-types';

/* ═══════════════════════════════════════════ Types ═══════════════════════════════════════════ */

export type FileListResult = {
  items: LocalFileListItem[];
  truncated: boolean;
};

export type FileStatResult = {
  kind: 'file' | 'directory';
  size: number;
  createdMs: number;
  modifiedMs: number;
};

export type FileReadResult = {
  content: string;
};

export type FileServiceMode = 'local' | 'remote';

/* ═══════════════════════════════════════ Interface ═══════════════════════════════════════ */

export interface FileService {
  readonly mode: FileServiceMode;
  listDir(rootPathOrEmpty: string, relativePath?: string): Promise<FileListResult>;
  readFile(rootPathOrEmpty: string, relativePath: string): Promise<FileReadResult>;
  stat(rootPathOrEmpty: string, relativePath: string): Promise<FileStatResult>;
  rename(rootPathOrEmpty: string, oldRelPath: string, newRelPath: string): Promise<void>;
  deleteFile(rootPathOrEmpty: string, relativePath: string): Promise<void>;
  createFile(rootPathOrEmpty: string, relativePath: string, content: string): Promise<void>;
  /** Returns the agent's available tools from `tools.catalog`, or null if not applicable. */
  fetchToolsCatalog(): Promise<EngineToolEntry[] | null>;
  /** Checks if the agent has filesystem tools (group:fs). */
  hasFileTools(): Promise<boolean>;
}

/* ═══════════════════════════════════════ Local ═══════════════════════════════════════ */

/**
 * Uses the Electron desktop bridge (`window.cloffice`) for local filesystem operations.
 */
export class LocalFileService implements FileService {
  readonly mode: FileServiceMode = 'local';

  async listDir(rootPath: string, relativePath?: string): Promise<FileListResult> {
    const bridge = getDesktopBridge();
    if (!bridge) throw new Error('Desktop bridge not available.');
    const result = await bridge.listDirInFolder(rootPath, relativePath);
    return { items: result.items, truncated: result.truncated };
  }

  async readFile(rootPath: string, relativePath: string): Promise<FileReadResult> {
    const bridge = getDesktopBridge();
    if (!bridge) throw new Error('Desktop bridge not available.');
    const result = await bridge.readFileInFolder(rootPath, relativePath);
    return { content: result.content };
  }

  async stat(rootPath: string, relativePath: string): Promise<FileStatResult> {
    const bridge = getDesktopBridge();
    if (!bridge) throw new Error('Desktop bridge not available.');
    return bridge.statInFolder(rootPath, relativePath);
  }

  async rename(rootPath: string, oldRelPath: string, newRelPath: string): Promise<void> {
    const bridge = getDesktopBridge();
    if (!bridge) throw new Error('Desktop bridge not available.');
    await bridge.renameInFolder(rootPath, oldRelPath, newRelPath);
  }

  async deleteFile(rootPath: string, relativePath: string): Promise<void> {
    const bridge = getDesktopBridge();
    if (!bridge) throw new Error('Desktop bridge not available.');
    await bridge.deleteInFolder(rootPath, relativePath);
  }

  async createFile(rootPath: string, relativePath: string, content: string): Promise<void> {
    const bridge = getDesktopBridge();
    if (!bridge) throw new Error('Desktop bridge not available.');
    await bridge.createFileInFolder(rootPath, relativePath, content);
  }

  async fetchToolsCatalog(): Promise<EngineToolEntry[] | null> {
    return null; // Local mode — not applicable
  }

  async hasFileTools(): Promise<boolean> {
    return true; // Local mode always has full filesystem access
  }
}

/* ═══════════════════════════════════════ Remote ═══════════════════════════════════════ */

/**
 * Uses the current runtime `workspace.*` RPC methods for remote file operations.
 * The `rootPath` parameter is ignored — the remote agent's workspace root is implicit.
 */
export class WorkspaceRpcUnsupportedError extends Error {
  constructor(method: string) {
    super(`The current runtime does not support "${method}" yet. Compatibility plugin or engine update required.`);
    this.name = 'WorkspaceRpcUnsupportedError';
  }
}

function isUnsupportedMethodError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { message?: string; code?: string };
  const msg = (e.message ?? '').toLowerCase();
  const code = (e.code ?? '').toLowerCase();
  return msg.includes('unknown method') || msg.includes('not found') || msg.includes('not implemented')
    || code === 'method_not_found' || code === 'unknown_method' || code === 'not_implemented';
}

/**
 * Wraps the runtime RPC call with detection for unsupported `workspace.*` methods.
 * Throws `WorkspaceRpcUnsupportedError` when the server doesn't implement the method.
 */
async function guardedCall<T>(method: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (isUnsupportedMethodError(err)) {
      throw new WorkspaceRpcUnsupportedError(method);
    }
    throw err;
  }
}

export class RemoteFileService implements FileService {
  readonly mode: FileServiceMode = 'remote';

  constructor(private runtimeClient: EngineClientInstance) {}

  async listDir(_rootPath: string, relativePath?: string): Promise<FileListResult> {
    return guardedCall('workspace.list', () => this.runtimeClient.listWorkspaceFiles(relativePath));
  }

  async readFile(_rootPath: string, relativePath: string): Promise<FileReadResult> {
    return guardedCall('workspace.read', () => this.runtimeClient.readWorkspaceFile(relativePath));
  }

  async stat(_rootPath: string, relativePath: string): Promise<FileStatResult> {
    return guardedCall('workspace.stat', () => this.runtimeClient.statWorkspaceFile(relativePath));
  }

  async rename(_rootPath: string, oldRelPath: string, newRelPath: string): Promise<void> {
    await guardedCall('workspace.rename', () => this.runtimeClient.renameWorkspaceFile(oldRelPath, newRelPath));
  }

  async deleteFile(_rootPath: string, relativePath: string): Promise<void> {
    await guardedCall('workspace.delete', () => this.runtimeClient.deleteWorkspaceFile(relativePath));
  }

  async createFile(_rootPath: string, relativePath: string, content: string): Promise<void> {
    await guardedCall('workspace.write', () => this.runtimeClient.writeWorkspaceFile(relativePath, content));
  }

  private _cachedTools: EngineToolEntry[] | null = null;

  async fetchToolsCatalog(): Promise<EngineToolEntry[] | null> {
    if (this._cachedTools) return this._cachedTools;
    try {
      const catalog = await this.runtimeClient.fetchToolsCatalog();
      this._cachedTools = catalog.tools;
      return this._cachedTools;
    } catch {
      return null;
    }
  }

  async hasFileTools(): Promise<boolean> {
    const tools = await this.fetchToolsCatalog();
    if (!tools) return false;
    const FS_TOOLS = ['read', 'write', 'edit', 'apply_patch'];
    return tools.some((t) => FS_TOOLS.includes(t.name));
  }
}

/* ═══════════════════════════════════════ Factory ═══════════════════════════════════════ */

/**
 * Select the appropriate file service based on whether the current runtime endpoint points to
 * localhost (local mode) or a remote host.
 *
 * When the Electron bridge is available and the runtime endpoint is local (or not
 * connected), we use the local filesystem. When the runtime points to a
 * remote host, we route through the runtime `workspace.*` RPCs.
 */
export function createFileService(
  engine: EngineClientInstance | null,
  engineUrl: string,
  desktopBridgeAvailable: boolean,
): FileService {
  const isRemote = engineUrl ? isRemoteUrl(engineUrl) : false;

  // Remote mode: use engine RPC
  if (isRemote && engine) {
    return new RemoteFileService(engine);
  }

  // Local mode: use Electron bridge
  if (desktopBridgeAvailable) {
    return new LocalFileService();
  }

  // Fallback — if the engine is available at all, try remote
  if (engine) {
    return new RemoteFileService(engine);
  }

  // Nothing available
  return new LocalFileService();
}

function isRemoteUrl(url: string): boolean {
  try {
    const normalized = url
      .trim()
      .replace(/^ws:\/\//, 'http://')
      .replace(/^wss:\/\//, 'https://');
    const parsed = new URL(normalized);
    const host = parsed.hostname.toLowerCase();
    return host !== 'localhost' && host !== '127.0.0.1' && host !== '::1' && host !== '[::1]';
  } catch {
    return false;
  }
}






