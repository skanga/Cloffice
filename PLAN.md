# PLAN.md — Relay Internal Provider-Neutral Engine Migration

## 1. Decision

Relay should replace its OpenClaw dependency with a **Relay-owned internal engine** that lives in the same repo and ships as part of the same desktop product.

This is **not** a dependency swap. It is a **control-plane/runtime re-platform**:

- **Relay remains the operator desk**: chat, cowork, dispatch, schedules, approvals, artifacts, audit.
- **A new internal Relay Engine becomes the execution/orchestration layer**: sessions, runs, provider adapters, scheduling, persistence, approval state, event streaming.
- **Electron main remains the high-trust host**: local filesystem, shell, web fetch, notifications, OS integration, secure credential access.
- **The model/provider layer becomes replaceable** behind a provider-neutral engine contract.

### Explicit answer to the architecture question

We do **not** need a separate third-party harness such as OpenClaw, NanoClaw, or another external runtime product.

We **do** need an internal harness/runtime subsystem, because the product requires:

- durable sessions and runs
- streaming events
- structured approvals
- scheduling
- artifacts
- usage/cost normalization
- resumability and cancellation
- provider abstraction
- future sub-agents and sandboxed workbenches

The right move is therefore:

> **Build our own fully integrated Relay Engine inside Relay, but run it as an internal worker/utility process rather than baking agent execution directly into the renderer or Electron main process.**

---

## 2. Why this change

Relay’s current codebase is still structurally centered on OpenClaw:

- `src/lib/openclaw-gateway-client.ts` implements an OpenClaw-specific WebSocket handshake and RPC surface.
- `src/lib/file-service.ts` chooses between a local Electron bridge and remote `workspace.*` gateway RPCs.
- `electron/main.ts` still owns OpenClaw-specific config, discovery, health checks, binary probing, and workspace plugin installation.
- `tests/e2e/mock-gateway.mjs` simulates an OpenClaw-style gateway.
- `tests/e2e/approval-flow.spec.ts` currently proves approval flow by sending a prompt to the gateway and waiting for a `relay_actions` response.

This creates four problems:

1. **Protocol coupling**  
   Relay’s UI is coupled to an external OpenClaw transport and method set instead of a Relay-owned runtime contract.

2. **Product coupling**  
   Relay depends on OpenClaw behavior and setup assumptions, even when the actual product value is governance and operator control.

3. **Architecture drift**  
   Relay already executes many consequential actions locally through Electron IPC, which means the true product boundary is already “agent proposes / Relay executes.” OpenClaw sits awkwardly in the middle.

4. **Provider neutrality is harder than it should be**  
   Every provider decision is forced through an OpenClaw-compatible framing layer instead of a Relay-native engine contract.

---

## 3. Goals

### Primary goals

1. Replace OpenClaw with a **Relay-native internal engine**.
2. Keep the system **provider-neutral** at the engine boundary.
3. Preserve Relay’s core UX:
   - chat
   - cowork/project work
   - approvals
   - artifacts
   - scheduling
   - auditability
4. Reuse the existing **Electron local action bridge** for trusted host-side execution.
5. Make the first real provider adapter strong enough to deliver compelling agentic behavior.
6. Keep the repo and shipped product **fully integrated**.

### Secondary goals

1. Improve crash isolation by moving the engine out of the renderer and main process.
2. Replace text-parsed `relay_actions` with **structured action proposals**.
3. Move durable runtime state out of localStorage and into an engine-owned store.
4. Make future providers easier to add.

---

## 4. Non-goals for the initial migration

These are deliberately **out of scope for v1** of the internal engine migration:

1. **OpenClaw protocol compatibility**
2. **Remote gateway / remote node parity**
3. **Automatic import of OpenClaw server-side sessions**
4. **A headless multi-tenant server product**
5. **Full connector marketplace work**
6. **Production-grade browser automation / computer use**
7. **A generalized plugin ecosystem for third-party runtime extensions**

We should design so these are possible later, but not require them to ship the first Relay-native engine.

---

## 5. Current-state inventory (repo-specific)

This migration should start from the code that already exists instead of pretending Relay is a blank slate.

## 5.1 Strong seams already present

### A. Relay already owns local execution

`electron/main.ts` already exposes local host actions over IPC, including:

- folder selection
- list/read/stat files
- create/append/rename/delete files
- shell execution
- web fetch
- notifications

This is a major asset. We do not need to invent host execution from scratch.

### B. Relay already owns approvals

`src/app-types.ts` already contains the core approval-related UI types:

- `SafetyPermissionScope`
- `PendingApprovalAction`
- `LocalActionType`
- `LocalActionReceipt`

The approval product is already fundamentally a Relay concern.

### C. Relay already has a working “agent proposes / Relay executes” proof

