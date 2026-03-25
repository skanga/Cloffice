import { _electron as electron, expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';

const ONBOARDING_COMPLETE_KEY = 'relay.onboarding.complete';
const USAGE_MODE_KEY = 'relay.usage.mode';
const RELAY_RECENTS_KEY = 'relay.recents.v1';
const COWORK_PROJECTS_KEY = 'relay.cowork.projects.v1';
const COWORK_ACTIVE_PROJECT_KEY = 'relay.cowork.projects.active.v1';
const USE_REAL_GATEWAY = process.env.RELAY_E2E_REAL_GATEWAY === '1';

test.describe.configure({ timeout: 120000 });

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

test.describe('Cowork project runtime rules', () => {
  let app: ElectronApplication;
  let window: Page;

  test.beforeEach(async () => {
    test.skip(USE_REAL_GATEWAY, 'Project context suite runs against mock gateway only.');

    app = await electron.launch({
      args: ['.'],
    });

    window = await app.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    await window.evaluate(([onboardingKey, usageModeKey, recentsKey, projectsKey, activeProjectKey]) => {
      localStorage.setItem(onboardingKey, 'true');
      localStorage.setItem(usageModeKey, 'guest');
      localStorage.removeItem(recentsKey);
      localStorage.removeItem(projectsKey);
      localStorage.removeItem(activeProjectKey);
      sessionStorage.clear();
    }, [ONBOARDING_COMPLETE_KEY, USAGE_MODE_KEY, RELAY_RECENTS_KEY, COWORK_PROJECTS_KEY, COWORK_ACTIVE_PROJECT_KEY]);

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
    await ensureE2ESafetyPolicy(window);
  });

  test.afterEach(async () => {
    await app.close();
  });

  test('write action is blocked when no active project context exists', async () => {
    await window.getByPlaceholder('How can I help you today?').fill(
      'Return one relay_actions append_file action for relay-e2e/mock-approval.txt with content "no project".',
    );
    await window.getByLabel('Send task').click();

    await expect(window.locator('[data-testid^="pending-approval-"]')).toHaveCount(0, { timeout: 12000 });
    await expect(window.getByText('append_file • error')).toBeVisible({ timeout: 20000 });
  });

  test('run keeps its original project root when active project changes mid-run', async () => {
    const roots = await window.evaluate(async () => {
      const bridge = window.relay;
      if (!bridge?.getDownloadsPath || !bridge.createFileInFolder) {
        throw new Error('Desktop bridge is unavailable for project test setup.');
      }

      const downloads = await bridge.getDownloadsPath();
      const projectARoot = `${downloads}${downloads.endsWith('\\') ? '' : '\\'}relay-e2e-project-a`;
      const projectBRoot = `${downloads}${downloads.endsWith('\\') ? '' : '\\'}relay-e2e-project-b`;

      await bridge.createFileInFolder(downloads, 'relay-e2e-project-a/seed.txt', 'seed', true);
      await bridge.createFileInFolder(downloads, 'relay-e2e-project-b/seed.txt', 'seed', true);

      return {
        projectARoot,
        projectBRoot,
      };
    });

    const now = Date.now();
    await window.evaluate(([projectsKey, activeProjectKey, projectARoot, projectBRoot, nowValue]) => {
      const projects = [
        {
          id: 'e2e-project-a',
          name: 'E2E Project A',
          workspaceFolder: projectARoot,
          createdAt: nowValue,
          updatedAt: nowValue,
        },
        {
          id: 'e2e-project-b',
          name: 'E2E Project B',
          workspaceFolder: projectBRoot,
          createdAt: nowValue,
          updatedAt: nowValue,
        },
      ];

      localStorage.setItem(projectsKey, JSON.stringify(projects));
      localStorage.setItem(activeProjectKey, 'e2e-project-a');
    }, [COWORK_PROJECTS_KEY, COWORK_ACTIVE_PROJECT_KEY, roots.projectARoot, roots.projectBRoot, now]);

    await window.reload();
    await window.waitForLoadState('domcontentloaded');

    await window.getByPlaceholder('How can I help you today?').fill(
      'DELAY_LONG Return one relay_actions append_file action for relay-e2e/mock-approval.txt with content "run uses project A snapshot".',
    );
    await window.getByLabel('Send task').click();

    await window.getByRole('button', { name: 'E2E Project B' }).click();

    const approvalCard = window.locator('[data-testid^="pending-approval-"]').first();
    await expect(approvalCard).toBeVisible({ timeout: 25000 });

    const approvalTestIdAttr = (await approvalCard.getAttribute('data-testid')) || '';
    const approvalId = approvalTestIdAttr.replace('pending-approval-', '');
    await window.getByTestId(`pending-approval-approve-${approvalId}`).click();

    await expect(window.getByText('append_file • ok')).toBeVisible({ timeout: 30000 });

    const fileLocations = await window.evaluate(async ({ projectARoot, projectBRoot }) => {
      const bridge = window.relay;
      if (!bridge?.existsInFolder) {
        throw new Error('Desktop bridge is unavailable for verification.');
      }

      const relPath = 'relay-e2e/mock-approval.txt';
      const inA = await bridge.existsInFolder(projectARoot, relPath);
      const inB = await bridge.existsInFolder(projectBRoot, relPath);

      return {
        inA: inA.exists,
        inB: inB.exists,
      };
    }, roots);

    expect(fileLocations.inA).toBeTruthy();
    expect(fileLocations.inB).toBeFalsy();
  });
});
