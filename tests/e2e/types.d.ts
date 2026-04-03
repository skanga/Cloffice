import type { DesktopBridgeApi } from '../../src/types';

declare global {
  interface Window {
    cloffice?: DesktopBridgeApi;
    __scheduleExportText?: string | null;
    __restoreScheduleExportHooks?: () => void;
    __settingsScheduleExportText?: string | null;
    __restoreSettingsScheduleExportHooks?: () => void;
  }
}

export {};
