import { readFile } from 'node:fs/promises';
import path from 'node:path';

const repoRoot = process.cwd();
const preloadPath = path.join(repoRoot, 'dist-electron', 'electron', 'preload.cjs');
const appPath = path.join(repoRoot, 'src', 'App.tsx');

async function assertIncludes(filePath, requiredSnippets) {
  const content = await readFile(filePath, 'utf8');
  const missing = requiredSnippets.filter((snippet) => !content.includes(snippet));
  if (missing.length > 0) {
    throw new Error(`Missing snippets in ${filePath}: ${missing.join(', ')}`);
  }
}

async function run() {
  await assertIncludes(preloadPath, [
    'createFileInFolder',
    'appendFileInFolder',
    'readFileInFolder',
    'listDirInFolder',
    'existsInFolder',
  ]);

  await assertIncludes(appPath, [
    'type: \'create_file\'',
    'type: \'append_file\'',
    'type: \'read_file\'',
    'type: \'list_dir\'',
    'type: \'exists\'',
  ]);

  console.log('Local action smoke checks passed.');
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
