import { _electron as electron, expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';

const ONBOARDING_COMPLETE_KEY = 'relay.onboarding.complete';
const USAGE_MODE_KEY = 'relay.usage.mode';
const RELAY_RECENTS_KEY = 'relay.recents.v1';
const COWORK_PROJECTS_KEY = 'relay.cowork.projects.v1';
const COWORK_ACTIVE_PROJECT_KEY = 'relay.cowork.projects.active.v1';
const COWORK_TASKS_KEY = 'relay.cowork.tasks.v1';
const LOCAL_CONFIG_KEY = 'relay.config';

function pendingApprovalCards(page: Page) {
  return page.getByTestId(/^pending-approval-(?!s-card$)(?!approve-)(?!reject-)(?!reason-).+/);
}

async function clearStoredState(page: Page) {
  await page.evaluate(async ([onboardingKey, usageModeKey, recentsKey, projectsKey, activeProjectKey, tasksKey, localConfigKey]) => {
    localStorage.removeItem(onboardingKey);
    localStorage.setItem(usageModeKey, 'guest');
    localStorage.removeItem(recentsKey);
    localStorage.removeItem(projectsKey);
    localStorage.removeItem(activeProjectKey);
    localStorage.removeItem(tasksKey);
    localStorage.removeItem(localConfigKey);
    sessionStorage.clear();

    const bridge = window.cloffice ?? window.relay;
    await bridge?.saveConfig?.({
      gatewayUrl: 'ws://127.0.0.1:65534',
      gatewayToken: '',
    });
    await bridge?.saveEngineConfig?.({
      providerId: 'openclaw-compat',
      runtimeKind: 'openclaw-compat',
      transport: 'websocket-gateway',
      endpointUrl: 'ws://127.0.0.1:65534',
      accessToken: '',
    });
  }, [
    ONBOARDING_COMPLETE_KEY,
    USAGE_MODE_KEY,
    RELAY_RECENTS_KEY,
    COWORK_PROJECTS_KEY,
    COWORK_ACTIVE_PROJECT_KEY,
    COWORK_TASKS_KEY,
    LOCAL_CONFIG_KEY,
  ] as const);
}

async function prepareProjectRoot(page: Page) {
  return page.evaluate(async () => {
    const bridge = window.cloffice ?? window.relay;
    if (!bridge?.getDownloadsPath || !bridge.createFileInFolder) {
      throw new Error('Desktop bridge unavailable for project setup.');
    }

    const downloads = await bridge.getDownloadsPath();
    const folderName = 'cloffice-internal-ui-e2e';
    await bridge.createFileInFolder(downloads, `${folderName}/README.md`, '# Internal UI E2E\n', true);
    return `${downloads}${downloads.endsWith('\\') ? '' : '\\'}${folderName}`;
  });
}

async function createProjectFromSidebar(page: Page, params: { title: string; description: string; rootFolder: string }) {
  await page.getByTitle('Add project').click();
  await page.getByTestId('create-project-mode-existing').click();
  await page.getByPlaceholder('Project name').fill(params.title);
  await page.getByPlaceholder('Project description (what this project is about)').fill(params.description);
  await page.getByPlaceholder('Choose project location').fill(params.rootFolder);
  await page.getByRole('button', { name: 'Create' }).click();
  await expect(page.locator('[data-testid^="project-select-"]', { hasText: params.title })).toBeVisible();
}

async function openProjectCowork(page: Page, projectTitle: string) {
  const openTaskButton = page.getByRole('button', { name: `New task in ${projectTitle}` });
  await expect(openTaskButton).toBeVisible({ timeout: 15000 });
  await openTaskButton.click();
  const promptBox = page.getByRole('textbox', { name: 'Task prompt' }).first();
  if (!(await promptBox.isVisible({ timeout: 3000 }).catch(() => false))) {
    await openTaskButton.click();
  }
  await expect(promptBox).toBeVisible({ timeout: 15000 });
}

async function connectInternalProviderFromOnboarding(page: Page) {
  await expect(page.getByRole('heading', { name: 'Welcome to Cloffice' })).toBeVisible();
  await page.getByRole('button', { name: 'Get started' }).click();

  const onboardingProviderButton = page.getByTestId('onboarding-provider-internal');
  if (await onboardingProviderButton.isVisible({ timeout: 5000 })) {
    await expect(page.getByRole('heading', { name: 'Connect to a runtime' })).toBeVisible();
    await expect(onboardingProviderButton).toBeEnabled({ timeout: 20000 });
    await onboardingProviderButton.click();
    const connectButton = page.locator('form').getByRole('button', { name: 'Connect', exact: true });
    if (await connectButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await connectButton.scrollIntoViewIfNeeded();
      await connectButton.click({ force: true });
    }
    const readyHeading = page.getByRole('heading', { name: "You're all set" });
    if (await readyHeading.isVisible({ timeout: 5000 })) {
      await expect(page.getByText('Internal runtime diagnostics')).toBeVisible();
      return;
    }

    const diagnosticsPanel = page.getByText('Internal runtime diagnostics');
    if (await diagnosticsPanel.isVisible({ timeout: 5000 }).catch(() => false)) {
      await expect(diagnosticsPanel).toBeVisible();
      return;
    }

    await expect(page.getByRole('button', { name: 'Connected' })).toBeVisible({ timeout: 30000 });
    return;
  }

  const openEngineSettings = page.getByRole('button', { name: 'Open Engine Settings' });
  await expect(openEngineSettings).toBeVisible({ timeout: 15000 });
  await openEngineSettings.click();
  const settingsProviderButton = page.getByTestId('settings-provider-internal');
  await expect(settingsProviderButton).toBeVisible();
  await expect(settingsProviderButton).toBeEnabled({ timeout: 20000 });
  await settingsProviderButton.click();
  await page.getByRole('button', { name: 'Save and connect' }).click();
  await expect(page.getByText('Internal runtime diagnostics')).toBeVisible({ timeout: 30000 });
}

async function finishOnboarding(page: Page) {
  const startUsingButton = page.getByRole('button', { name: 'Start using Cloffice' });
  if (await startUsingButton.isVisible({ timeout: 5000 })) {
    await startUsingButton.click();
  }
}

async function markOnboardingComplete(page: Page) {
  await page.evaluate(([onboardingKey, usageModeKey]) => {
    localStorage.setItem(onboardingKey, 'true');
    localStorage.setItem(usageModeKey, 'guest');
  }, [ONBOARDING_COMPLETE_KEY, USAGE_MODE_KEY] as const);
  await page.reload();
  await page.waitForLoadState('domcontentloaded');
}

async function connectInternalProviderFromSettings(page: Page) {
  await expect(page.getByText('Cowork is offline')).toBeVisible({ timeout: 15000 });
  await page.getByRole('button', { name: 'Open Engine Settings' }).click();
  const settingsProviderButton = page.getByTestId('settings-provider-internal');
  await expect(settingsProviderButton).toBeVisible();
  await expect(settingsProviderButton).toBeEnabled({ timeout: 20000 });
  await settingsProviderButton.click();
  await page.getByRole('button', { name: 'Save and connect' }).click();
  await expect(page.getByText('Internal runtime diagnostics')).toBeVisible({ timeout: 30000 });
  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByRole('tab', { name: /cowork/i }).click();
}

async function clearInternalSchedules(page: Page) {
  await page.evaluate(async () => {
    const bridge = window.cloffice ?? window.relay;
    if (!bridge?.connectInternalEngine || !bridge?.listInternalCronJobs || !bridge?.deleteInternalPromptSchedule) {
      throw new Error('Internal schedule bridge unavailable.');
    }
    await bridge.connectInternalEngine({ endpointUrl: 'internal://dev-runtime' });
    const jobs = await bridge.listInternalCronJobs();
    for (const job of jobs) {
      if (typeof job?.id === 'string') {
        await bridge.deleteInternalPromptSchedule(job.id);
      }
    }
  });
}

async function sendCoworkPrompt(page: Page, prompt: string) {
  const promptBox = page.getByRole('textbox', { name: 'Task prompt' }).first();
  await expect(promptBox).toBeVisible();
  await promptBox.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Backspace');
  await page.keyboard.type(prompt);
  await expect(page.getByLabel('Send task')).toBeEnabled();
  await page.getByLabel('Send task').click();
}

async function selectCoworkPlannerModel(page: Page) {
  const modelSelect = page.getByRole('combobox', { name: 'Model' });
  await expect(modelSelect).toBeVisible();
  if (await modelSelect.isEnabled()) {
    await modelSelect.selectOption('internal/dev-planner');
  }
}

async function waitForFirstApproval(page: Page, timeout = 30000) {
  const approvalCard = pendingApprovalCards(page).first();
  await expect(approvalCard).toBeVisible({ timeout });
  const approvalTestIdAttr = (await approvalCard.getAttribute('data-testid')) || '';
  const approvalId = approvalTestIdAttr.replace('pending-approval-', '');
  expect(approvalId).not.toBe('');
  return { approvalCard, approvalId };
}

async function waitForPromptStatus(page: Page, promptTag: string, status: 'running' | 'completed' | 'failed') {
  await expect
    .poll(
      async () =>
        page.evaluate(([tasksKey, tag]) => {
          const raw = localStorage.getItem(tasksKey);
          if (!raw) {
            return null;
          }
          try {
            const parsed = JSON.parse(raw) as Array<{ prompt?: string; status?: string }>;
            const match = parsed.find((entry) => typeof entry.prompt === 'string' && entry.prompt.includes(tag));
            return match?.status ?? null;
          } catch {
            return null;
          }
        }, [COWORK_TASKS_KEY, promptTag] as const),
      { timeout: 45000 },
    )
    .toBe(status);
}

async function openSchedulePage(page: Page) {
  await page.getByRole('button', { name: 'Schedule', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Schedule' })).toBeVisible({ timeout: 15000 });
}

test.describe('Internal engine UI flow', () => {
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
    await clearStoredState(page);
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
  });

  test.afterEach(async () => {
    await app.close();
  });

  test('onboarding can connect the internal runtime in the live UI', async () => {
    await connectInternalProviderFromOnboarding(page);
  });

  test('operator can approve a live cowork read-only action through the internal runtime UI flow', async () => {
    await markOnboardingComplete(page);
    await connectInternalProviderFromSettings(page);
    await expect(page.getByTitle('Add project')).toBeVisible({ timeout: 15000 });

    const rootFolder = await prepareProjectRoot(page);
    await createProjectFromSidebar(page, {
      title: 'Internal UI Project',
      description: 'Exercise the developer-only internal runtime through the live Cloffice UI.',
      rootFolder,
    });
    await openProjectCowork(page, 'Internal UI Project');
    await selectCoworkPlannerModel(page);

    await sendCoworkPrompt(page, 'UI-READ-ONLY-1: Inspect the current project root and capture root metadata before planning the next migration step.');

    const { approvalCard } = await waitForFirstApproval(page);
    await expect(approvalCard).toContainText('List directory .');

    let resolvedApprovals = 0;
    while ((await pendingApprovalCards(page).count()) > 0) {
      const nextApprovalCard = pendingApprovalCards(page).first();
      const previousApprovalText = (await nextApprovalCard.textContent()) || '';
      await nextApprovalCard.getByRole('button', { name: 'Approve' }).click();
      await expect
        .poll(
          async () => {
            const cards = pendingApprovalCards(page);
            const count = await cards.count();
            if (count === 0) {
              return 'cleared';
            }

            const activeApprovalText = (await cards.first().textContent()) || '';
            return activeApprovalText === previousApprovalText ? 'unchanged' : 'advanced';
          },
          { timeout: 15000 },
        )
        .not.toBe('unchanged');
      resolvedApprovals += 1;
      if (resolvedApprovals > 4) {
        throw new Error('Unexpected number of internal cowork approvals.');
      }
    }
    expect(resolvedApprovals).toBeGreaterThanOrEqual(2);

    await waitForPromptStatus(page, 'UI-READ-ONLY-1', 'running');
    await expect(page.getByRole('button', { name: 'Listed: .' })).toBeVisible({ timeout: 30000 });
    await waitForPromptStatus(page, 'UI-READ-ONLY-1', 'completed');
  });

  test('operator can pause resume retime and delete an internal schedule through the UI', async () => {
    await markOnboardingComplete(page);
    await connectInternalProviderFromSettings(page);
    await clearInternalSchedules(page);
    const rootFolder = await prepareProjectRoot(page);
    await createProjectFromSidebar(page, {
      title: 'Internal Schedule UI Project',
      description: 'Exercise internal schedule controls through the live UI.',
      rootFolder,
    });
    await openProjectCowork(page, 'Internal Schedule UI Project');

    const createdJob = await page.evaluate(async () => {
      const bridge = window.cloffice ?? window.relay;
      return bridge.createInternalPromptSchedule({
        kind: 'chat',
        name: 'UI schedule controls',
        prompt: 'UI schedule controls prompt.',
        intervalMinutes: 1,
        model: 'internal/dev-brief',
      });
    });

    await openSchedulePage(page);
    await page.getByRole('button', { name: 'Refresh' }).click();

    const jobCard = page.getByTestId(`scheduled-job-${createdJob.id}`);
    await expect(jobCard).toBeVisible({ timeout: 15000 });
    await expect(jobCard).toContainText('UI schedule controls');
    await expect(jobCard).toContainText('every 1 minute');

    await page.getByTestId(`scheduled-job-toggle-${createdJob.id}`).click();
    await expect(jobCard).toContainText('Paused');

    await expect(page.getByTestId(`scheduled-job-toggle-${createdJob.id}`)).toContainText('Resume');
    await page.getByTestId(`scheduled-job-toggle-${createdJob.id}`).click();
    await expect(jobCard).toContainText('Active');

    await page.getByTestId(`scheduled-job-interval-5-${createdJob.id}`).click();
    await expect(jobCard).toContainText('every 5 minutes');

    await page.getByTestId(`scheduled-job-delete-${createdJob.id}`).click();
    await expect(jobCard).toBeHidden({ timeout: 15000 });
  });

  test('scheduled internal cowork run surfaces approval recovery in the live UI', async () => {
    await markOnboardingComplete(page);
    await connectInternalProviderFromSettings(page);
    await clearInternalSchedules(page);
    await expect(page.getByTitle('Add project')).toBeVisible({ timeout: 15000 });

    const rootFolder = await prepareProjectRoot(page);
    await createProjectFromSidebar(page, {
      title: 'Internal Scheduled Project',
      description: 'Exercise scheduled cowork approval recovery through the live UI.',
      rootFolder,
    });
    await openProjectCowork(page, 'Internal Scheduled Project');

    const scheduleName = `UI scheduled cowork ${Date.now()}`;
    await page.evaluate(async ({ name, rootPath }) => {
      const bridge = window.cloffice ?? window.relay;
      const rawProjects = localStorage.getItem('relay.cowork.projects.v1');
      const parsedProjects = rawProjects ? JSON.parse(rawProjects) : [];
      const project = Array.isArray(parsedProjects)
        ? parsedProjects.find((entry) => entry?.name === 'Internal Scheduled Project')
        : null;
      await bridge.createInternalPromptSchedule({
        kind: 'cowork',
        name,
        prompt: 'SCHEDULED-COWORK-1: Inspect the current project root and capture root metadata before planning the next migration step.',
        projectId: project?.id,
        projectTitle: project?.name,
        rootPath,
        intervalMinutes: 1,
        model: 'internal/dev-planner',
      });
    }, { name: scheduleName, rootPath: rootFolder });

    const approvalCard = pendingApprovalCards(page).filter({ hasText: 'List directory .' }).first();
    await expect(approvalCard).toBeVisible({ timeout: 90000 });
    await expect(approvalCard).toContainText('Internal Scheduled Project');
    await expect(page.getByRole('button', { name: 'Approve' }).first()).toBeVisible({ timeout: 30000 });

    await openSchedulePage(page);
    const scheduledJobCard = page.getByTestId(/^scheduled-job-/).filter({ hasText: scheduleName }).first();
    await expect(scheduledJobCard).toBeVisible({ timeout: 15000 });
    await expect(scheduledJobCard).toContainText('Pending approval');
    await expect(scheduledJobCard).toContainText('List directory .');
    await expect(scheduledJobCard.getByTestId(/^scheduled-job-open-pending-run-/)).toBeVisible();
  });

  test('schedule page shows artifact drill-down for a completed internal schedule', async () => {
    await markOnboardingComplete(page);
    await connectInternalProviderFromSettings(page);
    await clearInternalSchedules(page);
    const rootFolder = await prepareProjectRoot(page);
    await createProjectFromSidebar(page, {
      title: 'Internal Schedule Artifact Project',
      description: 'Exercise seeded schedule artifact drill-down rendering through the live UI.',
      rootFolder,
    });

    const seededJob = await page.evaluate(async () => {
      const bridge = window.cloffice ?? window.relay;
      const created = await bridge.createInternalPromptSchedule({
        kind: 'cowork',
        name: 'UI schedule artifact drilldown',
        prompt: 'Seeded artifact drilldown prompt.',
        intervalMinutes: 5,
        model: 'internal/dev-planner',
      });
      if (!bridge.seedInternalScheduleArtifactForE2E) {
        throw new Error('E2E schedule artifact seeding bridge unavailable.');
      }
      await bridge.seedInternalScheduleArtifactForE2E(created.id);
      return created;
    });

    await openSchedulePage(page);
    await page.getByRole('button', { name: 'Refresh' }).click();
    const scheduledJobCard = page.getByTestId(`scheduled-job-${seededJob.id}`);
    await expect(scheduledJobCard).toBeVisible({ timeout: 15000 });
    await expect(scheduledJobCard).toContainText('Last artifact');
    await expect(scheduledJobCard.getByTestId(`scheduled-job-open-artifact-${seededJob.id}`)).toBeVisible();
    await scheduledJobCard.getByTestId(`scheduled-job-toggle-artifact-${seededJob.id}`).click();
    await expect(scheduledJobCard).toContainText('Preview');
  });
});
