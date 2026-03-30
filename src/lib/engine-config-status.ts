export function buildLoadedEngineConnectionStatus(name: string): string {
  return `Loaded connection "${name}". Click Save and connect to apply it.`;
}

export function buildEngineConnectionNameRequiredStatus(): string {
  return 'Connection name is required.';
}

export function buildSavedEngineConnectionStatus(name: string): string {
  return `Saved connection "${name}".`;
}

export function buildUpdatedEngineConnectionStatus(): string {
  return 'Updated saved connection with current runtime settings.';
}

export function buildDeletedEngineConnectionStatus(): string {
  return 'Deleted saved connection.';
}

export function buildLoadedLocalConfigurationStatus(): string {
  return 'Loaded local configuration (bridge unavailable).';
}

export function buildBridgeUnavailableConfigurationStatus(): string {
  return 'Electron bridge unavailable. Configuration will be saved locally for this browser profile.';
}

export function buildConfigurationLoadedStatus(): string {
  return 'Configuration loaded.';
}

export function buildLoadedLocalFallbackConfigurationStatus(): string {
  return 'Loaded local fallback configuration.';
}

export function buildUnableToLoadConfigurationStatus(): string {
  return 'Unable to load config. Using defaults.';
}

export function buildSavingAndConnectingStatus(): string {
  return 'Saving and connecting...';
}

export function buildFailedToSaveConfigurationStatus(): string {
  return 'Failed to save configuration.';
}

export function buildConfigurationSavedConnectingStatus(): string {
  return 'Configuration saved. Connecting to runtime...';
}
