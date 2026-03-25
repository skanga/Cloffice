<p align="center">
  <img src="assets/abstract-svg/relay-abstract-01-operator-desk.svg" alt="Relay operator desk" width="720" />
</p>

<p align="center">
  <a href="#what-is-relay"><strong>What Is Relay</strong></a> &middot;
  <a href="#why-relay"><strong>Why Relay</strong></a> &middot;
  <a href="#features"><strong>Features</strong></a> &middot;
  <a href="#quickstart"><strong>Quickstart</strong></a> &middot;
  <a href="#development"><strong>Development</strong></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT License" />
  <img src="https://img.shields.io/badge/desktop-Electron-47848f" alt="Electron" />
  <img src="https://img.shields.io/badge/frontend-React%20%2B%20Vite-646cff" alt="React + Vite" />
  <img src="https://img.shields.io/badge/language-TypeScript-3178c6" alt="TypeScript" />
</p>

<br/>

## What Is Relay?

# AI Copilot for OpenClaw. Governed. Audited. Yours.

**If OpenClaw is the runtime, Relay is the operator desk.**

Relay is an Electron desktop app for running AI work with human oversight. It combines chat, cowork execution, workspace context, and operator controls in one interface.

**Plan. Approve. Execute. Audit.**

It looks simple on the surface, but under the hood it is designed for approvals, execution context, and day-to-day operational visibility. Manage execution from one place, not from tab sprawl.

<br/>

## Why Relay?

Relay solves a specific problem: **You want to run AI workflows on your infrastructure, with your model, with human control over consequential actions.**

| Problem | Relay's Answer |
|---------|---|
| **Data sovereignty** | Self-hosted on your server. Your infrastructure. Your keys. |
| **Model lock-in** | Use any LLM. Claude, GPT-4, Llama, your fine-tuned model — your choice. |
| **No governance** | Approval gates and audit trails are first-class features, not afterthoughts. |
| **Tab sprawl** | One desktop app for chat, execution, workspace, settings, and activity. |
| **Unclear execution** | Every action logged. Full execution timeline. Traceable rationale. |

<br/>

## How It Works

|        | Step               | What You Do                                              |
| ------ | ------------------ | -------------------------------------------------------- |
| **01** | Connect runtime    | Point Relay to your OpenClaw gateway. Verify health.     |
| **02** | Run work           | Chat or cowork with your AI agent in a project context.  |
| **03** | Approve & verify   | Review recommendations. Approve critical actions.        |
| **04** | Track & audit      | Full timeline and audit trail for every execution.       |

<br/>

## Who Should Use Relay

- ✅ You run OpenClaw locally, on a VPS, or in a custom environment
- ✅ You need data to stay on your infrastructure (GDPR, HIPAA, compliance)
- ✅ You want to choose your own LLM or use a custom endpoint
- ✅ You need approval workflows and audit trails for regulated work (finance, legal, healthcare)
- ✅ You want a desktop-first operator experience, not browser tabs
- ✅ You're building AI-native operations and need human control built in

**Not for you if:**
- You want a browser-only SaaS (use Claude Cowork)
- You want fully autonomous agents (use Paperclip)
- You don't need approval gates or audit trails

<br/>

## Features

<table>
<tr>
<td align="center" width="33%">
<h3>🖥️ Desktop First</h3>
Native Electron app with persistent local state and reliable day-to-day operation.
</td>
<td align="center" width="33%">
<h3>💬 Chat + Cowork</h3>
Discussion and execution flows in one unified operator interface.
</td>
<td align="center" width="33%">
<h3>📂 Project Context</h3>
Tasks scoped to a working folder. No context drift.
</td>
</tr>
<tr>
<td align="center">
<h3>✅ Approval Gates</h3>
High-risk actions require human review before execution.
</td>
<td align="center">
<h3>📊 Full Visibility</h3>
Files, activity, memory, schedule, safety, and approvals in one shell.
</td>
<td align="center">
<h3>🔌 Flexible Routing</h3>
Connect to local, VPS, or custom OpenClaw-compatible endpoints.
</td>
</tr>
<tr>
<td align="center">
<h3>🔐 Audit Trail</h3>
Every action logged. Execution timeline. Rationale recorded.
</td>
<td align="center">
<h3>🧠 Memory System</h3>
Persistent operator context injected into every interaction.
</td>
<td align="center">
<h3>📅 Scheduling</h3>
Create and manage recurring tasks from the UI.
</td>
</tr>
</table>

<br/>

## Relay vs The Alternatives

