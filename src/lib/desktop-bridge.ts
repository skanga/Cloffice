export type DesktopBridge = NonNullable<Window['cloffice']>;

export function getDesktopBridge(): Window['cloffice'] {
  return window.cloffice;
}

export function requireDesktopBridge(): DesktopBridge {
  const bridge = getDesktopBridge();
  if (!bridge) {
    throw new Error('Desktop bridge unavailable.');
  }
  return bridge;
}
