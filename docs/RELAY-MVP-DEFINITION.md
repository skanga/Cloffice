# Relay MVP Definition

Created: 2026-03-23
Status: Draft for implementation
Product shape: Claude-style cowork UX + OpenClaw backend orchestration

## 1. Product Definition
Relay is a chat-first cowork interface that helps operators run recurring, judgment-sensitive workflows with human control at every significant step.

Relay is not the runtime. OpenClaw is the runtime.

- Relay owns interaction: conversation, steering, visibility, and audit experience.
- OpenClaw owns execution: reasoning, policy checks, connector calls, and action orchestration.

## 2. Why This MVP
Research patterns that directly shape this MVP:

- Users want cognitive partnership, not just answers.
- Teams want cross-tool synthesis and action, not another dashboard.
- Trust blockers are reliability, hidden reasoning, and weak controls.
- Adoption improves when AI handles repetitive work and humans keep decision authority.

MVP goal: prove that a cowork UX can reduce decision latency and context switching while remaining auditable and safe.

## 3. Target User and Use Case
Primary ICP for MVP pilot:

- Founder-led digital businesses and lean ops teams.
- Finance or operations lead with approval responsibility.

First production recipe:

- Finance spend approvals with policy-aware recommendations and escalations.

## 4. MVP Scope
In scope:

- One generic cowork shell (chat, steering, execution, results, history).
- One production recipe: finance spend approvals.
- Local no-login mode end-to-end.
- Optional hosted sign-in only for hosted services.

Out of scope:

- Workflow builder.
- Multi-recipe studio.
- Advanced RBAC and policy authoring UI.
- Slack-first operation model.
- Scheduled autonomous runs.

## 5. Architecture Contract
System contract:

1. User sends task in Relay.
2. Relay forwards task to OpenClaw via streaming API.
3. OpenClaw plans, reasons, applies policy, queries connectors.
4. Relay streams plan/progress/results and accepts user steering.
5. Relay sends steering back to OpenClaw.
6. OpenClaw re-plans or executes and returns audited outcomes.

Backend responsibility split:

- OpenClaw: LLM reasoning, tool use, policy engine, retries, connector orchestration, execution logs.
- Relay: rendering, interaction controls, timeline UX, per-run audit view, endpoint configuration.

## 6. Required Screens
Exactly six screens (or six primary states in one shell):

1. Chat
- Message history and live streaming responses.
- Input accepts natural language and slash commands.

2. Steering
- Inline controls: /yes, /no, /modify, /details, /hold.
- Free-text steering always available.

3. Details
- Right panel with plan, rationale, policy references, confidence notes, source links.

4. Execution
- Step-by-step runtime status from OpenClaw.
- Non-blocking: user can continue conversation while execution runs.

5. Results
- Structured summary: approved, escalated, blocked, skipped.
- Action receipts: order IDs, notifications, audit ID.

6. History
- Prior runs with timestamps, initiator, decisions, rationale snapshot, final outcomes.

## 7. Feature Behavior Specification
### 7.1 Conversational Tasking
Behavior:

- User enters a task in plain language.
- Relay sends a `task.create` event to OpenClaw.
- OpenClaw returns a plan preview before consequential actions.
- Relay renders plan with required approval gate.

Acceptance criteria:

- Plan preview appears before irreversible actions.
- Stream starts within 2 seconds in normal network conditions.
- User can issue follow-up prompts without resetting run context.

### 7.2 Steering Loop
Behavior:

- User can approve, reject, pause, ask for details, or modify scope.
- Any steering action triggers OpenClaw re-reasoning, not frontend-only edits.
- Relay appends steering events to the same run timeline.

Acceptance criteria:

- Steering response roundtrip is visible and auditable.
- Modified scope is reflected in updated plan diff.
- Hold state pauses execution and tool calls.

### 7.3 Policy-Aware Recommendation States
Behavior:

- OpenClaw returns each item with one state:
  - approve
  - escalate
  - block
  - skip
