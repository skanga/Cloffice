import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Pause,
  Play,
  RefreshCw,
  Timer,
  Zap,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import type { ScheduledJob } from '@/app-types';

type ScheduledPageProps = {
  jobs: ScheduledJob[];
  loading: boolean;
  status: string;
  onRefresh: () => void | Promise<void>;
  scheduleActionsEnabled?: boolean;
  onToggleJob?: (jobId: string, enabled: boolean) => void | Promise<void>;
  onSetJobInterval?: (jobId: string, intervalMinutes: number) => void | Promise<void>;
  onDeleteJob?: (jobId: string) => void | Promise<void>;
};

type ViewMode = 'timeline' | 'calendar';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function formatTime(value: string | null): string {
  if (!value) return 'Unavailable';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(parsed);
}

function formatTimeShort(value: string | null): string {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '—';
  return new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit' }).format(parsed);
}

function titleCase(value: string): string {
  if (!value.trim()) return 'Unknown';
  const lower = value.trim().toLowerCase();
  return `${lower.charAt(0).toUpperCase()}${lower.slice(1)}`;
}

function getRelativeTimeLabel(dateStr: string | null): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '';
  const now = Date.now();
  const diff = d.getTime() - now;
  const absDiff = Math.abs(diff);
  if (absDiff < 60_000) return diff > 0 ? 'Soon' : 'Just now';
  if (absDiff < 3_600_000) {
    const mins = Math.floor(absDiff / 60_000);
    return diff > 0 ? `in ${mins} min` : `${mins} min ago`;
  }
  if (absDiff < 86_400_000) {
    const hrs = Math.floor(absDiff / 3_600_000);
    return diff > 0 ? `in ${hrs} hr` : `${hrs} hr ago`;
  }
  const days = Math.floor(absDiff / 86_400_000);
  return diff > 0 ? `in ${days} day${days === 1 ? '' : 's'}` : `${days} day${days === 1 ? '' : 's'} ago`;
}

function getCalendarDays(year: number, month: number): (Date | null)[] {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startOffset = (firstDay.getDay() + 6) % 7;
  const days: (Date | null)[] = [];
  for (let i = 0; i < startOffset; i++) days.push(null);
  for (let d = 1; d <= lastDay.getDate(); d++) days.push(new Date(year, month, d));
  return days;
}

function jobMatchesDate(job: ScheduledJob, date: Date): boolean {
  if (job.nextRunAt) {
    const next = new Date(job.nextRunAt);
    if (next.toDateString() === date.toDateString()) return true;
  }
  if (job.lastRunAt) {
    const last = new Date(job.lastRunAt);
    if (last.toDateString() === date.toDateString()) return true;
  }
  return false;
}

