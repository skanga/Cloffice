import { app, BrowserWindow, Menu, shell, type IpcMain } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { isPathInside } from './local-files.js';

function getTrustedRendererDevOrigin(): string {
  return 'http://localhost:5173';
}

function getTrustedRendererProdRoot(): string {
  return path.join(app.getAppPath(), 'dist');
}

function isTrustedRendererUrl(targetUrl: string, isDev: boolean): boolean {
  try {
    const parsed = new URL(targetUrl);
    if (isDev) {
      return parsed.origin === getTrustedRendererDevOrigin();
    }
    if (parsed.protocol !== 'file:') {
      return false;
    }
    return isPathInside(getTrustedRendererProdRoot(), fileURLToPath(parsed));
  } catch {
    return false;
  }
}

function openExternalUrlIfSafe(url: string): void {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:' || parsed.protocol === 'mailto:') {
      void shell.openExternal(url);
    }
  } catch {
    // ignore malformed urls
  }
}

export async function createAppWindow(params: {
  isDev: boolean;
  delay: (ms: number) => Promise<void>;
}): Promise<BrowserWindow> {
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
  window.webContents.setWindowOpenHandler(({ url }) => {
    openExternalUrlIfSafe(url);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event, url) => {
    if (isTrustedRendererUrl(url, params.isDev)) {
      return;
    }
    event.preventDefault();
    openExternalUrlIfSafe(url);
  });

  if (params.isDev) {
    const devUrl = 'http://localhost:5173';
    let lastError: unknown;

    for (let attempt = 0; attempt < 12; attempt += 1) {
      try {
        await window.loadURL(devUrl);
        window.webContents.openDevTools({ mode: 'detach' });
        return window;
      } catch (error) {
        lastError = error;
        await params.delay(350);
      }
    }

    throw lastError;
  }

  await window.loadFile(path.join(app.getAppPath(), 'dist', 'index.html'));
  return window;
}

export function registerWindowIpcHandlers(ipcMain: IpcMain): void {
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
    return window?.isMaximized() ?? false;
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
        label: window.isMaximized() ? 'Restore' : 'Maximize',
        click: () => {
          if (window.isMaximized()) {
            window.unmaximize();
          } else {
            window.maximize();
          }
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
}
