# RELAY MVP — QUICK REFERENCE (ARCHITECTURE CORRECTED)

**Canonical spec:** This document is the source of truth for MVP scope. Use [docs/RELAY-MVP-ALIGNMENT-CHECKLIST.md](docs/RELAY-MVP-ALIGNMENT-CHECKLIST.md) to validate implementation.

**Build Time:** 4 weeks  
**Team:** 2 engineers  
**Tagline:** Claude Cowork for Your Company  
**Architecture:** Relay (UI) + OpenClaw (backend orchestration)
**Workflow Scope:** Finance spend approvals only (MVP)
**Access Model:** No-login local mode by default; optional sign-in for hosted services only

---

## CLEAR PRODUCT DEFINITION

### One-line Definition
Relay is a chat-first cowork interface that lets finance teams steer OpenClaw to analyze and execute spend-approval work with human control.

### What Claude Cowork Means in Relay
- The user works in conversation, not forms.
- The assistant keeps context across turns and accepts redirection mid-task.
- The assistant explains decisions before action and asks for confirmation on risky steps.
- The user can intervene at any point: approve, modify, hold, or reject.

### Who Uses Relay (MVP)
- Primary user: finance approver or finance operations lead.
- Secondary users: finance manager, controller, CFO delegate reviewing exceptions.
- Operating context: high context-switch environments with repetitive approvals and policy checks.

### Who Uses Relay (Expanded User Segments)
- Individual operators: people who need to hand off repetitive but judgment-sensitive operational work.
- Team leads and managers: reviewers who validate recommendations, steer exceptions, and approve execution.
- Operations and AI automation roles: users connecting tools, files, and workflows to improve throughput.
- Enterprise stakeholders: admins and risk owners who require visibility, control points, and audit traces.

### What They Use It For (MVP Jobs-to-be-Done)
- Turn a vague task into a concrete approval plan quickly.
- Review policy-sensitive spend requests with clear rationale.
- Execute approved actions without manually coordinating across systems.
- Handle exceptions and escalations without losing conversational context.
- Maintain an auditable record of what was decided, why, and what changed.

### Top Jobs Relay Is Hired For
- Coordinate cross-tool operational work from one conversation instead of jumping between systems.
- Turn raw inputs (files, notes, requests) into structured recommendations with policy-aware decisions.
- Delegate execution safely while keeping human approval on significant actions.
- Run recurring operational routines with the ability to inspect, redirect, and refine each run.
- Produce decision-ready outputs: summaries, execution receipts, and audit-friendly histories.

### Product Contract
- Relay owns user experience: chat, steering controls, progress visibility, and run history.
- OpenClaw owns execution: reasoning, policy checks, connectors, and action orchestration.
- Relay never pretends to execute work directly; it presents and steers OpenClaw execution.
- MVP covers one workflow only: finance spend approvals.

### Cowork Behavior Contract
- Be concise first: summarize findings and recommended next action.
- Be transparent: show reason, policy reference, and confidence for each recommendation.
- Be interruptible: user instructions can redirect flow at any time.
- Be safe-by-default: ask confirmation before executing irreversible or high-risk actions.
- Be stateful: retain thread context and user intent across multi-turn interactions.

### What Relay Is
- A Claude-style cowork UX for operational decision-making.
- A steering and visibility layer over OpenClaw orchestration.
- Usable in open-source local mode without login.

### What Relay Is Not
- Not a standalone agent runtime.
- Not a multi-workflow builder in MVP.
- Not an opaque autopilot that hides decision logic.

### Definition of Done (MVP)
- A finance user can complete one approval workflow end-to-end via chat.
- OpenClaw responses stream live, and users can steer mid-flow without resetting context.
- Recommendations include rationale and policy-aware status before execution.
- Execution progress, results, and audit trail are visible in Relay.
- Local no-login mode works fully for core cowork UX; hosted sign-in remains optional.

---

## THE ARCHITECTURE (CORRECT)

```
RELAY (Frontend, Electron)
├─ Chat interface (user sees conversation)
├─ Streaming display (OpenClaw response appears live)
└─ Steering options (user can redirect work)

↕ WebSocket/HTTP

OPENCLAW (Backend, orchestration engine)
├─ Claude (reasoning inside OpenClaw)
├─ Policy engine (company rules)
├─ SAP connector (MCP fetches/creates orders)
├─ Sub-agents (specialized work)
├─ Audit logging (all actions tracked)
├─ seventeenlabs.io API (optional hosted business services)
└─ Optional auth provider (hosted mode only)
```

**Relay = UI layer (what user interacts with)**  
**OpenClaw = Execution layer (does the work)**  
**Claude = Reasoning (inside OpenClaw, not standalone)**

**Default behavior:** users run Relay locally without login.

---

## THE CONVERSATION FLOW

