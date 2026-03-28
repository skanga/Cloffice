# ARCHITECTURE.md — Cloffice

## 1. What Cloffice is

Cloffice is a **local-first AI coworker desktop app**. It unifies chat, workspace context, governed approvals, scheduling, artifacts, and autonomous execution in a single desktop product.

Cloffice is derived from Relay, but it is no longer architected as an Electron client for an external OpenClaw-compatible backend. Instead, Cloffice uses a **built-in internal engine** that ships with the app and runs locally.

---

## 2. Core architecture decision

Cloffice has three primary layers:

1. **Renderer (UI / control plane)**
2. **Electron Main (trusted host services)**
3. **Cloffice Engine (internal worker process)**

The renderer is where the user sees and controls work.
The Electron main process owns privileged host integration.
The internal engine owns orchestration, runs, provider adapters, scheduling, durable state, and structured action proposals.

This means Cloffice is a **single integrated product**, but it still keeps a strict internal execution boundary.

---

## 3. High-level process model

```text
┌──────────────────────────────────────────────────────────────┐
│ Renderer (React/Vite UI)                                    │
│ chat · cowork · approvals · schedules · artifacts · files   │
└──────────────────────────────┬───────────────────────────────┘
                               │
                               │ preload IPC / message port
                               ▼
┌──────────────────────────────────────────────────────────────┐
│ Electron Main (trusted host)                                │
│ config · keychain · notifications · file/shell/web actions  │
│ engine supervision                                           │
└──────────────────────────────┬───────────────────────────────┘
                               │
                               │ internal transport
                               ▼
┌──────────────────────────────────────────────────────────────┐
│ Cloffice Engine                                              │
│ sessions · runs · providers · approvals · scheduler · DB    │
│ event journal · artifacts · usage normalization              │
└──────────────────────────────┬───────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────┐
│ Provider adapters / optional workbench                      │
│ Anthropic · OpenAI · local model adapters · future sandbox  │
└──────────────────────────────────────────────────────────────┘
```

---

## 4. Responsibilities by layer

### 4.1 Renderer

The renderer is the **control plane**.

It owns:

- chat and cowork UI
- session lists and navigation
- pending approvals UI
- schedule/task UI
- artifact browser and previews
- settings screens
- activity and audit views
- local workspace browsing UX

The renderer does **not** own:

- long-running orchestration
- provider-specific agent loops
- durable runtime state
- direct high-trust host execution

The renderer should treat the engine as the authoritative runtime and Electron main as the authoritative host bridge.

### 4.2 Electron Main

Electron main is the **trusted host services layer**.

It owns:

- local filesystem actions
- shell command execution
- web fetch under host policy
- notifications
- OS integration
- secure credential access / keychain integration
- engine process launch, health supervision, and restart policy
- IPC bridges between renderer and engine

Electron main should remain intentionally small. It is privileged and should not absorb agent orchestration logic.

### 4.3 Cloffice Engine

The internal engine is the **runtime/orchestration layer**.

It owns:

- sessions
- runs
- messages and event stream state
- provider adapters
- action proposal generation
- scheduler and recurring tasks
- usage/cost normalization
- durable persistence
- resume/cancel logic
- future sub-agent orchestration
- artifact metadata and lifecycle

The engine is not a separate product. It is shipped as an internal subsystem.

---

## 5. Governance model

Cloffice is built around a strict principle:

> **The model may propose. Cloffice governs. The host executes.**

### 5.1 Direct execution is limited

The model and engine should not have broad, raw host powers by default.

High-trust actions must become **structured action proposals**, such as:

- create file
- append file
- rename file
- delete file
- run shell command
- send web request
- send external message

### 5.2 Approval flow

1. The engine determines that an action is needed.
2. The engine emits a structured `pending_action` proposal.
3. The renderer displays the proposal for approval.
4. Electron main executes the approved action.
5. The result is returned to the engine.
6. The run continues with that result in context.

This preserves auditability and makes approvals a first-class product behavior rather than an afterthought.

---

## 6. Provider-neutral engine contract

The engine must be provider-neutral at its public boundary.

The renderer should never depend directly on provider-specific runtime semantics. Instead, it should talk to the engine using a Cloffice-owned contract.

### 6.1 Engine capabilities

The engine contract should cover:

- list/create/update/archive sessions
- send user input into a session
- stream run events
- expose pending approvals
- receive approval decisions
- list and manage schedules
- expose artifacts
- report usage/cost and provider metadata
- cancel/resume runs
- expose health and diagnostics

### 6.2 Provider adapters

Provider-specific logic belongs inside adapters.

Examples:

- Anthropic adapter
- OpenAI adapter
- local model adapter
- future adapter for a workbench or browser-use runtime

The adapter translates provider-specific APIs and tool loops into the engine’s normalized event model.

---

## 7. Session and run model

Cloffice should distinguish clearly between **sessions** and **runs**.

### 7.1 Session

A session is the durable unit the user recognizes.

It includes:

- title
- mode (`chat`, `cowork`, later others)
- workspace context
- provider/model preferences
- schedule links
- message history
- artifact links

