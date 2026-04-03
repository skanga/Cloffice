# Final Release Findings Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Resolve the remaining final-release review findings so the shipped product, trust boundary, docs, and release gate all align with the current architecture.

**Architecture:** Fix the remaining boundary inconsistencies at the Electron preload/main seam first, because those are the highest-risk gaps and they influence the correct shape of the renderer APIs. Then remove stale runtime configuration concepts so the docs, settings UI, and persisted config model all describe the same product. Finish with product-text cleanup and a stronger release gate so these regressions are caught before packaging.

**Tech Stack:** Electron, React 19, TypeScript, Playwright, ESLint, Vite

---

## Scope

This plan addresses all remaining findings from the final code and architecture review:

1. Production preload still exposes raw host powers that do not match the documented governed host-action boundary.
2. `healthCheck` / `checkRuntimeHealth` still expose arbitrary host-side fetch from the renderer.
3. Gateway/runtime URL and token are still first-class config even though the architecture says the built-in internal runtime is the live product path.
4. User-facing mojibake is still present in shipped UI text.
5. The default `verify` gate does not include the UI E2E suite that caught several real regressions.

## Task 1: Lock Down Runtime Health Checks To The Internal Runtime Model

**Files:**
- Modify: `electron/preload.cts`
- Modify: `electron/main.ts`
- Modify: `src/types.d.ts`
- Modify: `src/lib/engine-runtime-shell-controller.ts`
- Modify: `src/features/auth/onboarding-page.tsx`
- Modify: `src/features/settings/settings-page.tsx`
- Test: `scripts/file-safety-smoke.mjs`
- Test: `scripts/local-actions-smoke.mjs`

**Why first:** This is the smallest remaining host-side fetch bypass and should be removed before reshaping broader runtime config.

**Step 1: Write or extend the regression checks**

Add smoke coverage that fails if:
- production preload exposes `healthCheck(baseUrl: string)` or `checkRuntimeHealth(baseUrl: string)` as arbitrary URL-taking APIs
- `backend:health-check` in main accepts a raw renderer-supplied URL instead of an internal-only or app-owned descriptor

Suggested checks:
- `scripts/file-safety-smoke.mjs`: assert `electron/preload.cts` does not contain the old raw `baseUrl` signatures
- `scripts/local-actions-smoke.mjs`: assert `electron/main.ts` no longer exposes a generic `runHealthCheck(endpointUrl: string)` handler path

**Step 2: Replace raw URL health checks with a narrow runtime intent**

Refactor the bridge so the renderer can only ask for the current built-in internal runtime health, not an arbitrary URL.

Target shape:
- preload: `checkInternalRuntimeHealth(): Promise<EngineRuntimeHealthResult>`
- main: a handler that derives the runtime target from app-owned config or a constant internal runtime descriptor
- renderer: onboarding/settings call the narrow API instead of passing a URL

Do not preserve a compatibility path that accepts arbitrary `http(s)` from the renderer. If a debug-only custom endpoint is still needed, gate it behind the existing dev/test bridge.

**Step 3: Run focused verification**

Run:
- `npm.cmd run lint`
- `npm.cmd run typecheck`
- `npm.cmd run test:file-safety`
- `npm.cmd run test:local-actions`

Expected:
- all commands pass
- no remaining generic host-fetch health-check surface in production preload/main

**Step 4: Commit**

```bash
git add electron/preload.cts electron/main.ts src/types.d.ts src/lib/engine-runtime-shell-controller.ts src/features/auth/onboarding-page.tsx src/features/settings/settings-page.tsx scripts/file-safety-smoke.mjs scripts/local-actions-smoke.mjs
git commit -m "refactor: narrow runtime health checks to internal runtime"
```

## Task 2: Remove Production Raw Host-Power APIs Or Move Them Behind Narrow Intents

**Files:**
- Modify: `ARCHITECTURE.md`
- Modify: `electron/preload.cts`
- Modify: `electron/connector-host.ts`
- Modify: `electron/local-files.ts`
- Modify: `electron/main.ts`
- Modify: `src/types.d.ts`
- Modify: `src/lib/desktop-bridge.ts`
- Modify: `src/lib/connectors/shell.ts`
- Modify: `src/lib/connectors/web-fetch.ts`
- Modify: `src/lib/engine-local-action-orchestrator.ts`
- Test: `scripts/file-safety-smoke.mjs`
- Test: `scripts/local-actions-smoke.mjs`

**Why second:** The release review still says the documented trust boundary and the shipped preload surface disagree. This task resolves that explicitly.

**Step 1: Decide the supported product contract**

