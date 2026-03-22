# RELAY MVP SPECIFICATION

**Created:** Sunday, March 22, 2026, 11:15 AM UTC  
**Scope:** 4-week build (2 engineers)  
**Target:** Pilots live by early May 2026  
**Workflow:** Finance spend approvals (ONLY this workflow for MVP)

---

## THE MVP PHILOSOPHY

### What to Build (RUTHLESSLY SIMPLE)

```
Finance approval workflow:
├─ Claude sees pending spend requests (€5K+)
├─ Analyzes against company policy (e.g., "purchases > €50K need 2 approvals")
├─ Proposes decision: "Approve", "Reject", or "Needs 2nd opinion"
├─ Finance team clicks: [Approve] or [Reject]
├─ Action recorded: SAP order created, notifications sent, audit trail logged
└─ Done
```

**That's it. One workflow. Perfect execution.**

### What NOT to Build (For Later)

```
❌ Multiple workflows (sales approvals, hiring, etc) — ONLY finance
❌ Custom workflow builder — Use templates only
❌ Advanced RBAC — Email-based pilot first
❌ Slack integration — Web UI only
❌ Compliance certifications — SOC 2 later
❌ Advanced notifications — Basic email only
❌ Analytics dashboard — Simple metrics only
❌ Plugin system — Pre-built plugins only
❌ Scheduled tasks — Manual triggers only
❌ Internationalization — English only
```

**MVP = one workflow, one use case, perfect execution. Expansion comes later.**

---

## RELAY MVP ARCHITECTURE

### Frontend (What Users See)

```
Desktop App (Electron)
├─ Window: 1200x800px
├─ Dark theme (modern, clean)
└─ Layout:
   ├─ Left sidebar (nav)
   ├─ Main content area (workflow)
   └─ Right panel (details)
```

### Backend (What Powers It)

```
Relay connects to:
├─ OpenClaw (orchestration)
│  ├─ Claude (reasoning)
│  ├─ Policy engine (rules)
│  └─ MCP connectors (SAP, etc)
└─ seventeenlabs.io API (cloud)
   ├─ Auth (OAuth)
   ├─ Data storage
   └─ Audit logging
```

### Data Flow (How It Works)

```
1. User opens Relay
2. User types: "Process pending spend approvals > €5K"
3. Relay sends task to OpenClaw
4. OpenClaw (brain):
   ├─ Connects to SAP via MCP
   ├─ Fetches pending requests
   ├─ Analyzes against policy
   ├─ Generates recommendation
   └─ Returns: "3 ready to approve, 1 needs review"
5. Relay shows results in UI
6. User clicks [Approve all] or [Review #2]
7. OpenClaw executes:
   ├─ SAP purchase orders created
   ├─ Email notifications sent
   ├─ Audit trail recorded
   └─ Done
```

---

## RELAY MVP SCREENS

### Screen 1: Login

```
┌─────────────────────────────────┐
│         RELAY LOGIN             │
├─────────────────────────────────┤
│                                 │
│  [Login with Anthropic]         │
│  [Login with seventeenlabs.io]  │
│                                 │
│  Remember me: [ ]               │
│                                 │
│  "Open-source AI OS"            │
│  (Relay logo)                   │
│                                 │
└─────────────────────────────────┘
```

**Features:**
- OAuth login (seventeenlabs.io)
- Remember login
- Error handling (invalid credentials)
- "Remember me" checkbox (local storage)

---

### Screen 2: Dashboard (Home)

```
┌────────────────────────────────────────────────┐
│ RELAY                      [Settings] [Help]    │
├─────┬──────────────────────────────────────────┤
│     │  Welcome back, Finance Team               │
│ [×] │                                           │
│ [≡] │  Your workload:                           │
│     │  ├─ 5 pending approvals (€12K–€500K)     │
│ [→] │  ├─ 2 need review (policy questions)    │
│     │  └─ Waiting: 3 requests (other teams)    │
│     │                                           │
│ Nav │  [Start Workflow]                         │
│ ├─ H│                                           │
│ ├─ P│  Recent activity:                         │
│ ├─ A│  • Approved: PO#2043 (€50K)              │
│ ├─ S│  • Rejected: PO#2044 (budget fail)       │
│ ├─ M│  • Escalated: PO#2045 (needs CFO)       │
│ └─ ?│                                           │
│     │                                           │
└────────────────────────────────────────────────┘
```

