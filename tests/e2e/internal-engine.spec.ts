import { _electron as electron, expect, test } from '@playwright/test';
import type { ElectronApplication } from '@playwright/test';

test.describe('Internal engine development path', () => {
  let app: ElectronApplication;

  test.beforeEach(async () => {
    app = await electron.launch({
      args: ['.'],
      env: {
        ...process.env,
        CLOFFICE_ENABLE_INTERNAL_ENGINE: '1',
      },
    });
  });

  test.afterEach(async () => {
    await app.close();
  });

  test('renderer main world exposes internal runtime bridge and cowork action metadata', async () => {
    const result = await app.evaluate(async ({ BrowserWindow }) => {
      const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
      let win = null as BrowserWindow | null;
      const startedAt = Date.now();

      while (!win && Date.now() - startedAt < 60_000) {
        win = BrowserWindow.getAllWindows().find((candidate) => candidate.webContents.getURL().includes('localhost:5173')) ?? null;
        if (!win) {
          await sleep(500);
        }
      }

      if (!win) {
        throw new Error('renderer window not found');
      }

      const waitForBridge = async () => {
        const bridgeStartedAt = Date.now();
        while (Date.now() - bridgeStartedAt < 60_000) {
          const hasBridge = await win!.webContents.executeJavaScript('Boolean(window.cloffice || window.relay)', true);
          if (hasBridge) {
            return;
          }
          await sleep(500);
        }
        throw new Error('desktop bridge did not appear in renderer main world');
      };

      await waitForBridge();

      const callBridge = (expression: string) => win!.webContents.executeJavaScript(expression, true);

      const before = await callBridge(`(async () => {
        const bridge = window.cloffice ?? window.relay;
        return bridge.getInternalEngineRuntimeInfo();
      })()`);

      await callBridge(`(async () => {
        const bridge = window.cloffice ?? window.relay;
        await bridge.connectInternalEngine({ endpointUrl: 'internal://dev-runtime' });
      })()`);

      const chatSessionKey = await callBridge(`(async () => {
        const bridge = window.cloffice ?? window.relay;
        return bridge.createInternalChatSession();
      })()`);

      const coworkSessionKey = await callBridge(`(async () => {
        const bridge = window.cloffice ?? window.relay;
        return bridge.createInternalCoworkSession();
      })()`);

      await callBridge(`(async () => {
        const bridge = window.cloffice ?? window.relay;
        await bridge.setInternalSessionModel(${JSON.stringify(chatSessionKey)}, 'internal/dev-planner');
      })()`);

      const planner = await callBridge(`(async () => {
        const bridge = window.cloffice ?? window.relay;
        return bridge.sendInternalChat(${JSON.stringify(chatSessionKey)}, 'Plan a careful rollout for the internal engine development path.');
      })()`);

      const cowork = await callBridge(`(async () => {
        const bridge = window.cloffice ?? window.relay;
        return bridge.sendInternalChat(${JSON.stringify(coworkSessionKey)}, 'Inspect the current project before planning the next migration step.');
      })()`);

      const after = await callBridge(`(async () => {
        const bridge = window.cloffice ?? window.relay;
        return bridge.getInternalEngineRuntimeInfo();
      })()`);

      await callBridge(`(async () => {
        const bridge = window.cloffice ?? window.relay;
        await bridge.disconnectInternalEngine();
      })()`);

      return {
        before,
        after,
        chatSessionKey,
        coworkSessionKey,
        planner,
        cowork,
      };
    });

    expect(result.before.readiness).toBe('idle');
    expect(result.before.connected).toBe(false);
    expect(result.after.readiness).toBe('ready');
    expect(result.after.connected).toBe(true);
    expect(result.chatSessionKey).toMatch(/^internal:chat:/);
    expect(result.coworkSessionKey).toMatch(/^internal:cowork:/);
    expect(result.after.activeSessionKey).toBe(result.coworkSessionKey);

    expect(result.planner.model).toBe('internal/dev-planner');
    expect(result.planner.assistantMessage.text).toContain('1. Clarify the immediate objective');

    expect(result.cowork.engineActionPhase).toBe('approval_required');
    expect(result.cowork.engineActionMode).toBe('read-only');
    expect(result.cowork.requestedActions?.[0]?.type).toBe('list_dir');
    expect(result.cowork.assistantMessage.text).toContain('Internal cowork foundation response.');
  });
});
