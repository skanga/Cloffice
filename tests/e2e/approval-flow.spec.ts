import { _electron as electron, expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';

const ONBOARDING_COMPLETE_KEY = 'cloffice.onboarding.complete';
const USAGE_MODE_KEY = 'cloffice.usage.mode';
const CLOFFICE_RECENTS_KEY = 'cloffice.recents.v1';
const COWORK_PROJECTS_KEY = 'cloffice.cowork.projects.v1';
const COWORK_ACTIVE_PROJECT_KEY = 'cloffice.cowork.projects.active.v1';
const USE_REAL_RUNTIME = process.env.CLOFFICE_E2E_REAL_RUNTIME === '1';

test.describe.configure({ timeout: USE_REAL_RUNTIME ? 180000 : 120000 });

function pendingApprovalCards(page: Page) {
  return page.getByTestId(/^pending-approval-(?!s-card$)(?!approve-)(?!reject-)(?!reason-).+/);
}

async function sendCoworkPrompt(page: Page, prompt: string) {
  await page.getByPlaceholder('How can I help you today?').fill(prompt);

  const sendButton = page.getByLabel('Send task');
  if (await sendButton.isDisabled()) {
    const firstProject = page.locator('[data-testid^="project-select-"]').first();
    if (await firstProject.count()) {
      await firstProject.click();
    }
  }

  await sendButton.click();
}

async function waitForFirstApproval(page: Page, timeout = 20000) {
  const approvalCard = pendingApprovalCards(page).first();
  await expect(approvalCard).toBeVisible({ timeout });

  const approvalTestIdAttr = (await approvalCard.getAttribute('data-testid')) || '';
  const approvalId = approvalTestIdAttr.replace('pending-approval-', '');
  expect(approvalId).not.toBe('');

  return { approvalCard, approvalId };
}

async function ensureE2ESafetyPolicy(page: Page) {
  await page.evaluate(() => {
    const raw = localStorage.getItem('cloffice.safety.scopes');
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

      localStorage.setItem('cloffice.safety.scopes', JSON.stringify(next));
    } catch {
      // Ignore malformed stored safety policy; app defaults will apply.
    }
  });
}