**Sections:**
- Quick stats (pending, in-progress, waiting)
- Primary action: [Start Workflow]
- Recent activity log
- Sidebar navigation

---

### Screen 3: Workflow — Step 1 (Task Input)

```
┌────────────────────────────────────────────────┐
│ RELAY / Workflow                               │
├─────┬──────────────────────────────────────────┤
│ [×] │  Process Pending Approvals               │
│ [≡] │                                           │
│ [→] │  What do you want to do?                 │
│     │                                           │
│ Nav │  ┌────────────────────────────────────┐  │
│ ├─ H│  │ Process all pending spend          │  │
│ ├─ P│  │ approvals over €5K that pass       │  │
│ ├─ A│  │ policy check                       │  │
│ ├─ S│  │                                    │  │
│ ├─ M│  │ ↓ [ANALYZE]                       │  │
│ └─ ?│  └────────────────────────────────────┘  │
│     │                                           │
│     │  💭 Claude is analyzing...               │
│     │     (spinning indicator)                 │
│     │                                           │
└────────────────────────────────────────────────┘
```

**Features:**
- Text input (task description)
- Pre-filled templates (quick start)
- Analyze button
- Loading state (spinner)

---

### Screen 4: Workflow — Step 2 (Plan Review)

```
┌────────────────────────────────────────────────┐
│ RELAY / Workflow                               │
├─────┬──────────────────────────────────────────┤
│ [×] │  Process Pending Approvals               │
│     │                                           │
│     │  🧠 Claude's plan:                       │
│     │  ┌────────────────────────────────────┐  │
│     │  │ I'll fetch pending requests from   │  │
│     │  │ SAP, check each against your       │  │
│     │  │ €50K 2-approval policy, and        │  │
│     │  │ recommend approvals.               │  │
│     │  │                                    │  │
│     │  │ Found:                             │  │
│     │  │ • PO#2040: €12K (approve)         │  │
│     │  │ • PO#2041: €75K (needs 2 sign)    │  │
│     │  │ • PO#2042: €500K (CFO block)      │  │
│     │  │ • PO#2043: €3K (under limit)      │  │
│     │  │                                    │  │
│     │  │ Ready to proceed? → [YES] [NO]    │  │
│     │  └────────────────────────────────────┘  │
│     │                                           │
│     │  /help  /edit  /details                  │
│     │                                           │
└────────────────────────────────────────────────┘
```

**Features:**
- Claude's reasoning displayed
- List of items found
- Slash commands (/help, /edit, /details)
- Yes/No buttons to proceed

---

### Screen 5: Workflow — Step 3 (Execution)

```
┌────────────────────────────────────────────────┐
│ RELAY / Workflow                               │
├─────┬──────────────────────────────────────────┤
│     │  Processing...                           │
│     │                                           │
│     │  ✓ Fetched 4 requests from SAP           │
│     │  ✓ Analyzed against policy               │
│     │  ⏳ Creating purchase orders (2/3)...    │
│     │  ⏳ Sending notifications                │
│     │                                           │
│     │  Progress: ███████░░░░░░░░░░ 65%        │
│     │                                           │
│     │  Estimated: 12 seconds remaining         │
│     │                                           │
└────────────────────────────────────────────────┘
```

**Features:**
- Step-by-step progress
- Checkmarks for completed steps
- Progress bar
- Time estimate
- Can't interrupt (or confirm interruption)

---

### Screen 6: Workflow — Step 4 (Results)

