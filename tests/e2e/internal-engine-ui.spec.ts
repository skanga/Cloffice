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
  await page.getByRole('button', { name: `New task in ${projectTitle}` }).click();
  await expect(page.getByRole('textbox', { name: 'Task prompt' }).first()).toBeVisible({ timeout: 15000 });
}

async function connectInternalProviderFromOnboarding(page: Page) {
  await expect(page.getByRole('heading', { name: 'Welcome to Cloffice' })).toBeVisible();
  await page.getByRole('button', { name: 'Get started' }).click();

  const onboardingProviderButton = page.getByTestId('onboarding-provider-internal');
  if (await onboardingProviderButton.isVisible({ timeout: 5000 })) {
    await expect(page.getByRole('heading', { name: 'Connect to a runtime' })).toBeVisible();
    await expect(onboardingProviderButton).toBeEnabled({ timeout: 20000 });
    await onboardingProviderButton.click();
    await page.getByRole('button', { name: 'Connect' }).click();
    const readyHeading = page.getByRole('heading', { name: "You're all set" });
    if (await readyHeading.isVisible({ timeout: 5000 })) {
      await expect(page.getByText('Internal runtime diagnostics')).toBeVisible();
      return;
    }

    await expect(page.getByText('Internal runtime diagnostics')).toBeVisible({ timeout: 30000 });
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
  await modelSelect.selectOption('internal/dev-planner');
}

async function waitForFirstApproval(page: Page, timeout = 30000) {
  const approvalCard = pendingApprovalCards(page).first();
  await expect(approvalCard).toBeVisible({ timeout });
  const approvalTestIdAttr = (await approvalCard.getAttribute('data-testid')) || '';
  const approvalId = approvalTestIdAttr.replace('pending-approval-', '');
  expect(approvalId).not.toBe('');
  return { approvalCard, approvalId };
}

async function waitForPromptStatus(page: Page, promptTag: string, status: 'completed' | 'failed') {
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
    await connectInternalProviderFromOnboarding(page);
    await finishOnboarding(page);

    await expect(page.getByRole('button', { name: 'Connected' })).toBeVisible({ timeout: 15000 });
    const backButton = page.getByRole('button', { name: 'Back' });
    if (await backButton.isVisible({ timeout: 5000 })) {
      await backButton.click();
    }
    await page.getByRole('tab', { name: /cowork/i }).click();
    await expect(page.getByTitle('Add project')).toBeVisible({ timeout: 15000 });

    const rootFolder = await prepareProjectRoot(page);
    await createProjectFromSidebar(page, {
      title: 'Internal UI Project',
      description: 'Exercise the developer-only internal runtime through the live Cloffice UI.',
      rootFolder,
    });
    await openProjectCowork(page, 'Internal UI Project');
    await selectCoworkPlannerModel(page);

    await sendCoworkPrompt(page, 'UI-READ-ONLY-1: Inspect the current project root before planning the next migration step.');

    const { approvalCard, approvalId } = await waitForFirstApproval(page);
    await expect(approvalCard).toContainText('List directory .');
    await page.getByTestId(`pending-approval-approve-${approvalId}`).click();
    await expect(approvalCard).toHaveCount(0);

    await expect(page.getByText('Listed: .')).toBeVisible({ timeout: 30000 });
    await waitForPromptStatus(page, 'UI-READ-ONLY-1', 'completed');
  });
});
