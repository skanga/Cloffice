import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';

import type { LocalFilePlanAction } from '@/app-types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';

type TaskState = 'idle' | 'planned';
type RecommendationState = 'approve' | 'needs-second-sign' | 'block' | 'skip';

type PlanItem = {
  id: string;
  title: string;
  state: RecommendationState;
  rationale: string;
  confidence: number;
  policyRef: string;
};

type CoworkMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
};

type ExecutionStep = {
  id: string;
  label: string;
  detail: string;
  status: 'pending' | 'running' | 'done';
};

type RunSummary = {
  id: string;
  prompt: string;
  completedAt: string;
  approved: number;
  escalated: number;
  blocked: number;
  skipped: number;
  receiptId: string;
};

type CoworkPageProps = {
  taskPrompt: string;
  workingFolder: string;
  taskState: TaskState;
  status: string;
  desktopBridgeAvailable: boolean;
  localPlanActions: LocalFilePlanAction[];
  localPlanLoading: boolean;
  localApplyLoading: boolean;
  onTaskPromptChange: (value: string) => void;
  onWorkingFolderChange: (value: string) => void;
  onPickWorkingFolder: () => void | Promise<void>;
  onSubmit: (event: FormEvent) => void;
  onCreateLocalPlan: () => void | Promise<void>;
  onApplyLocalPlan: () => void | Promise<void>;
};

const connectors = ['Web search', 'Desktop files', 'Gateway tools'];

const baseExecutionSteps: ExecutionStep[] = [
  {
    id: 'step-analyze',
    label: 'Analyze task context',
    detail: 'Build structured understanding of the request and constraints.',
    status: 'pending',
  },
  {
    id: 'step-policy',
    label: 'Apply policy checks',
    detail: 'Classify recommendations by approval policy and risk threshold.',
    status: 'pending',
  },
  {
    id: 'step-orchestrate',
    label: 'Prepare execution payload',
    detail: 'Assemble actions and escalation routing before run approval.',
    status: 'pending',
  },
  {
    id: 'step-execute',
    label: 'Execute approved actions',
    detail: 'Apply approved items and produce receipts.',
    status: 'pending',
  },
];

function parsePromptToPlan(prompt: string): PlanItem[] {
  const normalized = prompt.toLowerCase();

  const hasLargeSpendSignal =
    normalized.includes('large') || normalized.includes('high value') || normalized.includes('cfo');
  const hasVendorRiskSignal = normalized.includes('vendor') || normalized.includes('new supplier');
  const hasUrgencySignal = normalized.includes('urgent') || normalized.includes('today') || normalized.includes('asap');

  const items: PlanItem[] = [
    {
      id: 'item-1',
      title: 'PO-2040 Office Ops Renewal',
      state: 'approve',
      rationale: 'Within threshold and matches existing contract metadata.',
      confidence: 0.92,
      policyRef: 'FIN-APP-01',
    },
    {
      id: 'item-2',
      title: hasLargeSpendSignal ? 'PO-2041 Annual Platform Commitment' : 'PO-2041 Department Software Upgrade',
      state: 'needs-second-sign',
      rationale: 'Amount crosses manager-only threshold and requires secondary sign-off.',
      confidence: 0.86,
      policyRef: 'FIN-APP-03',
    },
    {
      id: 'item-3',
      title: hasVendorRiskSignal ? 'PO-2042 New Vendor Onboarding' : 'PO-2042 Security Service Expansion',
      state: hasVendorRiskSignal ? 'block' : 'skip',
      rationale: hasVendorRiskSignal
        ? 'Missing vendor verification packet and legal review confirmation.'
        : 'Not enough attached evidence to approve in this run.',
      confidence: hasVendorRiskSignal ? 0.84 : 0.72,
      policyRef: hasVendorRiskSignal ? 'FIN-RISK-05' : 'FIN-APP-04',
    },
  ];

  if (hasUrgencySignal) {
    items.push({
      id: 'item-4',
      title: 'PO-2043 Urgent Contractor Extension',
      state: 'approve',
      rationale: 'Urgent extension validated against prior approved envelope.',
      confidence: 0.88,
      policyRef: 'FIN-APP-02',
    });
  }

  return items;
}