```
┌────────────────────────────────────────────────┐
│ RELAY / Workflow                               │
├─────┬──────────────────────────────────────────┤
│     │  ✅ COMPLETE                             │
│     │                                           │
│     │  Summary:                                │
│     │  ├─ Approved: 2 orders (€15K total)     │
│     │  ├─ Flagged: 1 order (needs 2nd sign)   │
│     │  ├─ Blocked: 1 order (over policy)      │
│     │  └─ Skipped: 1 order (under minimum)    │
│     │                                           │
│     │  Actions taken:                          │
│     │  ├─ SAP: PO#2040, PO#2043 created       │
│     │  ├─ Email: Sent 3 notifications         │
│     │  └─ Log: Audit trail recorded (ID#542)  │
│     │                                           │
│     │  [Save to PDF] [View Audit Log]          │
│     │                                           │
│     │  ⏱ Execution time: 47 seconds           │
│     │  💾 Saved to history                    │
│     │                                           │
│     │  [← Back]  [New Workflow]                │
│     │                                           │
└────────────────────────────────────────────────┘
```

**Features:**
- Summary of actions
- Breakdown by status (approved, flagged, blocked, skipped)
- Execution time
- Save/export options
- Navigation (back, new workflow)

---

### Screen 7: Approvals List (Dashboard Tab)

```
┌────────────────────────────────────────────────┐
│ RELAY / Approvals                              │
├─────┬──────────────────────────────────────────┤
│ [×] │  Pending Approvals                       │
│ [≡] │                                           │
│ [→] │  Sort: [Newest ▼] | Filter: [All ▼]    │
│     │                                           │
│ Nav │  ┌─────────────────────────────────────┐ │
│ ├─ H│  │ PO#2048  €150K  Needs 2nd sign      │ │
│ ├─ P│  │ Finance Team | 2 hours old          │ │
│ ├─ A│  │ [Details] [Approve] [Reject]        │ │
│ ├─ S│  │                                     │ │
│ ├─ M│  ├─────────────────────────────────────┤ │
│ └─ ?│  │ PO#2047  €45K  Ready to approve     │ │
│     │  │ Finance Team | 15 min ago           │ │
│     │  │ [Details] [Approve] [Reject]        │ │
│     │  │                                     │ │
│     │  ├─────────────────────────────────────┤ │
│     │  │ PO#2046  €8K  Skipped (under limit) │ │
│     │  │ Finance Team | 42 min ago           │ │
│     │  │ [Details] [Archive]                 │ │
│     │  │                                     │ │
│     │  └─────────────────────────────────────┘ │
│     │                                           │
│     │  Showing 3 of 12 | [Load More]           │
│     │                                           │
└────────────────────────────────────────────────┘
```

**Features:**
- List of pending approvals
- Status, amount, time
- Quick actions (Approve, Reject, Details)
- Sorting and filtering
- Pagination

---

### Screen 8: Audit Log

```
┌────────────────────────────────────────────────┐
│ RELAY / Audit Log                              │
├─────┬──────────────────────────────────────────┤
│     │  Workflow History                        │
│     │                                           │
│     │  Search: [________]  Export: [PDF]       │
│     │                                           │
│     │  ┌─────────────────────────────────────┐ │
│     │  │ Workflow #542                       │ │
│     │  │ 2026-03-22 14:35 UTC                │ │
│     │  │ User: sarah@company.com             │ │
│     │  │ Action: Approved 2, Flagged 1       │ │
│     │  │                                     │ │
│     │  │ • PO#2040 €12K ✓ Approved           │ │
│     │  │ • PO#2041 €75K ⚠ Flagged            │ │
│     │  │ • PO#2043 €3K ✓ Approved            │ │
│     │  │                                     │ │
│     │  │ Claude reasoning:                   │ │
│     │  │ "Analyzed 4 requests..."            │ │
│     │  │ (Click to expand)                   │ │
│     │  │                                     │ │
│     │  │ [Export] [View SAP Changes]         │ │
│     │  └─────────────────────────────────────┘ │
│     │                                           │
└────────────────────────────────────────────────┘
```

