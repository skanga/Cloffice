import { useState, useMemo, useCallback } from 'react';
import type { FormEvent } from 'react';

import type { HealthCheckResult } from '@/app-types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

type SettingsPageProps = {
  draftGatewayUrl: string;
  draftGatewayToken: string;
  health: HealthCheckResult | null;
  status: string;
  saving: boolean;
  pairingRequestId: string | null;
  onDraftGatewayUrlChange: (value: string) => void;
  onDraftGatewayTokenChange: (value: string) => void;
  onSave: (event: FormEvent) => void;
  onResetPairing: () => void | Promise<void>;
};

export function SettingsPage({
  draftGatewayUrl,
  draftGatewayToken,
  health,
  status,
  saving,
  pairingRequestId,
  onDraftGatewayUrlChange,
  onDraftGatewayTokenChange,
  onSave,
  onResetPairing,
}: SettingsPageProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [copied, setCopied] = useState(false);

  // Derive the effective pairing request ID: prefer the explicit prop, fall back to
  // extracting a UUID from the health message (e.g. "Approve with: openclaw devices approve <uuid>").
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

  return (
    <section className="mx-auto w-full max-w-[860px]">
      <div className="mb-4">
        <Badge variant="outline" className="mb-2 font-sans text-[11px] text-muted-foreground">
          Settings
        </Badge>
        <h1 className="mb-1 text-[clamp(1.55rem,2.4vw,2rem)] tracking-tight">Workspace settings</h1>
        <p className="font-sans text-sm text-muted-foreground">Configure your OpenClaw Gateway connection.</p>
      </div>

      <Card className="rounded-xl border-border bg-card shadow-[0_8px_22px_rgba(51,43,30,0.06)]">
        <CardHeader className="mb-1 flex flex-row items-center justify-between gap-2 border-b border-border/70 pb-3">
          <CardTitle>Gateway connection</CardTitle>
          <Badge
            variant="outline"
            className={
              health?.ok
                ? 'rounded-full border border-[rgba(47,122,88,0.35)] bg-[rgba(47,122,88,0.08)] font-sans text-[11px] text-[#2f7a58]'
                : 'rounded-full font-sans text-[11px]'
            }
          >
            {health?.ok ? 'Connected' : 'Not connected'}
          </Badge>
        </CardHeader>

        <CardContent className="pt-1">
          <form className="grid gap-3" onSubmit={onSave}>
            <label>
              <span className="mb-1 block font-sans text-xs text-muted-foreground">Gateway URL (WebSocket)</span>
              <Input
                value={draftGatewayUrl}
                onChange={(event) => onDraftGatewayUrlChange(event.target.value)}
                placeholder="ws://127.0.0.1:18789"
                className="font-sans"
              />
            </label>

            <label>
              <span className="mb-1 block font-sans text-xs text-muted-foreground">Gateway token</span>
              <Input
                type="password"
                value={draftGatewayToken}
                onChange={(event) => onDraftGatewayTokenChange(event.target.value)}
                placeholder="Paste token from OpenClaw setup"
                className="font-sans"
              />
            </label>

            <Button
              className="w-full border-0 bg-[linear-gradient(120deg,#ea9f7d,#de825e)] text-[#fffefb]"
              type="submit"
              disabled={saving}
            >
              {saving ? 'Connecting...' : 'Save & Connect'}
            </Button>
          </form>

          {effectivePairingId ? (
            <div className="mt-3 rounded-lg border border-[rgba(222,130,94,0.35)] bg-[rgba(222,130,94,0.08)] p-3">
              <p className="font-sans text-xs font-medium text-[#7a4a38]">Device pairing required</p>
              <p className="mt-1 font-sans text-xs text-[#7a4a38]">
                Run this on your gateway host to approve:
              </p>
              <div className="mt-1 flex items-center gap-1">
                <code className="flex-1 rounded bg-[rgba(0,0,0,0.05)] px-2 py-1 font-mono text-xs text-[#7a4a38] select-all">
                  openclaw devices approve {effectivePairingId}
                </code>
                <button
                  type="button"
                  className="shrink-0 rounded bg-[rgba(0,0,0,0.05)] px-2 py-1 font-sans text-[10px] text-[#7a4a38] hover:bg-[rgba(0,0,0,0.1)]"
                  onClick={copyCommand}
                >
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <p className="mt-2 font-sans text-xs text-[#7a4a38]/70">
                After approving, click Save & Connect again.
              </p>
            </div>
          ) : health && !health.ok ? (
            <div className="mt-3 rounded-lg border border-[rgba(180,80,50,0.25)] bg-[rgba(180,80,50,0.06)] p-3">
              <p className="font-sans text-xs font-medium text-[#7a4a38]">Connection failed</p>
              <p className="mt-1 font-sans text-xs text-[#7a4a38]/80">{health.message}</p>
            </div>
          ) : health?.ok ? (
            <p className="mt-3 font-sans text-xs text-[#2f7a58]">{status}</p>
          ) : status ? (
            <p className="mt-3 font-sans text-xs text-muted-foreground">{status}</p>
          ) : null}

          <div className="mt-4 border-t border-border/50 pt-3">
            <button
              type="button"
              className="font-sans text-xs text-muted-foreground/70 underline-offset-2 hover:text-muted-foreground hover:underline"
              onClick={() => setShowAdvanced(!showAdvanced)}
            >
              {showAdvanced ? 'Hide advanced options' : 'Advanced options'}
            </button>

            {showAdvanced && (
              <div className="mt-2 grid gap-2">
                <p className="font-sans text-xs text-muted-foreground">
                  Reset your device identity if the gateway no longer recognizes this client.
                  You will need to re-approve pairing after resetting.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  className="w-fit font-sans text-xs"
                  onClick={() => void onResetPairing()}
                >
                  Reset device identity
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