The current E2E approval tests use prompts that make the runtime return a JSON code block with `relay_actions`, and Relay turns that into approval cards and local action execution.

That means the UX contract is already much closer to a Relay-native runtime than to a thin OpenClaw client.

### D. Local-first file behavior already exists

`src/lib/file-service.ts` already prefers the local Electron bridge when the runtime is local, and explicitly notes that direct `workspace.*` RPC support is not guaranteed.

This means the path to an internal engine is already compatible with Relay’s file model.

## 5.2 OpenClaw-specific coupling to remove

### A. `src/lib/openclaw-gateway-client.ts`

Current responsibilities:

- WebSocket connect logic
- OpenClaw `connect.challenge` handshake
- `chat.send`
- `chat.history`
- `sessions.*`
- `models.list`
- `cron.list`
- `tools.catalog`
- `workspace.*`

This entire class should be replaced by a Relay-owned `EngineClient` contract.

### B. `electron/main.ts`

OpenClaw-specific logic currently includes:

- `openclaw-config.json`
- gateway health checks
- gateway discovery on default ports
- OpenClaw binary probing
- workspace plugin detection / install
- remote gateway connection assumptions

All of that should be removed or migrated.

### C. `tests/e2e/mock-gateway.mjs`

This should become a `mock-engine` or `scripted-provider` test fixture.

### D. `src/app-types.ts`

Several types are gateway-centric rather than engine-centric:

- `AppConfig` currently stores `gatewayUrl` and `gatewayToken`
- `GatewayDiscoveryResult`
- gateway-shaped model/session assumptions

These should move toward runtime/provider-neutral types.

---

## 6. Architecture decision

## 6.1 Process model

Relay should become a **three-layer local system**:

```text
┌──────────────────────────────────────────────────────────────┐
│ Renderer (React/Vite UI)                                    │
│ chat · cowork · dispatch · approvals · schedules · files    │
└──────────────────────────────┬───────────────────────────────┘
                               │
                               │ preload IPC / message port
                               ▼
┌──────────────────────────────────────────────────────────────┐
│ Electron Main (trusted host)                                │
│ config · keychain · notifications · file/shell/web actions  │
│ engine host/supervisor                                       │
└──────────────────────────────┬───────────────────────────────┘
                               │
                               │ internal transport
                               ▼
┌──────────────────────────────────────────────────────────────┐
│ Relay Engine Process                                         │
│ sessions · runs · providers · approvals · scheduler · DB    │
│ event journal · artifacts · model routing                    │
└──────────────────────────────┬───────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────┐
│ Provider adapters / optional workbench                      │
│ anthropic sdk · openai tool loop · local model adapter      │
│ future sandbox runner / browser workbench                   │
└──────────────────────────────────────────────────────────────┘
```

## 6.2 Why not run the agent directly in the renderer or main process?

Because the agent layer is exactly the part that is:

- most likely to hang
- most likely to crash
- most likely to consume CPU/memory unexpectedly
- least appropriate to trust with direct host privileges

The engine should be a supervised worker/utility process with a clear transport boundary.

## 6.3 Why not build a separate daemon product?

Because the user value is a **single integrated desktop system**, not a new infrastructure product.  
We want **one repo, one product, one user mental model**.

The engine is internal infrastructure, not a standalone platform.

---

## 7. Guiding design principles

1. **Relay owns governance**
   - The engine may orchestrate.
   - The model may propose.
   - Only Relay host services execute high-trust actions.

2. **Provider-neutral at the engine boundary**
   - The engine contract must not assume a single provider’s session semantics.
   - Provider adapters can be provider-specific internally.

3. **Local-first**
   - v1 assumes the engine runs on the user’s machine with access to the local project workspace through host services.

4. **Durable by default**
   - sessions, runs, approvals, schedules, artifacts, and event logs must survive app restarts.

5. **Structured events over text parsing**
   - `relay_actions` in assistant text can be a temporary compatibility layer, not the permanent mechanism.

6. **Reuse working code**
   - The existing Electron local action bridge should be reused, not replaced.

7. **Parity-driven migration**
   - Chat, cowork, approval flow, and scheduling must stay usable throughout the transition.

---

## 8. Responsibility split

| Responsibility | Current owner | Target owner |
|---|---|---|
| Chat transport | OpenClaw gateway WS client | `EngineClient` over internal IPC |
| Session management | OpenClaw | Relay Engine |
| Run orchestration | OpenClaw | Relay Engine |
| Model/provider selection | OpenClaw RPCs | provider adapters + engine model registry |
| File read/write execution | Electron local bridge or gateway | Electron host actions |
| Approval UI | Relay | Relay |
| Approval state machine | mixed | Relay Engine + Relay UI |
| Scheduler | OpenClaw cron | Relay Engine |
| Artifact creation | partially UI-driven | Relay Engine journal + host receipts |
| Audit log | mixed | Relay Engine event journal |
| Config/secrets | Electron config + gateway token | Relay config + keychain-backed provider credentials |

