import { getDesktopBridge } from './desktop-bridge';
import type { EngineToolEntry } from './engine-runtime-types';
import type { LocalFileListItem } from '@/app-types';

/**
 * Desktop filesystem abstraction backed by the Electron bridge.
 *
 * The live product no longer routes file browsing through external runtime
 * compatibility layers or remote workspace RPC methods.
 */

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

export interface FileService {
  listDir(relativePath?: string): Promise<FileListResult>;
  readFile(relativePath: string): Promise<FileReadResult>;
  stat(relativePath: string): Promise<FileStatResult>;
  rename(oldRelPath: string, newRelPath: string): Promise<void>;
  deleteFile(relativePath: string): Promise<void>;
  createFile(relativePath: string, content: string): Promise<void>;
  fetchToolsCatalog(): Promise<EngineToolEntry[] | null>;
  hasFileTools(): Promise<boolean>;
}

/**
 * Uses the Electron desktop bridge (`window.cloffice`) for local filesystem operations.
 */
export class LocalFileService implements FileService {
  constructor(private readonly explorerId: string) {}

  async listDir(relativePath?: string): Promise<FileListResult> {
    const bridge = getDesktopBridge();
    if (!bridge) throw new Error('Desktop bridge not available.');
    const result = await bridge.listDirInFolder(this.explorerId, relativePath);
    return { items: result.items, truncated: result.truncated };
  }

  async readFile(relativePath: string): Promise<FileReadResult> {
    const bridge = getDesktopBridge();
    if (!bridge) throw new Error('Desktop bridge not available.');
    const result = await bridge.readFileInFolder(this.explorerId, relativePath);
    return { content: result.content };
  }

  async stat(relativePath: string): Promise<FileStatResult> {
    const bridge = getDesktopBridge();
    if (!bridge) throw new Error('Desktop bridge not available.');
    return bridge.statInFolder(this.explorerId, relativePath);
  }

  async rename(oldRelPath: string, newRelPath: string): Promise<void> {
    const bridge = getDesktopBridge();
    if (!bridge) throw new Error('Desktop bridge not available.');
    await bridge.renameInFolder(this.explorerId, oldRelPath, newRelPath);
  }

  async deleteFile(relativePath: string): Promise<void> {
    const bridge = getDesktopBridge();
    if (!bridge) throw new Error('Desktop bridge not available.');
    await bridge.deleteInFolder(this.explorerId, relativePath);
  }

  async createFile(relativePath: string, content: string): Promise<void> {
    const bridge = getDesktopBridge();
    if (!bridge) throw new Error('Desktop bridge not available.');
    await bridge.createFileInFolder(this.explorerId, relativePath, content);
  }

  async fetchToolsCatalog(): Promise<EngineToolEntry[] | null> {
    return null;
  }

  async hasFileTools(): Promise<boolean> {
    return true;
  }
}

export function createFileService(explorerId: string): FileService {
  return new LocalFileService(explorerId);
}