export function ScheduledPage({
  jobs,
  loading,
  status,
  onRefresh,
  scheduleActionsEnabled = false,
  onToggleJob,
  onSetJobInterval,
  onDeleteJob,
}: ScheduledPageProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('timeline');
  const [calMonth, setCalMonth] = useState(() => new Date().getMonth());
  const [calYear, setCalYear] = useState(() => new Date().getFullYear());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  const now = new Date();
  const sortedJobs = useMemo(() => {
    return [...jobs].sort((a, b) => {
      if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
      const aNext = a.nextRunAt ? new Date(a.nextRunAt).getTime() : Infinity;
      const bNext = b.nextRunAt ? new Date(b.nextRunAt).getTime() : Infinity;
      return aNext - bNext;
    });
  }, [jobs]);

  const upcomingJobs = useMemo(() => sortedJobs.filter((j) => j.enabled && j.nextRunAt), [sortedJobs]);
  const enabledCount = jobs.filter((j) => j.enabled).length;
  const disabledCount = jobs.length - enabledCount;

  const calDays = useMemo(() => getCalendarDays(calYear, calMonth), [calYear, calMonth]);
  const jobsByDate = useMemo(() => {
    const map = new Map<string, ScheduledJob[]>();
    for (const day of calDays) {
      if (!day) continue;
      const key = day.toDateString();
      const matches = jobs.filter((j) => jobMatchesDate(j, day));
      if (matches.length > 0) map.set(key, matches);
    }
    return map;
  }, [calDays, jobs]);

  const selectedDateJobs = useMemo(() => {
    if (!selectedDate) return [];
    return jobsByDate.get(selectedDate.toDateString()) || [];
  }, [selectedDate, jobsByDate]);

  return (
    <section className="mx-auto grid h-full w-full max-w-[1060px] min-h-0 grid-rows-[auto_auto_minmax(0,1fr)] gap-3">
      {/* Header */}
      <header className="flex items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <CalendarDays className="size-5 text-amber-600" />
            <h1 className="text-xl font-semibold tracking-tight">Schedule</h1>
            <Badge variant="outline" className="ml-2 font-sans text-[11px]">
              {jobs.length} {jobs.length === 1 ? 'Job' : 'Jobs'}
            </Badge>
          </div>
          <p className="mt-1 font-sans text-sm text-muted-foreground">
            Overview of scheduled jobs reported by the current runtime connection.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-border">
            {(['timeline', 'calendar'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                className={`px-3 py-1.5 font-sans text-[11px] transition-colors first:rounded-l-lg last:rounded-r-lg ${
                  viewMode === mode ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/50'
                }`}
                onClick={() => setViewMode(mode)}
              >
                {mode === 'timeline' ? 'Timeline' : 'Calendar'}
              </button>
            ))}
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => void onRefresh()} disabled={loading} className="gap-1.5">
            <RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </header>

      {/* Stats bar */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border/60 bg-card px-4 py-2.5">
        <div className="flex items-center gap-1.5">
          <Play className="size-3.5 text-emerald-600" />
          <span className="font-sans text-[12px] text-muted-foreground">{enabledCount} active</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Pause className="size-3.5 text-muted-foreground/50" />
          <span className="font-sans text-[12px] text-muted-foreground">{disabledCount} paused</span>
        </div>
        <Separator orientation="vertical" className="h-4" />
        {upcomingJobs.length > 0 && (
          <div className="flex items-center gap-1.5">
            <Timer className="size-3.5 text-amber-500" />
            <span className="font-sans text-[12px] text-muted-foreground">
              Next: {getRelativeTimeLabel(upcomingJobs[0].nextRunAt)}
            </span>
          </div>
        )}
        <span className="ml-auto font-sans text-[11px] text-muted-foreground/60">
          {status.trim() || 'Connected.'}
        </span>
      </div>

      {/* Main content */}
      <div className="min-h-0 rounded-xl border border-border/60 bg-card">
        {viewMode === 'timeline' ? (
          /* ── Timeline view ── */
          <ScrollArea className="h-full">
            {sortedJobs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <CalendarDays className="mb-3 size-8 text-muted-foreground/30" />
                <p className="font-sans text-sm text-muted-foreground">
                  No scheduled jobs. Make sure the current runtime connection is configured.
                </p>
              </div>
            ) : (
              <div className="relative px-4 py-3">
                <div className="absolute left-[27px] top-3 bottom-3 w-px bg-border/50" />
                <div className="grid gap-2">
                  {sortedJobs.map((job) => {
                    const isEnabled = job.enabled;
                    const nextLabel = getRelativeTimeLabel(job.nextRunAt);

                    return (
                      <div key={job.id} className="relative flex gap-3 py-1.5" data-testid={`scheduled-job-${job.id}`}>
                        <div
                          className={`relative z-10 flex size-5 shrink-0 items-center justify-center rounded-full border ${
                            isEnabled
                              ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-950/30'
                              : 'border-border bg-background'
                          }`}
                        >
                          {isEnabled ? (
                            <Play className="size-2.5 text-emerald-600" />
                          ) : (
                            <Pause className="size-2.5 text-muted-foreground/50" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1 rounded-lg border border-border/60 bg-background px-3 py-2.5">
                          <div className="flex items-center gap-2">
                            <span className="font-sans text-[13px] font-medium">{job.name}</span>
                            <Badge variant={isEnabled ? 'default' : 'outline'} className="font-sans text-[10px]">
                              {isEnabled ? 'Active' : 'Paused'}
                            </Badge>
                            <Badge variant="outline" className="font-sans text-[10px]">
                              {titleCase(job.state)}
                            </Badge>
                            {nextLabel && (
                              <span className="ml-auto font-sans text-[11px] text-amber-600 font-medium">
                                {nextLabel}
                              </span>
                            )}
                          </div>
                          <p className="mt-1 font-mono text-[11px] text-muted-foreground">{job.schedule}</p>
                          <div className="mt-1.5 flex gap-4 font-sans text-[11px] text-muted-foreground">
                            <span>Next run: {formatTime(job.nextRunAt)}</span>
                            <span>Last run: {formatTime(job.lastRunAt)}</span>
                          </div>
                          {scheduleActionsEnabled ? (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-7 px-2 text-[11px]"
                                data-testid={`scheduled-job-toggle-${job.id}`}
                                onClick={() => void onToggleJob?.(job.id, !job.enabled)}
                              >
                                {job.enabled ? 'Pause' : 'Resume'}
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-7 px-2 text-[11px]"
                                data-testid={`scheduled-job-interval-1-${job.id}`}
                                onClick={() => void onSetJobInterval?.(job.id, 1)}
                              >
                                1m
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-7 px-2 text-[11px]"
                                data-testid={`scheduled-job-interval-5-${job.id}`}
                                onClick={() => void onSetJobInterval?.(job.id, 5)}
                              >
                                5m
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-7 px-2 text-[11px]"
                                data-testid={`scheduled-job-interval-15-${job.id}`}
                                onClick={() => void onSetJobInterval?.(job.id, 15)}
                              >
                                15m
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-7 px-2 text-[11px] text-destructive"
                                data-testid={`scheduled-job-delete-${job.id}`}
                                onClick={() => void onDeleteJob?.(job.id)}
                              >
                                Delete
                              </Button>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </ScrollArea>
        ) : (
          /* ── Calendar view ── */
          <div className="grid min-h-0 grid-cols-1 gap-0" style={{ gridTemplateColumns: selectedDate ? '1fr 280px' : '1fr' }}>
            <div className="p-4">
              {/* Month header */}
              <div className="mb-3 flex items-center justify-between">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => {
                    if (calMonth === 0) {
                      setCalMonth(11);
                      setCalYear((y) => y - 1);
                    } else {
                      setCalMonth((m) => m - 1);
                    }
                  }}
                >
                  <ChevronLeft className="size-4" />
                </Button>
                <span className="font-sans text-[14px] font-semibold">
                  {MONTH_NAMES[calMonth]} {calYear}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => {
                    if (calMonth === 11) {
                      setCalMonth(0);
                      setCalYear((y) => y + 1);
                    } else {
                      setCalMonth((m) => m + 1);
                    }
                  }}
                >
                  <ChevronRight className="size-4" />
                </Button>
              </div>

              {/* Weekday headers */}
              <div className="mb-1 grid grid-cols-7 gap-0">
                {WEEKDAYS.map((d) => (
                  <div key={d} className="py-1 text-center font-sans text-[11px] font-medium text-muted-foreground">
                    {d}
                  </div>
                ))}
              </div>

              {/* Calendar grid */}
              <div className="grid grid-cols-7 gap-0">
                {calDays.map((day, i) => {
                  if (!day) {
                    return <div key={`empty-${i}`} className="h-16" />;
                  }
                  const dayKey = day.toDateString();
                  const dayJobs = jobsByDate.get(dayKey) || [];
                  const isToday = day.toDateString() === now.toDateString();
                  const isSelected = selectedDate?.toDateString() === dayKey;

                  return (
                    <button
                      key={dayKey}
                      type="button"
                      className={`relative flex h-16 flex-col items-start rounded-lg border p-1 text-left transition-colors ${
                        isSelected
                          ? 'border-foreground/20 bg-accent'
                          : isToday
                            ? 'border-amber-300/50 bg-amber-50/50 dark:border-amber-800/30 dark:bg-amber-950/20'
                            : 'border-transparent hover:bg-accent/30'
                      }`}
                      onClick={() => setSelectedDate(isSelected ? null : day)}
                    >
                      <span
                        className={`font-sans text-[11px] ${
                          isToday ? 'font-bold text-amber-700 dark:text-amber-400' : 'text-foreground/70'
                        }`}
                      >
                        {day.getDate()}
                      </span>
                      {dayJobs.length > 0 && (
                        <div className="mt-auto flex flex-wrap gap-0.5">
                          {dayJobs.slice(0, 3).map((j) => (
                            <span
                              key={j.id}
                              className={`inline-block size-1.5 rounded-full ${j.enabled ? 'bg-emerald-500' : 'bg-muted-foreground/30'}`}
                            />
                          ))}
                          {dayJobs.length > 3 && (
                            <span className="font-sans text-[8px] text-muted-foreground">+{dayJobs.length - 3}</span>
                          )}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Day detail panel */}
            {selectedDate && (
              <div className="flex min-h-0 flex-col border-l border-border/60">
                <div className="border-b border-border/40 px-3 py-2.5">
                  <p className="font-sans text-[12px] font-medium">
                    {selectedDate.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })}
                  </p>
                  <p className="font-sans text-[11px] text-muted-foreground">
                    {selectedDateJobs.length} {selectedDateJobs.length === 1 ? 'Job' : 'Jobs'}
                  </p>
                </div>
                <ScrollArea className="flex-1">
                  {selectedDateJobs.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-center">
                      <Clock className="mb-2 size-6 text-muted-foreground/30" />
                      <p className="font-sans text-[12px] text-muted-foreground">No jobs on this day.</p>
                    </div>
                  ) : (
                    <div className="grid gap-1.5 p-3">
                      {selectedDateJobs.map((job) => (
                        <div key={job.id} className="rounded-lg border border-border/60 bg-background px-2.5 py-2">
                          <div className="flex items-center gap-1.5">
                            {job.enabled ? (
                              <Play className="size-3 text-emerald-600" />
                            ) : (
                              <Pause className="size-3 text-muted-foreground/50" />
                            )}
                            <span className="font-sans text-[12px] font-medium">{job.name}</span>
                          </div>
                          <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">{job.schedule}</p>
                          <p className="mt-0.5 font-sans text-[10px] text-muted-foreground">
                            {formatTimeShort(job.nextRunAt)}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

