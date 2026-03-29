import { _electron as electron, expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';

test.describe('Internal engine development path', () => {
  let app: ElectronApplication;
  let page: Page;

  test.beforeEach(async () => {
    app = await electron.launch({
      args: ['.'],
      env: {
        ...process.env,
        CLOFFICE_ENABLE_INTERNAL_ENGINE: '1',
      },
    });

    page = await app.firstWindow();
    await page.waitForLoadState('domcontentloaded');
  });

  test.afterEach(async () => {
    await app.close();
  });

  test('desktop bridge supports internal session-aware chat semantics', async () => {
    const runtimeInfoBeforeConnect = await page.evaluate(async () => window.cloffice?.getInternalEngineRuntimeInfo?.());
    expect(runtimeInfoBeforeConnect?.readiness).toBe('idle');
    expect(runtimeInfoBeforeConnect?.connected).toBe(false);

    await page.evaluate(async () => {
      await window.cloffice?.connectInternalEngine?.({
        endpointUrl: 'internal://dev-runtime',
      });
    });

    const sessionKey = await page.evaluate(async () => window.cloffice?.createInternalChatSession?.());
    expect(sessionKey).toMatch(/^internal:chat:/);

    const models = await page.evaluate(async () => window.cloffice?.listInternalModels?.());
    expect(models?.map((model: { value: string }) => model.value)).toEqual(
      expect.arrayContaining(['internal/dev-echo', 'internal/dev-brief', 'internal/dev-planner']),
    );

    await page.evaluate(async ([key]) => {
      await window.cloffice?.setInternalSessionModel?.(key, 'internal/dev-planner');
    }, [sessionKey]);

    const plannerResult = await page.evaluate(async ([key]) => (
      window.cloffice?.sendInternalChat?.(key, 'Plan a careful rollout for the internal engine development path.')
    ), [sessionKey]);

    expect(plannerResult?.model).toBe('internal/dev-planner');
    expect(plannerResult?.assistantMessage?.text).toContain('1. Clarify the immediate objective');
    expect(plannerResult?.sessionTitle).toContain('Plan:');

    const historyAfterPlanner = await page.evaluate(async ([key]) => window.cloffice?.getInternalHistory?.(key, 10), [sessionKey]);
    expect(historyAfterPlanner?.some((message: { role: string; text: string }) => (
      message.role === 'system' && message.text.includes('Planner mode active')
    ))).toBe(true);

    await page.evaluate(async ([key]) => {
      await window.cloffice?.setInternalSessionModel?.(key, 'internal/dev-brief');
    }, [sessionKey]);

    const briefResult = await page.evaluate(async ([key]) => (
      window.cloffice?.sendInternalChat?.(key, 'Summarize the current runtime state in one compact response.')
    ), [sessionKey]);

    expect(briefResult?.model).toBe('internal/dev-brief');
    expect(briefResult?.assistantMessage?.text).toContain('Internal brief response.');

    const historyAfterSwitch = await page.evaluate(async ([key]) => window.cloffice?.getInternalHistory?.(key, 20), [sessionKey]);
    expect(historyAfterSwitch?.some((message: { role: string; text: string }) => (
      message.role === 'system' && message.text.includes('Mode switched to Internal Dev Brief')
    ))).toBe(true);

    const runtimeInfoAfterChat = await page.evaluate(async () => window.cloffice?.getInternalEngineRuntimeInfo?.());
    expect(runtimeInfoAfterChat?.connected).toBe(true);
    expect(runtimeInfoAfterChat?.readiness).toBe('ready');
    expect(runtimeInfoAfterChat?.activeSessionKey).toBe(sessionKey);
    expect(runtimeInfoAfterChat?.sessionCount).toBeGreaterThan(0);

    await page.evaluate(async () => {
      await window.cloffice?.disconnectInternalEngine?.();
    });
  });
});
