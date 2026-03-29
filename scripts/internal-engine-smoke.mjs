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
        const hasBridge = await win.webContents.executeJavaScript('Boolean(window.cloffice || window.relay)', true);
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
      const bridge = window.cloffice ?? window.relay;
      return bridge.getInternalEngineRuntimeInfo();
    })()`);

    if (before.readiness !== 'idle' || before.connected !== false) {
      throw new Error(`unexpected pre-connect runtime info: ${JSON.stringify(before)}`);
    }

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

    if (!chatSessionKey || !chatSessionKey.startsWith('internal:chat:')) {
      throw new Error(`unexpected chat session key: ${chatSessionKey}`);
    }
    if (!coworkSessionKey || !coworkSessionKey.startsWith('internal:cowork:')) {
      throw new Error(`unexpected cowork session key: ${coworkSessionKey}`);
    }

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
      return bridge.sendInternalChat(${JSON.stringify(coworkSessionKey)}, 'Draft an internal cowork plan for organizing the next migration task.');
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

    if (!cowork.assistantMessage.text.includes('Internal cowork foundation response.')) {
      throw new Error(`cowork response missing foundation marker: ${cowork.assistantMessage.text}`);
    }
    if (!cowork.assistantMessage.text.includes('Current limitation: internal cowork foundations only emit read-only inspection actions in this phase.')) {
      throw new Error(`cowork response missing limitation note: ${cowork.assistantMessage.text}`);
    }
    if (!cowork.sessionTitle?.startsWith('Task:')) {
      throw new Error(`cowork session title not normalized: ${cowork.sessionTitle}`);
    }
    if (cowork.engineActionPhase !== 'approval_required') {
      throw new Error(`cowork action phase not normalized: ${JSON.stringify(cowork)}`);
    }
    if (cowork.engineActionMode !== 'read-only') {
      throw new Error(`cowork action mode not normalized: ${JSON.stringify(cowork)}`);
    }
    if (cowork.requestedActions?.[0]?.type !== 'list_dir') {
      throw new Error(`cowork requested action not emitted: ${JSON.stringify(cowork.requestedActions)}`);
    }

    const after = await callBridge(`(async () => {
      const bridge = window.cloffice ?? window.relay;
      return bridge.getInternalEngineRuntimeInfo();
    })()`);

    if (after.connected !== true || after.readiness !== 'ready' || after.activeSessionKey !== coworkSessionKey) {
      throw new Error(`unexpected post-chat runtime info: ${JSON.stringify(after)}`);
    }

    await callBridge(`(async () => {
      const bridge = window.cloffice ?? window.relay;
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
      coworkActionType: cowork.requestedActions?.[0]?.type ?? null,
      sessionCount: after.sessionCount,
      activeSessionKey: after.activeSessionKey,
    };
  });

  console.log(JSON.stringify(result, null, 2));
} finally {
  await app.close();
}
