# RELAY MVP — QUICK REFERENCE

**Canonical spec:** Use [docs/RELAY-MVP-QUICK-REFERENCE-REVISED.md](docs/RELAY-MVP-QUICK-REFERENCE-REVISED.md) as the source of truth. See [docs/RELAY-MVP-ALIGNMENT-CHECKLIST.md](docs/RELAY-MVP-ALIGNMENT-CHECKLIST.md) for implementation guardrails.

**Build Time:** 4 weeks  
**Team:** 2 engineers  
**Target:** Pilots live by May 1, 2026  
**Workflow:** Finance spend approvals (ONE workflow only)
**Access Model:** Local no-login default; optional hosted sign-in only

---

## WHAT TO BUILD (6 Screens)

1. **Chat** — Message history + streaming response
2. **Steering** — /yes /no /modify /details /hold + free input
3. **Details** — Right panel with full context + reasoning
4. **Execution** — Real-time progress (non-blocking, user can chat)
5. **Results** — Summary + OpenClaw suggests next steps
6. **History** — Past conversations + audit log

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
| **Frontend** | Electron + Vite + React + TypeScript | Fast, familiar, can package |
| **UI** | shadcn/ui + Tailwind | Components ready, fast |
| **State** | React state (MVP), TanStack Query optional | API calls, caching |
| **Backend** | OpenClaw API | Claude + orchestration |
| **Cloud** | seventeenlabs.io API (optional) | Hosted auth + audit logging |

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