| Feature | Relay | Claude Cowork | Paperclip |
|---------|-------|---------------|-----------|
| **Self-hosted** | ✅ | ❌ | ✅ |
| **Model choice** | ✅ | ❌ | ✅ |
| **Approval gates** | ✅ | ⚠️ Limited | ❌ |
| **Audit trail** | ✅ | ⚠️ Limited | ❌ |
| **Desktop app** | ✅ | ❌ | ❌ |
| **Governance controls** | ✅ Full | ⚠️ Basic | ❌ |
| **Data on your server** | ✅ | ❌ | ✅ |

**The nuance:** Claude Cowork is great for personal productivity. Paperclip handles autonomous company operations. **Relay is for teams that need to run real AI workflows while keeping human control intact.**

<br/>

## Problems Relay Solves

| Without Relay | With Relay |
| --- | --- |
| You bounce between terminals, browser tabs, and config files to run AI work. | Relay centralizes execution, settings, and workspace oversight in one desktop surface. |
| Runtime setup is fragmented across environments. | Gateway URL/token setup and health checks are built directly into app flow. |
| Context drifts between tasks and folders. | Project-scoped cowork runs keep actions grounded in the intended workspace. |
| Risky actions happen without clear review boundaries. | Approval gates and safety scopes enforce human-in-the-loop control where needed. |
| You have no audit trail of what the AI did and why. | Every action, approval, and result is logged with full execution timeline. |
| Your team uses different models or no model at all. | Relay works with any LLM or custom endpoint. Your choice. |

<br/>

## Why Relay Is Different

| Pillar | What It Means |
| --- | --- |
| **Runtime separation** | OpenClaw handles backend execution. Relay focuses on operator control and visibility. Clean boundary. |
| **Desktop reliability** | Electron packaging and local persistence support real day-to-day operations. Not a web app. |
| **Governance by default** | Approval workflows are first-class features, not bolted on. Human control is the design. |
| **Context awareness** | Projects and workspace views reduce drift and mistakes during execution. |
| **Full transparency** | Every decision, action, and outcome is auditable and exportable. |
| **Your infrastructure** | Data never leaves your server. Your keys. Your control. |

<br/>

## What Relay Is Not

| What We're Not | Why |
| --- | --- |
| **Not a model provider** | Relay doesn't train or host foundation models. Bring your own or use OpenClaw with any endpoint. |
| **Not the runtime itself** | OpenClaw remains the execution/orchestration backend. Relay is the control plane. |
| **Not a browser wrapper** | Relay is a native desktop operator interface with local state and system integration. |
| **Not autonomous autopilot** | Relay is built for governed operation and progressive trust, not "set it and forget it." |
| **Not a workflow builder** | Relay isn't a visual programming tool. It's a control center for running work. |

<br/>

## Quickstart

**Requirements:**
- Node.js 20+
- npm 10+

**Install & run:**

```bash
git clone https://github.com/SeventeenLabs/relay.git
cd relay
npm install
npm run dev
```

This starts Vite, compiles Electron in watch mode, and launches Relay.

**Optional cloud auth setup:**

```bash
cp .env.example .env
```

Set these when needed:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

<br/>

## Gateway Setup

In **Settings → Gateway**:

1. Enter your OpenClaw gateway URL and token
2. Save
3. Run the health check

**Typical endpoint patterns:**

- **Local:** `ws://127.0.0.1:18789`
- **VPS:** `wss://your-domain.com`
- **Custom:** Any OpenClaw-compatible endpoint

<br/>

## Development

```bash
npm run dev                 # Full desktop dev loop
npm run build               # Build renderer + electron
npm run preview             # Preview renderer build
npm run package             # Build and package app to release/
npm run lint                # ESLint
npm run typecheck           # TS type checks (renderer + electron)
npm run verify              # lint + typecheck + smoke tests
npm run test:local-actions  # Local actions smoke tests
npm run test:e2e            # Electron E2E tests (mock gateway)
```

<br/>

## Community

- **Security issues:** hello@seventeenlabs.io
- **Bug reports & feature requests:** [GitHub Issues](https://github.com/SeventeenLabs/relay/issues)
- **Contributions:** [CONTRIBUTING.md](CONTRIBUTING.md)
- **Code of conduct:** [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)
- **Security policy:** [SECURITY.md](SECURITY.md)
- **Support:** [SUPPORT.md](SUPPORT.md)

<br/>

## Open Source

- License: [MIT](LICENSE)
- Copyright © 2026 SeventeenLabs
- Built for operators who believe AI should be governed, auditable, and under human control.

---

**Get started:** [Download](https://github.com/SeventeenLabs/relay/releases) the latest build or clone and run locally.

**Questions?** Open an issue or reach out to hello@seventeenlabs.io.
