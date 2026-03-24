import { useState, useCallback, useMemo } from 'react';
import type { FormEvent } from 'react';

import type { HealthCheckResult } from '@/app-types';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

type OnboardingStep = 'welcome' | 'connect' | 'pairing' | 'ready';

type OnboardingPageProps = {
  draftGatewayUrl: string;
  draftGatewayToken: string;
  health: HealthCheckResult | null;
  saving: boolean;
  pairingRequestId: string | null;
  onDraftGatewayUrlChange: (value: string) => void;
  onDraftGatewayTokenChange: (value: string) => void;
  onSave: (event: FormEvent) => void;
  onComplete: () => void;
};

export function OnboardingPage({
  draftGatewayUrl,
  draftGatewayToken,
  health,
  saving,
  pairingRequestId,
  onDraftGatewayUrlChange,
  onDraftGatewayTokenChange,
  onSave,
  onComplete,
}: OnboardingPageProps) {
  const [step, setStep] = useState<OnboardingStep>('welcome');
  const [copied, setCopied] = useState(false);
  const [connectAttempted, setConnectAttempted] = useState(false);

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

  const copyCommand = useCallback(() => {
    if (!effectivePairingId) return;
    const cmd = `openclaw devices approve ${effectivePairingId}`;
    void navigator.clipboard.writeText(cmd).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [effectivePairingId]);

  const handleConnect = (event: FormEvent) => {
    event.preventDefault();
    setConnectAttempted(true);
    onSave(event);
  };

  // Auto-advance to pairing step when pairing is needed
  const needsPairing = connectAttempted && !saving && health && !health.ok && effectivePairingId;
  const isConnected = health?.ok === true;

  // Derive visible step
  const visibleStep: OnboardingStep = (() => {
    if (step === 'welcome') return 'welcome';
    if (isConnected) return 'ready';
    if (needsPairing) return 'pairing';
    return 'connect';
  })();

  return (
    <main className="grid h-full place-items-center overflow-auto p-6">
      <div className="w-full max-w-[520px]">
        {/* Progress dots */}
        <div className="mb-6 flex items-center justify-center gap-2">
          {(['welcome', 'connect', 'ready'] as const).map((s, i) => {
            const stepOrder = { welcome: 0, connect: 1, pairing: 1, ready: 2 };
            const current = stepOrder[visibleStep];
            const isActive = i === current;
            const isDone = i < current;
            return (
              <div
                key={s}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  isActive
                    ? 'w-6 bg-[#de825e]'
                    : isDone
                      ? 'w-1.5 bg-[#de825e]/40'
                      : 'w-1.5 bg-border'
                }`}
              />
            );
          })}
        </div>

        {/* Step: Welcome */}
        {visibleStep === 'welcome' && (
          <Card className="rounded-2xl border-border bg-card shadow-[0_12px_30px_rgba(31,31,28,0.10)]">
            <CardContent className="flex flex-col items-center px-8 pb-8 pt-10 text-center">
              {/* Logo mark */}
              <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#ea9f7d,#de825e)] shadow-[0_4px_16px_rgba(222,130,94,0.3)]">
                <span className="text-2xl font-bold text-white">R</span>
              </div>

              <h1 className="mb-2 text-2xl font-semibold tracking-tight">Welcome to Relay</h1>
              <p className="mb-1 font-sans text-sm text-muted-foreground">
                Your AI coworker, powered by OpenClaw.
              </p>
              <p className="mb-8 font-sans text-xs text-muted-foreground/70">
                Connect to your OpenClaw Gateway to get started.
              </p>

              <Button
                className="h-11 w-full max-w-[280px] border-0 bg-[linear-gradient(120deg,#ea9f7d,#de825e)] font-sans text-sm text-[#fffefb]"
                onClick={() => setStep('connect')}
              >
                Get started
              </Button>

              <p className="mt-4 font-sans text-[11px] text-muted-foreground/60">
                You can change these settings anytime.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Step: Connect */}
        {visibleStep === 'connect' && (
          <Card className="rounded-2xl border-border bg-card shadow-[0_12px_30px_rgba(31,31,28,0.10)]">
            <CardContent className="px-8 pb-8 pt-8">
              <h2 className="mb-1 text-xl font-semibold tracking-tight">Connect to your Gateway</h2>
              <p className="mb-5 font-sans text-sm text-muted-foreground">
                Enter your OpenClaw Gateway URL and access token.
              </p>

              <form className="grid gap-3" onSubmit={handleConnect}>
                <label>
                  <span className="mb-1 block font-sans text-xs text-muted-foreground">
                    Gateway URL
                  </span>
                  <Input
                    value={draftGatewayUrl}
                    onChange={(event) => onDraftGatewayUrlChange(event.target.value)}
                    placeholder="ws://127.0.0.1:18789"
                    className="font-sans"
                  />
                </label>

                <label>
                  <span className="mb-1 block font-sans text-xs text-muted-foreground">
                    Access token
                  </span>
                  <Input
                    type="password"
                    value={draftGatewayToken}
                    onChange={(event) => onDraftGatewayTokenChange(event.target.value)}
                    placeholder="Paste token from OpenClaw setup"
                    className="font-sans"
                  />
                </label>

                {/* Connection error (non-pairing) */}
                {connectAttempted && !saving && health && !health.ok && !effectivePairingId && (
                  <div className="rounded-lg border border-[rgba(180,80,50,0.25)] bg-[rgba(180,80,50,0.06)] p-3">
                    <p className="font-sans text-xs font-medium text-[#7a4a38]">Connection failed</p>
                    <p className="mt-1 font-sans text-xs text-[#7a4a38]/80">{health.message}</p>
                  </div>
                )}

                <div className="mt-1 flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10 font-sans text-sm"
                    onClick={() => {
                      setStep('welcome');
                      setConnectAttempted(false);
                    }}
                  >
                    Back
                  </Button>
                  <Button
                    type="submit"
                    disabled={saving}
                    className="h-10 flex-1 border-0 bg-[linear-gradient(120deg,#ea9f7d,#de825e)] font-sans text-sm text-[#fffefb]"
                  >
                    {saving ? 'Connecting...' : 'Connect'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Step: Pairing */}
        {visibleStep === 'pairing' && (
          <Card className="rounded-2xl border-border bg-card shadow-[0_12px_30px_rgba(31,31,28,0.10)]">
            <CardContent className="px-8 pb-8 pt-8">
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-[rgba(222,130,94,0.12)]">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="text-[#de825e]">
                  <path d="M10 2a4 4 0 0 0-4 4v2H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-1V6a4 4 0 0 0-4-4Zm-2 4a2 2 0 1 1 4 0v2H8V6Zm2 6a1 1 0 0 1 1 1v1a1 1 0 1 1-2 0v-1a1 1 0 0 1 1-1Z" fill="currentColor"/>
                </svg>
              </div>

              <h2 className="mb-1 text-xl font-semibold tracking-tight">Approve this device</h2>
              <p className="mb-4 font-sans text-sm text-muted-foreground">
                Run this command on your gateway host to approve Relay:
              </p>

              <div className="flex items-center gap-1">
                <code className="flex-1 rounded-lg bg-[rgba(0,0,0,0.05)] px-3 py-2 font-mono text-xs text-[#7a4a38] select-all">
                  openclaw devices approve {effectivePairingId}
                </code>
                <button
                  type="button"
                  className="shrink-0 rounded-lg bg-[rgba(0,0,0,0.05)] px-3 py-2 font-sans text-xs text-[#7a4a38] hover:bg-[rgba(0,0,0,0.1)]"
                  onClick={copyCommand}
                >
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>

              <p className="mt-4 font-sans text-xs text-muted-foreground/70">
                After approving, click the button below to reconnect.
              </p>

              <div className="mt-4 flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 font-sans text-sm"
                  onClick={() => {
                    setStep('connect');
                    setConnectAttempted(false);
                  }}
                >
                  Back
                </Button>
                <Button
                  type="button"
                  disabled={saving}
                  className="h-10 flex-1 border-0 bg-[linear-gradient(120deg,#ea9f7d,#de825e)] font-sans text-sm text-[#fffefb]"
                  onClick={(e) => handleConnect(e as unknown as FormEvent)}
                >
                  {saving ? 'Reconnecting...' : 'Reconnect'}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step: Ready */}
        {visibleStep === 'ready' && (
          <Card className="rounded-2xl border-border bg-card shadow-[0_12px_30px_rgba(31,31,28,0.10)]">
            <CardContent className="flex flex-col items-center px-8 pb-8 pt-10 text-center">
              <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-[rgba(47,122,88,0.1)]">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" className="text-[#2f7a58]">
                  <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                  <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2"/>
                </svg>
              </div>

              <h2 className="mb-2 text-2xl font-semibold tracking-tight">You're all set</h2>
              <p className="mb-1 font-sans text-sm text-muted-foreground">
                Relay is connected to your OpenClaw Gateway.
              </p>
              <p className="mb-8 font-sans text-xs text-[#2f7a58]">
                {health?.message}
              </p>

              <Button
                className="h-11 w-full max-w-[280px] border-0 bg-[linear-gradient(120deg,#ea9f7d,#de825e)] font-sans text-sm text-[#fffefb]"
                onClick={onComplete}
              >
                Start using Relay
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  );
}
