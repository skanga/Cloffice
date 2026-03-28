<p align="center">
  <img src="assets/screenshots/cowork.png" alt="Cloffice cowork view" width="1100" style="border-radius: 5px;" />
</p>

<p align="center">
  <a href="#what-is-cloffice"><strong>What Is Cloffice</strong></a> &middot;
  <a href="#architecture-direction"><strong>Architecture</strong></a> &middot;
  <a href="#current-runtime-status"><strong>Current Runtime Status</strong></a> &middot;
  <a href="#quickstart"><strong>Quickstart</strong></a> &middot;
  <a href="#development"><strong>Development</strong></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT License" />
  <img src="https://img.shields.io/badge/desktop-Electron-47848f" alt="Electron" />
  <img src="https://img.shields.io/badge/frontend-React%20%2B%20Vite-646cff" alt="React + Vite" />
  <img src="https://img.shields.io/badge/language-TypeScript-3178c6" alt="TypeScript" />
</p>

## What Is Cloffice?

Cloffice is a local-first AI coworker desktop app that unifies chat, workspace context, governed approvals, scheduling, artifacts, and autonomous execution in a single interface.

This repository began as Relay and is now being rebranded and refactored into Cloffice. The long-term product direction is a built-in provider-neutral internal engine that ships with the desktop app and keeps approvals and host-governed execution at the center of the product.

## Architecture direction

Cloffice is moving toward a three-layer local architecture:

- Renderer: chat, cowork, approvals, schedules, artifacts, and workspace UX
- Electron main: trusted host actions, credential access, notifications, and engine supervision
- Cloffice engine: sessions, runs, provider adapters, scheduling, durable state, and structured action proposals

See the source-of-truth planning docs for the migration path:

- [PLAN.md](PLAN.md)
- [ARCHITECTURE.md](ARCHITECTURE.md)
- [REBRAND_CHECKLIST.md](REBRAND_CHECKLIST.md)

## Current runtime status

The product identity is now Cloffice, but this first pass does not claim the engine migration is complete.

Current repo status:

- User-facing product identity is Cloffice
- The target architecture is a built-in provider-neutral internal engine
- Existing runtime plumbing still includes transitional OpenClaw compatibility code
- Remote `workspace.*` support and the `openclaw-relay-workspace` plugin remain compatibility surfaces for now

That compatibility code is being retained deliberately until the internal engine can replace it cleanly.

## Product focus

Cloffice is being shaped around:

- local-first desktop operation
- governed approvals for consequential actions
- workspace-aware chat and cowork flows
- durable sessions, runs, schedules, and artifacts
- a provider-neutral engine boundary instead of a permanent dependency on an external runtime product

## Quickstart

Requirements:

- Node.js 20+
- npm 10+

Install and run:

```bash
git clone <repo-url>
cd cloffice
npm install
npm run dev
```

If you are using the current compatibility runtime path, configure the runtime endpoint from the Engine settings screen after launch.

Optional cloud auth setup:

```bash
cp .env.example .env
```

Set these when needed:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

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
npm run test:e2e            # Electron E2E tests (transitional mock gateway)
```

## Notes on compatibility surfaces

The following areas are still transitional and intentionally not presented as the long-term architecture:

- `src/lib/openclaw-gateway-client.ts`
- `electron/main.ts` gateway discovery and compatibility setup
- `tests/e2e/mock-gateway.mjs`
- `plugins/openclaw-relay-workspace/`
- `docs/WORKSPACE-RPC-SPEC.md`

These remain in place so the app stays structurally coherent while the provider-neutral internal engine is introduced behind cleaner seams.

## Open source

- License: [MIT](LICENSE)
- Copyright (c) 2026 SeventeenLabs
