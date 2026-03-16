import type { FormEvent } from 'react';

import type { ChatMessage, ChatModelOption } from '@/app-types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';

type ChatPageProps = {
  taskPrompt: string;
  messages: ChatMessage[];
  sending: boolean;
  sessionKey: string;
  models: ChatModelOption[];
  selectedModel: string;
  modelsLoading: boolean;
  changingModel: boolean;
  status: string;
  onTaskPromptChange: (value: string) => void;
  onModelChange: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
};

export function ChatPage({
  taskPrompt,
  messages,
  sending,
  sessionKey,
  models,
  selectedModel,
  modelsLoading,
  changingModel,
  status,
  onTaskPromptChange,
  onModelChange,
  onSubmit,
}: ChatPageProps) {
  const trimmedStatus = status.trim();

  return (
    <section className="grid h-full w-full min-h-0 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)_auto]">
        <header className="flex items-center justify-between border-b border-[rgba(31,31,28,0.08)] px-5 py-4">
          <div>
            <Badge variant="outline" className="mb-2 font-sans text-[11px] text-muted-foreground">
              Chat Workspace
            </Badge>
            <p className="font-sans text-sm font-medium text-foreground">OpenClaw conversation</p>
          </div>
          <div className="grid gap-1 text-right">
            <p className="font-sans text-[11px] uppercase tracking-wide text-muted-foreground">Session</p>
            <p className="max-w-[300px] truncate font-mono text-xs text-foreground">{sessionKey || 'resolving...'}</p>
          </div>
        </header>

        <ScrollArea className="h-full px-5 py-4">
          <div className="mx-auto grid w-full max-w-[760px] gap-3">
            {messages.length === 0 && (
              <>
                <div className="rounded-xl border border-[rgba(31,31,28,0.1)] bg-[rgba(255,255,255,0.92)] p-4 font-sans text-sm text-muted-foreground">
                  Start a conversation. Messages are streamed directly from OpenClaw Gateway.
                </div>
                <div className="rounded-xl border border-[rgba(31,31,28,0.08)] bg-[rgba(255,255,255,0.82)] p-4 font-sans text-sm text-muted-foreground">
                  Tip: pick a model in the right panel, then send a task prompt to begin.
                </div>
              </>
            )}

            {messages.map((message) => (
              <article
                key={message.id}
                className={
                  message.role === 'user'
                    ? 'ml-auto w-[min(92%,660px)] rounded-2xl border border-[rgba(233,151,116,0.45)] bg-[linear-gradient(135deg,rgba(247,197,171,0.34),rgba(239,168,130,0.25))] p-4 font-sans text-sm text-foreground shadow-[0_8px_18px_rgba(222,130,94,0.12)]'
                    : 'w-[min(92%,700px)] rounded-2xl border border-[rgba(31,31,28,0.1)] bg-[rgba(255,255,255,0.95)] p-4 font-sans text-sm text-foreground shadow-[0_8px_20px_rgba(31,31,28,0.05)]'
                }
              >
                <p className="mb-2 font-sans text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{message.role}</p>
                <p className="whitespace-pre-wrap leading-6">{message.text}</p>
              </article>
            ))}
          </div>
        </ScrollArea>

        <div className="border-t border-[rgba(31,31,28,0.08)] px-4 py-3">
          <form className="mx-auto grid w-full max-w-[760px] gap-3" onSubmit={onSubmit}>
            <Textarea
              value={taskPrompt}
              onChange={(event) => onTaskPromptChange(event.target.value)}
              placeholder="Reply..."
              rows={3}
              className="resize-none rounded-xl border-[rgba(31,31,28,0.12)] bg-white font-sans shadow-[inset_0_1px_0_rgba(31,31,28,0.04)]"
            />
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="h-8 w-8 rounded-md border-[rgba(31,31,28,0.14)] p-0 font-sans text-base leading-none"
                  aria-label="Add attachment"
                >
                  +
                </Button>
                <p className="line-clamp-1 font-sans text-xs text-muted-foreground">{trimmedStatus || 'Connected. Ready to send.'}</p>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={selectedModel}
                  onChange={(event) => onModelChange(event.target.value)}
                  disabled={modelsLoading || changingModel || models.length === 0}
                  className="h-8 max-w-[210px] rounded-md border border-[rgba(31,31,28,0.12)] bg-white px-2 font-sans text-xs text-foreground outline-none transition focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="">Session default</option>
                  {models.map((model) => (
                    <option key={model.value} value={model.value}>
                      {model.label}
                    </option>
                  ))}
                </select>
                <Button className="h-8 min-w-[84px] border-0 bg-[linear-gradient(120deg,#e19876,#cf7450)] px-3 text-[#fffefb]" type="submit" disabled={sending}>
                  {sending ? 'Sending...' : 'Send'}
                </Button>
              </div>
            </div>
          </form>
        </div>
      </div>

      <aside className="grid min-h-0 w-full gap-3 self-stretch lg:grid-rows-[auto_minmax(0,1fr)] lg:justify-self-end">
        <Card className="w-full rounded-2xl border-[rgba(31,31,28,0.1)] bg-[rgba(255,255,255,0.78)] shadow-[0_10px_28px_rgba(31,31,28,0.08)]">
          <CardContent className="grid gap-2 py-1">
            <p className="font-sans text-xs uppercase tracking-wide text-muted-foreground">Progress</p>
            <div className="grid gap-2 font-sans text-sm text-foreground">
              <div className="rounded-lg border border-[rgba(31,31,28,0.08)] bg-white px-3 py-2">Connected to Gateway</div>
              <div className="rounded-lg border border-[rgba(31,31,28,0.08)] bg-white px-3 py-2">Session resolved</div>
              <div className="rounded-lg border border-[rgba(31,31,28,0.08)] bg-white px-3 py-2">Streaming chat events</div>
            </div>
          </CardContent>
        </Card>

        <Card className="min-h-0 w-full rounded-2xl border-[rgba(31,31,28,0.1)] bg-[rgba(255,255,255,0.78)] shadow-[0_10px_28px_rgba(31,31,28,0.08)]">
          <CardContent className="grid h-full min-h-0 gap-2 py-1">
            <p className="font-sans text-xs uppercase tracking-wide text-muted-foreground">Context</p>
            <div className="min-h-0 overflow-auto rounded-lg border border-[rgba(31,31,28,0.08)] bg-white p-3">
              <p className="mb-2 font-sans text-xs text-muted-foreground">Latest status</p>
              <p className="font-sans text-sm text-foreground">{trimmedStatus || 'No status yet.'}</p>
              <p className="mt-4 font-sans text-xs text-muted-foreground">Active model</p>
              <p className="font-sans text-sm text-foreground">{selectedModel || 'Session default'}</p>
              <p className="mt-4 font-sans text-xs text-muted-foreground">Messages in view</p>
              <p className="font-sans text-sm text-foreground">{messages.length}</p>
            </div>
          </CardContent>
        </Card>
      </aside>
    </section>
  );
}
