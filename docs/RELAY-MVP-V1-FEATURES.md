# Relay MVP V1 Features

Date: 2026-03-23
Status: Canonical feature checklist for V1 implementation
Scope: Must-have features only for first pilot-ready release

## 1. Copilot Core (Relay Frontend)

1. Chat workspace with streaming responses from OpenClaw.
2. Run state visibility in UI:
- draft
- planned
- waiting_approval
- executing
- waiting_input
- completed
- failed
- canceled
3. Steering controls in-thread:
- yes
- no
- modify
- details
- hold
4. Free-text steering during run (not button-only).
5. Plan preview before any consequential write action.
6. Details panel showing:
- recommendation rationale
- policy reason
- source/context references
7. Execution timeline with step-level statuses.
8. Results summary with per-run counts:
- approved
- escalated
- blocked
- skipped
9. Run history list with searchable runs.
10. Per-run audit trace view (who, what, when, why).
11. Export run summary (PDF or JSON acceptable for V1).

## 2. First Production Recipe (Finance Spend Approvals)

12. Fetch pending spend requests from ERP connector (SAP first).
13. Evaluate each request against policy thresholds.
14. Produce recommendation state per request:
- approve
- escalate
- block
- skip
15. Require explicit human approval before write operations.
16. Route escalations to the mapped approver role.
17. Execute approved actions back into ERP.
18. Return action receipts with external IDs and timestamps.
19. Maintain an exception list for unresolved items.
20. Send notifications for approval, escalation, and completion events.

## 3. Hosted Multi-User Essentials (If Hosted Mode Included in V1)

21. Organization and workspace tenancy model.
22. User roles:
- operator
- reviewer
- admin
23. Shared run ownership and assignment support.
24. Workspace-scoped connector credentials.
25. Tenant isolation and permission checks on each action.
26. Immutable event logging for run transitions.
27. Admin settings for policy thresholds and connector health.

## 4. Reliability and Control Requirements

28. Retry and failure handling with user-visible fallback paths.
29. No silent writes: every write tied to a prior approval event.
30. Guardrails for run cost and depth:
- max steps
- timeout
- budget limit
31. Basic reliability telemetry:
- run success rate
- connector failure rate
- override rate

## 5. Explicitly Out of Scope for V1

1. Workflow builder or recipe studio.
2. Advanced RBAC/policy authoring UI.
3. Slack-first operating mode.
4. Scheduled autonomous runs.
5. Full analytics suite beyond pilot scorecards.
6. Multi-recipe marketplace.

## 6. Definition of V1 Completion

V1 is complete when:

1. A user can run task -> plan -> steer -> approve -> execute -> results end-to-end.
2. Finance approval recipe executes with policy states and receipts.
3. Audit trail is visible and exportable per run.
4. Reliability is acceptable for pilot teams.
5. Required V1 features (1-31) are implemented and tested.
