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
      providerId: 'internal',
      runtimeKind: 'internal',
      transport: 'internal-ipc',
      endpointUrl: 'internal://dev-runtime',
      accessToken: '',
      internalProviderConfig: {
        openaiApiKey: '',
        openaiBaseUrl: '',
        openaiModels: '',
        anthropicApiKey: '',
        anthropicModels: '',
        geminiApiKey: '',
        geminiModels: '',
      },
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
  const readyHeading = page.getByRole('heading', { name: "You're all set" });
  const diagnosticsPanel = page.getByText('Internal runtime diagnostics');
  const addProjectButton = page.getByTitle('Add project');
  if (await readyHeading.isVisible({ timeout: 3000 }).catch(() => false)) {
    await expect(diagnosticsPanel).toBeVisible({ timeout: 10000 });
    return;
  }
  if (await diagnosticsPanel.isVisible({ timeout: 3000 }).catch(() => false)) {
    return;
  }
  if (await addProjectButton.isVisible({ timeout: 3000 }).catch(() => false)) {
    return;
  }

  await expect(async () => {
    if (await page.getByTestId('onboarding-provider-internal').isVisible().catch(() => false)) {
      return;
    }
    if (await page.getByRole('button', { name: 'Open Engine Settings' }).isVisible().catch(() => false)) {
      return;
    }
    if (await page.getByText('Internal runtime diagnostics').isVisible().catch(() => false)) {
      return;
    }
    const getStartedButton = page.getByRole('button', { name: 'Get started' });
    await expect(getStartedButton).toBeVisible();
    await getStartedButton.click({ force: true });
  }).toPass({ timeout: 30000 });

  const onboardingProviderButton = page.getByTestId('onboarding-provider-internal');
  if (await onboardingProviderButton.isVisible({ timeout: 5000 })) {
    await expect(page.getByRole('heading', { name: 'Connect to a runtime' })).toBeVisible();
    await expect(onboardingProviderButton).toBeEnabled({ timeout: 20000 });
    await onboardingProviderButton.click();
    await expect(async () => {
      const readyHeading = page.getByRole('heading', { name: "You're all set" });
      const diagnosticsPanel = page.getByText('Internal runtime diagnostics');
      const connectedButton = page.getByRole('button', { name: 'Connected' });
      if (await readyHeading.isVisible().catch(() => false)) {
        return;
      }
      if (await diagnosticsPanel.isVisible().catch(() => false)) {
        return;
      }
      if (await connectedButton.isVisible().catch(() => false)) {
        return;
      }

      const connectButton = page.locator('form').getByRole('button', { name: 'Connect', exact: true });
      await expect(connectButton).toBeVisible();
      await connectButton.click({ force: true });
    }).toPass({ timeout: 20000 });
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
  if (await page.getByTitle('Add project').isVisible({ timeout: 5000 }).catch(() => false)) {
    return;
  }
  if (await page.getByText('Internal runtime diagnostics').isVisible({ timeout: 5000 }).catch(() => false)) {
    await page.getByRole('button', { name: 'Back' }).click();
    await page.getByRole('tab', { name: /cowork/i }).click();
    return;
  }

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
  await expect(async () => {
    const scheduleControl = page.getByRole('button', { name: 'Schedule', exact: true })
      .or(page.getByRole('tab', { name: 'Schedule', exact: true }));
    await expect(scheduleControl.first()).toBeVisible();
    await scheduleControl.first().click();
  }).toPass({ timeout: 15000 });
  await expect(page.getByRole('heading', { name: 'Schedule' })).toBeVisible({ timeout: 15000 });
}

