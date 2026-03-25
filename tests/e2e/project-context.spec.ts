import { _electron as electron, expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';

const ONBOARDING_COMPLETE_KEY = 'relay.onboarding.complete';
const USAGE_MODE_KEY = 'relay.usage.mode';
const RELAY_RECENTS_KEY = 'relay.recents.v1';
const COWORK_PROJECTS_KEY = 'relay.cowork.projects.v1';
const COWORK_ACTIVE_PROJECT_KEY = 'relay.cowork.projects.active.v1';
const USE_REAL_GATEWAY = process.env.RELAY_E2E_REAL_GATEWAY === '1';

test.describe.configure({ timeout: 120000 });

async function sendCoworkPrompt(page: Page, prompt: string) {
  await page.getByPlaceholder('How can I help you today?').fill(prompt);
  await page.getByLabel('Send task').click();
}

async function waitForFirstApproval(page: Page, timeout = 25000) {
  const approvalCard = page.locator('[data-testid^="pending-approval-"]').first();
  await expect(approvalCard).toBeVisible({ timeout });

  const approvalTestIdAttr = (await approvalCard.getAttribute('data-testid')) || '';
  const approvalId = approvalTestIdAttr.replace('pending-approval-', '');
  expect(approvalId).not.toBe('');

  return { approvalCard, approvalId };
}

async function approveFirstPendingAction(page: Page, timeout = 25000) {
  const { approvalCard, approvalId } = await waitForFirstApproval(page, timeout);
  await page.getByTestId(`pending-approval-approve-${approvalId}`).click();
  await expect(approvalCard).toHaveCount(0);
}

async function createProjectFromSidebar(page: Page, project: { title: string; description: string; rootFolder: string }) {
  await page.getByTitle('Add project').click();
  await page.getByPlaceholder('Project title (example: Client Alpha Website)').fill(project.title);
  await page
    .getByPlaceholder('Description (optional: goals, owner, constraints)')
    .fill(project.description);
  await page
    .getByPlaceholder('Workspace folder path (example: C:/Projects/client-alpha)')
    .fill(project.rootFolder);
  await page.getByRole('button', { name: 'Create project' }).click();
  await expect(page.locator('button[data-slot="sidebar-menu-button"]', { hasText: project.title })).toBeVisible();
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

    await window.getByTestId('project-select-e2e-project-b').click();

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

  test('traversal path is blocked with PROJECT_BOUNDARY_BLOCK and no approval card', async () => {
    const root = await window.evaluate(async () => {
      const bridge = window.relay;
      if (!bridge?.getDownloadsPath || !bridge.createFileInFolder) {
        throw new Error('Desktop bridge is unavailable for project setup.');
      }

      const downloads = await bridge.getDownloadsPath();
      const workspaceRoot = `${downloads}${downloads.endsWith('\\') ? '' : '\\'}relay-e2e-traversal-root`;
      await bridge.createFileInFolder(downloads, 'relay-e2e-traversal-root/seed.txt', 'seed', true);
      return {
        workspaceRoot,
        downloads,
      };
    });

    const now = Date.now();
    await window.evaluate(([projectsKey, activeProjectKey, workspaceRoot, nowValue]) => {
      const projects = [
        {
          id: 'e2e-project-traversal',
          name: 'E2E Traversal Guard',
          workspaceFolder: workspaceRoot,
          createdAt: nowValue,
          updatedAt: nowValue,
        },
      ];

      localStorage.setItem(projectsKey, JSON.stringify(projects));
      localStorage.setItem(activeProjectKey, 'e2e-project-traversal');
    }, [COWORK_PROJECTS_KEY, COWORK_ACTIVE_PROJECT_KEY, root.workspaceRoot, now]);

    await window.reload();
    await window.waitForLoadState('domcontentloaded');

    await sendCoworkPrompt(
      window,
      'Return one relay_actions append_file action for ../relay-e2e-traversal-leak.txt with content "must be blocked".',
    );

    await expect(window.locator('[data-testid^="pending-approval-"]')).toHaveCount(0, { timeout: 12000 });
    await expect(window.getByText('append_file • error')).toBeVisible({ timeout: 20000 });
    await expect(window.getByText('PROJECT_BOUNDARY_BLOCK')).toBeVisible({ timeout: 20000 });

    const escapedExists = await window.evaluate(async (downloadsRoot) => {
      const bridge = window.relay;
      if (!bridge?.existsInFolder) {
        throw new Error('Desktop bridge is unavailable for verification.');
      }

      const result = await bridge.existsInFolder(downloadsRoot, 'relay-e2e-traversal-leak.txt');
      return result.exists;
    }, root.downloads);

    expect(escapedExists).toBeFalsy();
  });

  test('realistic flow: create a docs-maintenance project from sidebar and execute an approved write', async () => {
    const workspaceRoot = await window.evaluate(async () => {
      const bridge = window.relay;
      if (!bridge?.getDownloadsPath || !bridge.createFileInFolder) {
        throw new Error('Desktop bridge is unavailable for realistic project setup.');
      }

      const downloads = await bridge.getDownloadsPath();
      const root = `${downloads}${downloads.endsWith('\\') ? '' : '\\'}relay-docs-maintenance`;
      await bridge.createFileInFolder(downloads, 'relay-docs-maintenance/README.md', '# Docs Maintenance\n', true);
      return root;
    });

    await createProjectFromSidebar(window, {
      title: 'Relay Docs Maintenance',
      description: 'Maintain release notes and operational docs for Relay.',
      rootFolder: workspaceRoot,
    });

    await sendCoworkPrompt(
      window,
      'Return one relay_actions append_file action for relay-e2e/mock-approval.txt with content "docs maintenance run".',
    );

    const { approvalCard } = await waitForFirstApproval(window);
    await expect(approvalCard.getByText('Project: Relay Docs Maintenance')).toBeVisible();

    await approveFirstPendingAction(window);

    await expect(window.getByText('append_file • ok')).toBeVisible({ timeout: 30000 });

    const result = await window.evaluate(async (root) => {
      const bridge = window.relay;
      if (!bridge?.existsInFolder || !bridge.readFileInFolder) {
        throw new Error('Desktop bridge is unavailable for verification.');
      }

      const relPath = 'relay-e2e/mock-approval.txt';
      const exists = await bridge.existsInFolder(root, relPath);
      const content = exists.exists ? (await bridge.readFileInFolder(root, relPath)).content : '';

      return {
        exists: exists.exists,
        content,
      };
    }, workspaceRoot);

    expect(result.exists).toBeTruthy();
    expect(result.content).toContain('docs maintenance run');
  });

  test('realistic flow: two projects stay isolated across approved writes', async () => {
    const roots = await window.evaluate(async () => {
      const bridge = window.relay;
      if (!bridge?.getDownloadsPath || !bridge.createFileInFolder) {
        throw new Error('Desktop bridge is unavailable for realistic isolation setup.');
      }

      const downloads = await bridge.getDownloadsPath();
      const runTag = Date.now();
      const docsFolderName = `relay-client-docs-ops-${runTag}`;
      const supportFolderName = `relay-client-support-ops-${runTag}`;
      const docsRoot = `${downloads}${downloads.endsWith('\\') ? '' : '\\'}${docsFolderName}`;
      const supportRoot = `${downloads}${downloads.endsWith('\\') ? '' : '\\'}${supportFolderName}`;

      await bridge.createFileInFolder(downloads, `${docsFolderName}/README.md`, '# Docs Ops\n', true);
      await bridge.createFileInFolder(downloads, `${supportFolderName}/README.md`, '# Support Ops\n', true);

      return {
        docsRoot,
        supportRoot,
      };
    });

    await createProjectFromSidebar(window, {
      title: 'Client Docs Ops',
      description: 'Maintain deliverables and release documentation.',
      rootFolder: roots.docsRoot,
    });

    await createProjectFromSidebar(window, {
      title: 'Client Support Ops',
      description: 'Maintain support playbooks and escalation docs.',
      rootFolder: roots.supportRoot,
    });

    await window.locator('button[data-slot="sidebar-menu-button"]', { hasText: 'Client Docs Ops' }).click();
    await sendCoworkPrompt(
      window,
      'Return one relay_actions append_file action for relay-e2e/mock-approval.txt with content "docs project write".',
    );
    await approveFirstPendingAction(window);
    await expect(window.getByText('append_file • ok')).toBeVisible({ timeout: 30000 });

    const afterFirstWrite = await window.evaluate(async ({ docsRoot, supportRoot }) => {
      const bridge = window.relay;
      if (!bridge?.existsInFolder) {
        throw new Error('Desktop bridge is unavailable for verification.');
      }

      const relPath = 'relay-e2e/mock-approval.txt';
      const docs = await bridge.existsInFolder(docsRoot, relPath);
      const support = await bridge.existsInFolder(supportRoot, relPath);
      return {
        docs: docs.exists,
        support: support.exists,
      };
    }, roots);

    expect(afterFirstWrite.docs).toBeTruthy();
    expect(afterFirstWrite.support).toBeFalsy();

    await window.locator('button[data-slot="sidebar-menu-button"]', { hasText: 'Client Support Ops' }).click();
    await sendCoworkPrompt(
      window,
      'Return one relay_actions append_file action for relay-e2e/mock-approval.txt with content "support project write".',
    );
    await approveFirstPendingAction(window);
    await expect(window.locator('p', { hasText: 'append_file • ok' }).first()).toBeVisible({ timeout: 30000 });

    const afterSecondWrite = await window.evaluate(async ({ docsRoot, supportRoot }) => {
      const bridge = window.relay;
      if (!bridge?.existsInFolder) {
        throw new Error('Desktop bridge is unavailable for verification.');
      }

      const relPath = 'relay-e2e/mock-approval.txt';
      const docs = await bridge.existsInFolder(docsRoot, relPath);
      const support = await bridge.existsInFolder(supportRoot, relPath);
      return {
        docs: docs.exists,
        support: support.exists,
      };
    }, roots);

    expect(afterSecondWrite.docs).toBeTruthy();
    expect(afterSecondWrite.support).toBeTruthy();
  });

  test('projects can be renamed and deleted from sidebar with persistence', async () => {
    const workspaceRoot = await window.evaluate(async () => {
      const bridge = window.relay;
      if (!bridge?.getDownloadsPath || !bridge.createFileInFolder) {
        throw new Error('Desktop bridge is unavailable for rename/delete setup.');
      }

      const downloads = await bridge.getDownloadsPath();
      const root = `${downloads}${downloads.endsWith('\\') ? '' : '\\'}relay-ops-inbox`;
      await bridge.createFileInFolder(downloads, 'relay-ops-inbox/README.md', '# Ops Inbox\n', true);
      return root;
    });

    await createProjectFromSidebar(window, {
      title: 'Ops Inbox',
      description: 'Initial queue workspace.',
      rootFolder: workspaceRoot,
    });

    await window.locator('button[data-slot="sidebar-menu-button"]', { hasText: 'Ops Inbox' }).hover();
    await window.getByTitle('Rename project Ops Inbox').click();
    await window.getByPlaceholder('Project title').fill('Ops Inbox Renamed');
    await window.getByPlaceholder('Description (optional)').fill('Renamed for operations triage.');
    await window.getByTestId('rename-project-confirm').click();

    await expect(window.getByRole('button', { name: /^Ops Inbox Renamed$/, exact: false })).toBeVisible();
    await expect(window.getByRole('button', { name: /^Ops Inbox$/, exact: false })).toHaveCount(0);

    await window.getByRole('button', { name: /^Ops Inbox Renamed$/, exact: false }).hover();
    await window.getByTitle('Delete project Ops Inbox Renamed').click();
    await window.getByTestId('delete-project-confirm').click();

    await expect(window.getByRole('button', { name: /^Ops Inbox Renamed$/, exact: false })).toHaveCount(0);
    await expect(window.getByText('No projects yet')).toBeVisible();

    await window.reload();
    await window.waitForLoadState('domcontentloaded');
    await expect(window.getByText('No projects yet')).toBeVisible();

    const persistedProjects = await window.evaluate((projectsKey) => {
      const raw = localStorage.getItem(projectsKey);
      if (!raw) {
        return [] as Array<{ id: string; name: string }>;
      }
      try {
        return JSON.parse(raw) as Array<{ id: string; name: string }>;
      } catch {
        return [] as Array<{ id: string; name: string }>;
      }
    }, COWORK_PROJECTS_KEY);

    expect(persistedProjects).toHaveLength(0);
  });
});
