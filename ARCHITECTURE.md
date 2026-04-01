# ARCHITECTURE.md - Cloffice

## 1. What Cloffice is

Cloffice is a local-first AI coworker desktop app. It combines chat, cowork, governed approvals, scheduling, artifacts, runtime activity, and provider-backed execution in a single desktop product.

Cloffice is a Cloffice-owned local-first desktop product built around an internal engine.

## 2. Current architecture decision

Cloffice currently has two real runtime layers and one UI layer:

1. Renderer
2. Electron main
3. Internal engine hosted inside Electron main

This is the architecture that exists in the repo today.

Important clarification:

- The earlier migration plan discussed a separate engine worker or utility process.
- That is not the current implementation.
- The current implementation keeps the internal engine inside Electron main and exposes it through preload and IPC.

That means the product already has a Cloffice-owned runtime boundary, but not a separate process boundary.

## 3. High-level runtime model

```text
Renderer (React/Vite UI)
  chat · cowork · approvals · schedules · activity · settings · artifacts
        |
        | preload bridge / IPC
        v
Electron Main
  config · secure secret storage · notifications · filesystem · shell · web fetch
  internal engine host
        |
        v
Internal Engine
  sessions · runs · approvals · provider adapters · scheduler · artifacts · retention · diagnostics
```

## 4. Responsibilities by layer

### 4.1 Renderer

The renderer is the operator-facing control plane.

It owns:

- chat and cowork interfaces
- session navigation
- pending approval UI
- schedule management UI
- activity and diagnostics views
- artifact presentation
- settings and provider setup
- workspace and project UX

It does not own:

- durable runtime truth
- provider API orchestration
- scheduler execution
- direct high-trust host actions

### 4.2 Electron main

Electron main is the trusted host boundary.

It owns:

- filesystem access
- shell execution
- web fetch under host policy
- notifications
- desktop integration
- config loading and saving
- secret storage and hydration
- the internal engine host
- preload bridge methods exposed to the renderer

Electron main is also where Cloffice currently enforces the consequential host-action boundary.

### 4.3 Internal engine

The internal engine is the runtime and orchestration layer.

It owns:

- sessions
- messages and streamed events
- runs and run history
- provider-backed chat and cowork execution
- approval state and recovery
- artifacts and receipts
- scheduler state and triggers
- runtime retention and diagnostics
- provider normalization and cowork quality analytics

The internal engine is currently embedded in Electron main. It is an internal subsystem, not a separate shipped service.

## 5. Governance model

Cloffice follows a strict governance rule:

> The model may propose. Cloffice governs. The host executes.

In practice this means:

1. provider-backed runs produce text, structured state, and action proposals
2. the engine records and exposes pending approvals
3. the renderer presents the approval decision to the operator
4. Electron main executes approved host actions
5. results and receipts are recorded back into the run

This is the core product model for consequential actions.

## 6. Provider model

Cloffice is provider-neutral at the runtime boundary.

Current provider support:

- OpenAI-compatible providers
- Anthropic
- Gemini

OpenAI-compatible flows can also target compatible base URLs such as Groq or OpenRouter through the same internal adapter path.

Provider-specific behavior is normalized inside the internal engine. The renderer does not depend on provider SDK contracts directly.

## 7. Chat and cowork model

### 7.1 Sessions

Sessions are the durable user-facing unit.

They include:

- session kind such as `chat` or `cowork`
- title
- selected model
- history
- related runs

### 7.2 Runs

Runs are execution attempts inside a session.

They include:

- run id
- run status
- streamed output
- provider metadata
- approval state
- receipts and artifacts
- summary and diagnostics

### 7.3 Cowork normalization

Provider-backed cowork runs carry normalization metadata so Cloffice can distinguish:

- provider-structured output
- normalized section output
- synthetic fallback output

That metadata is used in developer diagnostics and activity analytics.

## 8. Approvals and host actions

Approvals are first-class runtime entities.

Supported behavior already exists for:

- pending approval creation
- approval and rejection
- rejection reasons
- receipt recording
- restart-safe approval recovery
- scheduled cowork approval visibility

Host action execution remains on the trusted Electron side.

## 9. Persistence model

Durable runtime state is internal-engine-owned.

Persisted state includes:

- sessions
- messages
- runs
- artifacts
- pending approvals
- schedules
- schedule run history and counters
- runtime retention policy

Cloffice also applies runtime-owned pruning for retained run and artifact history.

## 10. Scheduling model

The scheduler is now a Cloffice-owned internal runtime feature.

Current supported capabilities include:

- create, edit, pause, resume, delete
- run now
- duplicate
- bulk actions
- import and export
- grouped schedule views by project and model
- health and metrics rollups
- retained schedule history and counters
- scheduled cowork approval recovery

Schedules are internal runtime entities, not renderer-owned timers.

## 11. Configuration and secrets

Cloffice now uses a Cloffice-native config path.

Current behavior:

- main config file is `cloffice-config.json`
- provider API keys are stripped from plain config writes
- provider secrets are stored separately on the Electron side and rehydrated on read

This means provider secrets are no longer stored in plain JSON config.

## 12. Diagnostics and observability

Cloffice exposes strong runtime diagnostics in-product.

Current visibility includes:

- runtime readiness and counts
- recent internal runs
- retention policy and retained counts
- schedule metrics and health rollups
- activity timeline for scheduled and runtime events
- cowork normalization totals
- per-provider normalization breakdowns
- per-provider daily trend history
- fallback hotspots by model
- recent fallback runs

## 13. What is no longer part of the architecture

The following are no longer part of the live product architecture:

- external compatibility runtime paths
- compatibility discovery and plugin-install flows
- gateway URL or gateway token as a required core setup concept
- compatibility-specific transport or session management in the product path

## 14. Remaining architecture decisions

The largest architectural decision still open is whether Cloffice should keep the internal engine embedded in Electron main or move it into a separate supervised worker or utility process.

Reasons you might keep the current approach:

- simpler packaging
- fewer supervision and transport concerns
- current product behavior is already working

Reasons you might still move it out later:

- stronger crash isolation
- tighter resource supervision
- clearer trust and operational boundaries

That is now a hardening choice, not a prerequisite for the product architecture.

## 15. Short version

Cloffice today is:

- one desktop product
- one repo
- one Cloffice-owned internal runtime
- provider-backed for chat and cowork
- governed by approvals
- local-first by default
- no longer dependent on any external compatibility runtime for core behavior