async function openDeveloperSettings(page: Page) {
  await page.keyboard.press('Control+,');
  await expect(async () => {
    const developerControl = page.getByRole('button', { name: 'Developer', exact: true })
      .or(page.getByRole('tab', { name: 'Developer', exact: true }));
    await expect(developerControl.first()).toBeVisible();
    await developerControl.first().click();
  }).toPass({ timeout: 15000 });
  await expect(page.getByText('Recent internal runs')).toBeVisible({ timeout: 15000 });
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

    await expect
      .poll(
        async () =>
          page.evaluate(([tasksKey, tag]) => {
            const raw = window.localStorage.getItem(tasksKey);
            if (!raw) {
              return false;
            }
            const tasks = JSON.parse(raw) as Array<{ prompt?: string; status?: string }>;
            const status = tasks.find((task) => task.prompt?.startsWith(tag))?.status ?? null;
            return status === 'running' || status === 'completed';
          }, [COWORK_TASKS_KEY, 'UI-READ-ONLY-1'] as const),
        { timeout: 45000 },
      )
      .toBe(true);
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
    await expect.poll(async () => page.evaluate(async (jobId) => {
      const bridge = window.cloffice ?? window.relay;
      const jobs = await bridge.listInternalCronJobs();
      return jobs.some((job) => job.id === jobId);
    }, createdJob.id)).toBe(true);

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

  test('operator can bulk pause resume and delete internal schedules through the UI', async () => {
    await markOnboardingComplete(page);
    await connectInternalProviderFromSettings(page);
    await clearInternalSchedules(page);
    const rootFolder = await prepareProjectRoot(page);
    await createProjectFromSidebar(page, {
      title: 'Internal Bulk Schedule Project',
      description: 'Exercise bulk internal schedule controls through the live UI.',
      rootFolder,
    });

    const createdJobs = await page.evaluate(async () => {
      const bridge = window.cloffice ?? window.relay;
      const first = await bridge.createInternalPromptSchedule({
        kind: 'chat',
        name: 'UI bulk schedule one',
        prompt: 'Bulk schedule one.',
        intervalMinutes: 1,
        model: 'internal/dev-brief',
      });
      const second = await bridge.createInternalPromptSchedule({
        kind: 'chat',
        name: 'UI bulk schedule two',
        prompt: 'Bulk schedule two.',
        intervalMinutes: 5,
        model: 'internal/dev-brief',
      });
      return [first, second];
    });

    await openSchedulePage(page);
    await page.getByRole('button', { name: 'Refresh' }).click();
    for (const createdJob of createdJobs) {
      await expect(page.getByTestId(`scheduled-job-${createdJob.id}`)).toBeVisible({ timeout: 15000 });
    }

    await page.getByTestId(`scheduled-job-select-${createdJobs[0].id}`).check();
    await page.getByTestId(`scheduled-job-select-${createdJobs[1].id}`).check();
    await page.getByTestId('schedule-bulk-pause').click();
    await expect(page.getByTestId(`scheduled-job-${createdJobs[0].id}`)).toContainText('Paused');
    await expect(page.getByTestId(`scheduled-job-${createdJobs[1].id}`)).toContainText('Paused');

    await page.getByTestId('schedule-select-all-visible').check();
    await page.getByTestId('schedule-bulk-resume').click();
    await expect(page.getByTestId(`scheduled-job-${createdJobs[0].id}`)).toContainText('Active');
    await expect(page.getByTestId(`scheduled-job-${createdJobs[1].id}`)).toContainText('Active');

    await page.getByTestId('schedule-select-all-visible').check();
    await page.getByTestId('schedule-bulk-run-now').click();
    await expect.poll(async () => page.evaluate(async (jobIds) => {
      const bridge = window.cloffice ?? window.relay;
      const jobs = await bridge.listInternalCronJobs();
      return jobIds.every((jobId: string) => jobs.some((job: any) => job?.id === jobId && job?.lastRunAt));
    }, createdJobs.map((job) => job.id)), { timeout: 15000 }).toBe(true);

    await page.getByTestId('schedule-select-all-visible').check();
    await page.getByTestId('schedule-bulk-duplicate').click();
    await expect.poll(async () => page.evaluate(async () => {
      const bridge = window.cloffice ?? window.relay;
      const jobs = await bridge.listInternalCronJobs();
      return jobs.filter((job: any) => job?.name === 'UI bulk schedule one copy' || job?.name === 'UI bulk schedule two copy').length;
    }), { timeout: 15000 }).toBe(2);

    await page.getByTestId('schedule-select-all-visible').check();
    await page.getByTestId('schedule-bulk-delete').click();
    await expect(page.getByTestId(`scheduled-job-${createdJobs[0].id}`)).toBeHidden({ timeout: 15000 });
    await expect(page.getByTestId(`scheduled-job-${createdJobs[1].id}`)).toBeHidden({ timeout: 15000 });
  });

  test('operator can create and edit an internal schedule directly from the Schedule page UI', async () => {
    await markOnboardingComplete(page);
    await connectInternalProviderFromSettings(page);
    await clearInternalSchedules(page);
    const rootFolder = await prepareProjectRoot(page);
    await createProjectFromSidebar(page, {
      title: 'Internal Direct Schedule Project',
      description: 'Exercise direct schedule page creation and editing.',
      rootFolder,
    });

    await openSchedulePage(page);
    await page.getByTestId('schedule-create-kind-cowork').click();
    await page.getByTestId('schedule-filter-all').click();
    await page.getByTestId('schedule-create-name').fill('UI direct schedule');
    await page.getByTestId('schedule-create-prompt').fill('Inspect the current project root and summarize the next migration step.');
    await page.getByTestId('schedule-create-interval-5').click();
    await page.getByTestId('schedule-create-model-select').selectOption({ index: 1 });
    await page.getByTestId('schedule-create-submit').click();

    await expect.poll(async () => page.evaluate(async () => {
      const bridge = window.cloffice ?? window.relay;
      const jobs = await bridge.listInternalCronJobs();
      return jobs.some((job: any) => job?.name === 'UI direct schedule');
    }), { timeout: 15000 }).toBe(true);

    const createdJobId = await page.evaluate(async () => {
      const bridge = window.cloffice ?? window.relay;
      const jobs = await bridge.listInternalCronJobs();
      const match = jobs.find((job: any) => job?.name === 'UI direct schedule');
      return match?.id ?? null;
    });
    expect(createdJobId).not.toBeNull();
    const createdJobCard = page.getByTestId(`scheduled-job-${createdJobId}`);
    await expect(createdJobCard).toBeVisible({ timeout: 15000 });
    await expect(createdJobCard).toContainText('UI direct schedule');
    await expect(createdJobCard).toContainText('Cowork');
    await expect(createdJobCard).toContainText('every 5 minutes');

    await page.getByTestId(`scheduled-job-edit-${createdJobId}`).click();
    await page.getByTestId(`scheduled-job-edit-name-${createdJobId}`).fill('UI direct schedule edited');
    await page.getByTestId(`scheduled-job-edit-prompt-${createdJobId}`).fill('Inspect README.md and summarize the next migration step.');
    await page.getByTestId(`scheduled-job-edit-model-${createdJobId}`).selectOption({ index: 0 });
    await page.getByTestId(`scheduled-job-edit-save-${createdJobId}`).click();

    await expect.poll(async () => page.evaluate(async (targetJobId) => {
      const bridge = window.cloffice ?? window.relay;
      const jobs = await bridge.listInternalCronJobs();
      const match = jobs.find((job: any) => job?.id === targetJobId);
      return match
        ? {
            name: match.name,
            prompt: match.prompt,
            model: match.model ?? null,
          }
        : null;
    }, createdJobId), { timeout: 15000 }).toEqual({
      name: 'UI direct schedule edited',
      prompt: 'Inspect README.md and summarize the next migration step.',
      model: null,
    });

    await expect(createdJobCard).toContainText('UI direct schedule edited');

    await page.getByTestId(`scheduled-job-duplicate-${createdJobId}`).click();
    await expect.poll(async () => page.evaluate(async () => {
      const bridge = window.cloffice ?? window.relay;
      const jobs = await bridge.listInternalCronJobs();
      return jobs.some((job: any) => job?.name === 'UI direct schedule edited copy');
    }), { timeout: 15000 }).toBe(true);

    await page.getByTestId('schedule-search').fill('edited copy');
    await expect(page.getByText('Showing 1 of')).toBeVisible();
    const duplicatedCard = page.getByTestId(/^scheduled-job-/).filter({ hasText: 'UI direct schedule edited copy' }).first();
    await expect(duplicatedCard).toBeVisible({ timeout: 15000 });

    await page.getByTestId('schedule-search').fill('UI direct schedule edited');
    await page.getByTestId(`scheduled-job-run-now-${createdJobId}`).click();
    await expect.poll(async () => page.evaluate(async (targetJobId) => {
      const bridge = window.cloffice ?? window.relay;
      const jobs = await bridge.listInternalCronJobs();
      const match = jobs.find((job: any) => job?.id === targetJobId);
      return Boolean(match?.lastRunAt);
    }, createdJobId), { timeout: 15000 }).toBe(true);
  });

  test('operator can group schedules by project and model on the Schedule page', async () => {
    await markOnboardingComplete(page);
    await connectInternalProviderFromSettings(page);
    await clearInternalSchedules(page);
    const rootFolder = await prepareProjectRoot(page);
    await createProjectFromSidebar(page, {
      title: 'Internal Grouped Schedule Project',
      description: 'Exercise schedule grouping in the live UI.',
      rootFolder,
    });

    await page.evaluate(async (selectedRootPath) => {
      const bridge = window.cloffice ?? window.relay;
      const rawProjects = localStorage.getItem('relay.cowork.projects.v1');
      const parsedProjects = rawProjects ? JSON.parse(rawProjects) : [];
      const project = Array.isArray(parsedProjects)
        ? parsedProjects.find((entry) => entry?.name === 'Internal Grouped Schedule Project')
        : null;
      await bridge.createInternalPromptSchedule({
        kind: 'cowork',
        name: 'Grouped project schedule',
        prompt: 'Inspect the grouped project root.',
        intervalMinutes: 5,
        projectId: project?.id,
        projectTitle: project?.name,
        rootPath: selectedRootPath,
        model: 'internal/dev-planner',
      });
      await bridge.createInternalPromptSchedule({
        kind: 'chat',
        name: 'Ungrouped model schedule',
        prompt: 'Summarize the latest scheduler changes.',
        intervalMinutes: 15,
        model: null,
      });
    }, rootFolder);

    await openSchedulePage(page);
    await expect(page.getByText('Grouped project schedule')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Ungrouped model schedule')).toBeVisible({ timeout: 15000 });

    await page.getByTestId('schedule-group-project').click();
    await expect(page.getByTestId('schedule-group-section-internal-grouped-schedule-project')).toContainText('Grouped project schedule');
    await expect(page.getByTestId('schedule-group-section-no-project')).toContainText('Ungrouped model schedule');

    await page.getByTestId('schedule-group-model').click();
    await expect(page.getByTestId('schedule-group-section-internal-dev-planner')).toContainText('Grouped project schedule');
    await expect(page.getByTestId('schedule-group-section-default-model')).toContainText('Ungrouped model schedule');
  });

  test('operator can export and import internal schedules through the UI', async () => {
    await markOnboardingComplete(page);
    await connectInternalProviderFromSettings(page);
    await clearInternalSchedules(page);
    const rootFolder = await prepareProjectRoot(page);
    await createProjectFromSidebar(page, {
      title: 'Internal Import Export Project',
      description: 'Exercise schedule export and import through the live UI.',
      rootFolder,
    });

    const createdJob = await page.evaluate(async (selectedRootPath) => {
      const bridge = window.cloffice ?? window.relay;
      const created = await bridge.createInternalPromptSchedule({
        kind: 'cowork',
        name: 'UI export import schedule',
        prompt: 'Inspect the current project root and summarize the next migration step.',
        intervalMinutes: 5,
        rootPath: selectedRootPath,
        model: 'internal/dev-planner',
      });
      await bridge.updateInternalPromptSchedule(created.id, { enabled: false });
      return created;
    }, rootFolder);

    await openSchedulePage(page);
    await expect(page.getByTestId(`scheduled-job-${createdJob.id}`)).toBeVisible({ timeout: 15000 });

    await page.evaluate(() => {
      const originalCreateObjectURL = URL.createObjectURL.bind(URL);
      const originalAnchorClick = HTMLAnchorElement.prototype.click;
      (window as any).__scheduleExportText = null;
      URL.createObjectURL = ((blob: Blob) => {
        void blob.text().then((text) => {
          (window as any).__scheduleExportText = text;
        });
        return originalCreateObjectURL(blob);
      }) as typeof URL.createObjectURL;
      HTMLAnchorElement.prototype.click = function click() {
        return;
      };
      (window as any).__restoreScheduleExportHooks = () => {
        URL.createObjectURL = originalCreateObjectURL;
        HTMLAnchorElement.prototype.click = originalAnchorClick;
      };
    });
    await page.getByTestId('schedule-export-visible').click();
    await expect.poll(async () => page.evaluate(() => (window as any).__scheduleExportText), {
      timeout: 15000,
    }).not.toBeNull();
    const exportText = await page.evaluate(() => (window as any).__scheduleExportText as string);
    await page.evaluate(() => {
      (window as any).__restoreScheduleExportHooks?.();
    });
    const exported = JSON.parse(exportText) as { schedules: Array<{ name: string; enabled: boolean; kind: string }> };
    expect(exported.schedules[0]?.name).toBe('UI export import schedule');
    expect(exported.schedules[0]?.enabled).toBe(false);
    expect(exported.schedules[0]?.kind).toBe('cowork');

    await clearInternalSchedules(page);
    await page.getByRole('button', { name: 'Refresh' }).click();
    await expect(page.getByTestId(`scheduled-job-${createdJob.id}`)).toBeHidden({ timeout: 15000 });

    await page.getByTestId('schedule-import-input').setInputFiles({
      name: 'schedules.json',
      mimeType: 'application/json',
      buffer: Buffer.from(exportText, 'utf8'),
    });

    await expect.poll(async () => page.evaluate(async () => {
      const bridge = window.cloffice ?? window.relay;
      const jobs = await bridge.listInternalCronJobs();
      const match = jobs.find((job: any) => job?.name === 'UI export import schedule');
      return match
        ? {
            enabled: match.enabled,
            schedule: match.schedule,
            kind: match.kind,
          }
        : null;
    }), { timeout: 15000 }).toEqual({
      enabled: false,
      schedule: 'every 5 minutes',
      kind: 'cowork',
    });
  });

  test('operator can export and import schedules from Settings developer tools', async () => {
    await markOnboardingComplete(page);
    await connectInternalProviderFromSettings(page);
    await clearInternalSchedules(page);

    await page.evaluate(async () => {
      const bridge = window.cloffice ?? window.relay;
      await bridge.createInternalPromptSchedule({
        kind: 'chat',
        name: 'Settings backup schedule',
        prompt: 'Summarize the latest scheduler changes.',
        intervalMinutes: 15,
        model: null,
      });
    });

    await openDeveloperSettings(page);

    await page.evaluate(() => {
      const originalCreateObjectURL = URL.createObjectURL.bind(URL);
      const originalAnchorClick = HTMLAnchorElement.prototype.click;
      (window as any).__settingsScheduleExportText = null;
      URL.createObjectURL = ((blob: Blob) => {
        void blob.text().then((text) => {
          (window as any).__settingsScheduleExportText = text;
        });
        return originalCreateObjectURL(blob);
      }) as typeof URL.createObjectURL;
      HTMLAnchorElement.prototype.click = function click() {
        return;
      };
      (window as any).__restoreSettingsScheduleExportHooks = () => {
        URL.createObjectURL = originalCreateObjectURL;
        HTMLAnchorElement.prototype.click = originalAnchorClick;
      };
    });
    await page.getByTestId('settings-schedule-export').click();
    await expect.poll(async () => page.evaluate(() => (window as any).__settingsScheduleExportText), {
      timeout: 15000,
    }).not.toBeNull();
    const exportText = await page.evaluate(() => (window as any).__settingsScheduleExportText as string);
    await page.evaluate(() => {
      (window as any).__restoreSettingsScheduleExportHooks?.();
    });
    const exported = JSON.parse(exportText) as { schedules: Array<{ name: string; kind: string }> };
    expect(exported.schedules[0]?.name).toBe('Settings backup schedule');
    expect(exported.schedules[0]?.kind).toBe('chat');

    await clearInternalSchedules(page);
    await page.getByTestId('settings-schedule-import-input').setInputFiles({
      name: 'settings-schedules.json',
      mimeType: 'application/json',
      buffer: Buffer.from(exportText, 'utf8'),
    });

    await expect.poll(async () => page.evaluate(async () => {
      const bridge = window.cloffice ?? window.relay;
      const jobs = await bridge.listInternalCronJobs();
      const match = jobs.find((job: any) => job?.name === 'Settings backup schedule');
      return match
        ? {
            schedule: match.schedule,
            kind: match.kind,
          }
        : null;
    }), { timeout: 15000 }).toEqual({
      schedule: 'every 15 minutes',
      kind: 'chat',
    });
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

    await expect.poll(
      async () => page.evaluate(async (jobId) => {
        const bridge = window.cloffice ?? window.relay;
        const jobs = await bridge.listInternalCronJobs();
        const job = jobs.find((entry: any) => entry?.id === jobId);
        return Boolean(job?.lastArtifactSummary);
      }, seededJob.id),
      { timeout: 15000, message: 'expected seeded schedule artifact summary to be visible in the bridge state' },
    ).toBe(true);

    await openSchedulePage(page);
    await page.getByRole('button', { name: 'Refresh' }).click();
    const scheduledJobCard = page.getByTestId(`scheduled-job-${seededJob.id}`);
    await expect(scheduledJobCard).toBeVisible({ timeout: 15000 });
    await expect(scheduledJobCard).toContainText('Last artifact');
    await expect(scheduledJobCard.getByTestId(`scheduled-job-open-artifact-${seededJob.id}`)).toBeVisible();
    await expect(scheduledJobCard.getByTestId(`scheduled-job-copy-artifact-${seededJob.id}`)).toBeVisible();
    await expect(scheduledJobCard.getByTestId(`scheduled-job-copy-errors-${seededJob.id}`)).toBeVisible();
    await expect(async () => {
      await page.getByTestId(`scheduled-job-copy-artifact-${seededJob.id}`).click();
      await expect(page.getByTestId(`scheduled-job-copy-artifact-${seededJob.id}`)).toContainText('Copied summary');
    }).toPass({ timeout: 30000 });
    await expect(async () => {
      await page.getByTestId(`scheduled-job-copy-errors-${seededJob.id}`).click();
      await expect(page.getByTestId(`scheduled-job-copy-errors-${seededJob.id}`)).toContainText('Copied errors');
    }).toPass({ timeout: 30000 });
    await scheduledJobCard.getByTestId(`scheduled-job-toggle-artifact-${seededJob.id}`).click();
    await expect(scheduledJobCard).toContainText('Preview');
    await expect(scheduledJobCard).toContainText('Errors');
  });
});