---

## 9. Target runtime contract

The first major technical step is to define the Relay-native runtime contract.

## 9.1 Renderer-facing `EngineClient`

```ts
export interface EngineClient {
  health(): Promise<EngineHealth>;

  listProviders(): Promise<ProviderDescriptor[]>;
  listModels(providerId: string): Promise<ModelDescriptor[]>;

  createSession(input: CreateSessionInput): Promise<SessionSummary>;
  updateSession(input: UpdateSessionInput): Promise<void>;
  deleteSession(sessionId: string): Promise<void>;
  listSessions(filter?: SessionFilter): Promise<SessionSummary[]>;
  getSession(sessionId: string): Promise<SessionDetail>;

  listMessages(sessionId: string, limit?: number): Promise<ChatMessage[]>;
  sendUserMessage(input: SendUserMessageInput): Promise<{ runId: string }>;
  cancelRun(runId: string): Promise<void>;

  listSchedules(): Promise<ScheduleSummary[]>;
  createSchedule(input: CreateScheduleInput): Promise<ScheduleSummary>;
  updateSchedule(input: UpdateScheduleInput): Promise<void>;
  deleteSchedule(scheduleId: string): Promise<void>;

  listArtifacts(runId: string): Promise<CoworkArtifact[]>;
  approveAction(input: ApproveActionInput): Promise<void>;
  rejectAction(input: RejectActionInput): Promise<void>;

  subscribe(listener: (event: EngineEvent) => void): () => void;
}
```

### Notes

- `sendUserMessage()` returns quickly with a `runId`.
- Streaming updates come through `subscribe()`.
- The renderer should stop depending on transport-level RPC names.

## 9.2 Engine event model

```ts
export type EngineEvent =
  | { type: 'session.updated'; session: SessionSummary }
  | { type: 'message.delta'; runId: string; sessionId: string; text: string }
  | { type: 'message.completed'; runId: string; sessionId: string; message: ChatMessage }
  | { type: 'run.phase'; runId: string; sessionId: string; phase: RunPhase; detail?: string }
  | { type: 'run.usage'; runId: string; usage: MessageUsage }
  | { type: 'approval.requested'; approval: ApprovalRequest }
  | { type: 'approval.resolved'; approvalId: string; status: 'approved' | 'rejected' | 'expired' }
  | { type: 'action.receipt'; runId: string; receipt: LocalActionReceipt }
  | { type: 'artifact.updated'; runId: string; artifact: CoworkArtifact }
  | { type: 'schedule.updated'; schedule: ScheduleSummary }
  | { type: 'run.completed'; runId: string; sessionId: string }
  | { type: 'run.failed'; runId: string; sessionId: string; error: string };
```

## 9.3 Domain entities

The engine should own stable Relay-native IDs and map provider-specific IDs internally.

### Core entities

- **Session**  
  A long-lived conversational/work context in Relay.
- **Message**  
  User, assistant, or system content visible in the transcript.
- **Run**  
  A single execution attempt triggered by a user message, dispatch task, or schedule.
- **Run step**  
  A structured unit of work within a run.
- **Approval request**  
  A pending consequential action requiring operator input.
- **Artifact**  
  A deliverable or material side effect tied to a run.
- **Schedule**  
  A persisted recurring run definition.
- **Provider state**  
  Adapter-specific serialized state for session continuity.

### Important rule

Relay session IDs are canonical.  
Provider thread/conversation IDs are implementation detail.

---

## 10. Provider-neutral engine design

The engine must be provider-neutral without pretending all providers behave the same.

## 10.1 Adapter interface

```ts
export interface ProviderAdapter {
  readonly id: string;
  readonly label: string;

  listModels(): Promise<ModelDescriptor[]>;
  capabilities(): ProviderCapabilities;

  startRun(input: ProviderRunInput): AsyncIterable<ProviderEvent>;
  resumeRun(input: ProviderResumeInput): AsyncIterable<ProviderEvent>;
  cancelRun(providerRunId: string): Promise<void>;
}
```

## 10.2 Provider event normalization

Adapters should normalize provider-specific output into a common internal shape:

```ts
export type ProviderEvent =
  | { type: 'text.delta'; text: string }
  | { type: 'text.completed'; text: string }
  | { type: 'tool.request'; request: ToolRequest }
  | { type: 'usage'; usage: NormalizedUsage }
  | { type: 'checkpoint'; state: unknown }
  | { type: 'completed' }
  | { type: 'failed'; error: string };
```

## 10.3 Provider strategy