### 7.2 Run

A run is one execution instance inside a session.

It includes:

- run id
- start/end timestamps
- state (`queued`, `running`, `awaiting_approval`, `succeeded`, `failed`, `cancelled`)
- streamed events
- pending actions
- usage/cost data
- error information

This distinction is important for resumability, auditability, and future background/autonomous workflows.

---

## 8. Persistence

Durable state should be engine-owned, not renderer-owned.

### 8.1 Store

The default local store should be SQLite.

The engine should persist:

- sessions
- runs
- messages
- event journal
- pending/completed approvals
- schedules and task runs
- artifacts and artifact metadata
- provider usage and cost records
- settings that are runtime-scoped rather than UI-scoped

### 8.2 Local UI state

The renderer may keep ephemeral UI preferences in local storage or a lightweight client store, but runtime truth belongs in the engine database.

---

## 9. Scheduling

Scheduling is an engine concern.

The UI should manage schedules, but the engine should own:

- schedule definitions
- next-run computation
- run triggering
- task run records
- retry state
- pause/resume/cancel behavior

This avoids coupling schedules to a specific open window or renderer state.

---

## 10. Artifacts

Artifacts are first-class outputs of the engine.

Examples:

- generated files
- transformed documents
- code patches
- structured reports
- downloaded or derived assets

The engine should track artifact metadata, while Electron main handles trusted host-side file realization where needed.

---

## 11. Workspaces

Cloffice is local-first and workspace-aware.

### 11.1 Workspace role

A workspace gives the engine and UI context about where work is happening.

Examples:

- project folder
- selected files
- recent file operations
- repository metadata

### 11.2 Safety posture

Read access can be broader than write access.

A good default posture is:

- workspace reads allowed with user awareness
- workspace writes require explicit approval unless the user has broadened permissions
- destructive actions require strong confirmation or policy grant

---

## 12. Optional workbench / sandbox

The first engine version does not require a full sandbox product.

However, the architecture should reserve a place for a future **workbench** for:

- browser automation
- isolated shell execution
- containerized project operations
- risky autonomous flows

That workbench should sit below the engine as an execution substrate, not as the primary application runtime.

---

## 13. Failure model

Because the engine is a separate internal process, Cloffice can degrade gracefully.

### 13.1 Renderer failure

If the renderer reloads or crashes, the engine should be able to preserve session/run state.

### 13.2 Engine failure

If the engine fails, Electron main should be able to:

- detect failure
- show degraded-state UI
- restart the engine
- reconnect the renderer
- preserve durable state via the engine database

### 13.3 Host action failure

If a host action fails, the result should be attached to the corresponding run and surfaced in the approval/audit trail.

---

## 14. Security model

### 14.1 Principle of least privilege

Privileges should be concentrated in Electron main and narrowed by policy.

### 14.2 No blind autonomy for high-trust actions

The engine may reason about actions, but it should not silently perform host-destructive or externally consequential operations.

### 14.3 Clear audit trail

Every meaningful action should have:

- initiator context
- proposed action payload
- approval decision
- execution result
- timestamps

---

## 15. Repository shape

A target repo layout could look like this:

```text
/apps
  /desktop                # Electron + renderer app
/packages
  /engine-core            # sessions, runs, events, approvals, scheduler
  /engine-client          # typed client used by renderer/main
  /engine-provider-api    # provider-neutral interfaces
  /provider-anthropic     # first strong provider adapter
  /provider-openai        # later
  /host-bridge            # host action contracts and IPC schemas
  /shared-types           # normalized app/runtime types
  /test-fixtures          # mock engine, scripted providers
/docs
  PLAN.md
  ARCHITECTURE.md
  REBRAND_CHECKLIST.md
```

The exact folder names may differ, but the important boundary is architectural, not cosmetic.

---

## 16. Migration direction

Cloffice should migrate in this order:

1. Rebrand repo, package, app, docs, and visible product text.
2. Introduce a provider-neutral `EngineClient` abstraction.
3. Replace OpenClaw-specific gateway logic with an internal engine transport.
4. Move durable runtime state into the engine.
5. Replace text-parsed action blobs with structured pending actions.
6. Add the first real provider adapter.
7. Remove OpenClaw-specific setup, plugin, and discovery code.

---

## 17. Definition of the target state

Cloffice reaches the intended architecture when all of the following are true:

- the app no longer depends on OpenClaw-specific runtime contracts
- the UI talks only to a Cloffice-owned engine contract
- the engine runs as an internal worker/utility process
- provider adapters are replaceable behind a normalized interface
- high-trust actions flow through structured approvals
- sessions/runs/schedules/artifacts persist in an engine-owned store
- the user experiences one integrated product, not two stitched-together systems

---

## 18. Short version

Cloffice is:

- **one desktop product**
- **one integrated repo**
- **one built-in internal engine**
- **provider-neutral at the runtime boundary**
- **governed by approvals and host-side execution**
- **local-first by default**

That is the architecture the rest of the migration plan should serve.
