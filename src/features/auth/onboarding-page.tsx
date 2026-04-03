import { getDesktopBridge } from '@/lib/desktop-bridge';
import { getEngineProvider, listEngineProviders } from '@/lib/engine-provider-registry';
import { useState, useMemo, useEffect } from 'react';
import type { FormEvent } from 'react';

import type { EngineProviderId, HealthCheckResult } from '@/app-types';
import type { InternalEngineRunRecord, InternalEngineRuntimeInfo } from '@/lib/internal-engine-bridge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type OnboardingStep = 'welcome' | 'connect' | 'ready';

type OnboardingPageProps = {
  draftEngineProviderId: EngineProviderId;
  health: HealthCheckResult | null;
  saving: boolean;
  pairingRequestId: string | null;
  onDraftEngineProviderIdChange: (value: EngineProviderId) => void;
  onSave: (event: FormEvent) => void;
  onComplete: () => void;
};

function ClofficeMark({ size = 48 }: { size?: number }) {
  const primary = 'var(--app-primary)';
  const primaryForeground = 'var(--app-primary-foreground)';
  return (
    <svg width={size} height={size} viewBox="0 0 256 256" fill="none">
      <rect width="256" height="256" rx="58" fill={primary} />
      <rect x="44" y="54" width="56" height="120" rx="28" fill={primaryForeground} />
      <rect x="156" y="54" width="56" height="120" rx="28" fill={primaryForeground} />
      <rect x="98" y="88" width="68" height="52" rx="24" fill={primaryForeground} />
      <path d="M118 114H182" stroke={primary} strokeWidth="9" strokeLinecap="round" />
      <path d="M170 102L186 114L170 126" stroke={primary} strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const STEP_LABELS = ['Welcome', 'Connect', 'Ready'] as const;

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="mb-10 flex items-center justify-center gap-1">
      {STEP_LABELS.map((label, i) => {
        const isActive = i === current;
        const isDone = i < current;
        return (
          <div key={label} className="flex items-center gap-1">
            {i > 0 && (
              <div className={`mx-1 h-px w-6 transition-colors duration-300 ${isDone ? 'bg-primary' : 'bg-border'}`} />
            )}
            <div className="flex items-center gap-1.5">
              <div
                className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold transition-all duration-300 ${
                  isActive
                    ? 'bg-primary text-primary-foreground shadow-[0_0_0_3px_hsl(var(--primary)/0.2)]'
                    : isDone
                      ? 'bg-primary/20 text-primary'
                      : 'bg-muted text-muted-foreground/50'
                }`}
              >
                {isDone ? (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                    <path d="M5 12l5 5L19 7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : (
                  i + 1
                )}
              </div>
              <span
                className={`font-sans text-xs font-medium transition-colors duration-300 ${
                  isActive ? 'text-foreground' : isDone ? 'text-primary' : 'text-muted-foreground/50'
                }`}
              >
                {label}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PrimaryButton({ children, disabled, className, ...props }: React.ComponentProps<typeof Button>) {
  return (
    <Button
      disabled={disabled}
      className={cn(
        'h-11 w-full border-0 bg-primary font-sans text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-50',
        className,
      )}
      {...props}
    >
      {children}
    </Button>
  );
}

export function OnboardingPage({
  draftEngineProviderId,
  health,
  saving,
  onDraftEngineProviderIdChange,
  onSave,
  onComplete,
}: OnboardingPageProps) {
  const [step, setStep] = useState<OnboardingStep>('welcome');
  const [connectAttempted, setConnectAttempted] = useState(false);
  const [internalRuntimeInfo, setInternalRuntimeInfo] = useState<InternalEngineRuntimeInfo | null>(null);
  const [internalRunHistory, setInternalRunHistory] = useState<InternalEngineRunRecord[]>([]);

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
              ? `Developer-only internal runtime ${internalRuntimeInfo.providerBackedModelCount > 0 ? `ready with ${internalRuntimeInfo.providerBackedModelCount} provider-backed chat models` : internalRuntimeInfo.readiness === 'ready' ? 'ready for internal chat sessions' : 'available in this build'}.`
              : provider.summary,
          }
        : provider
    )),
    [engineProviders, internalRuntimeInfo],
  );
  const selectedEngineProvider = useMemo(() => getEngineProvider(draftEngineProviderId), [draftEngineProviderId]);
  const selectedEngineProviderCard = useMemo(
    () => effectiveEngineProviders.find((provider) => provider.id === draftEngineProviderId) ?? selectedEngineProvider,
    [draftEngineProviderId, effectiveEngineProviders, selectedEngineProvider],
  );

  useEffect(() => {
    const bridge = getDesktopBridge();
    if (!bridge?.getInternalEngineRuntimeInfo) {
      setInternalRuntimeInfo(null);
      setInternalRunHistory([]);
      return;
    }

    let cancelled = false;
    Promise.all([
      bridge.getInternalEngineRuntimeInfo(),
      bridge.getInternalRunHistory?.(3) ?? Promise.resolve([]),
    ]).then(([info, runs]) => {
      if (!cancelled) {
        setInternalRuntimeInfo(info);
        setInternalRunHistory(runs);
      }
    }).catch(() => {
      if (!cancelled) {
        setInternalRuntimeInfo(null);
        setInternalRunHistory([]);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleConnect = (event: FormEvent) => {
    event.preventDefault();
    setConnectAttempted(true);
    onSave(event);
  };

  const isConnected = health?.ok === true;
  const visibleStep: OnboardingStep = isConnected ? 'ready' : step;
  const stepIndex = { welcome: 0, connect: 1, ready: 2 }[visibleStep];

  return (
    <main className="relative grid h-full place-items-center overflow-auto">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -right-32 -top-32 h-[480px] w-[480px] rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute -bottom-24 -left-24 h-[360px] w-[360px] rounded-full bg-primary/5 blur-3xl" />
      </div>

      <div className="relative z-10 w-full max-w-[480px] px-6">
        <StepIndicator current={stepIndex} />

        {visibleStep === 'welcome' && (
          <div className="flex flex-col items-center text-center">
            <div className="mb-6">
              <ClofficeMark size={64} />
            </div>

            <h1 className="mb-2 font-sans text-[28px] font-bold leading-tight tracking-tight text-foreground">
              Welcome to Cloffice
            </h1>
            <p className="mb-2 max-w-[340px] font-sans text-[15px] leading-relaxed text-muted-foreground">
              Local-first AI coworking with governed approvals.
              <br />
              The internal engine is the default and only built-in runtime path.
            </p>
            <div className="mb-8 mt-4 w-full max-w-[360px]">
              <div className="flex items-center justify-center gap-2 rounded-xl border border-border bg-muted/20 px-5 py-3">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-muted-foreground/60">
                  <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" stroke="currentColor" strokeWidth="2" />
                  <path d="M12 16v-4m0-4h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
                <span className="font-sans text-[13px] text-muted-foreground">
                  Internal engine is the default. Advanced runtime changes can be made later in Settings.
                </span>
              </div>
            </div>

            <div className="w-full max-w-[320px]">
              <PrimaryButton onClick={() => setStep('connect')}>
                Get started
              </PrimaryButton>
            </div>

            {connectAttempted && !saving && health && !health.ok && (
              <div className="mt-4 w-full max-w-[360px] rounded-xl border border-destructive/20 bg-destructive/[0.04] px-4 py-3 text-left">
                <p className="font-sans text-[13px] font-semibold text-destructive">Connection failed</p>
                <p className="mt-1 font-sans text-[12px] leading-relaxed text-destructive/70">
                  {health.message}
                </p>
              </div>
            )}

            <p className="mt-6 font-sans text-[11px] text-muted-foreground/40">
              Settings can be changed anytime from Preferences.
            </p>
          </div>
        )}

        {visibleStep === 'connect' && (
          <div className="rounded-2xl border border-border bg-card p-8 shadow-sm">
            <div className="mb-6">
              <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="text-primary">
                  <path d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" stroke="currentColor" strokeWidth="2" />
                  <path d="M12 8v4l3 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <h2 className="font-sans text-lg font-bold tracking-tight text-foreground">
                Connect to a runtime
              </h2>
              <p className="mt-1 font-sans text-[13px] leading-relaxed text-muted-foreground">
                Choose the runtime mode Cloffice should prepare for. Production builds use the built-in internal runtime path.
              </p>
            </div>

            <form className="grid gap-4" onSubmit={handleConnect}>
              <div className="grid gap-2">
                <label className="font-sans text-[12px] font-medium text-foreground">
                  Engine provider
                </label>
                <div className="grid gap-2 sm:grid-cols-2">
                  {effectiveEngineProviders.map((provider) => {
                    const isSelected = draftEngineProviderId === provider.id;
                    return (
                      <button
                        key={provider.id}
                        type="button"
                        disabled={!provider.selectionEnabled}
                        data-testid={`onboarding-provider-${provider.id}`}
                        className={`rounded-xl border px-3 py-3 text-left transition ${
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
                        <p className="text-sm font-medium text-foreground">{provider.displayName}</p>
                        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{provider.summary}</p>
                        {!provider.selectionEnabled && provider.availabilityReason ? (
                          <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">{provider.availabilityReason}</p>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-xl border border-border/70 bg-muted/20 px-4 py-3">
                <p className="font-sans text-[13px] font-semibold text-foreground">Built-in internal runtime</p>
                <p className="mt-1 font-sans text-[12px] leading-relaxed text-muted-foreground">
                  Cloffice connects through the built-in internal runtime in production. Runtime URL and token overrides are only available in the development bridge.
                </p>
              </div>

              {connectAttempted && !saving && health && !health.ok && (
                <div className="rounded-xl border border-destructive/20 bg-destructive/[0.04] px-4 py-3">
                  <p className="font-sans text-[13px] font-semibold text-destructive">Connection failed</p>
                  <p className="mt-1 font-sans text-[12px] leading-relaxed text-destructive/70">
                    {health.message}
                  </p>
                </div>
              )}

              <div className="mt-2 flex gap-2.5">
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 flex-none px-5 font-sans text-[13px]"
                  onClick={() => {
                    setStep('welcome');
                    setConnectAttempted(false);
                  }}
                >
                  Back
                </Button>
                <PrimaryButton type="submit" disabled={saving} className="h-10 flex-1 w-auto">
                  {saving ? (
                    <span className="flex items-center gap-2">
                      <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5" opacity="0.2" />
                        <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                      </svg>
                      Connecting...
                    </span>
                  ) : (
                    'Connect'
                  )}
                </PrimaryButton>
              </div>
            </form>
          </div>
        )}

        {visibleStep === 'ready' && (
          <div className="flex flex-col items-center text-center">
            <div className="relative mb-6">
              <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
                  <path d="M5 12l5 5L19 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full border-2 border-card bg-primary text-primary-foreground">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                  <path d="M5 12l5 5L19 7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            </div>

            <h2 className="mb-2 font-sans text-[28px] font-bold leading-tight tracking-tight text-foreground">
              You're all set
            </h2>
            <p className="mb-2 font-sans text-[15px] leading-relaxed text-muted-foreground">
              {selectedEngineProviderCard.id === 'internal' && internalRuntimeInfo
                ? `Cloffice is connected to the internal development runtime. Readiness: ${internalRuntimeInfo.readiness}.`
                : `Cloffice is connected to the current runtime endpoint through ${selectedEngineProviderCard.displayName}.`}
            </p>

            {health?.message && (
              <div className="mb-8 mt-2 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5">
                <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                <span className="font-mono text-[11px] text-primary">
                  {health.message}
                </span>
              </div>
            )}

            {draftEngineProviderId === 'internal' && internalRuntimeInfo ? (
              <div className="mb-6 w-full max-w-[360px] rounded-xl border border-dashed border-border bg-muted/20 px-4 py-3 text-left">
                <p className="font-sans text-[12px] font-semibold text-foreground">Internal runtime diagnostics</p>
                <div className="mt-2 grid gap-1 font-sans text-[11px] text-muted-foreground">
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
                    <p>
                      <span className="font-medium text-foreground">Chat providers:</span>{' '}
                      {internalRuntimeInfo.chatProviders
                        .map((provider) => `${provider.label} (${provider.configured ? `${provider.modelCount} models` : 'not configured'})`)
                        .join(' | ')}
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
                {internalRunHistory.length > 0 ? (
                  <div className="mt-3 border-t border-border/40 pt-3">
                    <p className="font-sans text-[12px] font-semibold text-foreground">Recent runs</p>
                    <div className="mt-2 grid gap-2">
                      {internalRunHistory.map((run) => {
                        const latestEntry = run.timeline?.[run.timeline.length - 1];
                        return (
                          <div key={run.runId} className="rounded-md border border-border/50 bg-background/40 px-2.5 py-2">
                            <p className="font-sans text-[11px] font-medium text-foreground">
                              {run.sessionKind} | {run.status} | {run.model}
                            </p>
                            <p className="font-sans text-[11px] text-muted-foreground">
                              {run.summary ?? run.promptPreview ?? run.runId}
                            </p>
                            {latestEntry ? (
                              <p className="font-sans text-[11px] text-muted-foreground/90">
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

            <div className="mt-4 w-full max-w-[320px]">
              <PrimaryButton onClick={onComplete}>
                Start using Cloffice
              </PrimaryButton>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