async function seedActiveE2EProject(page: Page) {
  await page.evaluate(async ([projectsKey, activeKey]) => {
    const bridge = window.cloffice;
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
  let page: Page;

  test.beforeEach(async () => {
    app = await electron.launch({
      args: ['.'],
    });

    page = await app.firstWindow();
    await page.waitForLoadState('domcontentloaded');

    await page.evaluate(([onboardingKey, usageModeKey, recentsKey]) => {
      localStorage.setItem(onboardingKey, 'true');
      localStorage.setItem(usageModeKey, 'guest');
      localStorage.removeItem(recentsKey);
      sessionStorage.clear();
    }, [ONBOARDING_COMPLETE_KEY, USAGE_MODE_KEY, CLOFFICE_RECENTS_KEY]);

    await page.reload();
    await page.waitForLoadState('domcontentloaded');

    if (!USE_REAL_RUNTIME) {
      await page.evaluate(async () => {
        if (!window.cloffice?.saveConfig) {
          return;
        }

        await window.cloffice.saveConfig({
          internalRuntimeDebug: {
            endpointUrl: 'ws://127.0.0.1:18789',
          },
        });
      });

      await page.reload();
      await page.waitForLoadState('domcontentloaded');
      await seedActiveE2EProject(page);
      await page.reload();
      await page.waitForLoadState('domcontentloaded');
      await ensureE2ESafetyPolicy(page);
    } else {
      await page.evaluate(async () => {
        if (!window.cloffice?.saveConfig) {
          return;
        }

        const raw = localStorage.getItem('cloffice.config');
        if (!raw) {
          return;
        }

        try {
          const parsed = JSON.parse(raw) as {
            internalRuntimeDebug?: {
              endpointUrl?: string;
              accessToken?: string;
            };
          };
          const endpointUrl = typeof parsed.internalRuntimeDebug?.endpointUrl === 'string'
            ? parsed.internalRuntimeDebug.endpointUrl.trim()
            : '';
          const accessToken = typeof parsed.internalRuntimeDebug?.accessToken === 'string'
            ? parsed.internalRuntimeDebug.accessToken
            : '';
          if (!endpointUrl) {
            return;
          }

          await window.cloffice.saveConfig({
            internalRuntimeDebug: {
              endpointUrl,
              ...(accessToken ? { accessToken } : {}),
            },
          });
        } catch {
          // Ignore malformed local fallback config.
        }
      });

      await page.reload();
      await page.waitForLoadState('domcontentloaded');
      await seedActiveE2EProject(page);
      await page.reload();
      await page.waitForLoadState('domcontentloaded');
      await ensureE2ESafetyPolicy(page);
    }
  });

  test.afterEach(async () => {
    await app.close();
  });

  if (USE_REAL_RUNTIME) {
    test('real runtime: operator can approve a live engine_actions request', async () => {
      await page.getByPlaceholder('How can I help you today?').fill(
        'Return ONLY one JSON code block with engine_actions containing exactly one append_file action for path cloffice-e2e/mock-approval.txt and content "line from real runtime". No prose.',
      );
      await page.getByLabel('Send task').click();

      const { approvalCard, approvalId } = await waitForFirstApproval(page, 90000);

      await page.getByTestId(`pending-approval-approve-${approvalId}`).click();
      await expect(approvalCard).toHaveCount(0);

      await expect(page.getByText(/Done\.\s+append_file\s+.*mock-approval\.txt/i)).toBeVisible({ timeout: 45000 });
    });
  } else {
    test('mock runtime: operator can reject then approve requests from live chat events', async () => {
      await sendCoworkPrompt(
        page,
        'Run 1: Return one engine_actions append_file action for cloffice-e2e/mock-approval.txt with content "line from run 1".',
      );

      const { approvalCard, approvalId } = await waitForFirstApproval(page);

      const rejectReason = page.getByTestId(`pending-approval-reason-${approvalId}`);
      const rejectButton = page.getByTestId(`pending-approval-reject-${approvalId}`);
      await rejectReason.fill('Operator rejected via E2E');
      await expect(rejectButton).toBeEnabled();
      await rejectButton.click();
      await expect(approvalCard).toHaveCount(0);
      await expect(page.getByText(/Failed\.\s+append_file\s+.*mock-approval\.txt/i)).toBeVisible();

      await sendCoworkPrompt(
        page,
        'Run 2: Return one engine_actions append_file action for cloffice-e2e/mock-approval.txt with content "line from run 2".',
      );

      const { approvalCard: approvalCard2, approvalId: approvalId2 } = await waitForFirstApproval(page);
      await page.getByTestId(`pending-approval-approve-${approvalId2}`).click();
      await expect(approvalCard2).toHaveCount(0);
      await expect(page.getByText(/Done\.\s+append_file\s+.*mock-approval\.txt/i)).toBeVisible();
    });

    test('mock runtime: reject stays disabled until reason is provided and approved action writes file content', async () => {
      await sendCoworkPrompt(
        page,
        'Run 3: Return one engine_actions append_file action for cloffice-e2e/mock-approval.txt with content "line from run 3".',
      );

      const { approvalCard, approvalId } = await waitForFirstApproval(page);
      const rejectButton = page.getByTestId(`pending-approval-reject-${approvalId}`);
      await expect(rejectButton).toBeDisabled();

      await page.getByTestId(`pending-approval-approve-${approvalId}`).click();
      await expect(approvalCard).toHaveCount(0);
      await expect(page.getByText(/Done\.\s+append_file\s+.*mock-approval\.txt/i)).toBeVisible();

      const fileContent = await page.evaluate(async () => {
        const bridge = window.cloffice;
        if (!bridge?.getDownloadsPath || !bridge.readFileInFolder) {
          return '';
        }

        const root = await bridge.getDownloadsPath();
        const read = await bridge.readFileInFolder(root, 'cloffice-e2e/mock-approval.txt');
        return read.content;
      });

      expect(fileContent).toContain('line from run 3');
    });

    test('mock runtime: disabled file-modify policy blocks append without approval card', async () => {
      await page.evaluate(() => {
        const activeProjectId = (localStorage.getItem('cloffice.cowork.projects.active.v1') || '').trim();
        const scopedKey = activeProjectId ? `cloffice.safety.scopes.project.${activeProjectId}` : 'cloffice.safety.scopes';
        const raw =
          localStorage.getItem(scopedKey) ||
          localStorage.getItem('cloffice.safety.scopes');

        const scopes = (raw ? JSON.parse(raw) : []) as Array<{
          id: string;
          name?: string;
          description?: string;
          riskLevel?: 'low' | 'medium' | 'high' | 'critical';
          enabled: boolean;
          requiresApproval: boolean;
        }>;

        let next = scopes.map((scope) =>
          scope.id === 'file-modify'
            ? {
                ...scope,
                enabled: false,
                requiresApproval: false,
              }
            : scope,
        );

        if (!next.some((scope) => scope.id === 'file-modify')) {
          next = [
            ...next,
            {
              id: 'file-modify',
              name: 'Modify files',
              description: 'Agent can modify existing files',
              riskLevel: 'medium',
              enabled: false,
              requiresApproval: false,
            },
          ];
        }

        localStorage.setItem('cloffice.safety.scopes', JSON.stringify(next));
        if (activeProjectId) {
          localStorage.setItem(scopedKey, JSON.stringify(next));
        }
      });

      await sendCoworkPrompt(
        page,
        'Run 4: Return one engine_actions append_file action for cloffice-e2e/mock-approval.txt with content "line from run 4".',
      );

      await expect(pendingApprovalCards(page)).toHaveCount(0, { timeout: 12000 });
      await expect(page.getByText(/Failed\.\s+append_file\s+.*mock-approval\.txt/i)).toBeVisible({ timeout: 20000 });
    });
  }
});