Use the architecture doc as the source of truth:
- renderer may request governed actions
- Electron main executes host actions
- production preload should not expose broad, generic host powers

Keep dev/test-only helper paths behind `CLOFFICE_ENABLE_TEST_BRIDGE` or equivalent.

**Step 2: Audit the remaining production bridge methods**

Classify each remaining consequential method in `electron/preload.cts`:
- keep as harmless UI shell API
- narrow to a domain intent
- move behind dev/test bridge only
- delete entirely

Minimum required decisions:
- raw file mutation methods
- `shellExec`
- `webFetch`
- `openPath`

**Step 3: Implement the chosen production boundary**

Recommended release-safe target:
- production renderer no longer gets generic `shellExec` or `webFetch`
- file mutation remains available only through existing governed local-file / schedule / cowork flows that main already validates against explorer authority
- any connector-host path intended only for local action execution is invoked from main-owned orchestration, not directly from renderer

If the product intentionally wants operator-triggered shell/web connectors in production, then update `ARCHITECTURE.md` to say that explicitly and document the reduced threat assumption. Do not leave the current mismatch unresolved.

**Step 4: Update smoke coverage**

Extend the smoke tests so they fail if the final chosen boundary regresses. The checks must validate behavior, not stale file locations.

**Step 5: Run focused verification**

Run:
- `npm.cmd run lint`
- `npm.cmd run typecheck`
- `npm.cmd run test:file-safety`
- `npm.cmd run test:local-actions`

If shell/web connector behavior changes materially, also run:
- `npm.cmd run verify`

**Step 6: Commit**

```bash
git add ARCHITECTURE.md electron/preload.cts electron/connector-host.ts electron/local-files.ts electron/main.ts src/types.d.ts src/lib/desktop-bridge.ts src/lib/connectors/shell.ts src/lib/connectors/web-fetch.ts src/lib/engine-local-action-orchestrator.ts scripts/file-safety-smoke.mjs scripts/local-actions-smoke.mjs
git commit -m "refactor: align production bridge with governed host boundary"
```

## Task 3: Remove Stale Gateway URL / Token Product Concepts

**Files:**
- Modify: `ARCHITECTURE.md`
- Modify: `src/app-types.ts`
- Modify: `src/lib/engine-config.ts`
- Modify: `electron/main.ts`
- Modify: `electron/preload.cts`
- Modify: `src/types.d.ts`
- Modify: `src/features/auth/onboarding-page.tsx`
- Modify: `src/features/settings/settings-page.tsx`
- Modify: `src/lib/engine-runtime-shell-controller.ts`
- Test: `tests/e2e/internal-engine-ui.spec.ts`

**Why third:** Once runtime health checks are narrowed, the remaining runtime URL/token fields can be removed cleanly instead of being kept alive for legacy compatibility.

**Step 1: Normalize the intended product model**

The built-in internal runtime is the live product path. Remove first-class runtime URL/token fields from the production config model unless they are explicitly dev-only.

Target state:
- no operator-facing runtime token field in production UI
- no production copy saying “this field is unused”
- app config types reflect the internal runtime product reality

**Step 2: Refactor config types and persistence**

In `src/app-types.ts`, `src/lib/engine-config.ts`, and `electron/main.ts`:
- remove or demote `endpointUrl` and `accessToken`
- preserve a migration path for existing persisted config entries so old installs do not break
- if debug-only custom endpoint support must remain, move it into an explicitly development-only config path

**Step 3: Simplify onboarding and settings**

In onboarding/settings:
- remove runtime endpoint and token inputs from production UI
- replace them with clear built-in runtime copy
- keep any debugging controls only when the dev/test bridge is enabled

**Step 4: Align docs**

Update `ARCHITECTURE.md` and any in-app helper text so the product description, config model, and UI all describe the same runtime story.

**Step 5: Run verification**

Run:
- `npm.cmd run lint`
- `npm.cmd run typecheck`
- `npm.cmd run verify`
- `npx.cmd playwright test -c playwright.electron.config.ts tests/e2e/internal-engine-ui.spec.ts --grep "onboarding can connect the internal runtime in the live UI" --workers=1 --reporter=list`

Expected:
- onboarding still works
- settings no longer expose stale runtime token/URL concepts in production mode

**Step 6: Commit**

```bash
git add ARCHITECTURE.md src/app-types.ts src/lib/engine-config.ts electron/main.ts electron/preload.cts src/types.d.ts src/features/auth/onboarding-page.tsx src/features/settings/settings-page.tsx src/lib/engine-runtime-shell-controller.ts tests/e2e/internal-engine-ui.spec.ts
git commit -m "refactor: remove stale runtime gateway config from product UI"
```

