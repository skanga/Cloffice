import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Info,
  Play,
  Search,
  Timer,
  Zap,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import type { ChatMessage, ChatActivityItem } from '@/app-types';
import type { InternalEngineRunRecord, InternalEngineRuntimeRetentionPolicy } from '@/lib/internal-engine-bridge';

type ActivityPageProps = {
  chatMessages: ChatMessage[];
  coworkMessages: ChatMessage[];
  activeSessionKey: string;
  coworkSessionKey: string;
  engineConnected: boolean;
  onOpenInternalRun?: (runId: string, scheduleId?: string | null) => void;
};

type ActivityEntry = {
  id: string;
  timestamp: number;
  source: 'chat' | 'cowork' | 'schedule' | 'runtime';
  sessionKey: string;
  role: 'user' | 'assistant' | 'system';
  text: string;
  activities: ChatActivityItem[];
  runId?: string;
  scheduleId?: string;
};

type ToneFilter = 'all' | 'success' | 'danger' | 'neutral';

function getDesktopBridge() {
  return window.cloffice ?? window.relay ?? null;
}

function extractActivities(msg: ChatMessage): ChatActivityItem[] {
  if (msg.meta?.kind === 'activity' && Array.isArray(msg.meta.items)) {
    return msg.meta.items;
  }
  return [];
}

function buildScheduleRunActivity(run: InternalEngineRunRecord): ChatActivityItem {
  const tone: 'success' | 'danger' | 'neutral' = run.status === 'completed'
    ? 'success'
    : run.status === 'blocked' || run.status === 'interrupted'
      ? 'danger'
      : 'neutral';
  const details = [
    run.scheduleName ? `Schedule: ${run.scheduleName}` : null,
    run.model ? `Model: ${run.model}` : null,
    run.providerPhase ? `Phase: ${run.providerPhase}` : null,
    run.responseSchemaVersion ? `Schema: v${run.responseSchemaVersion}` : null,
    run.responseNormalization ? `Normalization: ${run.responseNormalization}` : null,
    run.summary ?? run.resultSummary ?? null,
  ].filter(Boolean).join(' · ');
  return {
    id: `schedule-run-${run.runId}`,
    tone,
    label: `Scheduled run ${run.status.replace(/_/g, ' ')}`,
    details: details || undefined,
  };
}

function buildRuntimeRunActivity(run: InternalEngineRunRecord): ChatActivityItem {
  const tone: 'success' | 'danger' | 'neutral' = run.status === 'completed'
    ? 'success'
    : run.status === 'blocked' || run.status === 'interrupted'
      ? 'danger'
      : 'neutral';
  const details = [
    `Session: ${run.sessionKind}`,
    run.model ? `Model: ${run.model}` : null,
    run.providerPhase ? `Phase: ${run.providerPhase}` : null,
    run.responseSchemaVersion ? `Schema: v${run.responseSchemaVersion}` : null,
    run.responseNormalization ? `Normalization: ${run.responseNormalization}` : null,
    run.summary ?? run.resultSummary ?? null,
  ].filter(Boolean).join(' · ');
  return {
    id: `runtime-run-${run.runId}`,
    tone,
    label: `Runtime run ${run.status.replace(/_/g, ' ')}`,
    details: details || undefined,
  };
}

function timeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hr ago`;
  const days = Math.floor(seconds / 86400);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

const TONE_CONFIG = {
  success: { icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-950/30', border: 'border-emerald-200 dark:border-emerald-800/50', label: 'Success' },
  danger: { icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-50 dark:bg-red-950/30', border: 'border-red-200 dark:border-red-800/50', label: 'Error' },
  neutral: { icon: Info, color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-950/30', border: 'border-blue-200 dark:border-blue-800/50', label: 'Info' },
} as const;

export function ActivityPage({
  chatMessages,
  coworkMessages,
  activeSessionKey,
  coworkSessionKey,
  engineConnected,
  onOpenInternalRun,
}: ActivityPageProps) {
  const [filterQuery, setFilterQuery] = useState('');
  const [toneFilter, setToneFilter] = useState<ToneFilter>('all');
  const [sourceFilter, setSourceFilter] = useState<'all' | 'chat' | 'cowork' | 'schedule' | 'runtime'>('all');
  const [expandedEntries, setExpandedEntries] = useState<Set<string>>(new Set());
  const [internalRunHistory, setInternalRunHistory] = useState<InternalEngineRunRecord[]>([]);
  const [runtimeRetentionPolicy, setRuntimeRetentionPolicy] = useState<InternalEngineRuntimeRetentionPolicy | null>(null);
  const [runDetailsById, setRunDetailsById] = useState<Record<string, InternalEngineRunRecord>>({});

  useEffect(() => {
    let cancelled = false;
    const bridge = getDesktopBridge();
    if (!bridge?.getInternalRunHistory) {
      setInternalRunHistory([]);
      return () => {
        cancelled = true;
      };
    }

    const loadRunHistory = async () => {
      try {
        const [runs, retentionPolicy] = await Promise.all([
          bridge.getInternalRunHistory(24),
          bridge.getInternalRuntimeRetentionPolicy?.() ?? Promise.resolve(null),
        ]);
        if (!cancelled) {
          setInternalRunHistory(runs);
          setRuntimeRetentionPolicy(retentionPolicy);
        }
      } catch {
        if (!cancelled) {
          setInternalRunHistory([]);
          setRuntimeRetentionPolicy(null);
        }
      }
    };

    void loadRunHistory();
    const intervalId = window.setInterval(() => {
      void loadRunHistory();
    }, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [engineConnected]);

  const entries = useMemo(() => {
    const all: ActivityEntry[] = [];
    let counter = 0;

    const processMessages = (messages: ChatMessage[], source: 'chat' | 'cowork', sessionKey: string) => {
      for (const msg of messages) {
        counter++;
        const activities = extractActivities(msg);
        all.push({
          id: `${source}-${counter}`,
          timestamp: Date.now() - (messages.length - counter) * 60_000,
          source,
          sessionKey,
          role: msg.role,
          text: msg.text,
          activities,
        });
      }
    };

    processMessages(chatMessages, 'chat', activeSessionKey);
    counter = 0;
    processMessages(coworkMessages, 'cowork', coworkSessionKey);
    for (const run of internalRunHistory) {
      const source = run.scheduleId ? 'schedule' : 'runtime';
      all.push({
        id: `${source}-${run.runId}`,
        timestamp: run.updatedAt || run.startedAt,
        source,
        sessionKey: run.sessionKey,
        role: 'system',
        text: run.summary
          || run.resultSummary
          || run.promptPreview
          || `${source === 'schedule' ? 'Scheduled' : 'Runtime'} run ${run.status.replace(/_/g, ' ')}`,
        activities: [source === 'schedule' ? buildScheduleRunActivity(run) : buildRuntimeRunActivity(run)],
        runId: run.runId,
        scheduleId: run.scheduleId,
      });
    }

    return all.sort((a, b) => b.timestamp - a.timestamp);
  }, [chatMessages, coworkMessages, activeSessionKey, coworkSessionKey, internalRunHistory]);

  const filteredEntries = useMemo(() => {
    let result = entries;

    if (sourceFilter !== 'all') {
      result = result.filter((e) => e.source === sourceFilter);
    }
    if (toneFilter !== 'all') {
      result = result.filter((e) => e.activities.some((a) => a.tone === toneFilter));
    }
    if (filterQuery.trim()) {
      const q = filterQuery.toLowerCase();
      result = result.filter(
        (e) =>
          e.text.toLowerCase().includes(q) ||
          e.activities.some((a) => a.label.toLowerCase().includes(q) || a.details?.toLowerCase().includes(q)),
      );
    }

    return result;
  }, [entries, sourceFilter, toneFilter, filterQuery]);

  const stats = useMemo(() => {
    const total = entries.length;
    const withActivity = entries.filter((e) => e.activities.length > 0).length;
    const successes = entries.filter((e) => e.activities.some((a) => a.tone === 'success')).length;
    const errors = entries.filter((e) => e.activities.some((a) => a.tone === 'danger')).length;
    return { total, withActivity, successes, errors };
  }, [entries]);

  const toggleExpand = useCallback((entry: ActivityEntry) => {
    setExpandedEntries((prev) => {
      const next = new Set(prev);
      if (next.has(entry.id)) next.delete(entry.id);
      else next.add(entry.id);
      return next;
    });
    if (!entry.runId || runDetailsById[entry.runId]) {
      return;
    }
    const bridge = getDesktopBridge();
    void bridge?.getInternalRunDetails?.(entry.runId).then((detail) => {
      if (!detail) {
        return;
      }
      setRunDetailsById((current) => ({ ...current, [entry.runId!]: detail }));
    }).catch(() => {
      // Best-effort detail hydration for runtime-backed activity entries.
    });
  }, [runDetailsById]);

  return (
    <section className="mx-auto grid h-full w-full max-w-[1060px] min-h-0 grid-rows-[auto_auto_minmax(0,1fr)] gap-3">
      <header>
        <div className="flex items-center gap-2">
          <Zap className="size-5 text-amber-600" />
          <h1 className="text-xl font-semibold tracking-tight">Activity</h1>
          <Badge variant="outline" className="ml-2 font-sans text-[11px]">
            {engineConnected ? 'Live' : 'Offline'}
          </Badge>
        </div>
        <p className="mt-1 font-sans text-sm text-muted-foreground">
          Real-time overview of all agent actions, tool calls, and system events.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border/60 bg-card px-4 py-2.5">
        <div className="flex items-center gap-1.5">
          <Clock className="size-3.5 text-muted-foreground/60" />
          <span className="font-sans text-[12px] text-muted-foreground">{stats.total} events</span>
        </div>
        <Separator orientation="vertical" className="h-4" />
        <div className="flex items-center gap-1.5">
          <CheckCircle2 className="size-3.5 text-emerald-600" />
          <span className="font-sans text-[12px] text-muted-foreground">{stats.successes} success</span>
        </div>
        <div className="flex items-center gap-1.5">
          <AlertTriangle className="size-3.5 text-red-500" />
          <span className="font-sans text-[12px] text-muted-foreground">{stats.errors} errors</span>
        </div>
        <Separator orientation="vertical" className="h-4" />
        <div className="flex items-center gap-1.5">
          <Timer className="size-3.5 text-amber-500" />
          <span className="font-sans text-[12px] text-muted-foreground">{stats.withActivity} with actions</span>
        </div>
        {runtimeRetentionPolicy ? (
          <>
            <Separator orientation="vertical" className="h-4" />
            <div className="flex items-center gap-1.5">
              <Info className="size-3.5 text-muted-foreground/60" />
              <span className="font-sans text-[12px] text-muted-foreground">
                Run retention {internalRunHistory.length}/{runtimeRetentionPolicy.runHistoryRetentionLimit}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <Info className="size-3.5 text-muted-foreground/60" />
              <span className="font-sans text-[12px] text-muted-foreground">
                Artifact retention {runtimeRetentionPolicy.artifactHistoryRetentionLimit}
              </span>
            </div>
          </>
        ) : null}
      </div>

      <div className="flex min-h-0 flex-col rounded-xl border border-border/60 bg-card">
        <div className="flex items-center gap-2 border-b border-border/40 px-4 py-2">
          <Search className="size-3.5 text-muted-foreground/60" />
          <Input
            type="text"
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            placeholder="Search activity..."
            className="h-7 border-0 bg-transparent px-0 text-[12px] shadow-none focus-visible:ring-0"
          />
          <Separator orientation="vertical" className="h-4" />
          <div className="flex items-center gap-1">
            {(['all', 'chat', 'cowork', 'schedule', 'runtime'] as const).map((src) => (
              <button
                key={src}
                type="button"
                className={`rounded-md px-2 py-1 font-sans text-[11px] transition-colors ${
                  sourceFilter === src ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/50'
                }`}
                onClick={() => setSourceFilter(src)}
              >
                {src === 'all' ? 'All' : src === 'chat' ? 'Chat' : src === 'cowork' ? 'Cowork' : src === 'schedule' ? 'Scheduled' : 'Runtime'}
              </button>
            ))}
          </div>
          <Separator orientation="vertical" className="h-4" />
          <div className="flex items-center gap-1">
            {(['all', 'success', 'danger', 'neutral'] as const).map((tone) => (
              <button
                key={tone}
                type="button"
                className={`rounded-md px-2 py-1 font-sans text-[11px] transition-colors ${
                  toneFilter === tone ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/50'
                }`}
                onClick={() => setToneFilter(tone)}
              >
                {tone === 'all' ? 'All' : TONE_CONFIG[tone].label}
              </button>
            ))}
          </div>
        </div>

        <ScrollArea className="flex-1">
          {filteredEntries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Zap className="mb-3 size-8 text-muted-foreground/30" />
              <p className="font-sans text-sm text-muted-foreground">
                {filterQuery || toneFilter !== 'all' || sourceFilter !== 'all'
                  ? 'No matches for this filter.'
                  : 'No activity yet. Start a chat, a cowork task, or a scheduled run.'}
              </p>
            </div>
          ) : (
            <div className="relative px-4 py-3">
              <div className="absolute left-[27px] top-3 bottom-3 w-px bg-border/50" />

              <div className="grid gap-1">
                {filteredEntries.map((entry) => {
                  const hasActivities = entry.activities.length > 0;
                  const isExpanded = expandedEntries.has(entry.id);
                  const runDetails = entry.runId ? runDetailsById[entry.runId] : null;
                  const primaryTone = entry.activities.find((a) => a.tone === 'danger')?.tone
                    || entry.activities.find((a) => a.tone === 'success')?.tone
                    || 'neutral';
                  const ToneIcon = entry.role === 'user' ? Play : (hasActivities ? TONE_CONFIG[primaryTone].icon : Clock);

                  return (
                    <div key={entry.id} className="relative flex gap-3 py-1.5">
                      <div
                        className={`relative z-10 flex size-5 shrink-0 items-center justify-center rounded-full border ${
                          entry.role === 'user'
                            ? 'border-amber-300 bg-amber-50'
                            : hasActivities
                              ? `${TONE_CONFIG[primaryTone].border} ${TONE_CONFIG[primaryTone].bg}`
                              : 'border-border bg-background'
                        }`}
                      >
                        <ToneIcon className={`size-2.5 ${entry.role === 'user' ? 'text-amber-600' : hasActivities ? TONE_CONFIG[primaryTone].color : 'text-muted-foreground/60'}`} />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <Badge
                            variant="outline"
                            className="font-sans text-[10px] uppercase"
                            data-testid={entry.source === 'schedule'
                              ? 'activity-source-schedule'
                              : entry.source === 'runtime'
                                ? 'activity-source-runtime'
                                : undefined}
                          >
                            {entry.source}
                          </Badge>
                          <span className="font-sans text-[10px] text-muted-foreground">
                            {entry.source === 'schedule' || entry.source === 'runtime'
                              ? 'Runtime'
                              : entry.role === 'user' ? 'You' : 'Agent'}
                          </span>
                          <span className="font-sans text-[10px] text-muted-foreground/60">
                            {timeAgo(entry.timestamp)}
                          </span>
                          {entry.runId && onOpenInternalRun ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="ml-auto h-6 px-2 text-[10px]"
                              data-testid={`activity-open-run-${entry.runId}`}
                              onClick={() => onOpenInternalRun(entry.runId!, entry.scheduleId ?? null)}
                            >
                              Open run
                            </Button>
                          ) : null}
                        </div>

                        <p className="mt-0.5 line-clamp-2 font-sans text-[12px] text-foreground/80">
                          {entry.text.slice(0, 200)}
                          {entry.text.length > 200 ? '…' : ''}
                        </p>

                        {hasActivities && (
                          <div className="mt-1.5">
                            <button
                              type="button"
                              className="flex items-center gap-1 font-sans text-[11px] text-muted-foreground hover:text-foreground"
                              onClick={() => toggleExpand(entry)}
                            >
                              {isExpanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
                              {entry.activities.length} action{entry.activities.length > 1 ? 's' : ''}
                            </button>

                            {isExpanded && (
                              <div className="mt-1 grid gap-1 pl-1">
                                {entry.activities.map((activity) => {
                                  const aConf = TONE_CONFIG[activity.tone];
                                  const AIcon = aConf.icon;
                                  return (
                                    <div
                                      key={activity.id}
                                      className={`flex items-start gap-2 rounded-lg border px-2.5 py-1.5 ${aConf.border} ${aConf.bg}`}
                                    >
                                      <AIcon className={`mt-0.5 size-3.5 shrink-0 ${aConf.color}`} />
                                      <div className="min-w-0">
                                        <p className="font-sans text-[12px] font-medium">{activity.label}</p>
                                        {activity.details && (
                                          <p className="mt-0.5 font-sans text-[11px] text-muted-foreground">
                                            {activity.details}
                                          </p>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                                {runDetails?.timeline?.length ? (
                                  <div className="rounded-lg border border-border/50 bg-card/60 px-2.5 py-2">
                                    <p className="font-sans text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                                      Timeline
                                    </p>
                                    <div className="mt-2 grid gap-1.5">
                                      {runDetails.timeline.slice(0, 5).map((timelineEntry) => (
                                        <div
                                          key={timelineEntry.id}
                                          className="rounded-md border border-border/40 bg-background/70 px-2 py-1.5"
                                        >
                                          <div className="flex items-center justify-between gap-2">
                                            <span className="font-sans text-[11px] font-medium text-foreground">
                                              {timelineEntry.phase}
                                            </span>
                                            <span className="font-sans text-[10px] text-muted-foreground">
                                              {timeAgo(timelineEntry.at)}
                                            </span>
                                          </div>
                                          <p className="mt-0.5 font-sans text-[11px] text-muted-foreground">
                                            {timelineEntry.message}
                                          </p>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                ) : null}
                                {runDetails?.artifact ? (
                                  <div className="rounded-lg border border-border/50 bg-card/60 px-2.5 py-2">
                                    <div className="flex items-center gap-2">
                                      <p className="font-sans text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                                        Artifact
                                      </p>
                                      <Badge variant="outline" className="font-sans text-[10px]">
                                        {runDetails.artifact.receiptCount} receipt{runDetails.artifact.receiptCount === 1 ? '' : 's'}
                                      </Badge>
                                    </div>
                                    {runDetails.artifact.summary ? (
                                      <p className="mt-1 font-sans text-[11px] text-muted-foreground">
                                        {runDetails.artifact.summary}
                                      </p>
                                    ) : null}
                                    {runDetails.artifact.errors.length > 0 ? (
                                      <p className="mt-1 font-sans text-[11px] text-destructive">
                                        {runDetails.artifact.errors[0]}
                                      </p>
                                    ) : null}
                                  </div>
                                ) : null}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </ScrollArea>
      </div>
    </section>
  );
}