**Features:**
- List of all workflows executed
- Timestamp and user
- Actions taken
- Claude's reasoning
- Export to PDF
- SAP integration confirmation

---

## RELAY MVP FEATURES (Detailed)

### Core Features (MUST HAVE)

```
1. User Authentication
   ├─ OAuth login (seventeenlabs.io)
   ├─ Session management (local storage)
   ├─ Logout + session recovery
   └─ Error handling (invalid token, expired)

2. Task Input
   ├─ Text input (free-form task description)
   ├─ Pre-filled templates (quick start)
   └─ Send to OpenClaw backend

3. Plan Review
   ├─ Display Claude's reasoning
   ├─ Show breakdown (what it found)
   ├─ Approve or reject the plan
   └─ Slash commands (/details, /help, /edit)

4. Execution Display
   ├─ Step-by-step progress (visual)
   ├─ Checkmarks for completed steps
   ├─ Progress bar
   ├─ Time estimate
   └─ Can stop (with confirmation)

5. Results Summary
   ├─ Count of actions (approved, flagged, blocked)
   ├─ SAP order numbers created
   ├─ Notifications sent
   ├─ Execution time
   └─ Audit trail ID

6. History & Audit
   ├─ List all workflows executed
   ├─ Timestamp, user, actions taken
   ├─ Claude reasoning (expandable)
   ├─ SAP order verification
   └─ Export to PDF

7. Settings
   ├─ Company profile (name, logo, policy)
   ├─ SAP credentials (test connection)
   ├─ Email notification settings
   ├─ Claude model selection (if multiple)
   └─ Theme (light/dark)
```

### Nice-to-Have (Nice, but Optional for MVP)

```
⚠️ DON'T BUILD THESE YET:

- Multiple workflows (sales, hiring, etc)
- Custom workflow builder
- Role-based access control (RBAC)
- Slack integration
- Advanced notifications (webhooks, SMS)
- Analytics dashboard
- Plugin system
- Scheduled tasks
- Undo/rollback
- Compliance certifications
- Multi-language support
```

---

## RELAY MVP TECHNICAL STACK

### Frontend (UI Layer)

```
Framework: Next.js (Vercel)
├─ Fast development
├─ Built-in API routes (optional backend)
├─ Deploy instantly

Desktop: Electron
├─ Wrap Next.js in Electron
├─ Package as .exe, .dmg, .AppImage
├─ Auto-updater (built-in)

UI Library: shadcn/ui
├─ Pre-built components (fast)
├─ Accessible defaults
├─ Dark theme support

State Management: TanStack Query
├─ Handle API calls
├─ Caching
├─ Error handling

Styling: Tailwind CSS
├─ Fast styling
├─ Dark theme built-in
└─ Consistent design system
```

### Backend Integration

```
OpenClaw API (Orchestration)
├─ Send task → get plan
├─ Approve plan → execute
├─ Get results
└─ Streaming (for live progress)

seventeenlabs.io API (Cloud)
├─ Auth (OAuth)
├─ User data
├─ Audit logging
├─ SAP integration
└─ Notifications
```

### External Integrations (MVP Scope)

```
SAP ERP (via MCP connector)
├─ Fetch pending requests
├─ Create purchase orders
├─ Update status

Email (via MCP connector)
├─ Send notifications
├─ Simple HTML email
└─ Template-based

Claude API (via OpenClaw)
├─ Reasoning
├─ Plan generation
└─ Multi-turn conversation
```

---

## RELAY MVP BUILD TIMELINE (4 Weeks)

### Week 1: Foundation

**Days 1–2: Setup**
- [ ] Create Next.js + Electron project
- [ ] Set up build pipeline
- [ ] Auth flow (OAuth login)
- [ ] API client (OpenClaw + seventeenlabs.io)

**Days 3–5: Core Screens**
- [ ] Login screen
- [ ] Dashboard (home)
- [ ] Task input screen
- [ ] All with dark theme