### Recommended v1

Start with **one strong adapter**, but do not hard-code it into the engine.

Recommended first adapter:

- `providers/anthropic-agent-sdk/`

Reason:
- fastest path to strong agentic behavior
- already close to the workflows Relay wants
- lets us avoid inventing low-level agent loop behavior in phase 1

### Recommended v2

Add one generic tool-calling adapter:

- `providers/openai-responses/` or equivalent generic tool-call adapter

This proves provider neutrality at the engine boundary without over-engineering the first milestone.

## 10.4 Important rule

Provider neutrality should exist at the **Relay Engine contract**.  
It does **not** mean every provider exposes identical semantics or equal capabilities.

Use capability flags for differences:

```ts
export type ProviderCapabilities = {
  streamingText: boolean;
  toolCalling: boolean;
  nativeSubAgents: boolean;
  resumableRuns: boolean;
  usageReporting: boolean;
};
```

---

## 11. Tool and action model

This is the most important part of “mesh seamlessly.”

## 11.1 Principle

The model should not receive unrestricted direct host mutation powers.

Instead:

- safe read-only operations can be executed directly through host-read tools
- consequential actions become **structured action proposals**
- Relay shows approvals
- Electron host executes approved actions
- the engine resumes with the receipt

## 11.2 Tool classes

### A. Direct read tools (safe enough to execute immediately)

Examples:

- `read_file`
- `list_dir`
- `stat_path`
- `search_files`
- `read_memory`
- `fetch_get` (optional, policy-controlled)

### B. Proposal tools (must create an approval request or policy decision)

Examples:

- `create_file`
- `append_file`
- `edit_file`
- `rename_path`
- `delete_path`
- `shell_exec`
- `fetch_mutating`
- `send_external_message`
- `connector_write`

### C. Sandbox/workbench tools (later phase)

Examples:

- browser automation
- long-running shell execution
- package install
- git operations in isolated clone
- code execution in a workbench directory/container

## 11.3 Proposed action shape

```ts
export type ProposedAction =
  | {
      id: string;
      type: 'create_file' | 'append_file' | 'edit_file' | 'rename' | 'delete';
      projectId?: string;
      workspaceRoot: string;
      path: string;
      summary: string;
      preview?: string;
      riskLevel: 'low' | 'medium' | 'high' | 'critical';
      scopeId: string;
      payload: Record<string, unknown>;
    }
  | {
      id: string;
      type: 'shell_exec';
      projectId?: string;
      workspaceRoot: string;
      path: string;
      summary: string;
      preview?: string;
      riskLevel: 'high' | 'critical';
      scopeId: string;
      payload: {
        command: string;
        timeoutMs?: number;
      };
    }
  | {
      id: string;
      type: 'web_fetch';
      path: string;
      summary: string;
      preview?: string;
      riskLevel: 'medium' | 'high';
      scopeId: string;
      payload: {
        url: string;
        options?: Record<string, unknown>;
      };
    };
```

## 11.4 Approval state machine

```text
proposed
  ├─> auto-approved (policy)
  ├─> pending-approval
  │     ├─> approved -> executing -> executed -> settled
  │     ├─> rejected -> settled
  │     └─> expired  -> settled
  └─> denied-by-policy -> settled
```

## 11.5 Mapping to existing Relay UI types

The current UI types should be preserved where possible:

- `PendingApprovalAction`
- `LocalActionType`
- `LocalActionReceipt`
- `SafetyPermissionScope`
- `CoworkArtifact`
- `CoworkProjectTask`

The internal engine should feed these existing UI concepts rather than inventing an entirely new product vocabulary.

## 11.6 Transitional compatibility

During migration, Relay can keep parsing `relay_actions` if needed.

Final target:

- the engine emits `approval.requested` and `action.receipt` events directly
- the renderer stops parsing assistant text for executable actions

---

## 12. Persistence and local data model

The engine needs a durable local store.

## 12.1 Store choice

Use a **SQLite-backed event journal + state tables** in the engine process.

Suggested location:

- `app.getPath('userData')/relay-engine.db`

Driver choice:

- prefer a runtime-supported SQLite option that packages cleanly with Electron
- if native module packaging becomes painful, choose the least operationally risky alternative and keep the DB access behind a repository layer

## 12.2 Tables / collections

Minimum durable entities:

- `sessions`
- `messages`
- `runs`
- `run_steps`
- `run_events`
- `approval_requests`
- `approval_decisions`
- `action_receipts`
- `artifacts`
- `schedules`
- `memory_entries`
- `provider_states`
- `engine_settings`

## 12.3 What remains outside the engine DB initially

These can remain UI/main-process owned initially:

- window/UI preferences
- theme/style settings
- onboarding completion flags
- some local recents / presentation state

