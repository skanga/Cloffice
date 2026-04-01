import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent, ReactNode } from 'react';
import { Code2, Folder, Globe, KeyRound, Link2, Shield, Terminal, Trash2 } from 'lucide-react';

import type { EngineConnectionProfile, EngineProviderId, HealthCheckResult, UserPreferences } from '@/app-types';
import type { ScheduledJob } from '@/app-types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { getDesktopBridge } from '@/lib/desktop-bridge';
import type { InternalProviderConfig } from '@/lib/engine-config';
import { listConnectors, persistConnectorConfig } from '@/lib/connectors';
import { loadAllowedDomains, saveAllowedDomains } from '@/lib/connectors/web-fetch';
import { getEngineProvider, listEngineProviders } from '@/lib/engine-provider-registry';
import type { InternalEngineRunRecord, InternalEngineRuntimeInfo, InternalEngineRuntimeRetentionPolicy } from '@/lib/internal-engine-bridge';
import type { InternalProviderConnectionTestResult } from '@/lib/internal-provider-adapter';
import type { ConnectorDefinition } from '@/lib/connectors/connector-types';

type AppLanguage = 'en' | 'de';

type SettingsSection = 'Profile' | 'Appearance' | 'System Prompt' | 'Gateway' | 'Connectors' | 'Account' | 'Privacy' | 'Developer';

type StyleOption = UserPreferences['style'];
type ThemeOption = UserPreferences['theme'];

type SettingsPageProps = {
  activeSection: SettingsSection;
  focusedInternalRunId?: string | null;
  focusedScheduledJobId?: string | null;
  scheduledJobs: ScheduledJob[];
  draftEngineProviderId: EngineProviderId;
  draftEngineUrl: string;
  draftEngineToken: string;
  draftInternalProviderConfig: InternalProviderConfig;
  health: HealthCheckResult | null;
  status: string;
  saving: boolean;
  pairingRequestId: string | null;
  preferences: UserPreferences;
  engineConnections: EngineConnectionProfile[];
  selectedEngineConnectionId: string | null;
  onDraftEngineProviderIdChange: (value: EngineProviderId) => void;
  onDraftEngineUrlChange: (value: string) => void;
  onDraftEngineTokenChange: (value: string) => void;
  onDraftInternalProviderConfigChange: (patch: Partial<InternalProviderConfig>) => void;
  onSave: (event: FormEvent) => void;
  onSelectEngineConnection: (connectionId: string) => void;
  onSaveEngineConnection: (name: string) => void;
  onOverwriteEngineConnection: (connectionId: string) => void;
  onDeleteEngineConnection: (connectionId: string) => void;
  onResetPairing: () => void | Promise<void>;
  onUpdatePreferences: (patch: Partial<UserPreferences>) => void;
  onOpenScheduleJob?: (jobId: string) => void | Promise<void>;
  onClearScheduleRunFilter?: () => void;
  onExportCurrentSchedules?: () => void | Promise<void>;
  onImportSchedules?: (content: string) => void | Promise<void>;
};

const sectionDescriptions: Record<SettingsSection, { en: string; de: string }> = {
  Profile: {
    en: 'Your name, role, and response preferences.',
    de: 'Dein Name, deine Rolle und Antwortspraeferenzen.',
  },
  Appearance: {
    en: 'Theme, language, and notifications.',
    de: 'Design, Sprache und Benachrichtigungen.',
  },
  'System Prompt': {
    en: 'Default instructions for every conversation.',
    de: 'Standardanweisungen fuer jede Konversation.',
  },
  Gateway: {
    en: 'Engine/runtime connection and internal provider setup.',
    de: 'Engine-Laufzeit und interne Provider-Einrichtung.',
  },
  Connectors: {
    en: 'Connect external services to Cloffice.',
    de: 'Externe Dienste mit Cloffice verbinden.',
  },
  Account: {
    en: 'Email, password, and security settings.',
    de: 'E-Mail, Passwort und Sicherheitseinstellungen.',
  },
  Privacy: {
    en: 'Data sharing and retention policies.',
    de: 'Datenfreigaben und Aufbewahrungsrichtlinien.',
  },
  Developer: {
    en: 'Developer options and debugging tools.',
    de: 'Entwickleroptionen und Debugging-Tools.',
  },
};

function StylePreview({ style, dark }: { style: StyleOption; dark: boolean }) {
  const isRelay = style === 'relay';
  const colors = isRelay
    ? dark
      ? {
          bg: '#0b0d0c',
          surface: '#121514',
          border: '#2b312e',
          lineStrong: '#f1f5f3',
          lineSoft: '#98a8a2',
          lineMuted: '#6d7b75',
          panel: '#1a1f1d',
          accentStrong: '#bbf451',
          accentSoft: '#3c4d1b',
        }
      : {
          bg: '#f6f8f7',
          surface: '#ffffff',
          border: '#d8dfdb',
          lineStrong: '#101513',
          lineSoft: '#5f6f68',
          lineMuted: '#8ea099',
          panel: '#f2f6f4',
          accentStrong: '#7b9f2f',
          accentSoft: '#dcf0b3',
        }
    : dark
      ? {
          bg: '#1f1d1a',
          surface: '#2a2723',
          border: '#3b3732',
          lineStrong: '#e4dacd',
          lineSoft: '#a79a8b',
          lineMuted: '#7f7569',
          panel: '#302d29',
          accentStrong: '#df9a79',
          accentSoft: '#553f35',
        }
      : {
          bg: '#f4f3ee',
          surface: '#fff9f2',
          border: '#ded3c2',
          lineStrong: '#9b806f',
          lineSoft: '#c7b19d',
          lineMuted: '#dcc9b7',
          panel: '#f0e5d7',
          accentStrong: '#c47a5c',
          accentSoft: '#edd4c7',
        };

  return (
    <svg viewBox="0 0 320 140" className="block h-full w-full" preserveAspectRatio="none" role="img" aria-label={`${isRelay ? 'Relay' : 'Claude'} style preview`}>
      <rect x="0" y="0" width="320" height="140" fill={colors.bg} />
      <rect x="10" y="10" width="98" height="120" rx="10" fill={colors.surface} stroke={colors.border} />
      <rect x="22" y="22" width="48" height="8" rx="4" fill={colors.accentStrong} opacity="0.85" />
      <rect x="22" y="36" width="34" height="5" rx="2.5" fill={colors.lineSoft} />
      <rect x="22" y="46" width="40" height="5" rx="2.5" fill={colors.lineMuted} />
      <rect x="22" y="58" width="74" height="24" rx="7" fill={colors.accentSoft} />

      <rect x="118" y="10" width="192" height="120" rx="10" fill={colors.surface} stroke={colors.border} />
      <rect x="132" y="22" width="96" height="8" rx="4" fill={colors.lineStrong} />
      <rect x="132" y="36" width="152" height="5" rx="2.5" fill={colors.lineSoft} />
      <rect x="132" y="46" width="132" height="5" rx="2.5" fill={colors.lineMuted} />
      <rect x="132" y="62" width="78" height="30" rx="8" fill={colors.panel} stroke={colors.border} />
      <rect x="220" y="62" width="76" height="30" rx="8" fill={colors.accentSoft} />
    </svg>
  );
}

