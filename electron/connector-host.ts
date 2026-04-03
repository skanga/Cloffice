import { spawn } from 'node:child_process';
import path from 'node:path';
import { promises as fs } from 'node:fs';

import type { IpcMain } from 'electron';

import { isPathWithinRegisteredExplorerRoots } from './local-files.js';

type ShellExecResult = {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
};

type WebFetchResult = {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  truncated: boolean;
};

const DEFAULT_SHELL_TIMEOUT_MS = 30_000;
const MAX_SHELL_TIMEOUT_MS = 120_000;
const DEFAULT_WEB_FETCH_TIMEOUT_MS = 30_000;
const MAX_WEB_FETCH_BODY_LENGTH = 100_000;

async function normalizeShellRootPath(rootPath: unknown): Promise<string> {
  const normalized = typeof rootPath === 'string' ? rootPath.trim() : '';
  if (!normalized) {
    throw new Error('Shell working directory is required.');
  }

  const resolved = path.resolve(normalized);
  const stats = await fs.stat(resolved);
  if (!stats.isDirectory()) {
    throw new Error('Shell working directory must be a directory.');
  }

  if (!isPathWithinRegisteredExplorerRoots(resolved)) {
    throw new Error('Shell working directory must be inside a currently selected local folder.');
  }

  return resolved;
}

function normalizeShellCommand(command: unknown): string {
  const normalized = typeof command === 'string' ? command.trim() : '';
  if (!normalized) {
    throw new Error('Shell command is required.');
  }
  return normalized;
}

function normalizeShellTimeout(timeoutMs: unknown): number {
  if (typeof timeoutMs !== 'number' || !Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return DEFAULT_SHELL_TIMEOUT_MS;
  }
  return Math.min(Math.round(timeoutMs), MAX_SHELL_TIMEOUT_MS);
}

async function executeShellCommand(rootPath: string, command: string, timeoutMs: number): Promise<ShellExecResult> {
  return await new Promise<ShellExecResult>((resolve) => {
    const child = spawn(command, {
      cwd: rootPath,
      shell: true,
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';
    let settled = false;
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);

    const finish = (result: ShellExecResult) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };

    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });

    child.on('error', (error) => {
      finish({
        stdout,
        stderr: `${stderr}${stderr ? '\n' : ''}${error.message}`,
        exitCode: null,
        timedOut: false,
      });
    });

    child.on('close', (code) => {
      finish({
        stdout,
        stderr,
        exitCode: typeof code === 'number' ? code : null,
        timedOut,
      });
    });
  });
}

function normalizeWebFetchUrl(url: unknown): string {
  const normalized = typeof url === 'string' ? url.trim() : '';
  if (!normalized) {
    throw new Error('Fetch URL is required.');
  }

  const parsed = new URL(normalized);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Only http/https URLs are allowed, got: ${parsed.protocol}`);
  }

  return parsed.toString();
}

function normalizeWebFetchOptions(options: unknown): {
  method: 'GET' | 'POST';
  headers: Record<string, string>;
  body?: string;
} {
  const record = options && typeof options === 'object' ? options as Record<string, unknown> : {};
  const method = typeof record.method === 'string' && record.method.toUpperCase() === 'POST' ? 'POST' : 'GET';
  const headersRecord = record.headers && typeof record.headers === 'object'
    ? record.headers as Record<string, unknown>
    : {};
  const headers = Object.fromEntries(
    Object.entries(headersRecord).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
  );
  const body = typeof record.body === 'string' ? record.body : undefined;

  return {
    method,
    headers,
    ...(body !== undefined ? { body } : {}),
  };
}

async function executeWebFetch(
  url: string,
  options: {
    method: 'GET' | 'POST';
    headers: Record<string, string>;
    body?: string;
  },
): Promise<WebFetchResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_WEB_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: options.method,
      headers: options.headers,
      ...(options.body !== undefined ? { body: options.body } : {}),
      signal: controller.signal,
    });

    const rawBody = await response.text();
    const truncated = rawBody.length > MAX_WEB_FETCH_BODY_LENGTH;
    const body = truncated ? rawBody.slice(0, MAX_WEB_FETCH_BODY_LENGTH) : rawBody;
    const headers = Object.fromEntries(response.headers.entries());

    return {
      status: response.status,
      statusText: response.statusText,
      headers,
      body,
      truncated,
    };
  } finally {
    clearTimeout(timer);
  }
}

export function registerConnectorHostIpcHandlers(ipcMain: IpcMain): void {
  ipcMain.handle('connector:shell-exec', async (_event, payload: unknown) => {
    const record = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
    const rootPath = await normalizeShellRootPath(record.rootPath);
    const command = normalizeShellCommand(record.command);
    const timeoutMs = normalizeShellTimeout(record.timeoutMs);
    return executeShellCommand(rootPath, command, timeoutMs);
  });

  ipcMain.handle('connector:web-fetch', async (_event, payload: unknown) => {
    const record = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
    const url = normalizeWebFetchUrl(record.url);
    const options = normalizeWebFetchOptions(record.options);
    return executeWebFetch(url, options);
  });
}
