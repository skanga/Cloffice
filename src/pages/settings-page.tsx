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
  checking: boolean;
  pairingRequestId: string | null;
  onDraftGatewayUrlChange: (value: string) => void;
  onDraftGatewayTokenChange: (value: string) => void;
  onSave: (event: FormEvent) => void;
  onHealthCheck: () => void | Promise<void>;
  onRequestPairing: () => void | Promise<void>;
  onResetPairing: () => void | Promise<void>;
};

export function SettingsPage({
  draftGatewayUrl,
  draftGatewayToken,
  health,
  status,
  saving,
  checking,
  pairingRequestId,
  onDraftGatewayUrlChange,
  onDraftGatewayTokenChange,
  onSave,
  onHealthCheck,
  onRequestPairing,
  onResetPairing,
}: SettingsPageProps) {
  return (
    <section className="mx-auto w-full max-w-[860px]">
      <div className="mb-4">
        <Badge variant="outline" className="mb-2 font-sans text-[11px] text-muted-foreground">
          Settings
        </Badge>
        <h1 className="mb-1 text-[clamp(1.55rem,2.4vw,2rem)] tracking-tight">Workspace settings</h1>
        <p className="font-sans text-sm text-muted-foreground">Configure backend routing, validate connectivity, and save your defaults.</p>
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
            {health?.ok ? 'Connected' : 'Unchecked'}
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
              <span className="mb-1 block font-sans text-xs text-muted-foreground">Gateway token (optional)</span>
              <Input
                type="password"
                value={draftGatewayToken}
                onChange={(event) => onDraftGatewayTokenChange(event.target.value)}
                placeholder="Paste token from OpenClaw setup"
                className="font-sans"
              />
            </label>

            <div className="flex items-end gap-2 max-sm:flex-col max-sm:items-stretch">
              <Button className="flex-1 border-0 bg-[linear-gradient(120deg,#ea9f7d,#de825e)] text-[#fffefb]" type="submit" disabled={saving}>
                {saving ? 'Saving...' : 'Save configuration'}
              </Button>
              <Button className="flex-1" variant="outline" type="button" onClick={() => void onHealthCheck()} disabled={checking}>
                {checking ? 'Checking...' : 'Connect'}
              </Button>
              <Button className="flex-1" variant="outline" type="button" onClick={() => void onRequestPairing()} disabled={checking}>
                {checking ? 'Requesting...' : 'Request pairing'}
              </Button>
              <Button className="flex-1" variant="outline" type="button" onClick={() => void onResetPairing()} disabled={checking}>
                {checking ? 'Resetting...' : 'Reset pairing'}
              </Button>
            </div>
          </form>

          <div className="mt-3 grid gap-2 rounded-xl border border-dashed border-border p-3">
            <p className="font-sans text-sm text-muted-foreground">{status}</p>
            <p className="font-sans text-xs text-muted-foreground">
              For most OpenClaw setups, only Gateway URL and token are required.
            </p>
            {pairingRequestId && (
              <div className="rounded-lg border border-[rgba(222,130,94,0.35)] bg-[rgba(222,130,94,0.08)] p-2">
                <p className="font-sans text-xs text-[#7a4a38]">
                  Pairing request ID: <span className="font-semibold">{pairingRequestId}</span>
                </p>
                <p className="mt-1 font-sans text-xs text-[#7a4a38]">
                  Approve on gateway host: openclaw devices approve {pairingRequestId}
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