function ThemePreview({ mode, style }: { mode: ThemeOption; style: StyleOption }) {
  const modeLabel = mode === 'light' ? 'Light' : mode === 'dark' ? 'Dark' : 'Auto';
  const isRelay = style === 'relay';
  const light = isRelay
    ? {
        bg: '#f6f8f7',
        surface: '#ffffff',
        border: '#d8dfdb',
        lineStrong: '#101513',
        lineSoft: '#5f6f68',
        lineMuted: '#8ea099',
        panel: '#f2f6f4',
      }
    : {
        bg: '#f4f3ee',
        surface: '#fff9f2',
        border: '#ded3c2',
        lineStrong: '#9b806f',
        lineSoft: '#c7b19d',
        lineMuted: '#dcc9b7',
        panel: '#f0e5d7',
      };
  const dark = isRelay
    ? {
        bg: '#0b0d0c',
        surface: '#121514',
        border: '#2b312e',
        lineStrong: '#f1f5f3',
        lineSoft: '#98a8a2',
        lineMuted: '#6d7b75',
        panel: '#1a1f1d',
      }
    : {
        bg: '#1f1d1a',
        surface: '#2a2723',
        border: '#3b3732',
        lineStrong: '#e4dacd',
        lineSoft: '#a79a8b',
        lineMuted: '#7f7569',
        panel: '#302d29',
      };

  const active = mode === 'dark' ? dark : light;
  return (
    <svg viewBox="0 0 320 140" className="block h-full w-full" preserveAspectRatio="none" role="img" aria-label={`${modeLabel} theme preview`}>
      <rect x="0" y="0" width="320" height="140" fill={mode === 'auto' ? light.bg : active.bg} />
      {mode === 'auto' ? <rect x="160" y="0" width="160" height="140" fill={dark.bg} /> : null}
      <rect
        x="14"
        y="14"
        width={mode === 'auto' ? 140 : 292}
        height="112"
        rx="10"
        fill={mode === 'auto' ? light.surface : active.surface}
        stroke={mode === 'auto' ? light.border : active.border}
      />
      <rect
        x={mode === 'auto' ? 166 : 26}
        y="14"
        width={mode === 'auto' ? 140 : 0}
        height="112"
        rx="10"
        fill={mode === 'auto' ? dark.surface : active.surface}
        stroke={mode === 'auto' ? dark.border : 'transparent'}
      />

      <rect x={mode === 'auto' ? 28 : 30} y="30" width="56" height="7" rx="3.5" fill={mode === 'auto' ? light.lineStrong : active.lineStrong} />
      <rect x={mode === 'auto' ? 28 : 30} y="43" width="86" height="5" rx="2.5" fill={mode === 'auto' ? light.lineSoft : active.lineSoft} />
      <rect x={mode === 'auto' ? 28 : 30} y="54" width="70" height="5" rx="2.5" fill={mode === 'auto' ? light.lineMuted : active.lineMuted} />
      <rect x={mode === 'auto' ? 28 : 30} y="66" width="66" height="24" rx="7" fill={mode === 'auto' ? light.panel : active.panel} />

      {mode === 'auto' ? (
        <>
          <rect x="180" y="30" width="56" height="7" rx="3.5" fill={dark.lineStrong} />
          <rect x="180" y="43" width="86" height="5" rx="2.5" fill={dark.lineSoft} />
          <rect x="180" y="54" width="70" height="5" rx="2.5" fill={dark.lineMuted} />
          <rect x="180" y="66" width="66" height="24" rx="7" fill={dark.panel} />
          <line x1="160" y1="14" x2="160" y2="126" stroke={dark.border} strokeDasharray="4 4" />
        </>
      ) : null}
    </svg>
  );
}

