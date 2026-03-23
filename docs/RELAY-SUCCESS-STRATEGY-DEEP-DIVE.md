# Relay Success Strategy Deep Dive

Date: 2026-03-23
Status: Working strategy document

## 1. What You Still Need To Know (Critical Unknowns)

Most teams focus on features and miss these unknowns that decide success:

1. Buying process unknowns
- Who signs: functional leader, IT/security, procurement, or all three.
- What blocks deals: security review, integration effort, unclear ROI, or change resistance.
- How long decisions take per segment.

2. Workflow economics unknowns
- True baseline cycle time and labor cost for each target workflow.
- Rework cost from bad decisions.
- Expected runtime cost per successful execution.

3. Reliability unknowns
- Failure modes per connector.
- Data quality variability across customers.
- Human override patterns and why they happen.

4. Adoption unknowns
- Which role becomes internal champion.
- Where behavior drops after week 2.
- What training and enablement creates sustained usage.

## 2. Success Model (What Must Be True)

Relay becomes a durable product if all conditions hold:

1. Repeatable value
- Same recipe delivers measurable gains across at least 3 distinct customers.

2. Trustable operation
- High-impact actions always pass explicit approval and are fully traceable.

3. Predictable delivery
- Time-to-first-value is short and implementation friction is controlled.

4. Healthy unit economics
- Gross margin remains viable at realistic usage levels.

5. Expandable footprint
- First recipe naturally leads to second and third adjacent workflows.

## 3. Strategic Sequence (What To Do In Order)

1. Wedge
- Win one high-friction, high-cost workflow.

2. Standardize
- Convert successful pilot motions into templates and product defaults.

3. Scale
- Expand with adjacent recipes using same governance model.

4. Platformize
- Add admin, policy operations, and monitoring capabilities as revenue base grows.

## 4. 6-Layer Execution Strategy

1. Product layer
- Keep cowork UX simple and deterministic for high-risk decisions.

2. Orchestration layer
- OpenClaw runs policy, tools, and execution state machine.

3. Governance layer
- Role gates, approval rules, and audit events are first-class objects.

4. Delivery layer
- Pilot onboarding, data readiness checks, and weekly business review cadence.

5. Commercial layer
- ROI-first selling with baseline and post-launch evidence.

6. Organizational layer
- Internal ownership map for product, implementation, and customer success.

## 5. Practical 12-Week Pilot Strategy

Weeks 1-2
- Baseline capture: cycle time, rework, exception handling, owner map.
- Define policy thresholds and escalation matrix.
- Run dry tests with sample data.

Weeks 3-6
- Controlled production runs with supervision.
- Weekly KPI review with customer sponsor.
- Log every override and classify root cause.

Weeks 7-9
- Stabilize high-frequency failure modes.
- Reduce manual interventions.
- Tighten UX around common steering patterns.

Weeks 10-12
- Executive readout with before/after metrics.
- Case study draft and expansion proposal.
- Decide go/no-go for adjacent recipe.

## 6. Decision Gates (No Drift Rule)

Gate 1: Recipe viability
- 50%+ cycle-time reduction and acceptable error/rework profile.

Gate 2: Trust viability
- Majority of runs completed with clear rationale and low unresolved exceptions.

Gate 3: Economic viability
- Positive margin forecast at expected usage.

Gate 4: Expansion viability
- At least one adjacent workflow with similar structure and same governance primitives.

## 7. Metrics That Matter Most

1. Operational impact
- Decision cycle time.
- Exception resolution time.
- Manual rework per run.

2. Trust and control
- Recommendation acceptance rate.
- Override rate with reason categories.
- Percentage of runs with complete audit trail.

3. Commercial traction
- Time-to-first-value.
- Expansion rate to second workflow.
- Gross margin per customer cohort.

## 8. What To Avoid

1. Building broad before proving narrow.
2. Leading with model comparisons instead of business outcomes.
3. Treating security/governance as post-MVP concerns.
4. Measuring only usage, not workflow outcomes.
5. Expanding recipes before reliability stabilizes.

## 9. Founder Checklist

Before expanding Relay, confirm:

1. We can prove measurable value in one workflow repeatedly.
2. We understand top 5 override causes and can reduce them.
3. We can onboard a new pilot quickly using a standard playbook.
4. We can pass common security and governance objections.
5. We have a clear adjacent workflow expansion map.