**Deliverable:** Runnable app, can login, no backend yet

---

### Week 2: Workflow UI

**Days 1–2: Workflow Screens**
- [ ] Plan review screen
- [ ] Execution display screen
- [ ] Results summary screen

**Days 3–5: Integration**
- [ ] Connect to OpenClaw API (send task)
- [ ] Receive plan from OpenClaw
- [ ] Display in UI
- [ ] Test with mock data

**Deliverable:** Can send task to OpenClaw, see plan, click Approve

---

### Week 3: Execution & History

**Days 1–3: Execution**
- [ ] Handle plan execution (approve → execute)
- [ ] Display progress (steps, checkmarks)
- [ ] Handle errors (with retry logic)

**Days 4–5: History**
- [ ] Audit log screen
- [ ] List all workflows
- [ ] View details
- [ ] Export to PDF

**Deliverable:** Can execute workflow, see results, view history

---

### Week 4: Polish & Deploy

**Days 1–2: Testing**
- [ ] Test SAP integration (with real credentials)
- [ ] Test email notifications
- [ ] Test error cases

**Days 3–4: Polish**
- [ ] Error messages (user-friendly)
- [ ] Loading states (spinners)
- [ ] Accessibility (keyboard nav, ARIA)
- [ ] Performance (no janky animations)

**Day 5: Build & Package**
- [ ] Create Electron installers (.exe, .dmg, .AppImage)
- [ ] Set up auto-updater
- [ ] Create release notes
- [ ] Deploy to seventeenlabs.io

**Deliverable:** Relay MVP, ready for pilots

---

## RELAY MVP METRICS (What We Measure)

### For Each Pilot (12-Week Test)

**Success Metrics:**
```
1. Cycle Time
   ├─ Before: Current approval process (target: 5 days)
   ├─ After: With Relay (target: < 30 minutes)
   └─ Goal: 99% improvement

2. Employee Adoption
   ├─ Weekly active users (target: 80% of finance team)
   ├─ Approvals per user per week (target: 5+)
   └─ Goal: Daily use

3. Cost Savings
   ├─ Labor hours saved (3 hours/employee/week)
   ├─ At €50/hour = €150/employee/week saved
   ├─ Monthly for 10 people = €6,000 saved
   └─ Goal: €75,000+ per customer per year

4. Error Rate
   ├─ Errors (misaligned approvals) (target: < 5%)
   ├─ Escalations needed (target: < 10%)
   └─ Goal: 99%+ accuracy

5. ROI
   ├─ Investment: €100K managed hosting
   ├─ Savings: €500K+ per year
   ├─ ROI: 5x return
   └─ Payback: 2.4 months
```

### Dashboard to Show to Pilots

```
Real-time metrics:
├─ Total approvals processed (this week)
├─ Average cycle time (down X% from before)
├─ Estimated cost savings (this week)
├─ Team adoption rate (X% using daily)
└─ Errors caught (vs before)

Weekly report (email):
├─ Trends (improving/stable/declining)
├─ ROI projection (extrapolated)
├─ Top users
├─ Issues/escalations
└─ Next steps
```

---

## RELAY MVP LAUNCH CHECKLIST

### Before Pilots Start

- [ ] Relay MVP built and tested
- [ ] Integration with SAP working
- [ ] Email notifications sending
- [ ] Audit logging complete
- [ ] Installers (Windows, Mac, Linux)
- [ ] Documentation (Getting Started guide)
- [ ] Support (email/Slack channel)
- [ ] Metrics dashboard ready
- [ ] Pilot agreements signed (3–5 customers)

### During Pilots (Week 1)

- [ ] Deploy to pilot customers
- [ ] User training call (30 min each)
- [ ] Collect baseline metrics (before state)
- [ ] Create monitoring dashboard
- [ ] Daily support (Slack channel)

### During Pilots (Week 2–12)

- [ ] Weekly check-ins (15 min, every Monday)
- [ ] Track metrics (see dashboard above)
- [ ] Address issues (48-hour response)
- [ ] Collect feedback (video calls, surveys)
- [ ] Plan next features based on feedback
- [ ] Take screenshots for case studies

