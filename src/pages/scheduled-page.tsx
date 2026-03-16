import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { ScheduledJob } from '@/app-types';

type ScheduledPageProps = {
  jobs: ScheduledJob[];
  loading: boolean;
  status: string;
  onRefresh: () => void | Promise<void>;
};

function formatTime(value: string | null): string {
  if (!value) {
    return 'Not available';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(parsed);
}

function titleCase(value: string): string {
  if (!value.trim()) {
    return 'unknown';
  }

  const lower = value.trim().toLowerCase();
  return `${lower.charAt(0).toUpperCase()}${lower.slice(1)}`;
}

export function ScheduledPage({ jobs, loading, status, onRefresh }: ScheduledPageProps) {
  return (
    <section className="mx-auto grid h-full w-full max-w-[920px] min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-4">
      <header className="flex items-center justify-between gap-3">
        <div>
          <Badge variant="outline" className="mb-2 font-sans text-[11px] text-muted-foreground">
            Scheduled
          </Badge>
          <h1 className="text-[clamp(1.5rem,2.4vw,2rem)] tracking-tight">OpenClaw Cron Jobs</h1>
          <p className="mt-1 font-sans text-sm text-muted-foreground">Live schedule from your OpenClaw gateway.</p>
        </div>
        <Button type="button" variant="outline" onClick={() => void onRefresh()} disabled={loading}>
          {loading ? 'Refreshing...' : 'Refresh'}
        </Button>
      </header>

      <Card className="min-h-0 rounded-xl border-border bg-card shadow-[0_8px_22px_rgba(51,43,30,0.06)]">
        <CardHeader className="flex flex-row items-center justify-between gap-3 border-b border-border/70 pb-3">
          <CardTitle>Scheduled tasks</CardTitle>
          <Badge variant="outline" className="font-sans text-[11px]">
            {jobs.length} {jobs.length === 1 ? 'job' : 'jobs'}
          </Badge>
        </CardHeader>
        <CardContent className="min-h-0 py-3">
          <p className="mb-3 font-sans text-xs text-muted-foreground">{status.trim() || 'Connected. Ready.'}</p>

          <ScrollArea className="h-[min(62vh,560px)]">
            <div className="grid gap-2 pr-2">
              {jobs.length === 0 && !loading && (
                <div className="rounded-lg border border-dashed border-border p-4 font-sans text-sm text-muted-foreground">
                  No scheduled jobs returned by OpenClaw. Make sure your paired device has the required scopes.
                </div>
              )}

              {jobs.map((job) => (
                <article key={job.id} className="grid gap-2 rounded-lg border border-border bg-background px-3 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-medium text-foreground">{job.name}</h3>
                    <div className="flex items-center gap-2">
                      <Badge variant={job.enabled ? 'default' : 'outline'} className="font-sans text-[11px]">
                        {job.enabled ? 'Enabled' : 'Disabled'}
                      </Badge>
                      <Badge variant="outline" className="font-sans text-[11px]">
                        {titleCase(job.state)}
                      </Badge>
                    </div>
                  </div>
                  <p className="font-mono text-xs text-muted-foreground">{job.schedule}</p>
                  <div className="grid gap-1 font-sans text-xs text-muted-foreground sm:grid-cols-2">
                    <p>Next run: {formatTime(job.nextRunAt)}</p>
                    <p>Last run: {formatTime(job.lastRunAt)}</p>
                  </div>
                </article>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </section>
  );
}
