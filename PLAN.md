# PLAN.md - Cloffice Internal Engine Status and Remaining Plan

## 1. Current decision

Cloffice now runs on a Cloffice-owned internal engine.

This is the current architecture in practice:

- Renderer: chat, cowork, schedules, approvals, activity, diagnostics
- Electron main: trusted host boundary, config, secure secret storage, file and shell actions, notifications, internal runtime host
- Internal engine: sessions, runs, approvals, provider adapters, artifacts, scheduler, retention, diagnostics

Important reality update:

- The internal engine currently lives in the Electron main process and is exposed through the preload bridge.
- The earlier plan for a separate supervised worker or utility process is still optional future work, not current product behavior.

## 2. What is complete

The following are now complete enough to be considered product reality:

- Internal engine is the default and only runtime path
- External compatibility discovery and plugin setup are removed from the product flow
- Provider-backed chat works through the internal engine
- Provider-backed cowork works through the internal engine
- Approvals and host execution work through the internal engine
- Durable state exists for sessions, runs, artifacts, approvals, and schedules
- Internal scheduler is productized enough for real use
- Config storage is Cloffice-native
- Provider secrets are no longer stored in plain config JSON
- Runtime diagnostics, retention controls, and cowork normalization analytics are in place

## 3. Provider status

Current provider support:

- OpenAI-compatible providers, including custom base URL flows such as Groq or OpenRouter
- Anthropic
- Gemini

Current provider-backed cowork quality work already in repo:

- response normalization tracking
- per-provider normalization breakdowns
- per-provider daily trend history
- fallback hotspot diagnostics by model
- regression coverage for normalization classes and provider-specific prompt shaping

## 4. Scheduler status

Internal scheduler status:

- create, edit, pause, resume, delete
- run now, duplicate, bulk actions
- import and export
- retention controls
- project and model grouping
- health and metrics rollups
- schedule history and counters
- scheduled cowork approval recovery visibility
- activity and developer drill-down from schedule runs

## 5. What changed from the original migration plan

The repo no longer matches several assumptions in the original migration document:

- Runtime migration work is complete and the product is internal-engine-first
- The engine is not a separate engine package or worker process today
- The product is already internal-engine-first, not in a temporary compatibility state
- Much of the earlier file-by-file migration plan is now historical

## 6. Remaining high-value work

These are the highest-value remaining runtime items.

### A. Provider and cowork quality

- keep reducing synthetic fallback rates
- improve provider-specific prompt shaping where needed
- add more direct visibility into normalization regressions over time
- strengthen engine-core tests around cowork continuation and action-loop quality

### B. Runtime hardening

- decide whether to keep the engine inside Electron main or move to a supervised worker process
- if moved, preserve the current engine contract and host-execution boundary
- continue tightening restart, interruption, and recovery behavior where useful

### C. Ongoing maintenance

- keep docs aligned with the current internal-engine architecture
- continue simplifying old migration commentary where it no longer adds value

## 7. Definition of done for the migration

The migration should be treated as complete when all of the following are true:

- Cloffice runs without any external compatibility runtime installed or configured
- core product flows depend only on the internal engine
- chat, cowork, approvals, artifacts, and schedules work through the internal engine
- provider secrets stay out of plain config files
- retained runtime state survives restart in a predictable way
- docs describe the current architecture instead of the migration target
- active config and storage naming is Cloffice-native

## 8. Recommended next work

Recommended order from here:

1. continue provider and cowork quality hardening
2. decide whether a separate engine worker process is still worth the packaging and supervision cost
3. refresh architecture and contributor docs again if that process-boundary decision changes

## 9. Status summary

Overall migration status: complete enough to treat the product as fully migrated.

Practical estimate:

- core runtime migration: complete
- rebrand and product-path cutover: complete
- remaining work: hardening and optional process-boundary work