### End of Pilots (Week 12)

- [ ] Final metrics review
- [ ] Collect testimonials (on camera, if possible)
- [ ] Create case studies (3 case studies from 3 pilots)
- [ ] Quantify ROI (X% faster, €Y saved)
- [ ] Plan public launch (June)

---

## SAMPLE MVP FINANCE WORKFLOW

### The Task
Finance team member opens Relay and types:

> "Process all pending spend approvals over €5K that pass our policy check (2 approvals needed for >€50K)."

### What Claude Does (Behind Scenes)

```
1. Fetch from SAP:
   ├─ PO#2040: €12K (vendor: Office Depot)
   ├─ PO#2041: €75K (vendor: Microsoft)
   ├─ PO#2042: €500K (vendor: AWS)
   ├─ PO#2043: €3K (vendor: Slack)
   └─ (And 3 more...)

2. Analyze Against Policy:
   ├─ PO#2040 €12K: ✓ Approve (under €50K, single approval needed)
   ├─ PO#2041 €75K: ⚠ Needs 2nd sign (over €50K threshold)
   ├─ PO#2042 €500K: ❌ Block (CFO must approve, escalate)
   ├─ PO#2043 €3K: ⊘ Skip (under €5K minimum)
   └─ ...

3. Propose Action:
   ├─ Ready to approve: PO#2040, PO#2043
   ├─ Need 2nd approval: PO#2041
   ├─ Escalate to CFO: PO#2042
   └─ "Proceed?"

4. Execute on Approval:
   ├─ Create SAP orders (PO#2040, PO#2043)
   ├─ Send approval request to CFO (PO#2042)
   ├─ Email notifications sent
   ├─ Audit trail recorded
   └─ Done
```

### Time: 47 seconds (vs 5 days manual)

---

## SUCCESS CRITERIA (How We Know MVP Works)

### For Pilots

✅ **Technical:**
- App runs without crashes
- SAP integration works reliably
- Audit logs are accurate
- Email notifications send

✅ **User Experience:**
- Finance team can understand the workflow
- Takes < 5 minutes to approve batch of requests
- Results are correct (no errors)
- They would use it again

✅ **Business:**
- Cycle time cut 50%+ (from 5 days to < 1 hour)
- Cost savings > €50K/year
- ROI clear (5+ x return)
- Want to expand to more workflows

### For Launch (June)

✅ **3–5 pilots completed with metrics**  
✅ **3 case studies written (with quotes + numbers)**  
✅ **Free tier on GitHub with 500+ stars**  
✅ **Press ready (launch announcement)**  
✅ **Sales team ready (5 hot inbound leads)**  

---

## AFTER MVP (What's Next)

### Once Pilots Prove Success

**Month 5–6 (May):**
- [ ] Expand to workflow #2 (hiring approvals)
- [ ] Add Slack integration
- [ ] Build admin dashboard (for IT team)

**Month 7 (June):**
- [ ] Launch free tier on GitHub
- [ ] Launch paid tier on seventeenlabs.io
- [ ] Hiring: VP Sales + Marketing

**Month 8–12 (July-Dec):**
- [ ] Add workflow #3 (marketing budgets)
- [ ] Add workflow #4 (contract approvals)
- [ ] Scale sales (10+ paying customers)
- [ ] Hit €1M ARR goal

---

## ONE FINAL THING

**Don't over-engineer the MVP.**

This is NOT production-ready code. This IS proof-of-concept.

Target:
- ✅ Works reliably for pilots
- ✅ Proves the concept
- ✅ Provides metrics for sales
- ✅ Fast enough to build (4 weeks)

After pilots succeed, we'll refactor for production (security, scaling, etc).

**Build fast. Validate with pilots. Then engineer properly.**

---

**This is your Relay MVP. 4 weeks to build. Pilots by May. Launch June. €1M ARR by December.**

