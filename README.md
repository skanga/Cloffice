<p align="center">
  <img src="assets/screenshots/cowork.png" alt="Cloffice cowork view" width="1100" style="border-radius: 5px;" />
</p>

<p align="center">
  <a href="#what-is-cloffice"><strong>What Is Cloffice</strong></a> &middot;
  <a href="#architecture"><strong>Architecture</strong></a> &middot;
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

Cloffice ships as a built-in provider-neutral desktop runtime with approvals and host-governed execution at the center of the product.

## Architecture

Cloffice currently uses a three-layer local architecture:

- Renderer: chat, cowork, approvals, schedules, artifacts, and workspace UX
- Electron main: trusted host actions, credential access, notifications, and the internal engine host
- Cloffice engine: sessions, runs, provider adapters, scheduling, durable state, and structured action proposals

Current source-of-truth docs:

- [PLAN.md](PLAN.md)
- [ARCHITECTURE.md](ARCHITECTURE.md)
- [REBRAND_CHECKLIST.md](REBRAND_CHECKLIST.md)

## Current runtime status

- User-facing product identity is Cloffice
- Core product flows run through the built-in internal engine
- No external compatibility runtime is required for chat, cowork, approvals, schedules, or artifacts
- Provider-backed chat and cowork support OpenAI-compatible, Anthropic, and Gemini models
- Product naming, storage keys, and runtime configuration now use Cloffice-native terminology

## Product focus

Cloffice is built around:

- local-first desktop operation
- governed approvals for consequential actions
- workspace-aware chat and cowork flows
- durable sessions, runs, schedules, and artifacts
- a provider-neutral engine boundary owned by Cloffice

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
npm run verify:release      # release gate, includes internal-engine UI E2E
npm run test:local-actions  # Local actions smoke tests
npm run test:e2e            # Electron E2E tests
```

Internal-engine UI E2E:

- `npm run test:e2e:internal-engine-ui` runs the full internal-engine UI suite.
- For low-memory debugging on Windows `cmd`, run `npm.cmd run dev:e2e` in one window, then run a single Playwright test from a second window with `npx.cmd playwright test -c playwright.electron.config.ts tests/e2e/internal-engine-ui.spec.ts --workers=1 --grep "<test name>"`.

## Documentation

This repository keeps only current Cloffice product documentation.

Current source of truth:

- [PLAN.md](PLAN.md)
- [ARCHITECTURE.md](ARCHITECTURE.md)
- [REBRAND_CHECKLIST.md](REBRAND_CHECKLIST.md)

## Open source

- License: [MIT](LICENSE)
- Copyright (c) 2026 SeventeenLabs
