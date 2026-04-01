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
        return bridge.sendInternalChat(${JSON.stringify(coworkSessionKey)}, 'Inspect the current project and capture root metadata before planning the next migration step.');
      })()`);

      const continuation = await callBridge(`(async () => {
        const bridge = window.cloffice ?? window.relay;
        return bridge.continueInternalCoworkRun({
          sessionKey: ${JSON.stringify(coworkSessionKey)},
          runId: ${JSON.stringify('bridge-test-run-1')},
          rootPath: ${JSON.stringify(process.cwd())},
          approvedActions: [
            { id: 'inspect-project', type: 'list_dir', path: '.' },
            { id: 'inspect-root-metadata', type: 'stat', path: '.' },
          ],
          rejectedActions: [],
        });
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
        continuation,
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

    expect(result.cowork.engineActionPhase).toBe('awaiting_approval');
    expect(result.cowork.engineActionMode).toBe('read-only');
    expect(result.cowork.requestedActions?.[0]?.type).toBe('list_dir');
    expect(result.cowork.requestedActions?.[1]?.type).toBe('stat');
    expect(result.cowork.assistantMessage.text).toContain('Internal cowork foundation response.');

    expect(result.continuation.engineActionPhase).toBe('completed');
    expect(result.continuation.execution.previews.some((entry: string) => entry.includes('Listed: .'))).toBe(true);
    expect(result.continuation.execution.previews.some((entry: string) => entry.includes('Stat: .'))).toBe(true);
  });

  test('internal cowork normalization probes classify structured normalized and fallback output', async () => {
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

      return {
        structured: await callBridge(`(async () => {
          const bridge = window.cloffice ?? window.relay;
          return bridge.debugNormalizeInternalCoworkResponse({
            phase: 'planning',
            task: 'Inspect the project root and decide the next migration step.',
            rawText: [
              'Goal: Inspect the project root and decide the next migration step.',
              '',
              'Plan: Review the top-level layout, identify the active migration boundary, and choose the smallest next code change.',
              '',
              'Needed context: Read-only inspection of the project root and package entry points.',
              '',
              'Next step: Request a root listing and package metadata before making the recommendation.'
            ].join('\\n'),
            requestedActions: [{ id: 'a1', type: 'list_dir', path: '.' }],
          });
        })()`),
        normalized: await callBridge(`(async () => {
          const bridge = window.cloffice ?? window.relay;
          return bridge.debugNormalizeInternalCoworkResponse({
            phase: 'continuation',
            rawText: [
              '## Findings',
              'The root contains Electron, renderer, and schedule-related code paths.',
              '',
              '**Recommendation:** Keep the next change focused on runtime-owned scheduler cleanup.',
              '',
              '- Next step: Review the scheduler controller and remove the next legacy branch.'
            ].join('\\n'),
            execution: {
              receipts: [],
              previews: ['Listed: .\\n[file] package.json'],
              errors: [],
            },
            requestedActions: [],
          });
        })()`),
        fallback: await callBridge(`(async () => {
          const bridge = window.cloffice ?? window.relay;
          return bridge.debugNormalizeInternalCoworkResponse({
            phase: 'continuation',
            rawText: 'Looks fine overall. Keep going.',
            execution: {
              receipts: [],
              previews: [],
              errors: [],
            },
            requestedActions: [],
          });
        })()`),
      };
    });

    expect(result.structured.phase).toBe('planning');
    expect(result.structured.normalization).toBe('provider_structured');
    expect(result.structured.text).toContain('Goal:');
    expect(result.structured.text).toContain('Needed context:');

    expect(result.normalized.phase).toBe('continuation');
    expect(result.normalized.normalization).toBe('normalized_sections');
    expect(result.normalized.text).toContain('Findings:');
    expect(result.normalized.text).toContain('Recommendation:');

    expect(result.fallback.phase).toBe('continuation');
    expect(result.fallback.normalization).toBe('synthetic_fallback');
    expect(result.fallback.text).toContain('Findings:');
    expect(result.fallback.text).toContain('Recommendation:');
  });
});
