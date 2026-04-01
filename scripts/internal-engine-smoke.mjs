import { _electron as electron } from '@playwright/test';

const app = await electron.launch({
  args: ['.'],
  env: {
    ...process.env,
    CLOFFICE_ENABLE_INTERNAL_ENGINE: '1',
  },
});

try {
  const result = await app.evaluate(async ({ BrowserWindow }) => {
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    let win = null;
    const startedAt = Date.now();

    while (!win && Date.now() - startedAt < 60_000) {
      win = BrowserWindow.getAllWindows().find((candidate) => candidate.webContents.getURL().includes('localhost:5173')) ?? null;
      if (!win) {
        await sleep(500);
      }
    }

    if (!win) {
      throw new Error(`renderer window not found: ${BrowserWindow.getAllWindows().map((candidate) => candidate.webContents.getURL()).join(', ')}`);
    }

    const waitForBridge = async () => {
      const bridgeStartedAt = Date.now();
      while (Date.now() - bridgeStartedAt < 60_000) {
        const hasBridge = await win.webContents.executeJavaScript('Boolean(window.cloffice)', true);
        if (hasBridge) {
          return;
        }
        await sleep(500);
      }
      throw new Error('desktop bridge did not appear in renderer main world');
    };

    await waitForBridge();

    const callBridge = (expression) => win.webContents.executeJavaScript(expression, true);

    const before = await callBridge(`(async () => {
      const bridge = window.cloffice;
      return bridge.getInternalEngineRuntimeInfo();
    })()`);

    const acceptableBefore =
      (before.readiness === 'idle' && before.connected === false)
      || (before.readiness === 'ready' && before.connected === true);
    if (!acceptableBefore) {
      throw new Error(`unexpected pre-connect runtime info: ${JSON.stringify(before)}`);
    }

    if (!before.connected) {
      await callBridge(`(async () => {
        const bridge = window.cloffice;
        await bridge.connectInternalEngine({ endpointUrl: 'internal://dev-runtime' });
      })()`);
    }

    const chatSessionKey = await callBridge(`(async () => {
      const bridge = window.cloffice;
      return bridge.createInternalChatSession();
    })()`);

    const coworkSessionKey = await callBridge(`(async () => {
      const bridge = window.cloffice;
      return bridge.createInternalCoworkSession();
    })()`);

    if (!chatSessionKey || !chatSessionKey.startsWith('internal:chat:')) {
      throw new Error(`unexpected chat session key: ${chatSessionKey}`);
    }
    if (!coworkSessionKey || !coworkSessionKey.startsWith('internal:cowork:')) {
      throw new Error(`unexpected cowork session key: ${coworkSessionKey}`);
    }

    await callBridge(`(async () => {
      const bridge = window.cloffice;
      await bridge.setInternalSessionModel(${JSON.stringify(chatSessionKey)}, 'internal/dev-planner');
    })()`);

    const planner = await callBridge(`(async () => {
      const bridge = window.cloffice;
      return bridge.sendInternalChat(${JSON.stringify(chatSessionKey)}, 'Plan a careful rollout for the internal engine development path.');
    })()`);

    const cowork = await callBridge(`(async () => {
      const bridge = window.cloffice;
      return bridge.sendInternalChat(${JSON.stringify(coworkSessionKey)}, 'Draft an internal cowork plan for organizing the next migration task and inspect root metadata before refining the plan.');
    })()`);

    if (planner.model !== 'internal/dev-planner') {
      throw new Error(`unexpected planner model: ${JSON.stringify(planner)}`);
    }
    if (!planner.assistantMessage.text.includes('1. Clarify the immediate objective')) {
      throw new Error(`planner response missing structured plan: ${planner.assistantMessage.text}`);
    }
    if (!planner.sessionTitle?.startsWith('Plan:')) {
      throw new Error(`planner session title not normalized: ${planner.sessionTitle}`);
    }

    const coworkText = cowork.assistantMessage.text || '';
    const hasLegacyFoundationText =
      coworkText.includes('Internal cowork foundation response.')
      && coworkText.includes('Current limitation: internal cowork foundations only emit safe read-only inspection and metadata actions in this phase.');
    const hasStructuredProviderText =
      coworkText.includes('Goal:')
      && coworkText.includes('Plan:')
      && coworkText.includes('Needed context:')
      && coworkText.includes('Next step:');
    if (!hasLegacyFoundationText && !hasStructuredProviderText) {
      throw new Error(`cowork response missing expected planning structure: ${coworkText}`);
    }
    if (!cowork.sessionTitle?.startsWith('Task:')) {
      throw new Error(`cowork session title not normalized: ${cowork.sessionTitle}`);
    }
    if (cowork.engineActionPhase !== 'awaiting_approval') {
      throw new Error(`cowork action phase not normalized: ${JSON.stringify(cowork)}`);
    }
    if (cowork.engineActionMode !== 'read-only') {
      throw new Error(`cowork action mode not normalized: ${JSON.stringify(cowork)}`);
    }
    if (cowork.requestedActions?.[0]?.type !== 'list_dir') {
      throw new Error(`cowork requested action not emitted: ${JSON.stringify(cowork.requestedActions)}`);
    }
    if (cowork.requestedActions?.[1]?.type !== 'stat') {
      throw new Error(`cowork metadata action not emitted: ${JSON.stringify(cowork.requestedActions)}`);
    }

    const continuation = await callBridge(`(async () => {
      const bridge = window.cloffice;
      return bridge.continueInternalCoworkRun({
        sessionKey: ${JSON.stringify(coworkSessionKey)},
        runId: ${JSON.stringify('smoke-run-1')},
        rootPath: ${JSON.stringify(process.cwd())},
        approvedActions: ${JSON.stringify([
          { id: 'inspect-project', type: 'list_dir', path: '.' },
          { id: 'inspect-root-metadata', type: 'stat', path: '.' },
        ])},
        rejectedActions: [],
      });
    })()`);
    if (continuation.engineActionPhase !== 'completed') {
      throw new Error(`cowork continuation phase not normalized: ${JSON.stringify(continuation)}`);
    }
    if (!continuation.execution?.previews?.some((entry) => typeof entry === 'string' && entry.includes('Stat: .'))) {
      throw new Error(`cowork continuation missing stat preview: ${JSON.stringify(continuation.execution)}`);
    }

    const schedulerToken = `scheduler-smoke-${Date.now()}`;
    const scheduledPrompt = `Internal scheduler smoke prompt ${schedulerToken}. Reply with a concise acknowledgement.`;
    const createdSchedule = await callBridge(`(async () => {
      const bridge = window.cloffice;
      return bridge.createInternalPromptSchedule({
        prompt: ${JSON.stringify(scheduledPrompt)},
        name: ${JSON.stringify(`Scheduler smoke ${Date.now()}`)},
        intervalMinutes: 1,
        model: 'internal/dev-brief',
      });
    })()`);
    if (!createdSchedule?.id || typeof createdSchedule.name !== 'string' || !createdSchedule.name.startsWith('Scheduler smoke')) {
      throw new Error(`internal schedule was not created: ${JSON.stringify(createdSchedule)}`);
    }

    const listedSchedules = await callBridge(`(async () => {
      const bridge = window.cloffice;
      return bridge.listInternalCronJobs();
    })()`);
    if (!Array.isArray(listedSchedules) || !listedSchedules.some((job) => job.id === createdSchedule.id)) {
      throw new Error(`created internal schedule missing from list: ${JSON.stringify(listedSchedules)}`);
    }

    const scheduleWaitStartedAt = Date.now();
    let scheduledRun = null;
    while (!scheduledRun && Date.now() - scheduleWaitStartedAt < 90_000) {
      const history = await callBridge(`(async () => {
        const bridge = window.cloffice;
        return bridge.getInternalRunHistory(30);
      })()`);
      scheduledRun = Array.isArray(history)
        ? history.find((run) => typeof run?.sessionKey === 'string'
          && run.sessionKey.startsWith('internal:scheduled:chat:')
          && typeof run?.promptPreview === 'string'
          && run.promptPreview.includes(schedulerToken))
        : null;
      if (!scheduledRun) {
        await sleep(5_000);
      }
    }
    if (!scheduledRun) {
      throw new Error('scheduled internal prompt did not fire within the expected window');
    }

    const after = await callBridge(`(async () => {
      const bridge = window.cloffice;
      return bridge.getInternalEngineRuntimeInfo();
    })()`);

    if (after.connected !== true || after.readiness !== 'ready') {
      throw new Error(`unexpected post-chat runtime info: ${JSON.stringify(after)}`);
    }
    if (after.lastScheduledJobName !== createdSchedule.name) {
      throw new Error(`scheduled runtime info did not record the fired job: ${JSON.stringify(after)}`);
    }

    await callBridge(`(async () => {
      const bridge = window.cloffice;
      await bridge.disconnectInternalEngine();
    })()`);

    return {
      readinessBefore: before.readiness,
      readinessAfter: after.readiness,
      chatSessionKey,
      coworkSessionKey,
      plannerModel: planner.model,
      coworkTitle: cowork.sessionTitle,
      coworkActionPhase: cowork.engineActionPhase,
      coworkActionMode: cowork.engineActionMode,
      coworkActionTypes: cowork.requestedActions?.map((action) => action.type) ?? [],
      continuationPhase: continuation.engineActionPhase,
      scheduleId: createdSchedule.id,
      scheduleCount: after.scheduleCount,
      lastScheduledJobName: after.lastScheduledJobName,
      sessionCount: after.sessionCount,
      activeSessionKey: after.activeSessionKey,
    };
  });

  console.log(JSON.stringify(result, null, 2));
} finally {
  await app.close();
}

