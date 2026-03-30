import type { ProjectKnowledgeItem, ProjectPathReference } from '@/app-types';

type CoworkPromptBridge = {
  readFileInFolder?: (rootPath: string, relativePath: string) => Promise<{ content?: string }>;
  listDirInFolder?: (
    rootPath: string,
    relativePath: string,
  ) => Promise<{ items: Array<{ path: string; kind: 'file' | 'directory' }> }>;
};

export function validateProjectRelativePath(
  inputPath: string,
  options?: { allowEmpty?: boolean },
): { ok: true } | { ok: false; reason: string } {
  const raw = (inputPath ?? '').trim();
  if (!raw) {
    return options?.allowEmpty ? { ok: true } : { ok: false, reason: 'Path is required.' };
  }

  const normalized = raw.replace(/\\/g, '/');
  if (/[\u0000-\u001F]/.test(normalized)) {
    return { ok: false, reason: 'Path contains invalid control characters.' };
  }
  if (normalized.startsWith('/') || normalized.startsWith('~/') || /^[a-zA-Z]:\//.test(normalized)) {
    return { ok: false, reason: 'Absolute paths are not allowed for project-bound actions.' };
  }

  if (normalized === '.' || normalized === './') {
    return { ok: false, reason: 'A concrete relative path is required.' };
  }

  const segments = normalized.split('/').filter((segment) => segment.length > 0);
  if (segments.some((segment) => segment === '..' || segment === '.')) {
    return { ok: false, reason: 'Parent directory traversal is not allowed.' };
  }

  return { ok: true };
}

export function extractProjectFileMentions(inputText: string): string[] {
  if (!inputText) {
    return [];
  }

  const mentions = new Set<string>();
  const quotedPattern = /@project:"([^"]+)"/g;
  let quotedMatch: RegExpExecArray | null;
  while ((quotedMatch = quotedPattern.exec(inputText)) !== null) {
    const nextPath = quotedMatch[1]?.trim();
    if (nextPath) {
      mentions.add(nextPath);
    }
  }

  const unquotedPattern = /@project\/([^\s,;]+)/g;
  let unquotedMatch: RegExpExecArray | null;
  while ((unquotedMatch = unquotedPattern.exec(inputText)) !== null) {
    const nextPath = unquotedMatch[1]?.trim();
    if (nextPath) {
      mentions.add(nextPath);
    }
  }

  return Array.from(mentions);
}

export async function loadCoworkReferencedProjectFilesContext(params: {
  text: string;
  folderContext: string;
  bridge: CoworkPromptBridge | null | undefined;
  projectPathReferences: ProjectPathReference[];
}): Promise<string> {
  const { text, folderContext, bridge, projectPathReferences } = params;
  if (!folderContext) {
    return '';
  }

  const selectedKindByPath = new Map(
    projectPathReferences.map((entry) => [entry.path, entry.kind] as const),
  );
  const referencedProjectPaths = Array.from(new Set(extractProjectFileMentions(text))).slice(0, 8);
  if (referencedProjectPaths.length === 0) {
    return '';
  }

  const snippets: string[] = [];
  const MAX_FILE_CHARS = 8_000;
  const MAX_FOLDER_LIST_ITEMS = 40;

  for (const rawPath of referencedProjectPaths) {
    const mentionsDirectory = /\/+$/.test(rawPath) || selectedKindByPath.get(rawPath) === 'directory';
    const relPath = rawPath.replace(/\/+$/, '').trim();
    if (!relPath) {
      continue;
    }

    const validated = validateProjectRelativePath(relPath);
    if (!validated.ok) {
      snippets.push(`- ${relPath}: skipped (${validated.reason})`);
      continue;
    }

    if (mentionsDirectory && bridge?.listDirInFolder) {
      try {
        const listing = await bridge.listDirInFolder(folderContext, relPath);
        const listed = listing.items
          .slice(0, MAX_FOLDER_LIST_ITEMS)
          .map((item) => `- ${item.kind === 'directory' ? '[dir]' : '[file]'} ${item.path}`)
          .join('\n');
        const truncated = listing.items.length > MAX_FOLDER_LIST_ITEMS ? '\n- ...truncated...' : '';
        snippets.push(`### ${relPath}/\n${listed || '- (empty)'}${truncated}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to list folder';
        snippets.push(`- ${relPath}/: list failed (${message})`);
      }
      continue;
    }

    if (!bridge?.readFileInFolder) {
      snippets.push(`- ${relPath}: read unavailable in this mode`);
      continue;
    }

    try {
      const fileResult = await bridge.readFileInFolder(folderContext, relPath);
      const fullContent = fileResult.content ?? '';
      const snippet = fullContent.slice(0, MAX_FILE_CHARS);
      const truncated = fullContent.length > MAX_FILE_CHARS ? '\n[...truncated...]' : '';
      snippets.push(`### ${relPath}\n\`\`\`\n${snippet}${truncated}\n\`\`\``);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to read file';
      snippets.push(`- ${relPath}: read failed (${message})`);
    }
  }

  return snippets.length > 0 ? `Referenced project files:\n${snippets.join('\n\n')}` : '';
}

export function buildCoworkProjectKnowledgeContext(params: {
  projectId?: string | null;
  projectKnowledgeItems: ProjectKnowledgeItem[];
}): string {
  if (!params.projectId) {
    return '';
  }

  return params.projectKnowledgeItems
    .filter((item) => item.projectId === params.projectId)
    .slice(0, 8)
    .map((item) => `- ${item.title}: ${item.content}`)
    .join('\n');
}

export function buildCoworkOutboundMessage(params: {
  coworkMemoryContext: string;
  projectName?: string | null;
  projectKnowledgeContext?: string;
  folderContext?: string;
  referencedProjectFilesContext?: string;
  webSearchEnabled: boolean;
  relayFileInstruction: string;
  text: string;
}): string {
  const webSearchInstruction = params.webSearchEnabled
    ? [
        'Web search mode is enabled.',
        'For requests requiring up-to-date or external information, use web tools and provide citations.',
        'Always include a Sources section with markdown links for any factual claims from external sources.',
      ].join('\n')
    : '';

  return [
    params.coworkMemoryContext,
    params.projectName ? `Project context: ${params.projectName}` : '',
    params.projectKnowledgeContext ? `Project knowledge:\n${params.projectKnowledgeContext}` : '',
    params.folderContext ? `Working folder context: ${params.folderContext}` : '',
    params.referencedProjectFilesContext ?? '',
    webSearchInstruction,
    params.relayFileInstruction,
    '',
    params.text,
  ]
    .filter((part) => part.length > 0)
    .join('\n\n');
}
