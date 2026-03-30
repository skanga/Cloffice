export function buildLocalFileOrganizerUnavailableStatus(): string {
  return 'Local file organizer is available in the Electron desktop app only.';
}

export function buildWorkingFolderRequiredStatus(): string {
  return 'Select a working folder first.';
}

export function buildLocalPlanReadyStatus(actionCount: number, rootPath: string): string {
  return `Plan ready: ${actionCount} file action${actionCount === 1 ? '' : 's'} in ${rootPath}`;
}

export function buildLocalPlanCreationFailureStatus(): string {
  return 'Failed to create local file plan.';
}

export function buildNoFolderSelectedStatus(): string {
  return 'No folder selected.';
}

export function buildBrowserSandboxFolderSelectedStatus(path: string): string {
  return `Folder selected in browser sandbox: ${path}. To apply local file changes, run the Electron desktop app (npm run dev).`;
}

export function buildWorkingFolderSelectedStatus(path: string): string {
  return `Working folder selected: ${path}`;
}

export function buildFolderPickerFailureStatus(): string {
  return 'Unable to open folder picker.';
}

export function buildArtifactOpenBridgeUnavailableStatus(): string {
  return 'Opening artifacts requires the Electron desktop bridge.';
}

export function buildArtifactOpenedStatus(path: string): string {
  return `Opened artifact: ${path}`;
}

export function buildArtifactOpenFailureStatus(): string {
  return 'Unable to open artifact.';
}

export function buildSaveSkillBridgeUnavailableStatus(): string {
  return 'Saving a skill requires the Electron desktop bridge.';
}

export function buildMissingCoworkPromptForSkillStatus(): string {
  return 'No cowork prompt found to save as a skill.';
}

export function buildSavedSkillDraftStatus(path: string): string {
  return `Saved skill draft: ${path}`;
}

export function buildSaveSkillFailureStatus(): string {
  return 'Unable to save skill draft.';
}

export function buildLocalPlanApplyPreconditionStatus(): string {
  return 'Create a plan before applying changes.';
}

export function buildLocalPlanAppliedStatus(applied: number, skipped: number, hasErrors: boolean): string {
  return `Applied ${applied} action${applied === 1 ? '' : 's'}, skipped ${skipped}. ${hasErrors ? 'Some items had errors.' : 'Done.'}`;
}

export function buildLocalPlanApplyFailureStatus(): string {
  return 'Failed to apply local file plan.';
}

export function buildCreateFileBridgeUnavailableStatus(): string {
  return 'Creating local files is available in the Electron desktop app only.';
}

export function buildRelativeFilePathRequiredStatus(): string {
  return 'Provide a relative file path (for example: notes/todo.md).';
}

export function buildCreatedFileStatus(path: string): string {
  return `Created file: ${path}`;
}

export function buildCreateFileFailureStatus(): string {
  return 'Failed to create file in working folder.';
}

export function buildLocalActionSmokeUnavailableStatus(): string {
  return 'Local action smoke test is available in the Electron desktop app only.';
}

export function buildLocalActionSmokeFailedStatus(error: string): string {
  return `Local action smoke test failed: ${error}`;
}

export function buildLocalActionSmokePassedStatus(rootPath: string, relativePath: string): string {
  return `Local action smoke test passed. File: ${rootPath}\\${relativePath}`;
}

export function buildWindowControlsUnavailableStatus(): string {
  return 'Window controls are available only in the Electron desktop app.';
}

export function buildWindowMinimizeFailureStatus(): string {
  return 'Unable to minimize window.';
}

export function buildWindowResizeFailureStatus(): string {
  return 'Unable to resize window.';
}

export function buildWindowCloseFailureStatus(): string {
  return 'Unable to close window from bridge.';
}

export function buildWindowSystemMenuFailureStatus(): string {
  return 'Unable to open system menu.';
}
