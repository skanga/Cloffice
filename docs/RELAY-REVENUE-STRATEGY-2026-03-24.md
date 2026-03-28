# Relay Revenue Strategy — Fastest Path to Money
**Date:** 2026-03-24  
**Status:** Active playbook

---

## Revenue Priority Stack (Ranked by Speed)

### Tier 1 — Services + Relay as the Deliverable (Weeks, not months)

Don't wait for SaaS subscriptions. Sell AI operations implementation as a **service** and leave Relay running as the product they keep paying for monthly.

**The pitch:**
> "We'll set up your AI agent operations — OpenClaw connected to your tools, approval workflows, cost controls, audit trail — all running on your server. Setup fee covers config + deployment. Monthly retainer covers support, updates, and your Pro seat."

**Price architecture:**
| Item | Price |
|---|---|
| AI operations audit | €3,000–8,000 one-time |
| Relay deployment + OpenClaw config | €5,000–15,000 one-time |
| Monthly Pro seat (ongoing) | €79–99/mo |
| Retainer (ongoing support + updates) | €500–2,000/mo |

**Math:** 3 clients at €5k setup + €99/mo = €15,000 in month 1 + €297/mo recurring. This funds continued development.

**Why this works:**
- Relay isn't SaaS-ready yet — but it doesn't need to be for this model
- Setup services generate cash immediately
- Every deployment is a paid beta test that improves the product
- Clients who pay for setup become loyal long-term SaaS subscribers

---

### Tier 2 — Find the "Dust-Frustrated" Buyer (1–2 months)

These buyers already have budget approved. They evaluated Dust or Cowork, got blocked by IT/legal/compliance, and are actively searching for an alternative.

**Where to find them:**
- LinkedIn: search "AI operations," "AI governance," "AI agent" + ops/IT leads at law firms, healthcare SaaS, agencies, financial services
- Dust.tt's published case studies — identify those industries, find peer companies that can't use cloud
- n8n Discord/community — threads asking "how do I add governance to my AI agents"
- r/selfhosted — users already paying for self-hosted infrastructure

**Outreach frame:**
> "We build self-hosted AI agent operations systems for [industry] companies who can't use Anthropic's cloud due to [compliance reason]. Relay is our operator desk — runs on your server, your keys, your audit trail. Would a 20-min demo be worth your time?"

**Conversion path:** Discovery call → demo → early access agreement → setup fee → monthly subscription

---

### Tier 3 — OpenClaw Ecosystem Distribution (Low-cost, compound returns)

**Action:** Get listed as the official recommended operator desk in OpenClaw's GitHub README, docs, and community.

**The mutual value argument to OpenClaw:**
- OpenClaw's adoption is slowed by the "security nightmare" perception (confirmed publicly by Andrew Wilkinson of Tiny.com)
- Relay directly solves that — it's the governance/safety layer on top of OpenClaw
- Joint positioning: "OpenClaw is your AI runtime. Relay is your operator desk. Together: enterprise-ready local AI."

**Distribution leverage:** Every OpenClaw user is a warm lead. Zero acquisition cost. Co-marketing = compounding reach with minimal spend.

---

### Tier 4 — OSS Launch + Product Hunt (1–3 months)

Release Relay Community as MIT open source. Launch on Product Hunt.

**What this generates:**
- GitHub stars → developer credibility and SEO
- Inbound from n8n users wanting the agent governance layer on top of their automations
- Inbound from OpenClaw users wanting a proper UI and approval flows
- Press/content coverage in AI tooling newsletters

**Monetization path from OSS:** Free installs → Pro upgrade prompt (approval gates, audit logs, team seats, cost controls) → €79/mo per operator seat

---

## The Single Fastest Move Right Now

**Ship it, charge for setup, keep the monthly.**

Identify 3 target businesses:
- Running or planning to run AI agents
- Cannot/will not use Anthropic's cloud (compliance, legal, or data sovereignty reason)
- Have budget for infrastructure/tooling

**Month 1 scenario:**
- Client A: €8k setup + €99/mo
- Client B: €5k setup + €99/mo  
- Client C: €5k setup + €99/mo

= **€18,000 month 1** + **€297/mo recurring**

That's real. That's fundable. That's the path.

---

## What "sellable" requires from the product right now

Before a paying client demo, Relay needs to demonstrate these 5 things:

1. **OpenClaw connects and runs** — agent dispatches a task, result appears in Relay
2. **Approval gate works** — agent proposes an action, human approves/rejects before it executes
3. **Cost display** — shows tokens/cost per agent session
4. **Basic audit log** — timestamped record of what agent did
5. **Configurable endpoint** — can point at local / VPS / custom OpenClaw URL

Everything else is polish. These 5 are the demo-able proof points that justify the setup fee.

---

## Pricing Guardrails (Don't Underprice)

Market benchmarks:
- Dust charges **€29/user/mo** cloud-only with no self-hosted option
- n8n charges **€667/mo** for self-hosted Business tier
- Lindy charges **$49.99/mo** for a single personal assistant

Relay's self-hosted + governance combination is worth **more** than Dust, not less. The buyer who needs data sovereignty is already paying their legal team far more than €79/mo to review cloud compliance.

**Recommended floors:**
- Solo operator seat: **€49/mo**
- Pro (governance + audit + connectors): **€99/mo**
- Team (3–10 seats): **€199/mo**
- Enterprise (unlimited): **€500+/mo** or custom annual

Never compete on price. Compete on sovereignty.

---

*Strategy last updated: 2026-03-24*