export function SettingsPage({
  activeSection,
  focusedInternalRunId = null,
  focusedScheduledJobId = null,
  scheduledJobs,
  draftEngineProviderId,
  draftEngineUrl,
  draftEngineToken,
  draftInternalProviderConfig,
  health,
  status,
  saving,
  pairingRequestId,
  preferences,
  engineConnections,
  selectedEngineConnectionId,
  onDraftEngineProviderIdChange,
  onDraftEngineUrlChange,
  onDraftEngineTokenChange,
  onDraftInternalProviderConfigChange,
  onSave,
  onSelectEngineConnection,
  onSaveEngineConnection,
  onOverwriteEngineConnection,
  onDeleteEngineConnection,
  onResetPairing,
  onUpdatePreferences,
  onOpenScheduleJob,
  onClearScheduleRunFilter,
  onExportCurrentSchedules,
  onImportSchedules,
}: SettingsPageProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [copied, setCopied] = useState(false);
  const [prefersDarkSystem, setPrefersDarkSystem] = useState(false);
  const [connectionNameDraft, setConnectionNameDraft] = useState('');
  const [internalRuntimeInfo, setInternalRuntimeInfo] = useState<InternalEngineRuntimeInfo | null>(null);
  const [internalRuntimeRetentionPolicy, setInternalRuntimeRetentionPolicy] = useState<InternalEngineRuntimeRetentionPolicy | null>(null);
  const [internalRunHistory, setInternalRunHistory] = useState<InternalEngineRunRecord[]>([]);
  const [highlightedRunId, setHighlightedRunId] = useState<string | null>(null);
  const [testingProviderId, setTestingProviderId] = useState<'openai' | 'anthropic' | 'gemini' | null>(null);
  const [providerTestResult, setProviderTestResult] = useState<InternalProviderConnectionTestResult | null>(null);
  const scheduleImportInputRef = useRef<HTMLInputElement | null>(null);
  const engineProviders = useMemo(() => listEngineProviders(), []);
  const effectiveEngineProviders = useMemo(
    () => engineProviders.map((provider) => (
      provider.id === 'internal' && internalRuntimeInfo
        ? {
            ...provider,
            availableInBuild: internalRuntimeInfo.status.availableInBuild,
            selectionEnabled: internalRuntimeInfo.status.availableInBuild,
            availabilityReason: internalRuntimeInfo.status.availableInBuild ? undefined : internalRuntimeInfo.status.unavailableReason,
            summary: internalRuntimeInfo.status.availableInBuild
              ? `Developer-only internal runtime ${internalRuntimeInfo.readiness === 'ready' ? 'ready for chat sessions' : 'available in this build'}.`
              : provider.summary,
          }
        : provider
    )),
    [engineProviders, internalRuntimeInfo],
  );
  const selectedEngineProvider = useMemo(() => getEngineProvider(draftEngineProviderId), [draftEngineProviderId]);
  const mainEngineProviders = effectiveEngineProviders;
  const scheduledJobsById = useMemo(() => {
    const map = new Map<string, ScheduledJob>();
    for (const job of scheduledJobs) {
      map.set(job.id, job);
    }
    return map;
  }, [scheduledJobs]);
  const filteredInternalRunHistory = useMemo(
    () => focusedScheduledJobId
      ? internalRunHistory.filter((run) => run.scheduleId === focusedScheduledJobId)
      : internalRunHistory,
    [focusedScheduledJobId, internalRunHistory],
  );
  const focusedSchedule = focusedScheduledJobId ? scheduledJobsById.get(focusedScheduledJobId) ?? null : null;
  const selectedEngineProviderCard = useMemo(
    () => effectiveEngineProviders.find((provider) => provider.id === draftEngineProviderId) ?? selectedEngineProvider,
    [draftEngineProviderId, effectiveEngineProviders, selectedEngineProvider],
  );
  const t = useCallback((en: string, de: string) => (preferences.language === 'de' ? de : en), [preferences.language]);
  const runtimeEndpointPlaceholder = 'internal://dev-runtime';
  const runtimeTokenPlaceholder = t('Not used for the internal engine', 'Wird fuer die interne Engine nicht verwendet');

  const handleImportScheduleFileSelection = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !onImportSchedules) {
      return;
    }
    const content = await file.text();
    await onImportSchedules(content);
  }, [onImportSchedules]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const applyPreference = () => setPrefersDarkSystem(media.matches);
    applyPreference();

    media.addEventListener('change', applyPreference);
    return () => media.removeEventListener('change', applyPreference);
  }, []);

  useEffect(() => {
    const bridge = getDesktopBridge();
    if (!bridge?.getInternalEngineRuntimeInfo) {
      setInternalRuntimeInfo(null);
      setInternalRuntimeRetentionPolicy(null);
      setInternalRunHistory([]);
      return;
    }

    let cancelled = false;
    Promise.all([
      bridge.getInternalEngineRuntimeInfo(),
      bridge.getInternalRuntimeRetentionPolicy?.() ?? Promise.resolve(null),
      bridge.getInternalRunHistory?.(5) ?? Promise.resolve([]),
    ]).then(([info, retentionPolicy, runs]) => {
      if (!cancelled) {
        setInternalRuntimeInfo(info);
        setInternalRuntimeRetentionPolicy(retentionPolicy);
        setInternalRunHistory(runs);
      }
    }).catch(() => {
      if (!cancelled) {
        setInternalRuntimeInfo(null);
        setInternalRuntimeRetentionPolicy(null);
        setInternalRunHistory([]);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleRuntimeRetentionChange = useCallback(async (
    field: 'runHistoryRetentionLimit' | 'artifactHistoryRetentionLimit',
    value: number,
  ) => {
    const bridge = getDesktopBridge();
    if (!bridge?.setInternalRuntimeRetentionPolicy) {
      return;
    }
    const nextPolicy = await bridge.setInternalRuntimeRetentionPolicy({ [field]: value });
    setInternalRuntimeRetentionPolicy(nextPolicy);
  }, []);

  useEffect(() => {
    if (activeSection !== 'Developer' || !focusedInternalRunId) {
      return;
    }

    setHighlightedRunId(focusedInternalRunId);
    const scrollTimer = window.setTimeout(() => {
      document.getElementById(`internal-run-${focusedInternalRunId}`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }, 60);
    const clearTimer = window.setTimeout(() => {
      setHighlightedRunId((current) => (current === focusedInternalRunId ? null : current));
    }, 2500);

    return () => {
      window.clearTimeout(scrollTimer);
      window.clearTimeout(clearTimer);
    };
  }, [activeSection, focusedInternalRunId, internalRunHistory]);

  const useDarkPreview =
    preferences.theme === 'dark' || (preferences.theme === 'auto' && prefersDarkSystem);

  const effectivePairingId = useMemo(() => {
    if (pairingRequestId) return pairingRequestId;
    if (health && !health.ok) {
      const match = health.message.match(
        /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
      );
      return match?.[0] ?? null;
    }
    return null;
  }, [pairingRequestId, health]);

  const handleSaveCurrentConnection = useCallback(() => {
    const fallbackName = draftEngineUrl.trim() || (draftEngineProviderId === 'internal' ? 'Internal engine' : 'Runtime connection');
    const nextName = connectionNameDraft.trim() || fallbackName;
    onSaveEngineConnection(nextName);
    setConnectionNameDraft('');
  }, [connectionNameDraft, draftEngineProviderId, draftEngineUrl, onSaveEngineConnection]);

  const renderPlaceholder = (icon: ReactNode, hint: string) => (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border/60 py-12 text-center">
      <div className="flex size-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        {icon}
      </div>
      <div>
        <p className="text-sm font-medium text-muted-foreground">{t('Not available yet', 'Noch nicht verfuegbar')}</p>
        <p className="mt-0.5 text-xs text-muted-foreground/70">{hint}</p>
      </div>
    </div>
  );

  return (
    <section className="mx-auto w-full max-w-[720px] px-2">
      <div className="mb-6">
        <h1 className="mb-1 text-[clamp(1.55rem,2.4vw,2rem)] tracking-tight">
          {preferences.language === 'de'
            ? ({
                Profile: 'Profil',
                Appearance: 'Darstellung',
                'System Prompt': 'System-Prompt',
                Gateway: 'Engine',
                Connectors: 'Konnektoren',
                Account: 'Konto',
                Privacy: 'Datenschutz',
                Developer: 'Entwickler',
              } as const)[activeSection]
            : activeSection === 'Gateway' ? 'Engine' : activeSection}
        </h1>
        <p className="font-sans text-sm text-muted-foreground">{sectionDescriptions[activeSection][preferences.language]}</p>
      </div>

      {activeSection === 'Profile' && (
        <section className="pb-6">
          <div className="mb-3">
            <h2 className="text-base font-medium">{t('Personal details', 'Persoenliche Daten')}</h2>
          </div>
          <div className="grid gap-4">
            <div className="grid gap-3 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
              <label className="grid gap-1">
                <span className="font-sans text-xs text-muted-foreground">{t('Full name', 'Vollstaendiger Name')}</span>
                <Input className="font-sans" placeholder="Christian Lutz" value={preferences.fullName} onChange={(e) => onUpdatePreferences({ fullName: e.target.value })} />
              </label>
              <label className="grid gap-1">
                <span className="font-sans text-xs text-muted-foreground">{t('How should Cloffice address you?', 'Wie soll Relay dich nennen?')}</span>
                <Input className="font-sans" placeholder="Christian" value={preferences.displayName} onChange={(e) => onUpdatePreferences({ displayName: e.target.value })} />
              </label>
            </div>
            <label className="grid gap-1">
              <span className="font-sans text-xs text-muted-foreground">{t('Role', 'Arbeitsfunktion')}</span>
              <Input className="font-sans" placeholder={t('e.g. Founder, Engineer, Designer', 'z. B. Gruender, Entwickler, Designer')} value={preferences.role} onChange={(e) => onUpdatePreferences({ role: e.target.value })} />
            </label>
            <label className="grid gap-1">
              <span className="font-sans text-xs text-muted-foreground">{t('Response preferences', 'Antwortspraeferenzen')}</span>
              <Textarea className="font-sans" placeholder={t('e.g. I mainly code in Python.', 'z. B. Ich programmiere hauptsaechlich in Python.')} value={preferences.responsePreferences} onChange={(e) => onUpdatePreferences({ responsePreferences: e.target.value })} />
            </label>
          </div>
        </section>
      )}

      {activeSection === 'Appearance' && (
        <div className="flex flex-col gap-6">
          <section>
            <div className="mb-3">
              <h2 className="text-base font-medium">{t('Theme', 'Theme')}</h2>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              {([
                [t('Light', 'Hell'), 'light'],
                [t('Auto', 'Auto'), 'auto'],
                [t('Dark', 'Dunkel'), 'dark'],
              ] as const).map(([label, value]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => onUpdatePreferences({ theme: value })}
                  className={`overflow-hidden rounded-xl border p-0 text-left transition-colors ${
                    preferences.theme === value
                      ? 'border-primary/50 bg-background text-foreground shadow-[0_0_0_1px_hsl(var(--primary)/0.2)]'
                      : 'border-border bg-background text-muted-foreground hover:border-border/80 hover:bg-muted/30'
                  }`}
                >
                  <div className="relative h-36 w-full overflow-hidden border-b border-border/70">
                    <div className="absolute inset-0">
                      <ThemePreview mode={value} style={preferences.style} />
                    </div>
                  </div>
                  <div className="flex min-h-[92px] flex-col px-3 py-3">
                    <p className="text-[1rem] font-medium leading-none text-foreground">{label}</p>
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      {value === 'light'
                        ? t('Always use light surfaces', 'Immer helle Oberflaechen verwenden')
                        : value === 'dark'
                          ? t('Always use dark surfaces', 'Immer dunkle Oberflaechen verwenden')
                          : t('Follow system appearance', 'Systemdarstellung uebernehmen')}
                    </p>
                    <p className="mt-auto pt-2 text-[11px] font-medium text-muted-foreground/85">
                      {value === 'auto'
                        ? `${t('Currently:', 'Aktuell:')} ${prefersDarkSystem ? t('Dark', 'Dunkel') : t('Light', 'Hell')}`
                        : '\u00a0'}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </section>

          <Separator />

          <section>
            <div className="mb-3">
              <h2 className="text-base font-medium">{t('Style', 'Stil')}</h2>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {([
                ['claude', t('Claude Cowork', 'Claude Cowork'), t('Warm editorial look', 'Warmer Editorial-Look')],
                ['relay', t('Cloffice', 'Cloffice'), t('Crisp product look', 'Klarer Produkt-Look')],
              ] as const).map(([value, label, description]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => onUpdatePreferences({ style: value })}
                  className={`overflow-hidden rounded-xl border p-0 text-left transition ${
                    preferences.style === value
                      ? 'border-primary/40 bg-primary/10 text-foreground'
                      : 'border-border bg-background text-muted-foreground hover:bg-muted'
                  }`}
                >
                  <div className="relative h-36 w-full overflow-hidden border-b border-border/70">
                    <div className="absolute inset-0">
                      <StylePreview style={value} dark={useDarkPreview} />
                    </div>
                  </div>
                  <div className="px-3 py-3">
                    <p className="text-sm font-medium text-foreground">{label}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{description}</p>
                  </div>
                </button>
              ))}
            </div>
          </section>

          <Separator />

          <section>
            <div className="mb-3">
              <h2 className="text-base font-medium">{t('Language', 'Sprache')}</h2>
            </div>
            <label className="grid gap-1">
              <span className="font-sans text-xs text-muted-foreground">{t('UI language', 'UI-Sprache')}</span>
              <select
                value={preferences.language}
                onChange={(event) => onUpdatePreferences({ language: event.target.value as AppLanguage })}
                className="h-9 rounded-md border border-border bg-background px-2 font-sans text-sm"
              >
                <option value="en">English (primary)</option>
                <option value="de">Deutsch (secondary)</option>
              </select>
            </label>
          </section>

          <Separator />

          <section>
            <div className="mb-3">
              <h2 className="text-base font-medium">{t('Notifications', 'Benachrichtigungen')}</h2>
            </div>
            <div className="flex flex-col gap-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium">{t('Response completions', 'Antwort-Vervollstaendigungen')}</p>
                  <p className="text-xs text-muted-foreground">
                    {t('Get notified when a response has completed.', 'Benachrichtige mich, wenn eine Antwort abgeschlossen ist.')}
                  </p>
                </div>
                <Button variant="outline" size="sm">{t('Enable', 'Aktivieren')}</Button>
              </div>
              <Separator />
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium">{t('System alerts', 'Systemhinweise')}</p>
                  <p className="text-xs text-muted-foreground">{t('Updates about scheduled tasks and status.', 'Updates zu geplanten Tasks und Status.')}</p>
                </div>
                <Button variant="outline" size="sm">{t('Manage', 'Verwalten')}</Button>
              </div>
            </div>
          </section>
        </div>
      )}

      {activeSection === 'System Prompt' && (
        <section className="pb-6">
          <div className="mb-3">
            <h2 className="text-base font-medium">{t('Default system prompt', 'Standard System-Prompt')}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t('Prepended as context to every conversation.', 'Wird jeder Konversation als Kontext vorangestellt.')}</p>
          </div>
          <Textarea
            className="min-h-[180px] font-sans text-sm"
            placeholder={t('e.g. You are a helpful SeventeenLabs assistant. Reply in English.', 'z. B. Du bist ein hilfreicher Assistent von SeventeenLabs. Antworte immer auf Deutsch.')}
            value={preferences.systemPrompt}
            onChange={(e) => onUpdatePreferences({ systemPrompt: e.target.value })}
          />
          <p className="mt-2 font-sans text-[11px] text-muted-foreground/60">
            {preferences.systemPrompt.length} {t('characters', 'Zeichen')}
          </p>
          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              role="switch"
              aria-checked={preferences.injectMemory}
              onClick={() => onUpdatePreferences({ injectMemory: !preferences.injectMemory })}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                preferences.injectMemory ? 'bg-primary' : 'bg-input'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform ${
                  preferences.injectMemory ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </button>
            <button
              type="button"
              className="font-sans text-sm text-foreground/80 cursor-pointer select-none text-left"
              onClick={() => onUpdatePreferences({ injectMemory: !preferences.injectMemory })}
            >
              {t('Inject memory into conversations', 'Erinnerungen in Konversationen einbetten')}
            </button>
          </div>
        </section>
      )}

      {activeSection === 'Gateway' && (
        <div className="flex flex-col gap-6">
          <section>
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-base font-medium">{t('Connection', 'Verbindung')}</h2>
              <Badge
                variant="outline"
                className={
                  health?.ok
                    ? 'rounded-full border border-primary/35 bg-primary/10 font-sans text-[11px] text-primary'
                    : 'rounded-full font-sans text-[11px]'
                }
              >
                {health?.ok ? t('Connected', 'Verbunden') : t('Not connected', 'Nicht verbunden')}
              </Badge>
            </div>
            <div className="mb-4 grid gap-3">
              <div>
                <p className="font-sans text-xs text-muted-foreground">{t('Engine provider', 'Engine-Anbieter')}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t(
                    selectedEngineProviderCard.id === 'internal' && internalRuntimeInfo
                      ? `Internal runtime is ${internalRuntimeInfo.readiness} in this build.`
                      : selectedEngineProviderCard.availableInBuild
                        ? `${selectedEngineProviderCard.displayName} is available in this build.`
                        : `${selectedEngineProviderCard.displayName} is registered, but not yet runnable in this build.`,
                    selectedEngineProviderCard.id === 'internal' && internalRuntimeInfo
                      ? `Die interne Laufzeit ist in diesem Build ${internalRuntimeInfo.readiness === 'ready' ? 'bereit' : internalRuntimeInfo.readiness === 'idle' ? 'im Leerlauf' : 'nicht verfuegbar'}.`
                      : selectedEngineProviderCard.availableInBuild
                        ? `${selectedEngineProviderCard.displayName} ist in diesem Build verfuegbar.`
                        : `${selectedEngineProviderCard.displayName} ist registriert, aber in diesem Build noch nicht lauffaehig.`,
                  )}
                </p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {mainEngineProviders.map((provider) => {
                  const isSelected = draftEngineProviderId === provider.id;
                  return (
                    <button
                      key={provider.id}
                      type="button"
                      disabled={!provider.selectionEnabled}
                      data-testid={`settings-provider-${provider.id}`}
                      className={`rounded-lg border px-3 py-3 text-left transition ${
                        isSelected
                          ? 'border-primary/45 bg-primary/10'
                          : provider.selectionEnabled
                            ? 'border-border bg-card hover:border-primary/30'
                            : 'border-border bg-muted/40 opacity-70'
                      }`}
                      onClick={() => {
                        if (provider.selectionEnabled) {
                          onDraftEngineProviderIdChange(provider.id);
                        }
                      }}
                    >
                      <p className="text-sm font-medium">{provider.displayName}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{provider.summary}</p>
                      {!provider.selectionEnabled && provider.availabilityReason ? (
                        <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">{provider.availabilityReason}</p>
                      ) : null}
                    </button>
                  );
                })}
              </div>
              {draftEngineProviderId === 'internal' && internalRuntimeInfo ? (
                <div className="rounded-lg border border-dashed border-border/70 bg-muted/20 px-3 py-3">
                  <p className="text-xs font-medium text-foreground">Internal runtime diagnostics</p>
                  <div className="mt-2 grid gap-1 text-[11px] text-muted-foreground">
                    <p><span className="font-medium text-foreground">Readiness:</span> {internalRuntimeInfo.readiness}</p>
                    <p><span className="font-medium text-foreground">Restore:</span> {internalRuntimeInfo.stateRestoreStatus}</p>
                    <p><span className="font-medium text-foreground">Service:</span> {internalRuntimeInfo.serviceName}</p>
                    <p><span className="font-medium text-foreground">Version:</span> {internalRuntimeInfo.serviceVersion}</p>
                    <p><span className="font-medium text-foreground">Home:</span> {internalRuntimeInfo.runtimeHome}</p>
                    <p><span className="font-medium text-foreground">Connected:</span> {internalRuntimeInfo.connected ? 'yes' : 'no'}</p>
                    <p><span className="font-medium text-foreground">Sessions:</span> {internalRuntimeInfo.sessionCount}</p>
                    <p><span className="font-medium text-foreground">Runs:</span> {internalRuntimeInfo.runCount}</p>
                    <p><span className="font-medium text-foreground">Artifacts:</span> {internalRuntimeInfo.artifactCount}</p>
                    <p><span className="font-medium text-foreground">Pending approvals:</span> {internalRuntimeInfo.pendingApprovalCount}</p>
                    <p><span className="font-medium text-foreground">Interrupted runs:</span> {internalRuntimeInfo.interruptedRunCount}</p>
                    <p><span className="font-medium text-foreground">Provider-backed models:</span> {internalRuntimeInfo.providerBackedModelCount}</p>
                    <p>
                      <span className="font-medium text-foreground">Provider cowork normalization:</span>{' '}
                      {internalRuntimeInfo.providerCoworkRunCount > 0
                        ? `${internalRuntimeInfo.providerCoworkStructuredCount} structured · ${internalRuntimeInfo.providerCoworkNormalizedCount} normalized · ${internalRuntimeInfo.providerCoworkFallbackCount} fallback`
                        : 'no retained provider-backed cowork runs'}
                    </p>
                    {internalRuntimeInfo.providerCoworkNormalizationByProvider.length > 0 ? (
                      <p className="sm:col-span-2">
                        <span className="font-medium text-foreground">By provider:</span>{' '}
                        {internalRuntimeInfo.providerCoworkNormalizationByProvider
                          .map((provider) => `${provider.providerId} (${provider.structuredCount} structured · ${provider.normalizedCount} normalized · ${provider.fallbackCount} fallback)`)
                          .join(' · ')}
                      </p>
                    ) : null}
                    {internalRuntimeInfo.providerCoworkNormalizationTrend.length > 0 ? (
                      <p className="sm:col-span-2">
                        <span className="font-medium text-foreground">7-day trend:</span>{' '}
                        {internalRuntimeInfo.providerCoworkNormalizationTrend
                          .map((entry) => `${entry.date} (${entry.structuredCount}/${entry.normalizedCount}/${entry.fallbackCount})`)
                          .join(' · ')}
                      </p>
                    ) : null}
                    <p><span className="font-medium text-foreground">Active session:</span> {internalRuntimeInfo.activeSessionKey ?? 'none'}</p>
                    <p><span className="font-medium text-foreground">Default model:</span> {internalRuntimeInfo.defaultModel}</p>
                    <p><span className="font-medium text-foreground">Status:</span> {internalRuntimeInfo.status.availableInBuild ? 'Internal development runtime available.' : internalRuntimeInfo.status.unavailableReason}</p>
                    {internalRuntimeInfo.lastProviderId ? (
                      <p><span className="font-medium text-foreground">Last provider:</span> {internalRuntimeInfo.lastProviderId}</p>
                    ) : null}
                    {internalRuntimeInfo.lastProviderError ? (
                      <p><span className="font-medium text-foreground">Last provider error:</span> {internalRuntimeInfo.lastProviderError}</p>
                    ) : null}
                    {internalRuntimeInfo.chatProviders.length > 0 ? (
                      <p className="sm:col-span-2">
                        <span className="font-medium text-foreground">Chat providers:</span>{' '}
                        {internalRuntimeInfo.chatProviders
                          .map((provider) => `${provider.label} (${provider.configured ? `${provider.modelCount} models` : 'not configured'})`)
                          .join(' · ')}
                      </p>
                    ) : null}
                    {internalRuntimeInfo.latestArtifactSummary ? (
                      <p><span className="font-medium text-foreground">Latest artifact:</span> {internalRuntimeInfo.latestArtifactSummary}</p>
                    ) : null}
                    {internalRuntimeInfo.latestRunTimelineMessage ? (
                      <p>
                        <span className="font-medium text-foreground">Latest run event:</span>{' '}
                        {internalRuntimeInfo.latestRunTimelinePhase ? `${internalRuntimeInfo.latestRunTimelinePhase} - ` : ''}
                        {internalRuntimeInfo.latestRunTimelineMessage}
                      </p>
                    ) : null}
                    {internalRuntimeInfo.lastRecoveryNote ? (
                      <p><span className="font-medium text-foreground">Recovery:</span> {internalRuntimeInfo.lastRecoveryNote}</p>
                    ) : null}
                  </div>
                  {filteredInternalRunHistory.length > 0 ? (
                    <div className="mt-3 border-t border-border/40 pt-3">
                      <p className="text-xs font-medium text-foreground">Recent runs</p>
                      <div className="mt-2 grid gap-2">
                        {filteredInternalRunHistory.map((run) => {
                          const latestEntry = run.timeline?.[run.timeline.length - 1];
                          return (
                            <div key={run.runId} className="rounded-md border border-border/50 bg-background/40 px-2.5 py-2">
                              <p className="text-[11px] font-medium text-foreground">
                                {run.sessionKind} · {run.status} · {run.model}
                              </p>
                              <p className="text-[11px] text-muted-foreground">
                                {run.summary ?? run.promptPreview ?? run.runId}
                              </p>
                              {latestEntry ? (
                                <p className="text-[11px] text-muted-foreground/90">
                                  Latest: {latestEntry.phase} - {latestEntry.message}
                                </p>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>

            <form className="grid gap-3" onSubmit={onSave}>
              {draftEngineProviderId === 'internal' ? (
                <div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-3">
                  <p className="text-sm font-medium text-foreground">{t('Built-in internal runtime', 'Integrierte interne Laufzeit')}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t(
                      'Cloffice uses the built-in internal runtime by default. Runtime URL is only needed for custom internal debugging endpoints, and the token field is unused.',
                      'Cloffice verwendet standardmaessig die integrierte interne Laufzeit. Die Runtime-URL wird nur fuer benutzerdefinierte interne Debug-Endpunkte benoetigt, und das Token-Feld bleibt ungenutzt.',
                    )}
                  </p>
                </div>
              ) : null}
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1">
                  <span className="font-sans text-xs text-muted-foreground">Runtime URL</span>
                  <Input
                    value={draftEngineUrl}
                    onChange={(event) => onDraftEngineUrlChange(event.target.value)}
                    placeholder={runtimeEndpointPlaceholder}
                    className="font-sans"
                  />
                </label>
                <label className="grid gap-1">
                  <span className="font-sans text-xs text-muted-foreground">Runtime token</span>
                  <Input
                    type="password"
                    value={draftEngineToken}
                    onChange={(event) => onDraftEngineTokenChange(event.target.value)}
                    placeholder={runtimeTokenPlaceholder}
                    className="font-sans"
                  />
                </label>
              </div>

              {draftEngineProviderId === 'internal' ? (
                <div className="grid gap-3 rounded-lg border border-border/70 bg-muted/20 p-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">{t('Internal provider credentials', 'Interne Provider-Zugangsdaten')}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t(
                        'Saved in Cloffice engine config for the internal provider path. Environment variables still override blank fields.',
                        'Wird fuer den internen Provider-Pfad in der Cloffice-Engine-Konfiguration gespeichert. Leere Felder koennen weiterhin durch Umgebungsvariablen ueberschrieben werden.',
                      )}
                    </p>
                  </div>

                  <label className="grid gap-1">
                    <span className="font-sans text-xs text-muted-foreground">OpenAI-compatible API key</span>
                    <Input
                      type="password"
                      value={draftInternalProviderConfig.openaiApiKey}
                      onChange={(event) => onDraftInternalProviderConfigChange({ openaiApiKey: event.target.value })}
                      placeholder="sk-..."
                      className="font-sans"
                    />
                  </label>

                  <label className="grid gap-1">
                    <span className="font-sans text-xs text-muted-foreground">OpenAI-compatible base URL</span>
                    <Input
                      value={draftInternalProviderConfig.openaiBaseUrl}
                      onChange={(event) => onDraftInternalProviderConfigChange({ openaiBaseUrl: event.target.value })}
                      placeholder="https://api.openai.com/v1"
                      className="font-sans"
                    />
                  </label>

                  <label className="grid gap-1">
                    <span className="font-sans text-xs text-muted-foreground">OpenAI-compatible model list</span>
                    <Input
                      value={draftInternalProviderConfig.openaiModels}
                      onChange={(event) => onDraftInternalProviderConfigChange({ openaiModels: event.target.value })}
                      placeholder="gpt-4.1-mini,gpt-4.1 or llama-3.3-70b-versatile,llama-3.1-8b-instant"
                      className="font-sans"
                    />
                    <p className="font-sans text-[11px] text-muted-foreground">
                      Comma-separated model ids. Use this for Groq, OpenRouter, and other OpenAI-compatible endpoints.
                    </p>
                  </label>

                  <label className="grid gap-1">
                    <span className="font-sans text-xs text-muted-foreground">Anthropic API key</span>
                    <Input
                      type="password"
                      value={draftInternalProviderConfig.anthropicApiKey}
                      onChange={(event) => onDraftInternalProviderConfigChange({ anthropicApiKey: event.target.value })}
                      placeholder="sk-ant-..."
                      className="font-sans"
                    />
                  </label>

                  <label className="grid gap-1">
                    <span className="font-sans text-xs text-muted-foreground">Anthropic model list</span>
                    <Input
                      value={draftInternalProviderConfig.anthropicModels}
                      onChange={(event) => onDraftInternalProviderConfigChange({ anthropicModels: event.target.value })}
                      placeholder="claude-3-7-sonnet-latest,claude-3-5-sonnet-latest"
                      className="font-sans"
                    />
                  </label>

                  <label className="grid gap-1">
                    <span className="font-sans text-xs text-muted-foreground">Gemini API key</span>
                    <Input
                      type="password"
                      value={draftInternalProviderConfig.geminiApiKey}
                      onChange={(event) => onDraftInternalProviderConfigChange({ geminiApiKey: event.target.value })}
                      placeholder="AIza..."
                      className="font-sans"
                    />
                  </label>

                  <label className="grid gap-1">
                    <span className="font-sans text-xs text-muted-foreground">Gemini model list</span>
                    <Input
                      value={draftInternalProviderConfig.geminiModels}
                      onChange={(event) => onDraftInternalProviderConfigChange({ geminiModels: event.target.value })}
                      placeholder="gemini-2.5-flash,gemini-2.5-pro"
                      className="font-sans"
                    />
                  </label>

                  <div className="grid gap-2 rounded-md border border-border/60 bg-background/70 p-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">{t('Provider connection test', 'Provider-Verbindungstest')}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {t(
                          'Runs a small live request through the internal runtime using the current credentials in this form.',
                          'Fuehrt eine kleine Live-Anfrage ueber die interne Laufzeit mit den aktuellen Zugangsdaten in diesem Formular aus.',
                          )}
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {(['openai', 'anthropic', 'gemini'] as const).map((providerId) => (
                        <Button
                          key={providerId}
                          type="button"
                          variant="secondary"
                          size="sm"
                          disabled={testingProviderId !== null}
                          onClick={async () => {
                            const bridge = getDesktopBridge();
                            if (!bridge?.testInternalProviderConnection) {
                              setProviderTestResult({
                                providerId,
                                ok: false,
                                message: 'Provider test bridge is unavailable.',
                              });
                              return;
                            }
                            setTestingProviderId(providerId);
                            try {
                              const result = await bridge.testInternalProviderConnection(providerId, draftInternalProviderConfig);
                              setProviderTestResult(result);
                            } catch (error) {
                              setProviderTestResult({
                                providerId,
                                ok: false,
                                message: error instanceof Error ? error.message : 'Provider test failed.',
                              });
                            } finally {
                              setTestingProviderId(null);
                            }
                          }}
                        >
                          {testingProviderId === providerId ? 'Testing...' : `Test ${providerId}`}
                        </Button>
                      ))}
                    </div>
                    {providerTestResult ? (
                      <div className={`rounded-md border px-3 py-2 text-xs ${providerTestResult.ok ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-950 dark:text-emerald-100' : 'border-destructive/40 bg-destructive/10 text-destructive'}`}>
                        <p className="font-medium">
                          {providerTestResult.ok ? 'Connection succeeded.' : 'Connection failed.'}
                          {providerTestResult.model ? ` Model: ${providerTestResult.model}` : ''}
                        </p>
                        <p className="mt-1">{providerTestResult.message}</p>
                        {providerTestResult.preview ? <p className="mt-1 font-mono">{providerTestResult.preview}</p> : null}
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}

              <Button
                className="w-full border-0 bg-primary text-primary-foreground hover:bg-primary/90"
                type="submit"
                disabled={saving}
              >
                {saving ? t('Connecting...', 'Verbinde...') : t('Save and connect', 'Speichern und verbinden')}
              </Button>
            </form>
          </section>
        </div>
      )}

      {activeSection === 'Developer' && (
        <div className="flex flex-col gap-6">
                {internalRuntimeRetentionPolicy ? (
                  <section className="rounded-xl border border-border/60 bg-card p-4">
                    <div className="mb-3">
                      <p className="text-sm font-medium text-foreground">{t('Runtime retention', 'Runtime-Aufbewahrung')}</p>
                      <p className="text-xs text-muted-foreground">
                        {t(
                          'Runtime-owned retention for internal runs and artifacts.',
                          'Runtime-eigene Aufbewahrung fuer interne Laeufe und Artefakte.',
                        )}{' '}
                        {t('Schema version', 'Schema-Version')}: {internalRuntimeRetentionPolicy.schemaVersion}
                      </p>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="rounded-lg border border-border/50 bg-background/70 px-3 py-2">
                        <p className="font-sans text-[11px] text-muted-foreground">{t('Retained runs', 'Behaltene Laeufe')}</p>
                        <p className="mt-1 text-sm font-medium text-foreground">
                          {internalRuntimeInfo?.runCount ?? 0} / {internalRuntimeRetentionPolicy.runHistoryRetentionLimit}
                        </p>
                      </div>
                      <div className="rounded-lg border border-border/50 bg-background/70 px-3 py-2">
                        <p className="font-sans text-[11px] text-muted-foreground">{t('Retained artifacts', 'Behaltene Artefakte')}</p>
                        <p className="mt-1 text-sm font-medium text-foreground">
                          {internalRuntimeInfo?.artifactCount ?? 0} / {internalRuntimeRetentionPolicy.artifactHistoryRetentionLimit}
                        </p>
                      </div>
                    </div>
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      <label className="grid gap-1">
                        <span className="font-sans text-xs text-muted-foreground">{t('Run history limit', 'Limit fuer Laufhistorie')}</span>
                        <select
                          className="h-9 rounded-md border border-border bg-background px-3 text-sm"
                          value={internalRuntimeRetentionPolicy.runHistoryRetentionLimit}
                          onChange={(event) => {
                            void handleRuntimeRetentionChange('runHistoryRetentionLimit', Number(event.target.value));
                          }}
                        >
                          {[25, 50, 100, 120, 200, 400].map((limit) => (
                            <option key={`runtime-run-retention-${limit}`} value={limit}>{limit}</option>
                          ))}
                        </select>
                      </label>
                      <label className="grid gap-1">
                        <span className="font-sans text-xs text-muted-foreground">{t('Artifact history limit', 'Limit fuer Artefakthistorie')}</span>
                        <select
                          className="h-9 rounded-md border border-border bg-background px-3 text-sm"
                          value={internalRuntimeRetentionPolicy.artifactHistoryRetentionLimit}
                          onChange={(event) => {
                            void handleRuntimeRetentionChange('artifactHistoryRetentionLimit', Number(event.target.value));
                          }}
                        >
                          {[25, 50, 100, 200, 400].map((limit) => (
                            <option key={`runtime-artifact-retention-${limit}`} value={limit}>{limit}</option>
                          ))}
                        </select>
                      </label>
                    </div>
                  </section>
                ) : null}
                <section className="rounded-xl border border-border/60 bg-card p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">{t('Recent internal runs', 'Aktuelle interne Laeufe')}</p>
                      <p className="text-xs text-muted-foreground">
                        {t(
                          'The most recent internal runtime history, including approval and execution timeline entries.',
                          'Die aktuelle interne Runtime-Historie einschliesslich Genehmigungs- und Ausfuehrungsereignissen.',
                        )}
                      </p>
                      {focusedSchedule ? (
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          {t('Filtered to schedule', 'Gefiltert nach Zeitplan')}: <span className="font-medium text-foreground">{focusedSchedule.name}</span>
                        </p>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="rounded-full font-sans text-[10px]">
                        {filteredInternalRunHistory.length} {t('runs loaded', 'Laeufe geladen')}
                      </Badge>
                      <Badge variant="outline" className="rounded-full font-sans text-[10px]">
                        {scheduledJobs.length} {t('schedules', 'Zeitplaene')}
                      </Badge>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 px-2 text-[11px]"
                        data-testid="settings-schedule-export"
                        disabled={scheduledJobs.length === 0}
                        onClick={() => void onExportCurrentSchedules?.()}
                      >
                        {t('Export schedules', 'Zeitplaene exportieren')}
                      </Button>
                      <input
                        ref={scheduleImportInputRef}
                        type="file"
                        accept="application/json"
                        className="hidden"
                        data-testid="settings-schedule-import-input"
                        onChange={(event) => void handleImportScheduleFileSelection(event)}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 px-2 text-[11px]"
                        data-testid="settings-schedule-import-trigger"
                        onClick={() => scheduleImportInputRef.current?.click()}
                      >
                        {t('Import schedules', 'Zeitplaene importieren')}
                      </Button>
                      {focusedSchedule && onClearScheduleRunFilter ? (
                        <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-[11px]" onClick={onClearScheduleRunFilter}>
                          {t('Clear filter', 'Filter loeschen')}
                        </Button>
                      ) : null}
                    </div>
                  </div>

                  {filteredInternalRunHistory.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-border/70 px-3 py-6 text-center text-xs text-muted-foreground">
                      {focusedSchedule
                        ? t('No runs have been recorded for the selected schedule yet.', 'Fuer den gewaehlten Zeitplan wurden noch keine Laeufe aufgezeichnet.')
                        : t('No internal runs recorded yet.', 'Noch keine internen Laeufe erfasst.')}
                    </div>
                  ) : (
                    <ScrollArea className="max-h-[540px] pr-2">
                      <div className="grid gap-3">
                        {filteredInternalRunHistory.map((run) => {
                          const artifact = run.artifact;
                          const isHighlighted = highlightedRunId === run.runId;
                          const relatedSchedule = run.scheduleId ? scheduledJobsById.get(run.scheduleId) : null;
                          return (
                            <div
                              key={run.runId}
                              id={`internal-run-${run.runId}`}
                              data-testid={`internal-run-card-${run.runId}`}
                              className={`rounded-lg border p-3 transition-colors ${
                                isHighlighted
                                  ? 'border-amber-400 bg-amber-50/70 dark:border-amber-700 dark:bg-amber-950/20'
                                  : 'border-border/60 bg-background/50'
                              }`}
                            >
                              <div className="flex flex-wrap items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="text-sm font-medium text-foreground">
                                    {run.sessionKind} · {run.status} · {run.model}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {run.summary ?? run.promptPreview ?? run.runId}
                                  </p>
                                  {run.scheduleName ? (
                                    <p className="mt-1 text-[11px] text-muted-foreground">
                                      {t('Schedule', 'Zeitplan')}: <span className="font-medium text-foreground">{run.scheduleName}</span>
                                    </p>
                                  ) : null}
                                </div>
                                <div className="flex flex-wrap gap-1">
                                  {run.providerBacked ? (
                                    <Badge variant="outline" className="rounded-full font-sans text-[10px]">
                                      {t('Provider-backed', 'Provider-gestuetzt')}
                                    </Badge>
                                  ) : null}
                                  {run.providerPhase ? (
                                    <Badge variant="outline" className="rounded-full font-sans text-[10px]">
                                      {t('Phase', 'Phase')}: {run.providerPhase}
                                    </Badge>
                                  ) : null}
                                  {run.actionMode === 'read-only' ? (
                                    <Badge variant="outline" className="rounded-full font-sans text-[10px]">
                                      {t('Read-only actions', 'Nur Leseaktionen')}
                                    </Badge>
                                  ) : null}
                                  {typeof run.approvedActionCount === 'number' ? (
                                    <Badge variant="outline" className="rounded-full font-sans text-[10px]">
                                      {t('Approved', 'Genehmigt')}: {run.approvedActionCount}
                                    </Badge>
                                  ) : null}
                                  {typeof run.rejectedActionCount === 'number' ? (
                                    <Badge variant="outline" className="rounded-full font-sans text-[10px]">
                                      {t('Rejected', 'Abgelehnt')}: {run.rejectedActionCount}
                                    </Badge>
                                  ) : null}
                                </div>
                                {relatedSchedule && onOpenScheduleJob ? (
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-7 px-2 text-[11px]"
                                    onClick={() => void onOpenScheduleJob(relatedSchedule.id)}
                                  >
                                    {t('Open schedule', 'Zeitplan oeffnen')}
                                  </Button>
                                ) : null}
                              </div>

                              <div className="mt-3 grid gap-1 text-[11px] text-muted-foreground sm:grid-cols-2">
                                <p><span className="font-medium text-foreground">{t('Run ID', 'Lauf-ID')}:</span> <span className="font-mono">{run.runId}</span></p>
                                <p><span className="font-medium text-foreground">{t('Session', 'Sitzung')}:</span> <span className="font-mono">{run.sessionKey}</span></p>
                                <p><span className="font-medium text-foreground">{t('Started', 'Gestartet')}:</span> {new Date(run.startedAt).toLocaleString()}</p>
                                <p><span className="font-medium text-foreground">{t('Updated', 'Aktualisiert')}:</span> {new Date(run.updatedAt).toLocaleString()}</p>
                                {run.resultSummary ? (
                                  <p className="sm:col-span-2"><span className="font-medium text-foreground">{t('Result', 'Ergebnis')}:</span> {run.resultSummary}</p>
                                ) : null}
                                {run.interruptedReason ? (
                                  <p className="sm:col-span-2"><span className="font-medium text-foreground">{t('Interrupted', 'Unterbrochen')}:</span> {run.interruptedReason}</p>
                                ) : null}
                              </div>

                              {run.timeline && run.timeline.length > 0 ? (
                                <div className="mt-3 rounded-md border border-border/50 bg-card/60 p-2">
                                  <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                                    {t('Timeline', 'Zeitachse')}
                                  </p>
                                  <div className="grid gap-2">
                                    {run.timeline.map((entry) => (
                                      <div key={entry.id} className="rounded-md border border-border/40 bg-background/70 px-2.5 py-2">
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                          <p className="text-[11px] font-medium text-foreground">
                                            {entry.phase}
                                          </p>
                                          <p className="text-[10px] text-muted-foreground">
                                            {new Date(entry.at).toLocaleString()}
                                          </p>
                                        </div>
                                        <p className="mt-1 text-[11px] text-muted-foreground">{entry.message}</p>
                                        {entry.details ? (
                                          <p className="mt-1 text-[11px] text-muted-foreground/90">{entry.details}</p>
                                        ) : null}
                                        {entry.action ? (
                                          <p className="mt-1 text-[11px] text-muted-foreground/90">
                                            <span className="font-medium text-foreground">{t('Action', 'Aktion')}:</span>{' '}
                                            <span className="font-mono">{entry.action.actionType}</span> · <span className="font-mono">{entry.action.path}</span>
                                          </p>
                                        ) : null}
                                        {entry.decision ? (
                                          <p className="mt-1 text-[11px] text-muted-foreground/90">
                                            <span className="font-medium text-foreground">{t('Decision', 'Entscheidung')}:</span>{' '}
                                            {entry.decision.approved ? t('approved', 'genehmigt') : t('rejected', 'abgelehnt')}
                                            {entry.decision.reason ? ` · ${entry.decision.reason}` : ''}
                                          </p>
                                        ) : null}
                                        {entry.receipt ? (
                                          <p className="mt-1 text-[11px] text-muted-foreground/90">
                                            <span className="font-medium text-foreground">{t('Receipt', 'Beleg')}:</span>{' '}
                                            {entry.receipt.status}
                                            {entry.receipt.errorCode ? ` · ${entry.receipt.errorCode}` : ''}
                                            {entry.receipt.message ? ` · ${entry.receipt.message}` : ''}
                                          </p>
                                        ) : null}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ) : null}

                              {artifact ? (
                                <div className="mt-3 rounded-md border border-border/50 bg-card/60 p-2">
                                  <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                                    {t('Artifact details', 'Artefaktdetails')}
                                  </p>
                                  <div className="grid gap-1 text-[11px] text-muted-foreground">
                                    <p>
                                      <span className="font-medium text-foreground">{t('Artifact ID', 'Artefakt-ID')}:</span>{' '}
                                      <span className="font-mono">{artifact.id}</span>
                                    </p>
                                    <p>
                                      <span className="font-medium text-foreground">{t('Recorded', 'Erfasst')}:</span>{' '}
                                      {new Date(artifact.createdAt).toLocaleString()}
                                    </p>
                                    <p>
                                      <span className="font-medium text-foreground">{t('Receipt count', 'Anzahl Belege')}:</span>{' '}
                                      {artifact.receiptCount}
                                    </p>
                                    {artifact.summary ? (
                                      <p>
                                        <span className="font-medium text-foreground">{t('Summary', 'Zusammenfassung')}:</span>{' '}
                                        {artifact.summary}
                                      </p>
                                    ) : null}
                                  </div>

                                  {artifact.previews.length > 0 ? (
                                    <div className="mt-3">
                                      <p className="mb-1 text-[11px] font-medium text-foreground">{t('Previews', 'Vorschauen')}</p>
                                      <div className="grid gap-2">
                                        {artifact.previews.map((preview, index) => (
                                          <pre
                                            key={`${artifact.id}-preview-${index}`}
                                            className="overflow-x-auto rounded-md border border-border/40 bg-background/70 px-2 py-1.5 text-[10px] leading-relaxed text-muted-foreground whitespace-pre-wrap"
                                          >
                                            {preview}
                                          </pre>
                                        ))}
                                      </div>
                                    </div>
                                  ) : null}

                                  {artifact.receipts.length > 0 ? (
                                    <div className="mt-3">
                                      <p className="mb-1 text-[11px] font-medium text-foreground">{t('Receipts', 'Belege')}</p>
                                      <div className="grid gap-2">
                                        {artifact.receipts.map((receipt) => (
                                          <div
                                            key={`${artifact.id}-receipt-${receipt.id}`}
                                            className="rounded-md border border-border/40 bg-background/70 px-2 py-1.5 text-[11px] text-muted-foreground"
                                          >
                                            <p>
                                              <span className="font-medium text-foreground">{receipt.type}</span> ·{' '}
                                              <span className="font-mono">{receipt.path}</span> · {receipt.status}
                                            </p>
                                            {receipt.message ? <p className="mt-0.5">{receipt.message}</p> : null}
                                            {receipt.errorCode ? <p className="mt-0.5 font-mono">{receipt.errorCode}</p> : null}
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  ) : null}

                                  {artifact.errors.length > 0 ? (
                                    <div className="mt-3">
                                      <p className="mb-1 text-[11px] font-medium text-foreground">{t('Errors', 'Fehler')}</p>
                                      <div className="grid gap-1">
                                        {artifact.errors.map((error, index) => (
                                          <p
                                            key={`${artifact.id}-error-${index}`}
                                            className="rounded-md border border-border/40 bg-background/70 px-2 py-1.5 text-[11px] text-muted-foreground"
                                          >
                                            {error}
                                          </p>
                                        ))}
                                      </div>
                                    </div>
                                  ) : null}
                                </div>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    </ScrollArea>
                  )}
                </section>
              </div>
            )}
    </section>
  );
}

/* Ã¢â€â‚¬Ã¢â€â‚¬ Connectors settings section Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ */

const connectorIcons: Record<string, ReactNode> = {
  folder: <Folder className="size-4" />,
  terminal: <Terminal className="size-4" />,
  globe: <Globe className="size-4" />,
};

function ConnectorsSection({ language }: { language: 'en' | 'de' }) {
  const t = (en: string, de: string) => (language === 'de' ? de : en);
  const [connectors, setConnectors] = useState<ConnectorDefinition[]>([]);
  const [domainDraft, setDomainDraft] = useState('');
  const [allowedDomains, setAllowedDomains] = useState<string[]>([]);

  useEffect(() => {
    setConnectors(listConnectors());
    setAllowedDomains(loadAllowedDomains());
  }, []);

  const toggleConnector = (id: string) => {
    setConnectors((prev) =>
      prev.map((c) => {
        if (c.id !== id) return c;
        const next = { ...c, status: c.status === 'active' ? 'inactive' as const : 'active' as const };
        // Mutate the actual registry object
        const original = listConnectors().find((o) => o.id === id);
        if (original) {
          original.status = next.status;
          persistConnectorConfig(id);
        }
        return next;
      }),
    );
  };

  const addDomain = () => {
    const d = domainDraft.trim().toLowerCase();
    if (!d || allowedDomains.includes(d)) return;
    const next = [...allowedDomains, d];
    setAllowedDomains(next);
    saveAllowedDomains(next);
    setDomainDraft('');
    // Update the web-fetch connector config
    const wf = listConnectors().find((c) => c.id === 'web-fetch');
    if (wf) {
      wf.config.allowedDomains = next;
      persistConnectorConfig('web-fetch');
    }
  };

  const removeDomain = (domain: string) => {
    const next = allowedDomains.filter((d) => d !== domain);
    setAllowedDomains(next);
    saveAllowedDomains(next);
    const wf = listConnectors().find((c) => c.id === 'web-fetch');
    if (wf) {
      wf.config.allowedDomains = next;
      persistConnectorConfig('web-fetch');
    }
  };

  return (
    <div className="space-y-6">
      {connectors.map((connector) => (
        <div
          key={connector.id}
          className="rounded-xl border border-border/60 bg-card p-4"
        >
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              {connectorIcons[connector.icon] ?? <Link2 className="size-4" />}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{connector.name}</span>
                <Badge variant={connector.status === 'active' ? 'default' : 'secondary'} className="text-[10px]">
                  {connector.status === 'active' ? t('Active', 'Aktiv') : t('Inactive', 'Inaktiv')}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">{connector.description}</p>
            </div>
            <Button
              variant={connector.status === 'active' ? 'secondary' : 'default'}
              size="sm"
              onClick={() => toggleConnector(connector.id)}
            >
              {connector.status === 'active' ? t('Disable', 'Deaktivieren') : t('Enable', 'Aktivieren')}
            </Button>
          </div>

          {/* Actions list */}
          <div className="mt-3 space-y-1">
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
              {t('Actions', 'Aktionen')}
            </p>
            {connector.actions.map((action) => (
              <div key={action.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="font-mono text-[11px]">{action.id}</span>
                <Badge variant="outline" className="text-[9px]">{action.riskLevel}</Badge>
              </div>
            ))}
          </div>

          {/* Web-fetch domain allowlist config */}
          {connector.id === 'web-fetch' && connector.status === 'active' && (
            <div className="mt-4 space-y-2 border-t border-border/40 pt-3">
              <p className="text-xs font-medium text-muted-foreground">
                {t('Allowed domains', 'Erlaubte Domains')}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {allowedDomains.map((domain) => (
                  <Badge key={domain} variant="secondary" className="gap-1 text-[11px]">
                    {domain}
                    <button
                      type="button"
                      className="ml-1 text-muted-foreground hover:text-foreground"
                      onClick={() => removeDomain(domain)}
                    >
                      Ãƒâ€”
                    </button>
                  </Badge>
                ))}
                {allowedDomains.length === 0 && (
                  <span className="text-[11px] text-muted-foreground/60">{t('No domains configured', 'Keine Domains konfiguriert')}</span>
                )}
              </div>
              <div className="flex gap-2">
                <Input
                  className="h-8 text-xs"
                  placeholder="e.g. api.example.com"
                  value={domainDraft}
                  onChange={(e) => setDomainDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addDomain(); } }}
                />
                <Button size="sm" variant="secondary" onClick={addDomain}>
                  {t('Add', 'Hinzufuegen')}
                </Button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}








