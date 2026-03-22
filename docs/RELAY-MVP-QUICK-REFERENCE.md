# RELAY MVP — QUICK REFERENCE

**Build Time:** 4 weeks  
**Team:** 2 engineers + you (strategy/support)  
**Target:** Pilots live by May 1, 2026  
**Workflow:** Finance spend approvals (ONE workflow only)

---

## WHAT TO BUILD (8 Screens)

1. **Login** — OAuth, remember me, error handling
2. **Dashboard** — Stats, pending items, recent activity
3. **Task Input** — Text input, templates, send button
4. **Plan Review** — Claude's reasoning, breakdown, approve/reject
5. **Execution** — Progress steps, checkmarks, time estimate
6. **Results** — Summary, actions taken, audit ID
7. **History** — List of all workflows, timestamps, Claude reasoning
8. **Audit Log** — Detailed view of what happened, export to PDF

---

## WHAT NOT TO BUILD (For Later)

❌ Multiple workflows (hire only finance)  
❌ Custom workflow builder (templates only)  
❌ RBAC (email-based access first)  
❌ Slack integration (web only)  
❌ Compliance certs (SOC 2 later)  
❌ Analytics dashboard (simple metrics only)  
❌ Plugin system (pre-built only)  
❌ Scheduled tasks (manual only)  

---

## TECH STACK

| Layer | Tech | Why |
|-------|------|-----|
| **Frontend** | Next.js + Electron | Fast, familiar, can package |
| **UI** | shadcn/ui + Tailwind | Components ready, fast |
| **State** | TanStack Query | API calls, caching |
| **Backend** | OpenClaw API | Claude + orchestration |
| **Cloud** | seventeenlabs.io API | Auth, audit logging, SAP |

---

## WORKFLOW (What It Does)

```
User: "Process pending spend approvals > €5K"
↓
Claude analyzes SAP + policy
↓
Shows plan: "Approve 2, flag 1, escalate 1"
↓
User: [APPROVE]
↓
Execute: Create orders, send emails, log actions
↓
Done in 47 seconds (vs 5 days manual)
```

---

## 4-WEEK BUILD PLAN

### Week 1: Foundation
- [ ] Next.js + Electron setup
- [ ] OAuth login
- [ ] Dashboard, task input screens
- **Goal:** Runnable app, no backend yet

### Week 2: Workflow UI
- [ ] Plan review, execution, results screens
- [ ] OpenClaw API integration
- [ ] Send task → receive plan
- **Goal:** Can see Claude's plan

### Week 3: Execution & History
- [ ] Execute workflow (approve → run)
- [ ] Audit log screens
- [ ] Error handling
- **Goal:** Can execute, see results, view history

### Week 4: Polish
- [ ] Test SAP integration
- [ ] Error messages + loading states
- [ ] Build installers (Windows, Mac, Linux)
- **Goal:** Production-ready for pilots

---

## SUCCESS METRICS (12-Week Pilots)

| Metric | Target | Impact |
|--------|--------|--------|
| **Cycle time** | 5 days → 30 min (99% faster) | Proof of value |
| **Adoption** | 80% of finance team | Real usage |
| **Cost saved** | €500K+/year | ROI = 5x |
| **Accuracy** | 99%+ no errors | Trust |
| **ROI** | €100K cost → €500K saved | Sell point |

---

## PILOT DEPLOYMENT

**3–5 customers:**
- Finance teams (spend approvals)
- 12-week free trial
- Weekly check-ins
- Measure + document metrics
- Create 3 case studies

**Output:** Proof points for June launch

---

## AFTER MVP SUCCESS

**May:** Expand to workflow #2 (hiring)  
**June:** Launch free tier + paid tier  
**July-Dec:** 20 customers, €1M ARR

---

## KEY NUMBERS

- **Build cost:** €50K (2 engineers × 4 weeks)
- **Pilot cost:** €100K (hosting + support)
- **Total investment:** €150K to prove concept
- **Payoff:** €1M ARR by Dec (6.7x return in Year 1)

---

## DON'T FORGET

✅ Ruthlessly simple (one workflow only)  
✅ Build fast (4 weeks, not 12)  
✅ Validate with pilots (before scaling)  
✅ Measure everything (metrics = sales)  
✅ Get case studies (social proof)  

---

**This is the MVP. Build it. Prove it. Scale it.**