## 12.4 What should migrate into the engine DB

These should become engine-owned:

- session transcript
- run history
- approval history
- artifacts
- schedules
- durable task state
- provider session state
- long-lived memory entries used in prompting

---

## 13. Scheduling model

## 13.1 Ownership

The scheduler should move from OpenClaw to the Relay Engine.

## 13.2 Schedule entity

A schedule should define:

- name
- cron or interval expression
- target session or project
- prompt template
- provider/model profile
- approval profile
- enabled flag
- next fire time
- misfire policy
- last outcome

## 13.3 Execution behavior

A scheduled trigger creates a normal run.  
That means scheduled runs reuse all the same machinery:

- run creation
- event streaming
- approvals
- artifacts
- usage
- completion notifications

## 13.4 Initial scope

v1 scheduler only needs to run while the app/process is active.

Future phase:

- tray/background process
- launch-at-login
- optional headless worker

---

## 14. Memory and context assembly

Relay’s memory system should become engine-owned over time.

## 14.1 Context layers

For each run, the engine should assemble context from:

1. global operator preferences
2. project/workspace metadata
3. memory entries
4. recent transcript
5. run-specific prompt
6. adapter/provider instructions
7. active approval policy

## 14.2 Prompt policy

Keep provider-neutral system context in the engine.

Example context layers:

- Relay operator desk instructions
- project guardrails
- response/output style
- approval policy explanation
- tool-use contract
- artifact expectations

## 14.3 Important rule

Approval policy must be conveyed both:

- in the prompt/tool contract
- in the engine’s actual enforcement logic

The model should be informed, but the engine/host must enforce.

---

## 15. Security and trust boundaries

## 15.1 Trust model

### Renderer
- untrusted presentation layer
- should not hold raw provider credentials
- should not perform host mutation directly

### Electron main
- trusted host boundary
- owns secure storage, local execution, notifications, path policy

### Engine
- semi-trusted orchestration layer
- can request reads and propose writes
- should not bypass main-process policy

## 15.2 Secret storage

Provider credentials should **not** be stored in plain JSON config.

Recommended design:

- config file stores provider profile metadata and credential reference IDs
- actual secrets live in OS credential store / encrypted storage managed by Electron main

## 15.3 Workspace safety

Reuse the current path safety controls from `electron/main.ts`:

- enforce “path must remain inside project root”
- block symlink escape routes
- preserve blocked basenames / path validation
- keep shell execution rooted to project workspace unless explicitly allowed

## 15.4 Future workbench

A future workbench should handle higher-risk execution:

- browser automation
- long shell tasks
- package installation
- code execution outside the main workspace

But do not block the internal engine migration on this.

---

## 16. Recommended repo layout

Do **not** start by converting Relay into a large multi-package workspace if that would slow down delivery.

Recommended approach:

- keep one repo
- introduce clear internal package boundaries by directory
- split into workspaces later only if needed

## 16.1 Suggested structure

```text
electron/
  main.ts
  preload.ts
  engine-host.ts
  credentials.ts
  host-actions.ts

src/
  app-types.ts
  lib/
    engine-client.ts
    host-file-service.ts
    runtime-types.ts
  features/
    chat/
    cowork/
    approvals/
    schedules/
    settings/

engine/
  bootstrap.ts
  transport/
    protocol.ts
    parent-bridge.ts
  core/
    orchestrator.ts
    sessions.ts
    runs.ts
    approvals.ts
    artifacts.ts
    schedules.ts
    memory.ts
  providers/
    provider.ts
    anthropic-agent-sdk/
    openai-responses/
  tools/
    read-tools.ts
    proposal-tools.ts
  db/
    schema.ts
    migrations/
    repositories/
  testing/
    scripted-provider.ts

tests/
  engine/
  e2e/
    mock-engine.mjs
```

## 16.2 Build outputs

Add a dedicated engine build target:

- `dist-engine/`

Recommended scripts:

```json
{
  "scripts": {
    "dev:engine": "tsc -p tsconfig.engine.json --watch",
    "build:engine": "tsc -p tsconfig.engine.json",
    "test:engine": "node --test dist-engine/tests/**/*.test.js"
  }
}
```

Update existing scripts so `dev` and `build` include the engine.

---

## 17. File-by-file migration plan

## 17.1 `src/lib/openclaw-gateway-client.ts`

### Action
Freeze this file, then replace it with a new `src/lib/engine-client.ts`.

### Migration path
1. Introduce a provider-neutral `EngineClient` interface.
2. Add a temporary `OpenClawRuntimeAdapter` that implements `EngineClient` by delegating to the existing gateway client.
3. Move UI consumers off direct OpenClaw types.
4. Once the internal engine is working, delete the adapter and the gateway client.

