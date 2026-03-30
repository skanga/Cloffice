export function buildProjectSelectedStatus(name: string): string {
  return `Project selected: ${name}`;
}

export function buildProjectNameAndWorkspaceRequiredStatus(): string {
  return 'Project name and workspace folder are required.';
}

export function buildProjectNameRequiredStatus(): string {
  return 'Project name is required.';
}

export function buildProjectCreatedStatus(name: string): string {
  return `Project created: ${name}`;
}

export function buildProjectUpdatedStatus(name: string): string {
  return `Project updated: ${name}`;
}

export function buildKnowledgeTitleAndContentRequiredStatus(): string {
  return 'Knowledge title and content are required.';
}

export function buildKnowledgeSavedStatus(title: string): string {
  return `Knowledge saved: ${title}`;
}

export function buildKnowledgeDeletedStatus(): string {
  return 'Knowledge entry deleted.';
}

export function buildProjectDeletedStatus(name?: string): string {
  return name ? `Project deleted: ${name}` : 'Project deleted.';
}

export function buildRecentTitleEmptyStatus(): string {
  return 'Title cannot be empty.';
}
