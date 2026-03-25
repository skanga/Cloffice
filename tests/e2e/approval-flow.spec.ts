import { _electron as electron, expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';

const ONBOARDING_COMPLETE_KEY = 'relay.onboarding.complete';
const USAGE_MODE_KEY = 'relay.usage.mode';
const RELAY_RECENTS_KEY = 'relay.recents.v1';
const COWORK_PROJECTS_KEY = 'relay.cowork.projects.v1';
const COWORK_ACTIVE_PROJECT_KEY = 'relay.cowork.projects.active.v1';
const USE_REAL_GATEWAY = process.env.RELAY_E2E_REAL_GATEWAY === '1';

test.describe.configure({ timeout: USE_REAL_GATEWAY ? 180000 : 120000 });

async function sendCoworkPrompt(page: Page, prompt: string) {
  await page.getByPlaceholder('How can I help you today?').fill(prompt);
  await page.getByLabel('Send task').click();
}

async function waitForFirstApproval(page: Page, timeout = 20000) {
  const approvalCard = page.locator('[data-testid^="pending-approval-"]').first();
  await expect(approvalCard).toBeVisible({ timeout });

  const approvalTestIdAttr = (await approvalCard.getAttribute('data-testid')) || '';
  const approvalId = approvalTestIdAttr.replace('pending-approval-', '');
  expect(approvalId).not.toBe('');

  return { approvalCard, approvalId };
}

async function ensureE2ESafetyPolicy(page: Page) {
  await page.evaluate(() => {
    const raw = localStorage.getItem('relay.safety.scopes');
    if (!raw) {
      return;
    }

    try {
      const scopes = JSON.parse(raw) as Array<{
        id: string;
        enabled: boolean;
        requiresApproval: boolean;
      }>;

      const next = scopes.map((scope) => {
        if (scope.id === 'file-modify' || scope.id === 'file-create') {
          return {
            ...scope,
            enabled: true,
            requiresApproval: true,
          };
        }
        return scope;
      });

      localStorage.setItem('relay.safety.scopes', JSON.stringify(next));
    } catch {
      // Ignore malformed stored safety policy; app defaults will apply.
    }
  });
}

async function seedActiveE2EProject(page: Page) {
  await page.evaluate(async ([projectsKey, activeKey]) => {
    const bridge = window.relay;
    const downloadsPath = (await bridge?.getDownloadsPath?.()) || '/Downloads';
    const now = Date.now();
    const project = {
      id: 'e2e-project-default',
      name: 'E2E Default Project',
      workspaceFolder: downloadsPath,
      createdAt: now,
      updatedAt: now,
    };

    localStorage.setItem(projectsKey, JSON.stringify([project]));
    localStorage.setItem(activeKey, project.id);
  }, [COWORK_PROJECTS_KEY, COWORK_ACTIVE_PROJECT_KEY]);
}

test.describe('Cowork approval flow', () => {
  let app: ElectronApplication;
  let window: Page;

  test.beforeEach(async () => {
    app = await electron.launch({
      args: ['.'],
    });

    window = await app.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    await window.evaluate(([onboardingKey, usageModeKey, recentsKey]) => {
      localStorage.setItem(onboardingKey, 'true');
      localStorage.setItem(usageModeKey, 'guest');
      localStorage.removeItem(recentsKey);
      sessionStorage.clear();
    }, [ONBOARDING_COMPLETE_KEY, USAGE_MODE_KEY, RELAY_RECENTS_KEY]);

    await window.reload();
    await window.waitForLoadState('domcontentloaded');

    if (!USE_REAL_GATEWAY) {
      await window.evaluate(async () => {
        if (!window.relay?.saveConfig) {
          return;
        }

        await window.relay.saveConfig({
          gatewayUrl: 'ws://127.0.0.1:18789',
          gatewayToken: '',
        });
      });

      await window.reload();
      await window.waitForLoadState('domcontentloaded');
      await seedActiveE2EProject(window);
      await window.reload();
      await window.waitForLoadState('domcontentloaded');
      await ensureE2ESafetyPolicy(window);
    } else {
      await window.evaluate(async () => {
        if (!window.relay?.saveConfig) {
          return;
        }

        const raw = localStorage.getItem('relay.config');
        if (!raw) {
          return;
        }

        try {
          const parsed = JSON.parse(raw) as { gatewayUrl?: string; gatewayToken?: string };
          const gatewayUrl = typeof parsed.gatewayUrl === 'string' ? parsed.gatewayUrl.trim() : '';
          const gatewayToken = typeof parsed.gatewayToken === 'string' ? parsed.gatewayToken : '';
          if (!gatewayUrl) {
            return;
          }

          await window.relay.saveConfig({
            gatewayUrl,
            gatewayToken,
          });
        } catch {
          // Ignore malformed local fallback config.
        }
      });

      await window.reload();
      await window.waitForLoadState('domcontentloaded');
      await seedActiveE2EProject(window);
      await window.reload();
      await window.waitForLoadState('domcontentloaded');
      await ensureE2ESafetyPolicy(window);
    }
  });

  test.afterEach(async () => {
    await app.close();
  });

  if (USE_REAL_GATEWAY) {
    test('real gateway: operator can approve a live relay_actions request', async () => {
      await window.getByPlaceholder('How can I help you today?').fill(
        'Return ONLY one JSON code block with relay_actions containing exactly one append_file action for path relay-e2e/mock-approval.txt and content "line from real gateway". No prose.',
      );
      await window.getByLabel('Send task').click();

      const { approvalCard, approvalId } = await waitForFirstApproval(window, 90000);

      await window.getByTestId(`pending-approval-approve-${approvalId}`).click();
      await expect(approvalCard).toHaveCount(0);

      await expect(window.getByText('append_file • ok')).toBeVisible({ timeout: 45000 });
    });
  } else {
    test('mock gateway: operator can reject then approve requests from live chat events', async () => {
      await sendCoworkPrompt(
        window,
        'Run 1: Return one relay_actions append_file action for relay-e2e/mock-approval.txt with content "line from run 1".',
      );

      const { approvalCard, approvalId } = await waitForFirstApproval(window);

      const rejectReason = window.getByTestId(`pending-approval-reason-${approvalId}`);
      const rejectButton = window.getByTestId(`pending-approval-reject-${approvalId}`);
      await rejectReason.fill('Operator rejected via E2E');
      await expect(rejectButton).toBeEnabled();
      await rejectButton.click();
      await expect(approvalCard).toHaveCount(0);
      await expect(window.getByText('append_file • error')).toBeVisible();

      await sendCoworkPrompt(
        window,
        'Run 2: Return one relay_actions append_file action for relay-e2e/mock-approval.txt with content "line from run 2".',
      );

      const { approvalCard: approvalCard2, approvalId: approvalId2 } = await waitForFirstApproval(window);
      await window.getByTestId(`pending-approval-approve-${approvalId2}`).click();
      await expect(approvalCard2).toHaveCount(0);
      await expect(window.getByText('append_file • ok')).toBeVisible();
    });

    test('mock gateway: reject stays disabled until reason is provided and approved action writes file content', async () => {
      await sendCoworkPrompt(
        window,
        'Run 3: Return one relay_actions append_file action for relay-e2e/mock-approval.txt with content "line from run 3".',
      );

      const { approvalCard, approvalId } = await waitForFirstApproval(window);
      const rejectButton = window.getByTestId(`pending-approval-reject-${approvalId}`);
      await expect(rejectButton).toBeDisabled();

      await window.getByTestId(`pending-approval-approve-${approvalId}`).click();
      await expect(approvalCard).toHaveCount(0);
      await expect(window.getByText('append_file • ok')).toBeVisible();

      const fileContent = await window.evaluate(async () => {
        const bridge = window.relay;
        if (!bridge?.getDownloadsPath || !bridge.readFileInFolder) {
          return '';
        }

        const root = await bridge.getDownloadsPath();
        const read = await bridge.readFileInFolder(root, 'relay-e2e/mock-approval.txt');
        return read.content;
      });

      expect(fileContent).toContain('line from mock gateway');
    });

    test('mock gateway: disabled file-modify policy blocks append without approval card', async () => {
      await window.evaluate(() => {
        const raw = localStorage.getItem('relay.safety.scopes');
        if (!raw) {
          return;
        }

        const scopes = JSON.parse(raw) as Array<{
          id: string;
          enabled: boolean;
          requiresApproval: boolean;
        }>;

        const next = scopes.map((scope) =>
          scope.id === 'file-modify'
            ? {
                ...scope,
                enabled: false,
                requiresApproval: false,
              }
            : scope,
        );

        localStorage.setItem('relay.safety.scopes', JSON.stringify(next));
      });

      await sendCoworkPrompt(
        window,
        'Run 4: Return one relay_actions append_file action for relay-e2e/mock-approval.txt with content "line from run 4".',
      );

      await expect(window.locator('[data-testid^="pending-approval-"]')).toHaveCount(0, { timeout: 12000 });
      await expect(window.getByText('append_file • error')).toBeVisible({ timeout: 20000 });
    });
  }
});
