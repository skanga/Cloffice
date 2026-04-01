/**
 * Type augmentation for the desktop bridge inside Playwright evaluate() callbacks.
 * Keeps the legacy `window.relay` alias while treating `window.cloffice` as the
 * primary desktop bridge surface.
 */
interface Window {
  cloffice?: {
    getConfig: () => Promise<any>;
    saveConfig: (config: { gatewayUrl: string; gatewayToken: string }) => Promise<any>;
    getInternalEngineStatus: () => Promise<any>;
    getInternalEngineRuntimeInfo: () => Promise<any>;
    getInternalRunHistory: (limit?: number) => Promise<any[]>;
    getInternalRunDetails: (runId: string) => Promise<any | null>;
    getInternalRuntimeRetentionPolicy: () => Promise<any>;
    connectInternalEngine: (options: any) => Promise<void>;
    disconnectInternalEngine: () => Promise<void>;
    getInternalEngineActiveSessionKey: () => Promise<string>;
    createInternalChatSession: () => Promise<string>;
    createInternalCoworkSession: () => Promise<string>;
    resolveInternalSessionKey: (preferredKey?: string) => Promise<string>;
    listInternalSessions: (limit?: number) => Promise<any[]>;
    listInternalModels: () => Promise<any[]>;
    getInternalSessionModel: (sessionKey: string) => Promise<string | null>;
    setInternalSessionModel: (sessionKey: string, modelValue: string | null) => Promise<void>;
    setInternalSessionTitle: (sessionKey: string, title: string | null) => Promise<void>;
    deleteInternalSession: (sessionKey: string) => Promise<void>;
    getInternalHistory: (sessionKey: string, limit?: number) => Promise<any[]>;
    listInternalCronJobs: () => Promise<any[]>;
    getInternalScheduleHistoryRetentionLimit: () => Promise<number>;
    createInternalPromptSchedule: (payload: {
      kind?: 'chat' | 'cowork';
      prompt: string;
      name?: string;
      intervalMinutes?: number;
      projectId?: string;
      projectTitle?: string;
      rootPath?: string;
      model?: string | null;
    }) => Promise<any>;
    updateInternalPromptSchedule: (id: string, payload: {
      enabled?: boolean;
      intervalMinutes?: number;
      name?: string;
      prompt?: string;
      model?: string | null;
      clearHistory?: boolean;
    }) => Promise<any>;
    setInternalRuntimeRetentionPolicy: (payload: {
      runHistoryRetentionLimit?: number;
      artifactHistoryRetentionLimit?: number;
    }) => Promise<any>;
    setInternalScheduleHistoryRetentionLimit: (limit: number) => Promise<number>;
    deleteInternalPromptSchedule: (id: string) => Promise<void>;
    seedInternalScheduleArtifactForE2E?: (id: string) => Promise<unknown>;
    sendInternalChat: (sessionKey: string, text: string) => Promise<any>;
    setInternalEngineEventHandler: (handler: ((frame: any) => void) | null) => void;
    testInternalProviderConnection: (providerId: 'openai' | 'anthropic' | 'gemini', config?: any) => Promise<any>;
    debugNormalizeInternalCoworkResponse: (payload: any) => Promise<any>;
    continueInternalCoworkRun: (payload: any) => Promise<any>;
    listInternalPendingApprovals: () => Promise<any[]>;
    saveInternalPendingApproval: (flow: any) => Promise<void>;
    clearInternalPendingApproval: (runId: string) => Promise<void>;
    applyInternalPendingApprovalDecision: (runId: string, decision: any) => Promise<any>;
    getEngineConfig: () => Promise<any>;
    saveEngineConfig: (draft: any) => Promise<any>;
    healthCheck: (baseUrl: string) => Promise<any>;
    checkRuntimeHealth: (baseUrl: string) => Promise<any>;
    minimizeWindow: () => Promise<void>;
    toggleMaximizeWindow: () => Promise<boolean>;
    isWindowMaximized: () => Promise<boolean>;
    closeWindow: () => Promise<void>;
    showSystemMenu: (x: number, y: number) => Promise<void>;
    getDownloadsPath: () => Promise<string>;
    selectFolder: (initialPath?: string) => Promise<string | null>;
    planOrganizeFolder: (rootPath: string) => Promise<any>;
    applyOrganizeFolderPlan: (rootPath: string, actions: any[]) => Promise<any>;
    createFileInFolder: (rootPath: string, relativePath: string, content: string, overwrite?: boolean) => Promise<any>;
    appendFileInFolder: (rootPath: string, relativePath: string, content: string) => Promise<any>;
    readFileInFolder: (rootPath: string, relativePath: string) => Promise<{ filePath: string; content: string }>;
    listDirInFolder: (rootPath: string, relativePath?: string) => Promise<any>;
    existsInFolder: (rootPath: string, relativePath: string) => Promise<{ path: string; exists: boolean; kind: string }>;
    renameInFolder: (rootPath: string, oldRelative: string, newRelative: string) => Promise<any>;
    deleteInFolder: (rootPath: string, relativePath: string) => Promise<any>;
    statInFolder: (rootPath: string, relativePath: string) => Promise<any>;
    openPath: (targetPath: string) => Promise<{ ok: boolean; error?: string }>;
  };
  relay?: Window['cloffice'];
}