### Why
This is the cleanest way to decouple the UI before replacing the backend.

## 17.2 `src/lib/file-service.ts`

### Action
Replace with a simpler host-oriented file abstraction.

### Migration path
1. Keep the local branch.
2. Remove the gateway `workspace.*` path from the main architecture.
3. Rename to something like `host-file-service.ts`.
4. Make the engine call host-read actions through the main process instead of pretending remote workspace RPCs are the long-term model.

### Why
Relay’s internal engine makes local host execution the primary path.

## 17.3 `electron/main.ts`

### Action
Refactor this file into smaller host modules.

### New responsibilities
- spawn/supervise engine process
- secure credential access
- config migration
- host action executor
- notifications

### Remove / retire
- OpenClaw gateway discovery
- OpenClaw binary probing
- workspace plugin install/check
- gateway-only health messaging
- `openclaw-config.json`

## 17.4 `src/app-types.ts`

### Action
Replace gateway-centric types with runtime/provider-neutral types.

### Add
- `ProviderDescriptor`
- `ModelDescriptor`
- `EngineHealth`
- `SessionSummary`
- `SessionDetail`
- `RunSummary`
- `ApprovalRequest`
- `ScheduleSummary`

### Keep where useful
- `ChatMessage`
- `MessageUsage`
- `PendingApprovalAction`
- `LocalActionReceipt`
- `CoworkArtifact`
- `SafetyPermissionScope`

## 17.5 `tests/e2e/mock-gateway.mjs`

### Action
Replace with `tests/e2e/mock-engine.mjs` or an in-process scripted engine fixture.

### Goal
The E2E suite should no longer depend on WebSocket gateway semantics to prove Relay’s core UX.

## 17.6 `tests/e2e/approval-flow.spec.ts`

### Action
Retarget this suite to the internal engine.

### Goal
Keep the same UX assertions:

- prompt sent
- pending approval appears
- reject requires a reason
- approve executes local action
- file content changes
- receipts appear in UI

But remove dependency on gateway messaging.

---

## 18. Configuration migration plan

## 18.1 Current config problem

`electron/main.ts` currently uses:

- `openclaw-config.json`
- `gatewayUrl`
- `gatewayToken`

This is now the wrong abstraction.

## 18.2 New config shape

Suggested file:

- `relay-config.json`

Suggested contents:

```json
{
  "runtimeMode": "internal",
  "defaultProviderId": "anthropic",
  "defaultModel": "",
  "providers": [
    {
      "id": "anthropic",
      "enabled": true,
      "credentialRef": "provider:anthropic:default"
    }
  ],
  "features": {
    "backgroundRuns": false,
    "workbench": false
  }
}
```

## 18.3 Migration behavior

On first launch after the engine migration:

1. If `relay-config.json` exists, use it.
2. Else if `openclaw-config.json` exists:
   - read it
   - migrate safe fields into the new config where useful
   - archive the old file
3. Leave unrelated localStorage/UI preferences untouched.

## 18.4 Settings UI changes

Replace **Gateway** settings with:

- **Engine**
  - engine status
  - data location
  - background run options
- **Providers**
  - provider enable/disable
  - model selection
  - credential setup
- **Workspaces**
  - default project roots
  - trust policy
- **Safety**
  - approval scopes and defaults

---

## 19. Implementation phases

The migration should happen in layers so the app keeps working throughout.

## Phase 1 — Extract a Relay-native runtime contract

### Objective
Decouple the renderer from OpenClaw without changing product behavior yet.

### Tasks
1. Define `EngineClient` and `EngineEvent`.
2. Add `OpenClawRuntimeAdapter implements EngineClient`.
3. Replace direct `OpenClawGatewayClient` usage in the renderer with `EngineClient`.
4. Replace gateway-shaped type imports in UI code.
5. Add a runtime feature flag:
   - `runtime=openclaw`
   - `runtime=internal`

### Deliverables
- `src/lib/engine-client.ts`
- `src/lib/runtime-types.ts`
- temporary `src/lib/openclaw-runtime-adapter.ts`

### Acceptance criteria
- Existing UI compiles against `EngineClient`.
- Existing E2E tests still pass using the adapter.
- No renderer component imports `OpenClawGatewayClient` directly.

### Why this phase matters
It shrinks the replacement problem from “rewrite Relay” to “swap an implementation behind a stable interface.”

---

## Phase 2 — Add the internal engine process skeleton

### Objective
Create a real internal runtime boundary without yet shipping a real model provider.

### Tasks
1. Add `electron/engine-host.ts`.
2. Spawn/supervise an internal engine worker process.
3. Define parent/child transport:
   - request/response
   - event stream
4. Implement a deterministic scripted provider / fake engine.
5. Expose engine methods through preload to the renderer.
6. Add internal engine health checks.

