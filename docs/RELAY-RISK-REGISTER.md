# Relay Risk Register

Date: 2026-03-23
Status: Active

## 1. Product Risks

1. Over-broad scope before first recipe proof
- Impact: high
- Likelihood: high
- Mitigation: lock expansion behind KPI gates.

2. Weak trust UX for high-impact actions
- Impact: high
- Likelihood: medium
- Mitigation: mandatory plan preview, rationale blocks, explicit approvals.

3. Poor fit between recipe and customer workflow
- Impact: high
- Likelihood: medium
- Mitigation: pilot entry criteria and workflow discovery checklist.

## 2. Technical Risks

1. Connector instability
- Impact: high
- Likelihood: medium
- Mitigation: health checks, retries, fallback behavior.

2. Runtime cost blowout
- Impact: high
- Likelihood: medium
- Mitigation: run limits, budget caps, execution depth controls.

3. Incomplete traceability
- Impact: high
- Likelihood: low to medium
- Mitigation: immutable event logging and exportable run records.

## 3. Governance Risks

1. Unclear approval ownership
- Impact: high
- Likelihood: medium
- Mitigation: explicit role and escalation mapping per workspace.

2. Policy drift between teams
- Impact: medium
- Likelihood: medium
- Mitigation: workspace policy templates and change history.

3. Data boundary confusion
- Impact: high
- Likelihood: medium
- Mitigation: connector scoping and clear access controls.

## 4. Commercial Risks

1. Long security/procurement cycles
- Impact: high
- Likelihood: high
- Mitigation: trust documentation pack and objection playbook.

2. ROI narrative too generic
- Impact: high
- Likelihood: medium
- Mitigation: baseline capture and workflow-specific KPI reporting.

3. Pilot success but no expansion
- Impact: high
- Likelihood: medium
- Mitigation: pre-planned adjacent recipe map and expansion criteria.

## 5. Adoption Risks

1. Usage drops after early novelty
- Impact: high
- Likelihood: medium
- Mitigation: training loops, champion network, weekly review cadence.

2. High override rates persist
- Impact: high
- Likelihood: medium
- Mitigation: classify override reasons and close top causes each sprint.

3. Teams keep parallel manual process forever
- Impact: medium
- Likelihood: high
- Mitigation: process redesign plan with customer sponsor.

## 6. Monitoring Plan

Track weekly for pilot accounts:

1. Run completion rate.
2. Override rate by reason.
3. Connector failure rate.
4. Rework hours.
5. Cycle time delta vs baseline.

## 7. Escalation Rules

Escalate internally when:

1. Override rate exceeds threshold for two weeks.
2. Connector reliability drops below SLA target.
3. Customer cannot demonstrate measurable value by week 6.
