import { useState, useMemo, useCallback } from 'react';
import type { FormEvent } from 'react';

import type { HealthCheckResult } from '@/app-types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Menu, MenuItem, MenuLabel } from '@/components/ui/menu';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';

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
  const [activeSection, setActiveSection] = useState('Allgemein');

  const renderPlaceholder = (title: string, description: string) => (
    <section className="pb-6 border-b border-border/60">
      <div className="mb-3">
        <h2 className="text-base font-medium">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="text-sm text-muted-foreground">Konfiguration folgt in einem weiteren Schritt.</div>
    </section>
  );

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
    <section className="mx-auto w-full max-w-[1120px] px-2">
      <div className="mb-6 flex items-center gap-2 text-sm text-muted-foreground">
        <button type="button" className="rounded-full px-2 py-1 hover:bg-muted">
          ←
        </button>
        <span className="font-sans">Einstellungen</span>
      </div>

      <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="pl-1">
          <Menu className="gap-1">
            {['Allgemein', 'Konto', 'Datenschutz', 'Abrechnung', 'Fahigkeiten', 'Konnektoren', 'Claude Code'].map((label) => (
              <MenuItem key={label} active={activeSection === label} onClick={() => setActiveSection(label)} className="text-[13px]">
                {label}
              </MenuItem>
            ))}
          </Menu>
          <Separator className="my-3" />
          <MenuLabel className="text-[11px]">Desktop-App</MenuLabel>
          <Menu className="gap-1">
            {['Allgemein', 'Erweiterungen', 'Entwickler'].map((label) => (
              <MenuItem key={label} active={activeSection === label} onClick={() => setActiveSection(label)} className="text-[13px]">
                {label}
              </MenuItem>
            ))}
          </Menu>
        </aside>

        <div className="flex flex-col gap-6">
          <div>
            <Badge variant="outline" className="mb-2 font-sans text-[11px] text-muted-foreground">
              {activeSection}
            </Badge>
            <h1 className="mb-1 text-[clamp(1.55rem,2.4vw,2rem)] tracking-tight">{activeSection}</h1>
            <p className="font-sans text-sm text-muted-foreground">
              Verwalte deine Konto- und Workspace-Einstellungen.
            </p>
          </div>

          {activeSection === 'Allgemein' && (
            <>
              <section className="pb-6 border-b border-border/60">
                <div className="mb-3">
                  <h2 className="text-base font-medium">Profil</h2>
                </div>
                <div className="grid gap-4">
                  <div className="grid gap-3 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
                    <label className="grid gap-1">
                      <span className="font-sans text-xs text-muted-foreground">Vollstandiger Name</span>
                      <Input className="font-sans" placeholder="Christian Lutz" />
                    </label>
                    <label className="grid gap-1">
                      <span className="font-sans text-xs text-muted-foreground">Wie soll Relay dich nennen?</span>
                      <Input className="font-sans" placeholder="Christian" />
                    </label>
                  </div>
                  <label className="grid gap-1">
                    <span className="font-sans text-xs text-muted-foreground">Arbeitsfunktion</span>
                    <Input className="font-sans" placeholder="Wahlen Sie Ihre Arbeitsfunktion" />
                  </label>
                  <label className="grid gap-1">
                    <span className="font-sans text-xs text-muted-foreground">Praferenzen fur Antworten</span>
                    <Textarea className="font-sans" placeholder="z. B. Ich programmiere hauptsachlich in Python." />
                  </label>
                </div>
              </section>

              <section className="pb-6 border-b border-border/60">
                <div className="mb-3">
                  <h2 className="text-base font-medium">Benachrichtigungen</h2>
                </div>
                <div className="flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium">Antwort-Vervollstandigungen</p>
                      <p className="text-xs text-muted-foreground">
                        Lass dich benachrichtigen, wenn eine Antwort abgeschlossen ist.
                      </p>
                    </div>
                    <Button variant="outline" size="sm">Aktivieren</Button>
                  </div>
                  <Separator />
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium">Systemhinweise</p>
                      <p className="text-xs text-muted-foreground">Updates zu geplanten Tasks und Status.</p>
                    </div>
                    <Button variant="outline" size="sm">Verwalten</Button>
                  </div>
                </div>
              </section>

              <section className="pb-6 border-b border-border/60">
                <div className="mb-3">
                  <h2 className="text-base font-medium">Darstellung</h2>
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  {['Einfach', 'Auto', 'Dunkel'].map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      className="flex flex-col items-center gap-2 rounded-xl border border-border bg-background px-3 py-3 text-sm text-muted-foreground hover:bg-muted"
                    >
                      <div className="h-16 w-full rounded-lg border border-border bg-muted" />
                      {mode}
                    </button>
                  ))}
                </div>
              </section>

              <section className="pb-2">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h2 className="text-base font-medium">Gateway connection</h2>
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
                </div>
                <div className="pt-1">
                  <form className="grid gap-3" onSubmit={onSave}>
                    <label className="grid gap-1">
                      <span className="font-sans text-xs text-muted-foreground">Gateway URL (WebSocket)</span>
                      <Input
                        value={draftGatewayUrl}
                        onChange={(event) => onDraftGatewayUrlChange(event.target.value)}
                        placeholder="ws://127.0.0.1:18789"
                        className="font-sans"
                      />
                    </label>

                    <label className="grid gap-1">
                      <span className="font-sans text-xs text-muted-foreground">Gateway token</span>
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
                </div>
              </section>
            </>
          )}

          {activeSection === 'Konto' && renderPlaceholder('Konto', 'Verwalte E-Mail, Passwort und Sicherheitseinstellungen.')}
          {activeSection === 'Datenschutz' && renderPlaceholder('Datenschutz', 'Kontrolliere Datenfreigaben und Aufbewahrungsrichtlinien.')}
          {activeSection === 'Abrechnung' && renderPlaceholder('Abrechnung', 'Abonnements, Rechnungen und Zahlungsarten verwalten.')}
          {activeSection === 'Fahigkeiten' && renderPlaceholder('Fahigkeiten', 'Aktiviere oder deaktiviere Copilot-Fahigkeiten.')}
          {activeSection === 'Konnektoren' && renderPlaceholder('Konnektoren', 'Verbinde externe Dienste mit Relay.')}
          {activeSection === 'Claude Code' && renderPlaceholder('Claude Code', 'Editor- und Code-Integrationen konfigurieren.')}
          {activeSection === 'Erweiterungen' && renderPlaceholder('Erweiterungen', 'Desktop-App Erweiterungen verwalten.')}
          {activeSection === 'Entwickler' && renderPlaceholder('Entwickler', 'Entwickleroptionen und Debugging-Tools.')}
        </div>
      </div>
    </section>
  );
}
