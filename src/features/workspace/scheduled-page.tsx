import { useMemo, useState } from 'react';
import { useEffect } from 'react';
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
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import type { ScheduledJob } from '@/app-types';
import type { EngineScheduleCreateInput } from '@/lib/engine-schedule-controller';

type ScheduledPageProps = {
  jobs: ScheduledJob[];
  loading: boolean;
  status: string;
  focusedJobId?: string | null;
  onRefresh: () => void | Promise<void>;
  scheduleActionsEnabled?: boolean;
  scheduleAccessLabel?: 'Read-write' | 'Read-only';
  scheduleAccessDescription?: string;
  createScheduleEnabled?: boolean;
  createScheduleStatus?: string;
  createScheduleBusy?: boolean;
  defaultCreateModel?: string | null;
  scheduleModels?: Array<{ value: string; label: string }>;
  onRunJobNow?: (jobId: string) => void | Promise<void>;
  onDuplicateJob?: (job: ScheduledJob) => void | Promise<void>;
  onBulkToggleJobs?: (jobIds: string[], enabled: boolean) => void | Promise<void>;
  onBulkDeleteJobs?: (jobIds: string[]) => void | Promise<void>;
  onToggleJob?: (jobId: string, enabled: boolean) => void | Promise<void>;
  onSetJobInterval?: (jobId: string, intervalMinutes: number) => void | Promise<void>;
  onDeleteJob?: (jobId: string) => void | Promise<void>;
  onOpenRunHistory?: (jobId: string, runId: string) => void | Promise<void>;
  onCreateSchedule?: (input: EngineScheduleCreateInput) => void | Promise<void>;
  onUpdateScheduleDetails?: (jobId: string, input: { name: string; prompt: string; model?: string | null }) => void | Promise<void>;
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

function buildArtifactSummaryText(job: ScheduledJob): string {
  const lines = [
    `Schedule: ${job.name}`,
    ...(job.lastRunId ? [`Run: ${job.lastRunId}`] : []),
    ...(job.lastArtifactSummary ? [`Summary: ${job.lastArtifactSummary}`] : []),
    ...(job.lastArtifactPreviews?.length ? ['Previews:', ...job.lastArtifactPreviews.map((preview) => `- ${preview}`)] : []),
    ...(job.lastArtifactErrors?.length ? ['Errors:', ...job.lastArtifactErrors.map((error) => `- ${error}`)] : []),
  ];
  return lines.join('\n');
}

function buildArtifactErrorText(job: ScheduledJob): string {
  const lines = [
    `Schedule: ${job.name}`,
    ...(job.lastRunId ? [`Run: ${job.lastRunId}`] : []),
    'Errors:',
    ...(job.lastArtifactErrors?.length ? job.lastArtifactErrors.map((error) => `- ${error}`) : ['- No recorded artifact errors.']),
  ];
  return lines.join('\n');
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
  focusedJobId = null,
  onRefresh,
  scheduleActionsEnabled = false,
  scheduleAccessLabel = scheduleActionsEnabled ? 'Read-write' : 'Read-only',
  scheduleAccessDescription = scheduleActionsEnabled
    ? 'This runtime supports direct schedule controls.'
    : 'This runtime exposes schedule rows for inspection only.',
  createScheduleEnabled = false,
  createScheduleStatus = '',
  createScheduleBusy = false,
  defaultCreateModel = null,
  scheduleModels = [],
  onRunJobNow,
  onDuplicateJob,
  onBulkToggleJobs,
  onBulkDeleteJobs,
  onToggleJob,
  onSetJobInterval,
  onDeleteJob,
  onOpenRunHistory,
  onCreateSchedule,
  onUpdateScheduleDetails,
}: ScheduledPageProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('timeline');
  const [calMonth, setCalMonth] = useState(() => new Date().getMonth());
  const [calYear, setCalYear] = useState(() => new Date().getFullYear());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [highlightedJobId, setHighlightedJobId] = useState<string | null>(null);
  const [copiedArtifactSummaryJobId, setCopiedArtifactSummaryJobId] = useState<string | null>(null);
  const [copiedArtifactErrorsJobId, setCopiedArtifactErrorsJobId] = useState<string | null>(null);
  const [expandedArtifactJobId, setExpandedArtifactJobId] = useState<string | null>(null);
  const [createKind, setCreateKind] = useState<'chat' | 'cowork'>('chat');
  const [createName, setCreateName] = useState('');
  const [createPrompt, setCreatePrompt] = useState('');
  const [createIntervalMinutes, setCreateIntervalMinutes] = useState<1 | 5 | 15>(1);
  const [createModel, setCreateModel] = useState(defaultCreateModel ?? '');
  const [editingJobId, setEditingJobId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editPrompt, setEditPrompt] = useState('');
  const [editModel, setEditModel] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [stateFilter, setStateFilter] = useState<'all' | 'active' | 'paused' | 'pending'>('all');
  const [selectedJobIds, setSelectedJobIds] = useState<string[]>([]);

  useEffect(() => {
    setCreateModel(defaultCreateModel ?? '');
  }, [defaultCreateModel]);

  const now = new Date();
  const sortedJobs = useMemo(() => {
    return [...jobs].sort((a, b) => {
      if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
      const aNext = a.nextRunAt ? new Date(a.nextRunAt).getTime() : Infinity;
      const bNext = b.nextRunAt ? new Date(b.nextRunAt).getTime() : Infinity;
      return aNext - bNext;
    });
  }, [jobs]);
  const visibleJobs = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLowerCase();
    return sortedJobs.filter((job) => {
      if (stateFilter === 'active' && !job.enabled) return false;
      if (stateFilter === 'paused' && job.enabled) return false;
      if (stateFilter === 'pending' && job.state !== 'awaiting_approval') return false;
      if (!normalizedSearch) return true;
      return [job.name, job.schedule, job.prompt ?? '', job.model ?? '', job.kind ?? '']
        .some((entry) => entry.toLowerCase().includes(normalizedSearch));
    });
  }, [searchQuery, sortedJobs, stateFilter]);

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
  const groupedScheduleModels = useMemo(() => {
    const groups = new Map<string, Array<{ value: string; label: string }>>();
    for (const model of scheduleModels) {
      const normalizedValue = model.value.toLowerCase();
      const group = normalizedValue.startsWith('internal/')
        ? 'Internal'
        : normalizedValue.startsWith('openai/')
          ? 'OpenAI-compatible'
          : normalizedValue.startsWith('anthropic/')
            ? 'Anthropic'
            : normalizedValue.startsWith('gemini/')
              ? 'Gemini'
              : 'Other';
      const current = groups.get(group) ?? [];
      current.push(model);
      groups.set(group, current);
    }
    return Array.from(groups.entries());
  }, [scheduleModels]);
  const visibleJobIds = useMemo(() => visibleJobs.map((job) => job.id), [visibleJobs]);
  const visibleSelectedCount = useMemo(
    () => selectedJobIds.filter((id) => visibleJobIds.includes(id)).length,
    [selectedJobIds, visibleJobIds],
  );
  const allVisibleSelected = visibleJobs.length > 0 && visibleSelectedCount === visibleJobs.length;
  const someVisibleSelected = visibleSelectedCount > 0 && !allVisibleSelected;

  useEffect(() => {
    if (!focusedJobId || viewMode !== 'timeline') {
      return;
    }

    setHighlightedJobId(focusedJobId);
    const scrollTimer = window.setTimeout(() => {
      document.querySelector(`[data-testid="scheduled-job-${focusedJobId}"]`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }, 60);
    const clearTimer = window.setTimeout(() => {
      setHighlightedJobId((current) => (current === focusedJobId ? null : current));
    }, 2500);

    return () => {
      window.clearTimeout(scrollTimer);
      window.clearTimeout(clearTimer);
    };
  }, [focusedJobId, viewMode, jobs]);

  useEffect(() => {
    setSelectedJobIds((current) => current.filter((id) => jobs.some((job) => job.id === id)));
  }, [jobs]);

  const copyArtifactText = async (text: string, type: 'summary' | 'errors', jobId: string) => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      }
    } catch {
      // Best-effort operator action.
    }
    if (type === 'summary') {
      setCopiedArtifactSummaryJobId(jobId);
      if (copiedArtifactErrorsJobId === jobId) {
        setCopiedArtifactErrorsJobId(null);
      }
      return;
    }
    setCopiedArtifactErrorsJobId(jobId);
    if (copiedArtifactSummaryJobId === jobId) {
      setCopiedArtifactSummaryJobId(null);
    }
  };

  const handleCreateSchedule = async () => {
    if (!onCreateSchedule) {
      return;
    }
    await onCreateSchedule({
      kind: createKind,
      name: createName.trim() || undefined,
      prompt: createPrompt,
      intervalMinutes: createIntervalMinutes,
      model: createModel.trim() || null,
    });
    setCreateName('');
    setCreatePrompt('');
  };

  const startEditingJob = (job: ScheduledJob) => {
    setEditingJobId(job.id);
    setEditName(job.name);
    setEditPrompt(job.prompt ?? '');
    setEditModel(job.model ?? '');
  };

  const handleSaveEditedJob = async () => {
    if (!editingJobId || !onUpdateScheduleDetails) {
      return;
    }
    await onUpdateScheduleDetails(editingJobId, {
      name: editName,
      prompt: editPrompt,
      model: editModel.trim() || null,
    });
    setEditingJobId(null);
  };
  const toggleSelectedJob = (jobId: string, checked: boolean) => {
    setSelectedJobIds((current) => (
      checked
        ? current.includes(jobId) ? current : [...current, jobId]
        : current.filter((id) => id !== jobId)
    ));
  };
  const toggleAllVisibleJobs = (checked: boolean) => {
    setSelectedJobIds((current) => {
      const remaining = current.filter((id) => !visibleJobIds.includes(id));
      return checked ? [...remaining, ...visibleJobIds] : remaining;
    });
  };
  const handleBulkToggle = async (enabled: boolean) => {
    const targetIds = selectedJobIds.filter((id) => visibleJobIds.includes(id));
    if (!targetIds.length || !onBulkToggleJobs) {
      return;
    }
    await onBulkToggleJobs(targetIds, enabled);
    setSelectedJobIds((current) => current.filter((id) => !targetIds.includes(id)));
  };
  const handleBulkDelete = async () => {
    const targetIds = selectedJobIds.filter((id) => visibleJobIds.includes(id));
    if (!targetIds.length || !onBulkDeleteJobs) {
      return;
    }
    await onBulkDeleteJobs(targetIds);
    setSelectedJobIds((current) => current.filter((id) => !targetIds.includes(id)));
  };
  const createValidationMessage = !createName.trim()
    ? 'Schedule name is required.'
    : !createPrompt.trim()
      ? 'Schedule prompt is required.'
      : '';
  const editValidationMessage = !editName.trim()
    ? 'Schedule name is required.'
    : !editPrompt.trim()
      ? 'Schedule prompt is required.'
      : '';

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
            <Badge variant="outline" className="font-sans text-[11px]">
              {scheduleAccessLabel}
            </Badge>
          </div>
          <p className="mt-1 font-sans text-sm text-muted-foreground">
            Overview of scheduled jobs reported by the current runtime connection.
          </p>
          <p className="mt-1 font-sans text-[12px] text-muted-foreground/80">
            {scheduleAccessDescription}
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

      {createScheduleEnabled ? (
        <div className="rounded-xl border border-border/60 bg-card px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <div>
              <p className="font-sans text-sm font-medium">Create internal schedule</p>
              <p className="font-sans text-[12px] text-muted-foreground">
                Schedule a chat or cowork prompt directly from this page.
              </p>
            </div>
            <div className="ml-auto flex rounded-lg border border-border">
              {(['chat', 'cowork'] as const).map((kind) => (
                <button
                  key={kind}
                  type="button"
                  className={`px-3 py-1.5 font-sans text-[11px] transition-colors first:rounded-l-lg last:rounded-r-lg ${
                    createKind === kind ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/50'
                  }`}
                  data-testid={`schedule-create-kind-${kind}`}
                  onClick={() => setCreateKind(kind)}
                >
                  {kind === 'chat' ? 'Chat' : 'Cowork'}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_160px_160px]">
            <Input
              value={createName}
              onChange={(event) => setCreateName(event.target.value)}
              placeholder={createKind === 'cowork' ? 'Scheduled cowork prompt' : 'Scheduled chat prompt'}
              data-testid="schedule-create-name"
            />
            <Input
              value={createModel}
              onChange={(event) => setCreateModel(event.target.value)}
              placeholder="Optional model override"
              data-testid="schedule-create-model"
              className="hidden"
            />
            <select
              value={createModel}
              onChange={(event) => setCreateModel(event.target.value)}
              className="h-10 rounded-xl border border-border bg-background px-3 font-sans text-xs text-foreground outline-none transition focus-visible:ring-2 focus-visible:ring-ring"
              data-testid="schedule-create-model-select"
            >
              <option value="">Default model</option>
              {groupedScheduleModels.map(([group, models]) => (
                <optgroup key={group} label={group}>
                  {models.map((model) => (
                    <option key={model.value} value={model.value}>
                      {model.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <div className="flex rounded-lg border border-border">
              {([1, 5, 15] as const).map((minutes) => (
                <button
                  key={minutes}
                  type="button"
                  className={`flex-1 px-3 py-2 font-sans text-[11px] transition-colors first:rounded-l-lg last:rounded-r-lg ${
                    createIntervalMinutes === minutes ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/50'
                  }`}
                  data-testid={`schedule-create-interval-${minutes}`}
                  onClick={() => setCreateIntervalMinutes(minutes)}
                >
                  {minutes}m
                </button>
              ))}
            </div>
          </div>
          <div className="mt-3 grid gap-2">
            <textarea
              value={createPrompt}
              onChange={(event) => setCreatePrompt(event.target.value)}
              placeholder={createKind === 'cowork' ? 'Describe the recurring cowork task.' : 'Describe the recurring chat prompt.'}
              className="min-h-24 rounded-lg border border-border bg-background px-3 py-2 font-sans text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
              data-testid="schedule-create-prompt"
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                className="gap-1.5"
                data-testid="schedule-create-submit"
                disabled={createScheduleBusy || Boolean(createValidationMessage)}
                onClick={() => void handleCreateSchedule()}
              >
                <Zap className="size-3.5" />
                {createScheduleBusy ? 'Creating...' : 'Create schedule'}
              </Button>
              <span className="font-sans text-[11px] text-muted-foreground/80">
                Cowork schedules use the active project context when available.
              </span>
              {createValidationMessage ? (
                <span className="font-sans text-[11px] text-destructive">{createValidationMessage}</span>
              ) : null}
              {createScheduleStatus.trim() ? (
                <span className="ml-auto font-sans text-[11px] text-muted-foreground/70">{createScheduleStatus}</span>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {/* Main content */}
      <div className="min-h-0 rounded-xl border border-border/60 bg-card">
        {viewMode === 'timeline' ? (
          /* ── Timeline view ── */
            <ScrollArea className="h-full">
            <div className="border-b border-border/50 px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                {scheduleActionsEnabled ? (
                  <label className="flex items-center gap-2 font-sans text-[11px] text-muted-foreground">
                    <input
                      type="checkbox"
                      className="size-4 rounded border border-border"
                      data-testid="schedule-select-all-visible"
                      checked={allVisibleSelected}
                      ref={(node) => {
                        if (node) {
                          node.indeterminate = someVisibleSelected;
                        }
                      }}
                      onChange={(event) => toggleAllVisibleJobs(event.target.checked)}
                    />
                    Select visible
                  </label>
                ) : null}
                <Input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search schedules, prompts, models"
                  className="max-w-sm"
                  data-testid="schedule-search"
                />
                <div className="flex rounded-lg border border-border">
                  {([
                    ['all', 'All'],
                    ['active', 'Active'],
                    ['paused', 'Paused'],
                    ['pending', 'Pending'],
                  ] as const).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      className={`px-3 py-1.5 font-sans text-[11px] transition-colors first:rounded-l-lg last:rounded-r-lg ${
                        stateFilter === value ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/50'
                      }`}
                      data-testid={`schedule-filter-${value}`}
                      onClick={() => setStateFilter(value)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <span className="ml-auto font-sans text-[11px] text-muted-foreground/70">
                  Showing {visibleJobs.length} of {sortedJobs.length}
                </span>
              </div>
              {scheduleActionsEnabled ? (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 text-[11px]"
                    data-testid="schedule-bulk-pause"
                    disabled={visibleSelectedCount === 0}
                    onClick={() => void handleBulkToggle(false)}
                  >
                    Pause selected
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 text-[11px]"
                    data-testid="schedule-bulk-resume"
                    disabled={visibleSelectedCount === 0}
                    onClick={() => void handleBulkToggle(true)}
                  >
                    Resume selected
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 text-[11px] text-destructive"
                    data-testid="schedule-bulk-delete"
                    disabled={visibleSelectedCount === 0}
                    onClick={() => void handleBulkDelete()}
                  >
                    Delete selected
                  </Button>
                  <span className="font-sans text-[11px] text-muted-foreground/70">
                    {visibleSelectedCount} selected
                  </span>
                </div>
              ) : null}
            </div>
            {visibleJobs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <CalendarDays className="mb-3 size-8 text-muted-foreground/30" />
                  <p className="font-sans text-sm text-muted-foreground">
                    {sortedJobs.length === 0
                      ? 'No scheduled jobs. Make sure the current runtime connection is configured.'
                      : 'No schedules match the current search or filter.'}
                  </p>
                </div>
            ) : (
              <div className="relative px-4 py-3">
                <div className="absolute left-[27px] top-3 bottom-3 w-px bg-border/50" />
                <div className="grid gap-2">
                  {visibleJobs.map((job) => {
                    const isEnabled = job.enabled;
                    const nextLabel = getRelativeTimeLabel(job.nextRunAt);
                    const isHighlighted = highlightedJobId === job.id;

                    return (
                      <div key={job.id} className="relative flex gap-3 py-1.5" data-testid={`scheduled-job-${job.id}`}>
                        {scheduleActionsEnabled ? (
                          <div className="pt-2">
                            <input
                              type="checkbox"
                              className="size-4 rounded border border-border"
                              data-testid={`scheduled-job-select-${job.id}`}
                              checked={selectedJobIds.includes(job.id)}
                              onChange={(event) => toggleSelectedJob(job.id, event.target.checked)}
                            />
                          </div>
                        ) : null}
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
                        <div
                          className={`min-w-0 flex-1 rounded-lg border px-3 py-2.5 transition-colors ${
                            isHighlighted
                              ? 'border-amber-400 bg-amber-50/70 dark:border-amber-700 dark:bg-amber-950/20'
                              : 'border-border/60 bg-background'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-sans text-[13px] font-medium">{job.name}</span>
                            <Badge variant={isEnabled ? 'default' : 'outline'} className="font-sans text-[10px]">
                              {isEnabled ? 'Active' : 'Paused'}
                            </Badge>
                            {job.kind ? (
                              <Badge variant="outline" className="font-sans text-[10px]">
                                {job.kind === 'cowork' ? 'Cowork' : 'Chat'}
                              </Badge>
                            ) : null}
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
                          {job.model ? (
                            <p className="mt-1 font-mono text-[10px] text-muted-foreground/80">
                              Model: {job.model}
                            </p>
                          ) : null}
                          <div className="mt-1.5 flex gap-4 font-sans text-[11px] text-muted-foreground">
                            <span>Next run: {formatTime(job.nextRunAt)}</span>
                            <span>Last run: {formatTime(job.lastRunAt)}</span>
                          </div>
                          {(typeof job.totalRunCount === 'number'
                            || typeof job.completedRunCount === 'number'
                            || typeof job.blockedRunCount === 'number'
                            || typeof job.approvalWaitCount === 'number') ? (
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              <Badge variant="outline" className="font-sans text-[10px]">
                                Runs {job.totalRunCount ?? 0}
                              </Badge>
                              <Badge variant="outline" className="font-sans text-[10px]">
                                Completed {job.completedRunCount ?? 0}
                              </Badge>
                              <Badge variant="outline" className="font-sans text-[10px]">
                                Blocked {job.blockedRunCount ?? 0}
                              </Badge>
                              <Badge variant="outline" className="font-sans text-[10px]">
                                Approval waits {job.approvalWaitCount ?? 0}
                              </Badge>
                            </div>
                          ) : null}
                          {editingJobId === job.id ? (
                            <div className="mt-2 grid gap-2 rounded-md border border-border/50 bg-card/60 px-2.5 py-2">
                              <Input
                                value={editName}
                                onChange={(event) => setEditName(event.target.value)}
                                placeholder="Schedule name"
                                data-testid={`scheduled-job-edit-name-${job.id}`}
                              />
                                <select
                                  value={editModel}
                                  onChange={(event) => setEditModel(event.target.value)}
                                  className="h-10 rounded-xl border border-border bg-background px-3 font-sans text-xs text-foreground outline-none transition focus-visible:ring-2 focus-visible:ring-ring"
                                  data-testid={`scheduled-job-edit-model-${job.id}`}
                                >
                                  <option value="">Default model</option>
                                  {groupedScheduleModels.map(([group, models]) => (
                                    <optgroup key={`${job.id}-${group}`} label={group}>
                                      {models.map((model) => (
                                        <option key={`${job.id}-${model.value}`} value={model.value}>
                                          {model.label}
                                        </option>
                                      ))}
                                    </optgroup>
                                  ))}
                                </select>
                              <textarea
                                value={editPrompt}
                                onChange={(event) => setEditPrompt(event.target.value)}
                                placeholder="Schedule prompt"
                                className="min-h-24 rounded-lg border border-border bg-background px-3 py-2 font-sans text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
                                data-testid={`scheduled-job-edit-prompt-${job.id}`}
                              />
                                <div className="flex flex-wrap gap-1.5">
                                  {editValidationMessage ? (
                                    <span className="self-center font-sans text-[11px] text-destructive">{editValidationMessage}</span>
                                  ) : null}
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-7 px-2 text-[11px]"
                                    data-testid={`scheduled-job-edit-save-${job.id}`}
                                    disabled={Boolean(editValidationMessage)}
                                    onClick={() => void handleSaveEditedJob()}
                                  >
                                    Save details
                                </Button>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="h-7 px-2 text-[11px]"
                                  data-testid={`scheduled-job-edit-cancel-${job.id}`}
                                  onClick={() => setEditingJobId(null)}
                                >
                                  Cancel
                                </Button>
                              </div>
                            </div>
                          ) : null}
                          {(job.lastRunStatus || job.lastRunSummary || job.lastRunId) ? (
                            <div className="mt-2 rounded-md border border-border/50 bg-card/60 px-2.5 py-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-sans text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                                  Last outcome
                                </span>
                                {job.lastRunStatus ? (
                                  <Badge variant="outline" className="font-sans text-[10px]">
                                    {titleCase(job.lastRunStatus)}
                                  </Badge>
                                ) : null}
                                {job.state === 'awaiting_approval' ? (
                                  <Badge variant="outline" className="font-sans text-[10px] text-amber-700">
                                    Pending approval
                                  </Badge>
                                ) : null}
                              </div>
                              {job.lastRunSummary ? (
                                <p className="mt-1 font-sans text-[11px] text-muted-foreground">{job.lastRunSummary}</p>
                              ) : null}
                              {job.lastRunId ? (
                                <div className="mt-1 flex flex-wrap items-center gap-2">
                                  <p className="font-mono text-[10px] text-muted-foreground/80">Run: {job.lastRunId}</p>
                                  {onOpenRunHistory ? (
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      className="h-6 px-2 text-[10px]"
                                      data-testid={`scheduled-job-open-run-${job.id}`}
                                      onClick={() => void onOpenRunHistory(job.id, job.lastRunId!)}
                                    >
                                      Open history
                                    </Button>
                                  ) : null}
                                </div>
                              ) : null}
                              {typeof job.pendingApprovalCount === 'number' && job.pendingApprovalCount > 0 ? (
                                <div className="mt-2 rounded-md border border-amber-200/70 bg-amber-50/70 px-2 py-1.5 dark:border-amber-900/40 dark:bg-amber-950/20">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <Badge variant="outline" className="font-sans text-[10px] text-amber-700">
                                      {job.pendingApprovalCount} pending approval{job.pendingApprovalCount === 1 ? '' : 's'}
                                    </Badge>
                                    {job.lastRunId && onOpenRunHistory ? (
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        className="h-6 px-2 text-[10px]"
                                        data-testid={`scheduled-job-open-pending-run-${job.id}`}
                                        onClick={() => void onOpenRunHistory(job.id, job.lastRunId!)}
                                      >
                                        Open run
                                      </Button>
                                    ) : null}
                                  </div>
                                  {job.pendingApprovalSummary ? (
                                    <p className="mt-1 font-sans text-[11px] text-muted-foreground">{job.pendingApprovalSummary}</p>
                                  ) : null}
                                </div>
                              ) : null}
                              {(job.lastArtifactSummary || typeof job.lastArtifactReceiptCount === 'number') ? (
                                <div className="mt-2 rounded-md border border-border/50 bg-background/70 px-2 py-1.5">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="font-sans text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                                      Last artifact
                                    </span>
                                    {typeof job.lastArtifactReceiptCount === 'number' ? (
                                      <Badge variant="outline" className="font-sans text-[10px]">
                                        {job.lastArtifactReceiptCount} receipt{job.lastArtifactReceiptCount === 1 ? '' : 's'}
                                      </Badge>
                                    ) : null}
                                    {typeof job.lastArtifactErrorCount === 'number' && job.lastArtifactErrorCount > 0 ? (
                                      <Badge variant="outline" className="font-sans text-[10px] text-destructive">
                                        {job.lastArtifactErrorCount} error{job.lastArtifactErrorCount === 1 ? '' : 's'}
                                      </Badge>
                                    ) : null}
                                    {job.lastRunId && onOpenRunHistory ? (
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        className="h-6 px-2 text-[10px]"
                                        data-testid={`scheduled-job-open-artifact-${job.id}`}
                                        onClick={() => void onOpenRunHistory(job.id, job.lastRunId!)}
                                      >
                                        Open artifact
                                      </Button>
                                    ) : null}
                                    {(job.lastArtifactSummary || job.lastArtifactPreviews?.length || job.lastArtifactErrors?.length) ? (
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        className="h-6 px-2 text-[10px]"
                                        data-testid={`scheduled-job-copy-artifact-${job.id}`}
                                        onClick={() => void copyArtifactText(buildArtifactSummaryText(job), 'summary', job.id)}
                                      >
                                        {copiedArtifactSummaryJobId === job.id ? 'Copied summary' : 'Copy summary'}
                                      </Button>
                                    ) : null}
                                    {job.lastArtifactErrors?.length ? (
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        className="h-6 px-2 text-[10px]"
                                        data-testid={`scheduled-job-copy-errors-${job.id}`}
                                        onClick={() => void copyArtifactText(buildArtifactErrorText(job), 'errors', job.id)}
                                      >
                                        {copiedArtifactErrorsJobId === job.id ? 'Copied errors' : 'Copy errors'}
                                      </Button>
                                    ) : null}
                                    {(job.lastArtifactPreviews?.length || job.lastArtifactErrors?.length) ? (
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        className="h-6 px-2 text-[10px]"
                                        data-testid={`scheduled-job-toggle-artifact-${job.id}`}
                                        onClick={() => setExpandedArtifactJobId((current) => current === job.id ? null : job.id)}
                                      >
                                        {expandedArtifactJobId === job.id ? 'Hide details' : 'Show details'}
                                      </Button>
                                    ) : null}
                                  </div>
                                  {job.lastArtifactSummary ? (
                                    <p className="mt-1 font-sans text-[11px] text-muted-foreground">{job.lastArtifactSummary}</p>
                                  ) : null}
                                  {expandedArtifactJobId === job.id ? (
                                    <div className="mt-2 grid gap-2">
                                      {job.lastArtifactPreviews?.length ? (
                                        <div>
                                          <p className="mb-1 font-sans text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                                            Preview
                                          </p>
                                          <div className="grid gap-2">
                                            {job.lastArtifactPreviews.map((preview, index) => (
                                              <pre
                                                key={`${job.id}-artifact-preview-${index}`}
                                                className="overflow-x-auto rounded-md border border-border/40 bg-card/80 px-2 py-1.5 text-[10px] leading-relaxed text-muted-foreground whitespace-pre-wrap"
                                              >
                                                {preview}
                                              </pre>
                                            ))}
                                          </div>
                                        </div>
                                      ) : null}
                                      {job.lastArtifactErrors?.length ? (
                                        <div>
                                          <p className="mb-1 font-sans text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                                            Errors
                                          </p>
                                          <div className="grid gap-1">
                                            {job.lastArtifactErrors.map((error, index) => (
                                              <p
                                                key={`${job.id}-artifact-error-${index}`}
                                                className="rounded-md border border-border/40 bg-card/80 px-2 py-1.5 text-[10px] text-muted-foreground"
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
                              ) : null}
                              {job.recentRunHistory?.length ? (
                                <div className="mt-2 rounded-md border border-border/50 bg-card/60 px-2.5 py-2">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="font-sans text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                                      Recent history
                                    </span>
                                    <Badge variant="outline" className="font-sans text-[10px]">
                                      {job.recentRunHistory.length} retained
                                    </Badge>
                                  </div>
                                  <div className="mt-2 grid gap-1.5">
                                    {job.recentRunHistory.map((entry, index) => (
                                      <div
                                        key={`${job.id}-history-${index}-${entry.at}`}
                                        className="rounded-md border border-border/40 bg-background/70 px-2 py-1.5"
                                      >
                                        <div className="flex flex-wrap items-center gap-2">
                                          <Badge variant="outline" className="font-sans text-[10px]">
                                            {titleCase(entry.status)}
                                          </Badge>
                                          <span className="font-sans text-[10px] text-muted-foreground">
                                            {formatTime(entry.at)}
                                          </span>
                                          {entry.runId ? (
                                            <span className="font-mono text-[10px] text-muted-foreground/80">
                                              {entry.runId}
                                            </span>
                                          ) : null}
                                        </div>
                                        {entry.summary ? (
                                          <p className="mt-1 font-sans text-[11px] text-muted-foreground">
                                            {entry.summary}
                                          </p>
                                        ) : null}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          ) : null}
                          {scheduleActionsEnabled ? (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-7 px-2 text-[11px]"
                                data-testid={`scheduled-job-edit-${job.id}`}
                                onClick={() => startEditingJob(job)}
                              >
                                Edit
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-7 px-2 text-[11px]"
                                data-testid={`scheduled-job-duplicate-${job.id}`}
                                onClick={() => void onDuplicateJob?.(job)}
                              >
                                Duplicate
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-7 px-2 text-[11px]"
                                data-testid={`scheduled-job-run-now-${job.id}`}
                                onClick={() => void onRunJobNow?.(job.id)}
                              >
                                Run now
                              </Button>
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

