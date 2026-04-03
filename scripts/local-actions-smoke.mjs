import { readFile } from 'node:fs/promises';
import path from 'node:path';

const repoRoot = process.cwd();
const preloadPath = path.join(repoRoot, 'dist-electron', 'electron', 'preload.cjs');
const sourcePreloadPath = path.join(repoRoot, 'electron', 'preload.cts');
const runCoordinatorPath = path.join(repoRoot, 'src', 'lib', 'engine-run-coordinator.ts');
const actionOrchestratorPath = path.join(repoRoot, 'src', 'lib', 'engine-local-action-orchestrator.ts');
const safetyPolicyPath = path.join(repoRoot, 'src', 'lib', 'safety-policy.ts');
const coworkPagePath = path.join(repoRoot, 'src', 'features', 'cowork', 'cowork-page.tsx');
const shellConnectorPath = path.join(repoRoot, 'src', 'lib', 'connectors', 'shell.ts');
const connectorTypesPath = path.join(repoRoot, 'src', 'lib', 'connectors', 'connector-types.ts');

async function assertIncludes(filePath, requiredSnippets) {
  const content = await readFile(filePath, 'utf8');
  const missing = requiredSnippets.filter((snippet) => !content.includes(snippet));
  if (missing.length > 0) {
    throw new Error(`Missing snippets in ${filePath}: ${missing.join(', ')}`);
  }
}

async function assertExcludes(filePath, forbiddenSnippets) {
  const content = await readFile(filePath, 'utf8');
  const present = forbiddenSnippets.filter((snippet) => content.includes(snippet));
  if (present.length > 0) {
    throw new Error(`Unexpected insecure snippets in ${filePath}: ${present.join(', ')}`);
  }
}

function extractSection(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  if (start < 0) {
    throw new Error(`Could not find section start: ${startMarker}`);
  }
  const end = source.indexOf(endMarker, start);
  if (end < 0) {
    throw new Error(`Could not find section end: ${endMarker}`);
  }
  return source.slice(start, end);
}

async function run() {
  const sourcePreload = await readFile(sourcePreloadPath, 'utf8');

  await assertIncludes(preloadPath, [
    'createFileInFolder',
    'appendFileInFolder',
    'readFileInFolder',
    'listDirInFolder',
    'existsInFolder',
    'explorerId',
    'enableDevelopmentBridge',
    'Object.assign(desktopBridgeApi, {',
    'getAuthSession',
    'saveAuthSession',
    'clearAuthSession',
  ]);

  await assertExcludes(preloadPath, [
    'backend:health-check',
    'checkRuntimeHealth',
    'healthCheck:',
  ]);

  const productionBridgeBlock = extractSection(
    sourcePreload,
    'const desktopBridgeApi = {',
    'if (enableDevelopmentBridge) {',
  );
  const developmentBridgeBlock = extractSection(
    sourcePreload,
    'if (enableDevelopmentBridge) {',
    "contextBridge.exposeInMainWorld('cloffice', desktopBridgeApi);",
  );

  const unexpectedProductionBridgeSnippets = [
    'shellExec: (rootPath: string, command: string, timeoutMs?: number)',
    'webFetch: (',
  ].filter((snippet) => productionBridgeBlock.includes(snippet));
  if (unexpectedProductionBridgeSnippets.length > 0) {
    throw new Error(`Unexpected dev-only bridge methods exposed in production preload block: ${unexpectedProductionBridgeSnippets.join(', ')}`);
  }

  const missingDevelopmentBridgeSnippets = [
    'shellExec: (rootPath: string, command: string, timeoutMs?: number)',
    'webFetch: (',
  ].filter((snippet) => !developmentBridgeBlock.includes(snippet));
  if (missingDevelopmentBridgeSnippets.length > 0) {
    throw new Error(`Missing dev-only bridge methods in development preload block: ${missingDevelopmentBridgeSnippets.join(', ')}`);
  }

  await assertIncludes(safetyPolicyPath, [
    'SAFETY_STORAGE_KEY',
    'DEFAULT_SAFETY_SCOPES',
    'resolveLocalActionPolicy',
    'create_file',
    'append_file',
    'read_file',
    'list_dir',
    'exists',
  ]);

  await assertIncludes(runCoordinatorPath, [
    'executeEngineCoworkActionExecution',
    'providerId === \'internal\' && params.actionMode === \'read-only\'',
    'executeEngineLocalActionPlan',
  ]);

  await assertIncludes(actionOrchestratorPath, [
    'requestApproval',
    'Blocked by safety policy',
    'Awaiting approval for',
    'REJECTED_BY_OPERATOR',
    'APPROVAL_TIMEOUT',
  ]);

  await assertIncludes(coworkPagePath, [
    'pending-approvals-card',
    'onApprovePendingAction',
    'onRejectPendingAction',
  ]);

  await assertIncludes(shellConnectorPath, [
    'const blockedList = readConnectorStringArrayConfig(',
    'connector.config',
    'errorCode: \'BLOCKED_COMMAND\'',
  ]);

  await assertExcludes(shellConnectorPath, [
    'ctx as unknown as { connector?: ConnectorDefinition }',
    'Array.isArray(ctx.bridge)',
  ]);

  await assertIncludes(connectorTypesPath, [
    'export function readConnectorStringArrayConfig(',
  ]);

  console.log('Local action + approval smoke checks passed.');
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