### Deliverables
- `engine/bootstrap.ts`
- `engine/transport/*`
- `engine/testing/scripted-provider.ts`
- `tests/e2e/mock-engine.mjs` or equivalent

### Acceptance criteria
- Relay can start with `runtime=internal`.
- The internal engine can create a session and stream a canned response.
- The renderer receives engine events through the new transport.

### Notes
Do not bring in real provider complexity yet. First prove process boundaries and transport.

---

## Phase 3 — Move approvals and host execution onto the internal engine

### Objective
Make the current approval loop work end-to-end with the internal engine.

### Tasks
1. Define `ProposedAction` and `ApprovalRequest`.
2. Change the engine to emit `approval.requested` events directly.
3. Keep current `relay_actions` parsing only as a temporary fallback.
4. Add an engine-owned approval state machine.
5. Route approved actions to Electron host executors.
6. Persist action receipts and feed them back into the run.

### Deliverables
- `engine/core/approvals.ts`
- `engine/tools/proposal-tools.ts`
- `electron/host-actions.ts`

### Acceptance criteria
- The existing approval-flow E2E behavior works with `runtime=internal`.
- A proposal appears as a pending approval card.
- Reject requires a reason.
- Approve triggers the existing local action executor.
- The file change is visible on disk.
- A structured receipt is attached to the run.

### Important rule
At the end of this phase, Relay should no longer need assistant-text JSON to drive approvals when the internal engine is active.

---

## Phase 4 — Add durable runtime state

### Objective
Make the internal engine restart-safe.

### Tasks
1. Add SQLite-backed repositories.
2. Persist:
   - sessions
   - messages
   - runs
   - approvals
   - artifacts
   - schedules
3. Add engine startup recovery:
   - reload active sessions
   - mark interrupted runs appropriately
4. Move durable task state out of localStorage.

### Deliverables
- `engine/db/*`
- migration framework
- repository layer
- startup rehydration

### Acceptance criteria
- Restarting Relay preserves session history.
- Approval history survives restart.
- Artifacts remain visible after restart.
- Interrupted runs are marked as interrupted or resumable, not silently lost.

---

## Phase 5 — Add the first real provider adapter

### Objective
Deliver real agentic capability without OpenClaw.

### Tasks
1. Implement `providers/anthropic-agent-sdk/` (recommended first).
2. Normalize model listing into `ModelDescriptor`.
3. Normalize usage/cost into `MessageUsage`.
4. Store provider credentials securely through Electron main.
5. Add per-session provider/model selection.

### Deliverables
- provider adapter
- provider settings UI
- credential plumbing

### Acceptance criteria
- A real provider can run a prompt end-to-end through the internal engine.
- Streaming text works.
- Tool/proposal flow works.
- Usage is recorded on the run.

### Important implementation choice
Do not let provider SDK details leak into the renderer contract.

---

## Phase 6 — Move scheduler and dispatch onto the internal engine

### Objective
Replace OpenClaw cron behavior with Relay-owned scheduling.

### Tasks
1. Implement schedule CRUD in the engine.
2. Add scheduler loop.
3. Reuse normal run creation for scheduled triggers.
4. Emit notifications on run completion.
5. Store last/next run state.

### Deliverables
- `engine/core/schedules.ts`
- scheduler persistence
- schedule UI integration

### Acceptance criteria
- A schedule can be created in the UI.
- The engine fires the schedule while the app is active.
- Completion produces artifacts and notifications.
- Failures appear in run history and audit trail.

---

## Phase 7 — Remove OpenClaw from the product

### Objective
Finish the re-platform and simplify the repo.

### Tasks
1. Remove `OpenClawGatewayClient`.
2. Remove OpenClaw discovery and plugin management.
3. Remove gateway-only config and settings.
4. Remove origin-rewrite logic that only existed for gateway allowlists.
5. Delete legacy gateway test harnesses.
6. Rename residual types/files/docs.

### Deliverables
- cleaned repo
- cleaned settings
- new onboarding
- updated README/docs

### Acceptance criteria
- New install of Relay does not mention OpenClaw in the main product flow.
- No OpenClaw binary is required.
- No gateway URL is required.
- No runtime-critical code path depends on OpenClaw.

---

## Phase 8 — Optional advanced workbench and multi-provider expansion

### Objective
Add stronger execution environments and broader provider support after parity.

### Tasks
1. Add isolated workbench abstraction.
2. Add browser/computer-use runner.
3. Add second provider adapter.
4. Add provider routing policies.
5. Add optional background launch-at-login mode.

### This phase is optional for the initial migration
Do not block the core replacement on it.

---

## 20. Recommended sequencing constraints

These constraints matter more than any individual filename.

### Constraint 1
**Do not rewrite the UI and runtime simultaneously.**  
Extract the runtime contract first.

