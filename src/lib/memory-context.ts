import type { MemoryEntry } from '@/app-types';
import { LEGACY_STORAGE_KEYS, readLocalStorageItem, STORAGE_KEYS } from './storage-keys';

export const MEMORY_STORAGE_KEY = STORAGE_KEYS.memoryEntries;
const MEMORY_STORAGE_LEGACY_KEYS = [LEGACY_STORAGE_KEYS.memoryEntries] as const;

/** Injection priority: rules > about-me > reflection > knowledge */
const CATEGORY_ORDER: MemoryEntry['category'][] = ['rules', 'about-me', 'reflection', 'knowledge'];

const CATEGORY_LABELS: Record<MemoryEntry['category'], string> = {
  rules: 'RULES',
  'about-me': 'ABOUT THE OPERATOR',
  reflection: 'CONTEXT & REFLECTIONS',
  knowledge: 'KNOWLEDGE',
};

/** ~2000 token budget expressed as character count */
const CHAR_BUDGET = 8000;

export function loadMemoryEntries(): MemoryEntry[] {
  try {
    const raw = readLocalStorageItem(MEMORY_STORAGE_KEY, MEMORY_STORAGE_LEGACY_KEYS);
    if (!raw) return [];
    return JSON.parse(raw) as MemoryEntry[];
  } catch {
    return [];
  }
}

function formatCategoryBlock(label: string, entries: MemoryEntry[]): string {
  const lines = entries.map((e) =>
    e.content.trim() ? `- ${e.title}: ${e.content}` : `- ${e.title}`,
  );
  return `[${label}]\n${lines.join('\n')}`;
}

/**
 * Builds the context block injected before every outbound message.
 * Returns an empty string when there is nothing to inject.
 *
 * Priority: systemPrompt → rules → about-me → reflection → knowledge
 * Entries are truncated to ~2000 tokens (8000 chars) in priority order.
 */
export function buildMemoryContext(entries: MemoryEntry[], systemPrompt = ''): string {
  const parts: string[] = [];

  if (systemPrompt.trim()) {
    parts.push(systemPrompt.trim());
  }

  if (entries.length > 0) {
    const byCategory = CATEGORY_ORDER.reduce<Map<MemoryEntry['category'], MemoryEntry[]>>(
      (map, cat) => {
        const catEntries = entries.filter((e) => e.category === cat);
        if (catEntries.length > 0) map.set(cat, catEntries);
        return map;
      },
      new Map(),
    );

    let charsUsed = 0;
    const blocks: string[] = [];

    for (const cat of CATEGORY_ORDER) {
      const catEntries = byCategory.get(cat);
      if (!catEntries) continue;

      const fitting: MemoryEntry[] = [];
      for (const entry of catEntries) {
        const cost = entry.title.length + entry.content.length + 10;
        if (charsUsed + cost > CHAR_BUDGET) break;
        fitting.push(entry);
        charsUsed += cost;
      }

      if (fitting.length > 0) {
        blocks.push(formatCategoryBlock(CATEGORY_LABELS[cat], fitting));
      }

      if (charsUsed >= CHAR_BUDGET) break;
    }

    if (blocks.length > 0) {
      parts.push(`<operator_context>\n${blocks.join('\n\n')}\n</operator_context>`);
    }
  }

  return parts.join('\n\n');
}