```
User: "Process spend approvals"
↓
Relay → OpenClaw (sends task)
↓
OpenClaw:
├─ Claude reasons
├─ Policy engine checks
├─ SAP connector fetches data
├─ Sub-agents analyze
└─ Generates response (streams back)
↓
Relay displays (words appear live):
"Found 7 pending requests:
├─ PO#2040: €12K (clear - approve)
├─ PO#2041: €75K (needs VP)
├─ PO#2042: €500K (flag CFO)
...
What would you like me to do?"
↓
User: "Wait, check Slack vendor first"
↓
Relay → OpenClaw (sends steering)
↓
OpenClaw re-reasons (vendor check sub-agent runs)
↓
Relay displays: "Slack vendor verified. Proceed?"
↓
User: "Yes, but skip AWS"
↓
Relay → OpenClaw (approves with modification)
↓
OpenClaw executes:
├─ Creates SAP orders
├─ Sends notifications
├─ Routes AWS to manager
├─ Logs audit trail
↓
Relay displays:
"Done. Created 2 orders, escalated 1, routed 1.
What's next?"
↓
Chat continues (multi-turn)
```

---

## SCREENS (6 TOTAL)

| Screen | What It Does |
|--------|---|
| **Chat** | Message history + streaming response |
| **Steering** | /yes /no /modify /details /hold + free input |
| **Details** | Right panel with full context + reasoning |
| **Execution** | Real-time progress (non-blocking, user can chat) |
| **Results** | Summary + OpenClaw suggests next steps |
| **History** | Past conversations + audit log |

---

## RELAY FEATURE DEFINITION (MVP)

### 1) Conversational Tasking
- User enters natural-language tasks in chat.
- Relay sends task intent to OpenClaw and streams responses live.
- Supports multi-turn follow-ups without resetting context.

### 2) Steering Controls
- Built-in steering actions: `/yes`, `/no`, `/modify`, `/details`, `/hold`.
- Free-text steering is first-class (not button-only workflow).
- OpenClaw re-reasons after each steering instruction.

### 3) Policy-Aware Recommendations
- OpenClaw returns recommendation states per item: `approve`, `needs-second-sign`, `block`, `skip`.
- Relay shows recommendation rationale and confidence hints in the Details panel.
- Finance policy context is visible before execution.

### 4) Execution Workspace
- User-triggered execution from approved plan.
- Real-time execution progress (step states + status stream).
- Non-blocking UX: user can continue conversation during execution.

### 5) Results + Next Action Suggestions
- End-of-run summary: approved, escalated, blocked, skipped.
- Action receipts: SAP actions, notifications, audit trail reference.
- OpenClaw suggests next actionable step in chat.

### 6) History + Audit Trace
- Conversation and run history per workflow.
- Expandable reasoning and decision timeline.
- Audit-oriented event trail for pilot proof and review.

### 7) Modes and Access
- `Local mode (no login)`: full open-source experience with local/OpenClaw endpoint usage.
- `Hosted mode (optional sign-in)`: optional hosted features via auth + seventeenlabs.io services.
- Cloud-only features are clearly labeled/locked in local mode.

### 8) Settings and Connectivity
- Configure OpenClaw endpoint (local, VPS, custom URL routing).
- Connection health checks and pairing/permission guidance.
- Model/session controls exposed where relevant.

---

## FEATURE BOUNDARIES (IN/OUT)

### In Scope (MVP)
- One workflow only: finance spend approvals.
- Chat-first cowork UX with steering loop.
- OpenClaw integration for plan, reasoning, and execution.
- Basic history and audit trace sufficient for pilots.

### Out of Scope (Post-MVP)
- Multi-workflow builder.
- Advanced RBAC/enterprise policy studio.
- Slack-first operation model.
- Full analytics suite beyond pilot reporting.

---

## MVP GUARDRAILS

- One workflow only: finance spend approvals.
- No multi-workflow builder in MVP.
- Local mode must be fully usable without sign-in.
- Never block core cowork UX behind login.
- Hosted sign-in is optional and only required for hosted features.

---

## TECH STACK

| Layer | Tech |
|-------|------|
| Frontend | Electron + Vite + React + TypeScript |
| UI | shadcn/ui + Tailwind |
| State | React state (MVP), TanStack Query optional later |
| Streaming | WebSocket (primary MVP transport) |
| Auth | No-login local default + optional hosted auth |
| Backend | OpenClaw API + optional seventeenlabs.io hosted services |

---

## 4-WEEK BUILD

| Week | What | Goal |
|------|------|------|
| 1 | Chat UI + OpenClaw integration | Send task, see response stream |
| 2 | Steering + details panel | User steers, OpenClaw re-reasons |
| 3 | Execution + SAP integration | Create orders, async execution |
| 4 | History + polish | Audit log, pilot-ready |

---

## SUCCESS METRICS

✅ Feels like Claude Cowork (conversational, not buttons)  
✅ OpenClaw's reasoning visible (user sees thinking)  
✅ Multi-turn works (user asks follow-ups)  
✅ Steering natural (slash commands + free input)  
✅ Local mode works without account  
✅ Cycle time 50%+ faster (5 days → 1 hour)  
✅ 80%+ adoption (finance uses daily)  
✅ 99%+ accurate (no errors)  
✅ ROI obvious (€500K+/year savings)  

---

## KEY POINTS

**NOT:** "Claude proposes/executes" (Claude is inside OpenClaw)  
**YES:** "OpenClaw orchestrates (using Claude reasoning)" (Relay displays)

**Architecture:**
```
User ↔ Relay (UI) ↔ OpenClaw (execution engine with Claude inside)
```

**User experience:**
```
Chat → Claude inside OpenClaw reasons → Response streams to Relay → User steers → Loop continues
```

---

**Claude Cowork UX, powered by OpenClaw orchestration. That's Relay.**