### Constraint 2
**Do not make provider neutrality block v1.**  
Ship one strong adapter first, but preserve a neutral engine contract.

### Constraint 3
**Do not move host execution into the engine.**  
The engine should request execution; Electron main should perform it.

### Constraint 4
**Do not block migration on sandbox/workbench work.**  
Reuse existing local host actions first.

### Constraint 5
**Do not keep text-parsed `relay_actions` as the long-term design.**  
Use it only as a transitional compatibility path.

---

## 21. Testing strategy

The test plan must change with the architecture.

## 21.1 Unit tests

### Engine core
- session lifecycle
- run lifecycle
- approval state machine
- artifact creation
- scheduler calculations
- persistence repositories

### Provider adapters
- event normalization
- usage normalization
- tool request mapping
- checkpoint/resume behavior

## 21.2 Contract tests

Create a provider contract suite that every adapter must pass:

- text streaming
- tool request emission
- completion behavior
- cancellation behavior
- failure behavior
- usage reporting shape

## 21.3 Host action tests

Retain and expand current smoke tests for:

- create file
- append file
- rename
- delete
- shell exec
- web fetch

These are a core safety boundary.

## 21.4 E2E tests

Replace gateway-driven tests with engine-driven tests.

Critical user journeys:

1. **Chat**
   - create session
   - send message
   - stream assistant text
   - cancel run

2. **Cowork approval**
   - proposal appears
   - reject with reason
   - approve
   - file changes on disk
   - receipt appears

3. **Dispatch**
   - prompt becomes background run
   - run completes
   - artifact visible
   - notification triggered

4. **Schedule**
   - create schedule
   - scheduler fires
   - run recorded

5. **Restart recovery**
   - run history survives restart
   - approvals and artifacts remain visible

## 21.5 Regression target

At minimum, the current approval E2E semantics should continue to pass after the migration.

---

## 22. Risks and mitigations

| Risk | Why it matters | Mitigation |
|---|---|---|
| UI/runtime rewrite too large | Could stall the project | extract `EngineClient` first |
| Provider lock-in reappears | defeats goal | keep provider-neutral engine interfaces and capability flags |
| Engine bypasses approvals | destroys governance model | keep all consequential execution in Electron main |
| Native dependency packaging pain | can slow Electron builds | isolate DB/credential implementations behind interfaces |
| Restart/resume complexity | sessions/runs become unreliable | add event journal and explicit interrupted-run recovery |
| Scheduler scope balloons | delays parity | limit v1 to “while app active” |
| Workbench ambition delays core migration | too much surface area | defer sandbox/browser phase |
| Secrets leak into renderer | security issue | keep provider credentials in main-process secure storage |
| Legacy OpenClaw assumptions linger in UI | product confusion | finish cleanup phase and update onboarding/settings/docs |

---

## 23. Definition of done

The migration is complete when all of the following are true:

1. Relay starts and runs without OpenClaw installed.
2. Relay no longer requires a gateway URL or token for core product flows.
3. Chat, cowork, approvals, artifacts, and scheduling work through the internal engine.
4. The renderer talks only to `EngineClient`, not to OpenClaw-specific classes.
5. Consequential actions are proposed by the engine and executed by host services.
6. Runs, approvals, and artifacts persist across app restarts.
7. At least one real provider adapter works end-to-end.
8. The current approval UX remains intact or improves.
9. OpenClaw-specific discovery/plugin/config code is removed from the product path.
10. The repo’s main documentation describes Relay as a self-contained product with an internal engine.

---

## 24. Recommended first milestone

If this work starts now, the first milestone should be narrowly scoped:

### Milestone A — “Approval loop without OpenClaw”

Deliver just enough internal engine to prove the central product loop:

1. create session
2. send prompt
3. engine proposes structured file action
4. approval appears in UI
5. approve executes local file action
6. receipt and artifact appear in run history

This is the right first milestone because it proves:

- process architecture
- engine contract
- approval model
- host execution reuse
- value of the replacement

If Milestone A is solid, the rest is mostly expansion, persistence, and provider work.

---

## 25. Final recommendation

Proceed with the migration.

### Recommended architecture
- **single Relay repo**
- **internal Relay Engine**
- **provider-neutral engine contract**
- **Electron main as host executor**
- **first-class approval workflow**
- **one strong provider adapter first**
- **OpenClaw removed after parity is proven**

### Recommended implementation order
1. extract runtime contract
2. add internal engine skeleton
3. move approvals onto engine + host actions
4. add persistence
5. add first real provider
6. move scheduler
7. remove OpenClaw
8. add advanced workbench later

This is feasible, coherent, and better aligned with what Relay is actually trying to be than keeping an external agent harness at the center of the product.
