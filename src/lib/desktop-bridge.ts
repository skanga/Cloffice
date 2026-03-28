export type DesktopBridge = NonNullable<Window['cloffice']>;

export function getDesktopBridge(): Window['cloffice'] | Window['relay'] {
  return window.cloffice ?? window.relay;
}

export function requireDesktopBridge(): DesktopBridge {
  const bridge = getDesktopBridge();
  if (!bridge) {
    throw new Error('Desktop bridge unavailable.');
  }
  return bridge;
}
