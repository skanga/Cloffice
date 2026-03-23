# Relay Execution Handbook

Date: 2026-03-23
Status: Operating handbook v1
Owner: Founder + product lead

## 1. Purpose
This handbook turns strategy into an execution system for building and scaling Relay.

It focuses on:

1. Weekly founder dashboard.
2. Pilot kickoff checklist.
3. Go/no-go gate template.
4. First 3 customer implementation playbook.

## 2. Operating Principles
1. Narrow before broad.
- Prove one recipe repeatedly before expanding.

2. Governed execution over generic chat.
- Relay wins on controlled outcomes, not model novelty.

3. Measure business deltas.
- Baseline and after-state metrics are required for every pilot.

4. Human-in-the-loop for consequential actions.
- Plan, approve, execute, verify.

5. Productize repeated services work.
- Anything repeated across pilots becomes template, tooling, or default UX.

## 3. Weekly Founder Dashboard Template
Use this every week in one 30-minute review.

### 3.1 Topline KPI Block
- Active pilot customers:
- Weekly active users:
- End-to-end runs completed:
- Median cycle time delta vs baseline:
- Override rate:
- Rework rate:
- Gross margin estimate per pilot:

### 3.2 Reliability Block
- Run success rate:
- Connector failure rate:
- Time to recover from failure:
- Top 3 failure causes:

### 3.3 Trust and Governance Block
- Percentage of runs with full audit trail:
- Percentage of high-risk actions with explicit approval:
- Top override reasons:

### 3.4 Commercial Block
- Pipeline stage movement:
- Security reviews in progress:
- Pilot expansions to second workflow:
- Churn risks:

### 3.5 Weekly Decisions
- Decision 1:
- Decision 2:
- Decision 3:

## 4. Pilot Kickoff Checklist (Customer-Facing)
Use this as a hard gate before pilot start.

### 4.1 Business Alignment
- Named executive sponsor confirmed.
- Named workflow owner confirmed.
- Named approver role map confirmed.
- Baseline process documented.
- Success criteria signed off.

### 4.2 Workflow Definition
- First recipe selected.
- Trigger prompts defined.
- Inputs and connector dependencies listed.
- Policy thresholds and escalations documented.
- Expected output schema agreed.

### 4.3 Data and Connector Readiness
- Required connectors configured.
- Access scopes validated.
- Test data quality check completed.
- Fallback path defined for connector failure.

### 4.4 Governance Setup
- Approval rules configured.
- Risk tier definitions mapped.
- Audit export format agreed.
- Data retention expectations confirmed.

### 4.5 Operations Setup
- Weekly review cadence booked.
- Champion and backup champion named.
- Incident contact path confirmed.
- Training session completed.

## 5. Go/No-Go Gate Template
Use at week 2, week 6, and week 12 for each pilot.

### 5.1 Gate Inputs
- Cycle time delta:
- Rework rate:
- Override rate and causes:
- Run completion rate:
- User adoption:
- Reliability incidents:
- Margin profile:

### 5.2 Decision Rules
Go if all are true:
1. Clear cycle-time improvement against baseline.
2. Stable trust profile (override causes known and manageable).
3. Reliability acceptable for daily use.
4. Customer sponsor confirms workflow value.

Conditional go if:
1. Value is clear but one reliability or governance blocker remains.
2. There is a dated mitigation plan and owner.

No-go if any are true:
1. No measurable workflow improvement.
2. Persistent trust breakdown (unexplained overrides, low confidence).
3. Connector instability prevents normal usage.
4. No internal owner on customer side.

### 5.3 Output Record
- Decision:
- Rationale:
- Actions:
- Owner:
- Due date:

## 6. First 3 Customer Implementation Playbook
Objective: prove repeatable value and extract product patterns.

### 6.1 Customer 1: Design Partner
Goal:
- Validate core workflow architecture and trust UX.

Execution:
1. High-touch implementation.
2. Daily feedback loop in first 2 weeks.
3. Capture every friction point and missing control.

Output:
- Stabilized recipe contract v1.
- Known failure mode list.
- First outcome narrative.

### 6.2 Customer 2: Reproducibility Test
Goal:
- Confirm that value is not unique to customer 1.

Execution:
1. Reuse onboarding template from customer 1.
2. Track time-to-first-value strictly.
3. Validate policy and approval model portability.

Output:
- Repeatability proof.
- Standardized implementation checklist v2.
- Updated KPI targets.

### 6.3 Customer 3: Scalability Test
Goal:
- Confirm team collaboration and operational scaling.

Execution:
1. Emphasize multi-user handoffs and escalations.
2. Stress-test history, audit, and ownership model.
3. Pilot adjacent workflow only if first remains healthy.

Output:
- Expansion readiness evidence.
- Case study package.
- Product backlog prioritized by cross-customer frequency.

## 7. Pilot Meeting Cadence
### Weekly 45-minute customer review agenda
1. KPI review against baseline.
2. Top blocked runs and root causes.
3. Override analysis.
4. Reliability updates.
5. Next-week actions and owners.

### Internal 30-minute post-review
1. What repeated across customers.
2. What should become product default.
3. What remains implementation-only.

## 8. Scorecard Template (Per Pilot)
Use one score from 1-5 each week.

- Value realization:
- Trust and control:
- Reliability:
- Adoption depth:
- Expansion potential:

Interpretation:
- 4-5: healthy, expand carefully.
- 3: stabilize before expansion.
- 1-2: reset scope or exit pilot.

## 9. Productization Backlog Rules
Add to product roadmap if an issue appears in at least 2 pilots and blocks KPI outcomes.

Prioritize backlog in this order:
1. Trust and governance blockers.
2. Reliability blockers.
3. Workflow throughput improvements.
4. UX polish.
5. Nice-to-have breadth.

## 10. Common Failure Patterns and Fast Fixes
1. Problem: Users chat but do not execute.
- Fix: stronger plan preview, clearer approval CTA, smaller first actions.

2. Problem: High overrides with vague reasons.
- Fix: require override reason categories and tighten rationale output.

3. Problem: Pilot enthusiasm drops after week 2.
- Fix: enforce champion cadence and weekly outcome reviews.

4. Problem: Connector instability erodes trust.
- Fix: preflight checks, fallback behavior, and transparent run states.

## 11. 90-Day Execution Plan
Days 1-30:
- Launch 1-2 pilots with strict baseline capture.
- Stabilize first recipe and trust controls.

Days 31-60:
- Improve reliability and reduce top override causes.
- Prove repeatability in second pilot.

Days 61-90:
- Complete third pilot scale test.
- Publish case studies and expansion readiness decision.

## 12. Definition of Execution Success
Relay execution strategy is working when:
1. At least 3 pilots show measurable workflow gains.
2. Trust metrics are stable and improving.
3. Implementation becomes repeatable with a standard playbook.
4. Expansion to adjacent workflows is justified by data, not opinion.