## Task 4: Remove Remaining Mojibake From User-Facing UI And Add Regression Coverage

**Files:**
- Modify: `src/features/workspace/scheduled-page.tsx`
- Modify: `src/features/auth/onboarding-page.tsx`
- Modify: `src/features/settings/settings-page.tsx`
- Modify: `electron/main.ts`
- Modify: `scripts/file-safety-smoke.mjs`

**Why fourth:** This is a release-quality issue, but it is mechanically straightforward after the higher-risk architecture changes are done.

**Step 1: Replace corrupted user-facing strings**

Clean the visible corruption currently reported in:
- `src/features/workspace/scheduled-page.tsx`
- `src/features/auth/onboarding-page.tsx`
- `src/features/settings/settings-page.tsx`
- any user-visible text in `electron/main.ts`

Specific replacements likely include:
- `â€”` -> `—` or ASCII fallback `-`
- `Â·` / `�` separators -> a consistent separator such as `·` or ` | `
- corrupted comment banners -> ASCII comments or remove them entirely
- corrupted close glyphs -> a valid text label or proper icon

Prefer ASCII when practical, per project rules, unless the file already uses a legitimate glyph consistently.

**Step 2: Add regression coverage**

Expand `scripts/file-safety-smoke.mjs` so it scans the affected user-facing files for known mojibake markers:
- `Ã`
- `Â`
- `â€`
- `�`

Keep the checks narrow enough to avoid false positives, but broad enough to catch new regressions in shipped UI text.

**Step 3: Run verification**

Run:
- `npm.cmd run lint`
- `npm.cmd run typecheck`
- `npm.cmd run test:file-safety`
- `npm.cmd run verify`

**Step 4: Commit**

```bash
git add src/features/workspace/scheduled-page.tsx src/features/auth/onboarding-page.tsx src/features/settings/settings-page.tsx electron/main.ts scripts/file-safety-smoke.mjs
git commit -m "fix: remove mojibake from user-facing UI text"
```

## Task 5: Promote Internal-Engine UI E2E Into The Release Gate

**Files:**
- Modify: `package.json`
- Modify: `README.md` or release docs if present
- Modify: `playwright.electron.config.ts` only if a lower-memory or CI-safe config split is needed

**Why last:** The suite is now valuable because it caught real regressions, but it should be integrated only after the above fixes reduce expected churn.

**Step 1: Define the release gate shape**

Do not force the heaviest local workflow into the default `verify` command if that will make normal iteration unusable on the target machine.

Recommended structure:
- keep `verify` as the fast local gate
- add a stronger release gate, for example `verify:release`, that includes:
  - `npm run verify`
  - `npm run test:e2e:internal-engine-ui`

If memory pressure remains a concern, add a documented alternative:
- `verify:release:manual` with the two-window cmd workflow already proven during debugging

**Step 2: Encode the stronger gate**

In `package.json`:
- add `verify:release`
- optionally add a smaller `test:e2e:internal-engine-ui:single` helper for one-test debugging

Suggested shape:

```json
"verify:release": "npm run verify && npm run test:e2e:internal-engine-ui"
```

If necessary, add a lower-memory headedless/single-worker variant rather than changing the existing script semantics unexpectedly.

**Step 3: Document the workflow**

Add a short release note in the repo docs describing:
- fast local verification
- release verification
- single-test E2E debugging from `cmd`

**Step 4: Run verification**

Run:
- `npm.cmd run verify`
- `npm.cmd run test:e2e:internal-engine-ui`

If the full suite is too heavy locally, at minimum run:
- `npm.cmd run verify`
- the full internal-engine UI suite using the two-window `cmd` workflow

**Step 5: Commit**

```bash
git add package.json README.md playwright.electron.config.ts
git commit -m "build: add internal engine UI suite to release verification"
```

## Recommended Execution Order

1. Task 1: lock down health checks
2. Task 2: align production preload with governed host boundary
3. Task 3: remove stale runtime gateway config
4. Task 4: clean mojibake and add regression coverage
5. Task 5: strengthen the release gate

## Final Verification Checklist

Run from `cmd` or PowerShell as appropriate:

```bash
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run verify
npm.cmd run test:e2e:internal-engine-ui
```

For low-memory debugging:

```bash
npm.cmd run dev:e2e
npx.cmd playwright test -c playwright.electron.config.ts tests/e2e/internal-engine-ui.spec.ts --workers=1 --reporter=list
```

Expected final state:
- production bridge matches documented trust boundary
- no arbitrary renderer-driven host fetch for runtime health
- no stale runtime URL/token product UX
- no visible mojibake in shipped UI
- release verification includes the internal-engine UI suite
