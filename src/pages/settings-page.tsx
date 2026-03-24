import { useState, useMemo, useCallback } from 'react';
import type { FormEvent } from 'react';
import { Code2, KeyRound, Link2, Shield } from 'lucide-react';

import type { HealthCheckResult } from '@/app-types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';

type UserPreferences = {
  fullName: string;
  displayName: string;
  role: string;
  responsePreferences: string;
  systemPrompt: string;
  theme: 'light' | 'auto' | 'dark';
};

type SettingsSection = 'Profil' | 'Darstellung' | 'System-Prompt' | 'Gateway' | 'Konnektoren' | 'Konto' | 'Datenschutz' | 'Entwickler';

type SettingsPageProps = {
  activeSection: SettingsSection;
  draftGatewayUrl: string;
  draftGatewayToken: string;
  health: HealthCheckResult | null;
  status: string;
  saving: boolean;
  pairingRequestId: string | null;
  preferences: UserPreferences;
  onDraftGatewayUrlChange: (value: string) => void;
  onDraftGatewayTokenChange: (value: string) => void;
  onSave: (event: FormEvent) => void;
  onResetPairing: () => void | Promise<void>;
  onUpdatePreferences: (patch: Partial<UserPreferences>) => void;
};

const sectionDescriptions: Record<SettingsSection, string> = {
  Profil: 'Dein Name, deine Rolle und Antwortpräferenzen.',
  Darstellung: 'Theme, Schriftgröße und Benachrichtigungen.',
  'System-Prompt': 'Standard-Anweisungen für jede Konversation.',
  Gateway: 'OpenClaw Gateway-Verbindung und Geräteautorisierung.',
  Konnektoren: 'Externe Dienste mit Relay verbinden.',
  Konto: 'E-Mail, Passwort und Sicherheitseinstellungen.',
  Datenschutz: 'Datenfreigaben und Aufbewahrungsrichtlinien.',
  Entwickler: 'Entwickleroptionen und Debugging-Tools.',
};