function buildPlanSummary(items: PlanItem[]): string {
  const approved = items.filter((item) => item.state === 'approve').length;
  const escalated = items.filter((item) => item.state === 'needs-second-sign').length;
  const blocked = items.filter((item) => item.state === 'block').length;
  const skipped = items.filter((item) => item.state === 'skip').length;

  return `Plan ready: ${items.length} items reviewed. ${approved} approve, ${escalated} needs second sign, ${blocked} block, ${skipped} skip.`;
}

function stateToneClasses(state: RecommendationState): string {
  if (state === 'approve') {
    return 'border-[rgba(47,122,88,0.3)] bg-[rgba(47,122,88,0.08)] text-[#2f7a58]';
  }
  if (state === 'needs-second-sign') {
    return 'border-[rgba(173,132,46,0.34)] bg-[rgba(173,132,46,0.1)] text-[#7a5e1d]';
  }
  if (state === 'block') {
    return 'border-[rgba(173,56,56,0.34)] bg-[rgba(173,56,56,0.1)] text-[#7f2c2c]';
  }
  return 'border-[rgba(98,96,90,0.3)] bg-[rgba(98,96,90,0.09)] text-[#4d4b45]';
}

export function CoworkPage({
  taskPrompt,
  workingFolder,
  taskState,
  status,
  desktopBridgeAvailable,
  localPlanActions,
  localPlanLoading,
  localApplyLoading,
  onTaskPromptChange,
  onWorkingFolderChange,
  onPickWorkingFolder,
  onSubmit,
  onCreateLocalPlan,
  onApplyLocalPlan,
}: CoworkPageProps) {
  const [planItems, setPlanItems] = useState<PlanItem[]>([]);
  const [planSummary, setPlanSummary] = useState('No plan drafted yet. Submit a task to generate recommendations.');
  const [coworkMessages, setCoworkMessages] = useState<CoworkMessage[]>([]);
  const [coworkModel, setCoworkModel] = useState('opus-4.5');
  const [executionSteps, setExecutionSteps] = useState<ExecutionStep[]>(baseExecutionSteps);
  const [executionRunning, setExecutionRunning] = useState(false);
  const [executionMessage, setExecutionMessage] = useState('Waiting for approved plan.');
  const [latestRun, setLatestRun] = useState<RunSummary | null>(null);
  const [runHistory, setRunHistory] = useState<RunSummary[]>([]);
  const [showDetails, setShowDetails] = useState(true);
  const executionTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const currentStepIndexRef = useRef(-1);

  useEffect(() => {
    return () => {
      if (executionTimerRef.current) {
        clearInterval(executionTimerRef.current);
        executionTimerRef.current = null;
      }
    };
  }, []);

  const recommendationCounts = useMemo(() => {
    return {
      approve: planItems.filter((item) => item.state === 'approve').length,
      escalate: planItems.filter((item) => item.state === 'needs-second-sign').length,
      block: planItems.filter((item) => item.state === 'block').length,
      skip: planItems.filter((item) => item.state === 'skip').length,
    };
  }, [planItems]);

  const appendAssistantMessage = (text: string) => {
    setCoworkMessages((current) => [...current, { id: `assistant-${Date.now()}`, role: 'assistant', text }]);
  };

  const appendUserMessage = (text: string) => {
    setCoworkMessages((current) => [...current, { id: `user-${Date.now()}`, role: 'user', text }]);
  };

  const handleDraftPlan = (event: FormEvent) => {
    onSubmit(event);
    const trimmedPrompt = taskPrompt.trim();
    if (!trimmedPrompt) {
      return;
    }

    const generated = parsePromptToPlan(trimmedPrompt);
    const summary = buildPlanSummary(generated);

    setPlanItems(generated);
    setPlanSummary(summary);
    setExecutionSteps(baseExecutionSteps);
    setExecutionMessage('Plan drafted. Review details and run execution when ready.');
    setLatestRun(null);

    appendUserMessage(trimmedPrompt);
    appendAssistantMessage(`${summary} Reply with /yes to run, /modify to adjust scope, or /details for full rationale.`);
  };

  const handleRunExecution = () => {
    if (planItems.length === 0 || executionRunning) {
      return;
    }

    setExecutionRunning(true);
    setExecutionMessage('Execution started. You can continue steering while this runs.');
    setExecutionSteps(baseExecutionSteps.map((step, index) => ({ ...step, status: index === 0 ? 'running' : 'pending' })));
    currentStepIndexRef.current = 0;

    appendAssistantMessage('Execution started. I will process approved items and provide receipts when complete.');

    executionTimerRef.current = setInterval(() => {
      const nextStepIndex = currentStepIndexRef.current + 1;

      setExecutionSteps((current) =>
        current.map((step, index) => {
          if (index < nextStepIndex) {
            return { ...step, status: 'done' };
          }
          if (index === nextStepIndex) {
            return { ...step, status: 'running' };
          }
          return { ...step, status: 'pending' };
        }),
      );

      currentStepIndexRef.current = nextStepIndex;

      if (nextStepIndex >= baseExecutionSteps.length) {
        if (executionTimerRef.current) {
          clearInterval(executionTimerRef.current);
          executionTimerRef.current = null;
        }

        const summary: RunSummary = {
          id: `run-${Date.now()}`,
          prompt: taskPrompt.trim() || 'Cowork task',
          completedAt: new Date().toLocaleString(),
          approved: recommendationCounts.approve,
          escalated: recommendationCounts.escalate,
          blocked: recommendationCounts.block,
          skipped: recommendationCounts.skip,
          receiptId: `rcpt-${Math.random().toString(16).slice(2, 8)}`,
        };

        setExecutionRunning(false);
        setExecutionMessage('Execution completed. Review receipts and decide the next action.');
        setLatestRun(summary);
        setRunHistory((current) => [summary, ...current].slice(0, 8));
        appendAssistantMessage(
          `Run complete. Approved ${summary.approved}, escalated ${summary.escalated}, blocked ${summary.blocked}, skipped ${summary.skipped}. Receipt: ${summary.receiptId}.`,
        );
      }
    }, 1200);
  };

  const handleSteeringCommand = (input: string) => {
    const trimmed = input.trim();
    if (!trimmed) {
      return;
    }

    appendUserMessage(trimmed);

    if (trimmed === '/details') {
      setShowDetails(true);
      appendAssistantMessage('Details expanded on the right panel.');
      return;
    }

    if (trimmed === '/yes') {
      appendAssistantMessage('Acknowledged. Executing approved plan now.');
      handleRunExecution();
      return;
    }

    if (trimmed === '/hold') {
      if (executionTimerRef.current) {
        clearInterval(executionTimerRef.current);
        executionTimerRef.current = null;
      }
      setExecutionRunning(false);
      setExecutionMessage('Execution held. You can review details and resume by running again.');
      appendAssistantMessage('Execution paused. No further actions are being applied.');
      return;
    }

    if (trimmed === '/modify') {
      appendAssistantMessage('Scope update noted. Share specifics and I will regenerate the plan.');
      return;
    }

    if (trimmed === '/no') {
      appendAssistantMessage('Plan rejected. Update the request and draft again.');
      return;
    }

    appendAssistantMessage('Steering received. Context retained for the next response.');
  };

  const completedSteps = executionSteps.filter((step) => step.status === 'done').length;
  const isInitialWorkspace = coworkMessages.length === 0;

  return (
    <section className="grid h-full w-full min-h-0 overflow-hidden gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div
        className={`grid h-full min-h-0 overflow-hidden bg-transparent ${
          isInitialWorkspace ? 'grid-rows-[minmax(0,1fr)]' : 'grid-rows-[auto_minmax(0,1fr)_auto]'
        }`}
      >
        {!isInitialWorkspace ? (
          <header className="flex items-center justify-between border-b border-[rgba(31,31,28,0.08)] px-2 py-3">
            <div>
              <p className="text-sm font-medium text-foreground">Finance approvals cowork</p>
              <p className="font-sans text-xs text-muted-foreground">Plan first, approve, then execute with checkpoints.</p>
            </div>
            <Badge
              variant="outline"
              className={
                taskState === 'planned'
                  ? 'rounded-full border border-[rgba(47,122,88,0.35)] bg-[rgba(47,122,88,0.08)] font-sans text-[11px] text-[#2f7a58]'
                  : 'rounded-full font-sans text-[11px]'
              }
            >
              {taskState === 'planned' ? 'Plan ready' : 'Awaiting prompt'}
            </Badge>
          </header>
        ) : null}

        <ScrollArea className="h-full px-2 py-4">
          {isInitialWorkspace ? (
            <div className="mx-auto grid h-full w-full max-w-[860px] place-items-center">
              <div className="w-full max-w-[640px]">
                <p className="mb-3 text-[clamp(1.8rem,2.8vw,2.5rem)] tracking-tight text-foreground">Let's knock something off your list</p>
                <div className="rounded-2xl border border-[rgba(31,31,28,0.1)] bg-[rgba(255,255,255,0.7)] p-4">
                  <p className="font-sans text-sm text-muted-foreground">
                    Cowork is an early research preview. New improvements ship frequently. Learn more or give us feedback.
                  </p>
                </div>

                <form className="mt-4 rounded-3xl border border-[rgba(31,31,28,0.12)] bg-white px-4 py-3" onSubmit={handleDraftPlan}>
                  <Textarea
                    value={taskPrompt}
                    onChange={(event) => onTaskPromptChange(event.target.value)}
                    placeholder="How can I help you today?"
                    rows={2}
                    className="min-h-[58px] resize-none border-0 bg-transparent px-0 py-1 font-sans text-[22px] text-foreground shadow-none focus-visible:ring-0"
                  />
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Button type="button" variant="ghost" className="h-8 rounded-md px-2 font-sans text-sm text-muted-foreground" aria-label="Select context">
                        LIP context
                      </Button>
                      <Button type="button" variant="ghost" className="h-8 w-8 rounded-md p-0 text-lg" aria-label="Add attachment">
                        +
                      </Button>
                    </div>

                    <div className="flex items-center gap-2">
                      <select
                        value={coworkModel}
                        onChange={(event) => setCoworkModel(event.target.value)}
                        className="h-8 rounded-md border border-[rgba(31,31,28,0.12)] bg-white px-2 font-sans text-xs text-foreground outline-none"
                      >
                        <option value="opus-4.5">Opus 4.5</option>
                        <option value="sonnet-4">Sonnet 4</option>
                      </select>

                      <Button
                        className="h-8 min-w-[90px] border-0 bg-[linear-gradient(120deg,#e5a48a,#d98765)] px-3 text-[#fffefb]"
                        type="submit"
                      >
                        Let's go
                      </Button>
                    </div>
                  </div>
                </form>
              </div>
            </div>
          ) : (
            <div className="mx-auto grid w-full max-w-[860px] gap-3">
              {coworkMessages.map((message) => (
                <article
                  key={message.id}
                  className={
                    message.role === 'user'
                      ? 'ml-auto w-[min(92%,700px)] px-2 py-1 text-right font-sans text-sm text-foreground'
                      : 'w-[min(95%,760px)] px-2 py-1 font-sans text-sm text-foreground'
                  }
                >
                  <p
                    className={`mb-2 font-sans text-[11px] font-semibold uppercase tracking-wide text-muted-foreground ${
                      message.role === 'user' ? 'text-right' : ''
                    }`}
                  >
                    {message.role}
                  </p>
                  <p className="whitespace-pre-wrap leading-6">{message.text}</p>
                </article>
              ))}
            </div>
          )}
        </ScrollArea>

        {!isInitialWorkspace ? (
          <div className="px-2 pb-3 pt-1">
            <div className="mx-auto grid w-full max-w-[860px] gap-2">
              <form className="rounded-3xl border border-[rgba(31,31,28,0.12)] bg-white px-4 py-3" onSubmit={handleDraftPlan}>
                <Textarea
                  value={taskPrompt}
                  onChange={(event) => onTaskPromptChange(event.target.value)}
                  placeholder="How can I help you today?"
                  rows={2}
                  className="min-h-[58px] resize-none border-0 bg-transparent px-0 py-1 font-sans text-[22px] text-foreground shadow-none focus-visible:ring-0"
                />
                <div className="mt-1 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Button type="button" variant="ghost" className="h-8 rounded-md px-2 font-sans text-sm text-muted-foreground" aria-label="Select context">
                      LIP context
                    </Button>
                    <Button type="button" variant="ghost" className="h-8 w-8 rounded-md p-0 text-lg" aria-label="Add attachment">
                      +
                    </Button>
                  </div>

                  <div className="flex items-center gap-2">
                    <select
                      value={coworkModel}
                      onChange={(event) => setCoworkModel(event.target.value)}
                      className="h-8 rounded-md border border-[rgba(31,31,28,0.12)] bg-white px-2 font-sans text-xs text-foreground outline-none"
                    >
                      <option value="opus-4.5">Opus 4.5</option>
                      <option value="sonnet-4">Sonnet 4</option>
                    </select>

                    <Button
                      className="h-8 min-w-[90px] border-0 bg-[linear-gradient(120deg,#e5a48a,#d98765)] px-3 text-[#fffefb]"
                      type="submit"
                    >
                      Let's go
                    </Button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        ) : null}
      </div>

      <aside className="grid min-h-0 w-full gap-3 lg:grid-rows-[auto_auto_minmax(0,1fr)]">
        <Card className="rounded-2xl border-[rgba(31,31,28,0.1)] bg-[rgba(255,255,255,0.82)]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Progress</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 pt-0">
            <div className="flex items-center gap-2">
              {executionSteps.map((step) => (
                <span
                  key={step.id}
                  className={
                    step.status === 'done'
                      ? 'h-4 w-4 rounded-full border border-[rgba(47,122,88,0.45)] bg-[rgba(47,122,88,0.2)]'
                      : step.status === 'running'
                        ? 'h-4 w-4 rounded-full border border-[rgba(222,130,94,0.45)] bg-[rgba(222,130,94,0.18)]'
                        : 'h-4 w-4 rounded-full border border-[rgba(31,31,28,0.15)] bg-transparent'
                  }
                  title={step.label}
                />
              ))}
            </div>
            <p className="font-sans text-xs text-muted-foreground">See task progress for longer tasks.</p>
            {!isInitialWorkspace ? (
              <p className="font-sans text-xs text-muted-foreground">{completedSteps}/{executionSteps.length} steps completed.</p>
            ) : null}
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-[rgba(31,31,28,0.1)] bg-[rgba(255,255,255,0.82)]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Working folder</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 pt-0">
            <div className="flex items-center gap-2">
              <Input
                value={workingFolder}
                onChange={(event) => onWorkingFolderChange(event.target.value)}
                placeholder="/Downloads"
                className="font-sans"
              />
              <Button type="button" size="sm" variant="outline" onClick={() => void onPickWorkingFolder()}>
                Browse
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => void onCreateLocalPlan()} disabled={localPlanLoading}>
                {localPlanLoading ? 'Planning...' : 'Generate plan'}
              </Button>
              <Button
                type="button"
                size="sm"
                className="border-0 bg-[linear-gradient(120deg,#ea9f7d,#de825e)] text-[#fffefb]"
                onClick={() => void onApplyLocalPlan()}
                disabled={localApplyLoading || localPlanActions.length === 0}
              >
                {localApplyLoading ? 'Applying...' : `Apply ${localPlanActions.length}`}
              </Button>
            </div>
            {!desktopBridgeAvailable && (
              <p className="font-sans text-[11px] text-muted-foreground">Desktop app required for native folder access.</p>
            )}
            <p className="font-sans text-xs text-muted-foreground">View and open files created during this task.</p>
          </CardContent>
        </Card>

        <Card className="min-h-0 rounded-2xl border-[rgba(31,31,28,0.1)] bg-[rgba(255,255,255,0.82)]">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm">Context</CardTitle>
            <Button type="button" size="sm" variant="ghost" onClick={() => setShowDetails((current) => !current)}>
              {showDetails ? 'Hide' : 'Show'}
            </Button>
          </CardHeader>
          <CardContent className="grid h-full min-h-0 gap-2 pt-0">
            <div>
              <p className="font-sans text-[11px] uppercase tracking-wide text-muted-foreground">Connectors</p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {connectors.map((connector) => (
                  <Badge key={connector} variant="outline" className="font-sans text-[11px]">
                    {connector}
                  </Badge>
                ))}
              </div>
            </div>

            <p className="font-sans text-xs text-muted-foreground">{status}</p>
            <p className="font-sans text-xs text-muted-foreground">{planSummary}</p>

            {showDetails && (
              <div className="min-h-0 overflow-hidden rounded-lg border border-[rgba(31,31,28,0.1)] bg-white p-2">
                <ScrollArea className="h-[180px]">
                  <div className="grid gap-2 pr-2">
                    {planItems.length === 0 && (
                      <p className="font-sans text-xs text-muted-foreground">No recommendations yet.</p>
                    )}
                    {planItems.map((item) => (
                      <div key={item.id} className="rounded-md border border-[rgba(31,31,28,0.08)] p-2">
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <p className="font-sans text-xs text-foreground">{item.title}</p>
                          <span className={`rounded-full border px-2 py-0.5 font-sans text-[10px] ${stateToneClasses(item.state)}`}>
                            {item.state}
                          </span>
                        </div>
                        <p className="font-sans text-[11px] text-muted-foreground">{item.rationale}</p>
                        <p className="mt-1 font-sans text-[10px] text-muted-foreground">
                          {item.policyRef} | {(item.confidence * 100).toFixed(0)}%
                        </p>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            )}

            <div className="rounded-lg border border-[rgba(31,31,28,0.1)] bg-white p-2">
              <p className="font-sans text-[11px] uppercase tracking-wide text-muted-foreground">Latest result</p>
              {!latestRun ? (
                <p className="font-sans text-xs text-muted-foreground">No completed run yet.</p>
              ) : (
                <p className="font-sans text-xs text-foreground">
                  {latestRun.approved} approve, {latestRun.escalated} escalate, {latestRun.blocked} block, {latestRun.skipped} skip
                </p>
              )}
            </div>

            <div className="min-h-0 overflow-hidden rounded-lg border border-[rgba(31,31,28,0.1)] bg-white p-2">
              <p className="mb-1 font-sans text-[11px] uppercase tracking-wide text-muted-foreground">History</p>
              <ScrollArea className="h-[90px]">
                <div className="grid gap-1 pr-2">
                  {runHistory.length === 0 ? (
                    <p className="font-sans text-xs text-muted-foreground">No run history yet.</p>
                  ) : (
                    runHistory.slice(0, 3).map((run) => (
                      <div key={run.id} className="rounded border border-[rgba(31,31,28,0.08)] p-1.5">
                        <p className="line-clamp-1 font-sans text-[11px] text-foreground">{run.prompt}</p>
                        <p className="font-sans text-[10px] text-muted-foreground">{run.completedAt}</p>
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
            </div>
          </CardContent>
        </Card>
      </aside>
    </section>
  );
}
