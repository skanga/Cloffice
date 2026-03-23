# Relay MVP Alignment Checklist

Use this checklist to keep product, engineering, and UX aligned on the MVP scope. The canonical spec is RELAY-MVP-DEFINITION.md.

## Source of Truth

- [ ] Confirm RELAY-MVP-DEFINITION.md is canonical.
- [ ] Ensure RELAY-MVP-QUICK-REFERENCE-REVISED.md and RELAY-MVP-QUICK-REFERENCE.md match the canonical doc.

## Scope Guardrails

- [ ] Copilot core remains generic (chat, steering, execution, results, history).
- [ ] Only one production recipe in MVP: finance spend approvals.
- [ ] Chat-first cowork UX, not forms-first.
- [ ] No multi-workflow builder.
- [ ] No Slack-first operation model.
- [ ] No scheduled tasks in MVP.
- [ ] No advanced RBAC/policy studio.

## Access Model

- [ ] Local no-login mode works end-to-end.
- [ ] Hosted sign-in is optional and only for hosted services.
- [ ] Core cowork UX is never blocked by login.

## Architecture Contract

- [ ] Relay is UI only; OpenClaw executes.
- [ ] Claude runs inside OpenClaw, not in Relay.
- [ ] Reasoning, policy checks, connectors live in OpenClaw.
- [ ] Relay shows reasoning, progress, and audit trail.

## Required Screens (6)

- [ ] Chat: message history + streaming response.
- [ ] Steering: /yes /no /modify /details /hold + free input.
- [ ] Details: right panel with context + reasoning.
- [ ] Execution: real-time progress; non-blocking chat.
- [ ] Results: summary + suggested next steps.
- [ ] History: past conversations + audit log.

## UX Behavior Contract

- [ ] Concise first; summarize + recommend next action.
- [ ] Transparent: show rationale, policy reference, confidence.
- [ ] Interruptible: user can redirect at any time.
- [ ] Safe-by-default: confirm before irreversible actions.
- [ ] Stateful: preserve context across turns.

## Engineering Deliverables

- [ ] WebSocket streaming from OpenClaw.
- [ ] Steering actions wired to OpenClaw re-reasoning.
- [ ] Execution steps with progress states.
- [ ] Results and audit trail view.
- [ ] Local settings for OpenClaw endpoint + health check.

## Pilot Readiness

- [ ] End-to-end copilot run works locally (task -> steer -> execute -> results).
- [ ] End-to-end finance approval recipe works locally.
- [ ] Clear audit trail per run.
- [ ] Basic error handling and retries.
- [ ] Performance acceptable for pilot users.