- Each state includes rationale and policy citation key.

Acceptance criteria:

- Every recommendation row includes state + reason.
- Escalations include required approver role.
- Blocked items cannot execute unless user explicitly overrides where policy allows.

### 7.4 Execution Workspace
Behavior:

- Execution starts only after explicit user approval.
- Relay displays step status from OpenClaw event stream:
  - queued
  - running
  - waiting_for_input
  - completed
  - failed
- On failures, OpenClaw may suggest retry path; Relay presents it as a controlled option.

Acceptance criteria:

- No write action without explicit approval event.
- Step timeline preserves ordering and timestamps.
- Failure includes actionable next step.

### 7.5 Results and Suggested Next Actions
Behavior:

- OpenClaw returns final outcome packet.
- Relay renders concise summary and recommended next actions.

Acceptance criteria:

- Summary includes counts and affected entities.
- Receipts include external IDs where applicable.
- Suggested next actions are specific, not generic.

### 7.6 Audit and Traceability
Behavior:

- Each run stores a chronological event ledger.
- Ledger includes: user prompts, steering actions, plan versions, policy decisions, execution events, outputs.

Acceptance criteria:

- Any result is traceable to a plan version and approval event.
- User can export run summary for pilot review.
- History remains available across app restarts.

### 7.7 Local Mode and Hosted Mode
Behavior:

- Local mode is default and fully usable for core cowork flow.
- Hosted mode enables optional cloud services via sign-in.

Acceptance criteria:

- No-login path supports task -> plan -> steer -> execute -> result.
- Hosted-only features are clearly labeled.
- Switching endpoint does not require reinstall.

## 8. Finance Approval Recipe (First Production Recipe)
Trigger examples:

- "Process pending spend approvals above 5k."
- "Review this week approvals and flag high-risk requests."

Inputs:

- Pending requests from ERP connector.
- Company policy thresholds from OpenClaw policy config.
- Optional context from notes or chat attachments.

Workflow contract:

1. OpenClaw fetches candidate requests.
2. OpenClaw classifies each request by policy.
3. OpenClaw returns recommendation table.
4. User steers (approve/modify/escalate/hold).
5. OpenClaw executes approved actions in ERP and sends notifications.
6. Relay displays receipts and audit summary.

Output requirements:

- Per-request state and rationale.
- Escalation routing info.
- Completed action IDs.
- Exceptions list.

## 9. Reliability and Safety Requirements
Must-have controls for MVP:

- Plan-before-action for consequential operations.
- Human confirmation before irreversible writes.
- Explainability block on each recommendation.
- Failure-safe defaults (no silent partial writes).
- Clear "not enough information" behavior.

## 10. Success Metrics for MVP Pilot
Product metrics:

- Decision cycle time reduction on target workflow.
- Weekly active usage by target role.
- Completion rate of end-to-end cowork runs.
- Manual rework rate after execution.

Trust metrics:

- Recommendation acceptance rate.
- Override rate with reason.
- User-reported clarity of rationale.

Business metrics:

- Time saved per approver per week.
- Approval SLA improvement.
- Exception handling time.

## 11. Definition of Done
MVP is done when all are true:

1. End-to-end run works in local mode with OpenClaw backend.
2. Steering loop works mid-run without losing context.
3. Finance recipe executes with policy-aware states and receipts.
4. Run history is auditable and exportable.
5. Core flow is stable for pilot use.

## 12. Open Questions for Final Lock
Please confirm these so I can finalize this into a release-ready implementation checklist:

1. What is the default policy threshold for the finance recipe (for example 5k, 10k, role-based)?
2. Which ERP connector is primary in pilot (SAP only, or SAP + another)?
3. Do you want explicit confidence scoring shown to users, or rationale only in MVP?
4. For local mode, should history be plain local storage or encrypted at rest by default?
5. What is the exact pilot success target for cycle time reduction (for example 50% or 80%)?