export function SettingsPage({
  activeSection,
  draftGatewayUrl,
  draftGatewayToken,
  health,
  status,
  saving,
  pairingRequestId,
  preferences,
  onDraftGatewayUrlChange,
  onDraftGatewayTokenChange,
  onSave,
  onResetPairing,
  onUpdatePreferences,
}: SettingsPageProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [copied, setCopied] = useState(false);

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

  const renderPlaceholder = (icon: React.ReactNode, hint: string) => (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border/60 py-12 text-center">
      <div className="flex size-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        {icon}
      </div>
      <div>
        <p className="text-sm font-medium text-muted-foreground">Noch nicht verfügbar</p>
        <p className="mt-0.5 text-xs text-muted-foreground/70">{hint}</p>
      </div>
    </div>
  );

  return (
    <section className="mx-auto w-full max-w-[720px] px-2">
      <div className="mb-6">
        <h1 className="mb-1 text-[clamp(1.55rem,2.4vw,2rem)] tracking-tight">{activeSection}</h1>
        <p className="font-sans text-sm text-muted-foreground">
          {sectionDescriptions[activeSection]}
        </p>
      </div>

      {/* ── Profil ── */}
      {activeSection === 'Profil' && (
        <section className="pb-6">
          <div className="mb-3">
            <h2 className="text-base font-medium">Persönliche Daten</h2>
          </div>
          <div className="grid gap-4">
            <div className="grid gap-3 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
              <label className="grid gap-1">
                <span className="font-sans text-xs text-muted-foreground">Vollständiger Name</span>
                <Input className="font-sans" placeholder="Christian Lutz" value={preferences.fullName} onChange={(e) => onUpdatePreferences({ fullName: e.target.value })} />
              </label>
              <label className="grid gap-1">
                <span className="font-sans text-xs text-muted-foreground">Wie soll Relay dich nennen?</span>
                <Input className="font-sans" placeholder="Christian" value={preferences.displayName} onChange={(e) => onUpdatePreferences({ displayName: e.target.value })} />
              </label>
            </div>
            <label className="grid gap-1">
              <span className="font-sans text-xs text-muted-foreground">Arbeitsfunktion</span>
              <Input className="font-sans" placeholder="z. B. Gründer, Entwickler, Designer" value={preferences.role} onChange={(e) => onUpdatePreferences({ role: e.target.value })} />
            </label>
            <label className="grid gap-1">
              <span className="font-sans text-xs text-muted-foreground">Präferenzen für Antworten</span>
              <Textarea className="font-sans" placeholder="z. B. Ich programmiere hauptsächlich in Python." value={preferences.responsePreferences} onChange={(e) => onUpdatePreferences({ responsePreferences: e.target.value })} />
            </label>
          </div>
        </section>
      )}

      {/* ── Darstellung ── */}
      {activeSection === 'Darstellung' && (
        <div className="flex flex-col gap-6">
          <section>
            <div className="mb-3">
              <h2 className="text-base font-medium">Theme</h2>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              {([['Einfach', 'light'], ['Auto', 'auto'], ['Dunkel', 'dark']] as const).map(([label, value]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => onUpdatePreferences({ theme: value })}
                  className={`flex flex-col items-center gap-2 rounded-xl border px-3 py-3 text-sm transition ${
                    preferences.theme === value
                      ? 'border-[#d98765] bg-[rgba(222,130,94,0.08)] text-foreground'
                      : 'border-border bg-background text-muted-foreground hover:bg-muted'
                  }`}
                >
                  <div className={`h-16 w-full rounded-lg border border-border ${value === 'dark' ? 'bg-[#2a2a28]' : 'bg-muted'}`} />
                  {label}
                </button>
              ))}
            </div>
          </section>

          <Separator />

          <section>
            <div className="mb-3">
              <h2 className="text-base font-medium">Benachrichtigungen</h2>
            </div>
            <div className="flex flex-col gap-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium">Antwort-Vervollständigungen</p>
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
        </div>
      )}

      {/* ── System-Prompt ── */}
      {activeSection === 'System-Prompt' && (
        <section className="pb-6">
          <div className="mb-3">
            <h2 className="text-base font-medium">Standard System-Prompt</h2>
            <p className="mt-1 text-sm text-muted-foreground">Wird jeder Konversation als Kontext vorangestellt.</p>
          </div>
          <Textarea
            className="min-h-[180px] font-sans text-sm"
            placeholder="z. B. Du bist ein hilfreicher Assistent der SeventeenLabs. Antworte immer auf Deutsch."
            value={preferences.systemPrompt}
            onChange={(e) => onUpdatePreferences({ systemPrompt: e.target.value })}
          />
          <p className="mt-2 font-sans text-[11px] text-muted-foreground/60">
            {preferences.systemPrompt.length} Zeichen
          </p>
        </section>
      )}

      {/* ── Gateway ── */}
      {activeSection === 'Gateway' && (
        <div className="flex flex-col gap-6">
          <section>
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-base font-medium">Verbindung</h2>
              <Badge
                variant="outline"
                className={
                  health?.ok
                    ? 'rounded-full border border-[rgba(47,122,88,0.35)] bg-[rgba(47,122,88,0.08)] font-sans text-[11px] text-[#2f7a58]'
                    : 'rounded-full font-sans text-[11px]'
                }
              >
                {health?.ok ? 'Verbunden' : 'Nicht verbunden'}
              </Badge>
            </div>
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
                <span className="font-sans text-xs text-muted-foreground">Gateway Token</span>
                <Input
                  type="password"
                  value={draftGatewayToken}
                  onChange={(event) => onDraftGatewayTokenChange(event.target.value)}
                  placeholder="Token aus OpenClaw-Setup einfügen"
                  className="font-sans"
                />
              </label>

              <Button
                className="w-full border-0 bg-[linear-gradient(120deg,#ea9f7d,#de825e)] text-[#fffefb]"
                type="submit"
                disabled={saving}
              >
                {saving ? 'Verbinde...' : 'Speichern & Verbinden'}
              </Button>
            </form>

            {effectivePairingId ? (
              <div className="mt-3 rounded-lg border border-[rgba(222,130,94,0.35)] bg-[rgba(222,130,94,0.08)] p-3">
                <p className="font-sans text-xs font-medium text-[#7a4a38]">Geräte-Pairing erforderlich</p>
                <p className="mt-1 font-sans text-xs text-[#7a4a38]">
                  Führe diesen Befehl auf deinem Gateway-Host aus:
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
                    {copied ? 'Kopiert!' : 'Kopieren'}
                  </button>
                </div>
                <p className="mt-2 font-sans text-xs text-[#7a4a38]/70">
                  Klicke danach erneut auf Speichern & Verbinden.
                </p>
              </div>
            ) : health && !health.ok ? (
              <div className="mt-3 rounded-lg border border-[rgba(180,80,50,0.25)] bg-[rgba(180,80,50,0.06)] p-3">
                <p className="font-sans text-xs font-medium text-[#7a4a38]">Verbindung fehlgeschlagen</p>
                <p className="mt-1 font-sans text-xs text-[#7a4a38]/80">{health.message}</p>
              </div>
            ) : health?.ok ? (
              <p className="mt-3 font-sans text-xs text-[#2f7a58]">{status}</p>
            ) : status ? (
              <p className="mt-3 font-sans text-xs text-muted-foreground">{status}</p>
            ) : null}
          </section>

          <Separator />

          <section>
            <div className="mb-3">
              <h2 className="text-base font-medium">Routing</h2>
              <p className="mt-1 text-sm text-muted-foreground">Konfiguriere, wie Relay sich mit dem OpenClaw-Backend verbindet.</p>
            </div>
            <div className="grid gap-3">
              <div className="flex flex-col gap-2">
                {([
                  ['Lokal', 'ws://127.0.0.1:18789', 'Gateway läuft auf diesem Rechner'],
                  ['VPS / Remote', 'wss://gateway.example.com', 'Gateway auf einem externen Server'],
                  ['Benutzerdefiniert', '', 'Eigene URL eingeben'],
                ] as const).map(([label, url, desc]) => {
                  const isSelected = url
                    ? draftGatewayUrl === url
                    : draftGatewayUrl !== 'ws://127.0.0.1:18789' && draftGatewayUrl !== 'wss://gateway.example.com';
                  return (
                    <button
                      key={label}
                      type="button"
                      onClick={() => { if (url) onDraftGatewayUrlChange(url); }}
                      className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 text-left text-sm transition ${
                        isSelected
                          ? 'border-[#d98765] bg-[rgba(222,130,94,0.08)]'
                          : 'border-border hover:bg-muted'
                      }`}
                    >
                      <div className={`mt-0.5 h-3 w-3 shrink-0 rounded-full border-2 ${isSelected ? 'border-[#d98765] bg-[#d98765]' : 'border-muted-foreground/40'}`} />
                      <div>
                        <p className="font-medium">{label}</p>
                        <p className="text-xs text-muted-foreground">{desc}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </section>

          <Separator />

          <section>
            <div className="mb-3">
              <h2 className="text-base font-medium">Geräteverwaltung</h2>
              <p className="mt-1 text-sm text-muted-foreground">Geräteidentität und Pairing-Status.</p>
            </div>
            <div className="grid gap-3">
              <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5">
                <div>
                  <p className="text-sm font-medium">Geräteidentität zurücksetzen</p>
                  <p className="text-xs text-muted-foreground">
                    Setzt die Ed25519-Schlüssel zurück. Danach muss das Pairing erneut bestätigt werden.
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  className="shrink-0 font-sans text-xs"
                  onClick={() => void onResetPairing()}
                >
                  Zurücksetzen
                </Button>
              </div>
            </div>
          </section>

          <Separator />

          <section className="pb-2">
            <button
              type="button"
              className="font-sans text-xs text-muted-foreground/70 underline-offset-2 hover:text-muted-foreground hover:underline"
              onClick={() => setShowAdvanced(!showAdvanced)}
            >
              {showAdvanced ? 'Erweiterte Optionen ausblenden' : 'Erweiterte Optionen'}
            </button>

            {showAdvanced && (
              <div className="mt-3 grid gap-3">
                <label className="grid gap-1">
                  <span className="font-sans text-xs text-muted-foreground">Reconnect-Versuche (max)</span>
                  <Input type="number" className="font-sans w-32" placeholder="6" defaultValue="6" />
                </label>
                <label className="grid gap-1">
                  <span className="font-sans text-xs text-muted-foreground">Reconnect-Basisintervall (ms)</span>
                  <Input type="number" className="font-sans w-32" placeholder="1000" defaultValue="1000" />
                </label>
                <label className="grid gap-1">
                  <span className="font-sans text-xs text-muted-foreground">WebSocket-Timeout (ms)</span>
                  <Input type="number" className="font-sans w-32" placeholder="30000" defaultValue="30000" />
                </label>
              </div>
            )}
          </section>
        </div>
      )}

      {/* ── Placeholders ── */}
      {activeSection === 'Konnektoren' && renderPlaceholder(<Link2 className="size-5" />, 'Verbinde CRM, Kalender, Wissensdatenbanken und mehr.')}
      {activeSection === 'Konto' && renderPlaceholder(<KeyRound className="size-5" />, 'E-Mail, Passwort und Zwei-Faktor-Authentifizierung.')}
      {activeSection === 'Datenschutz' && renderPlaceholder(<Shield className="size-5" />, 'Datenfreigaben, Aufbewahrung und Löschrichtlinien.')}
      {activeSection === 'Entwickler' && renderPlaceholder(<Code2 className="size-5" />, 'API-Schlüssel, Logs und Debugging-Werkzeuge.')}
    </section>
  );
}
