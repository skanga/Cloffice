# REBRAND_CHECKLIST.md — Relay → Cloffice

## 1. Rename visible product identity first

Update the user-visible and repository-visible identity before deeper architecture work.

### Change these first

- GitHub repo name: `Cloffice`
- repo description
- README title and opening paragraph
- app/product name shown in UI
- package/app metadata name fields
- window title
- installer/app bundle names
- app icons / assets later

### README opening line

Use this or a close variant:

> Cloffice is a local-first AI coworker desktop app that unifies chat, workspace context, governed approvals, and autonomous execution in a single interface.

---

## 2. Update the positioning language

Remove or rewrite language that frames the product as an OpenClaw client.

### Replace concepts like

- “for OpenClaw backends”
- “OpenClaw-compatible endpoint”
- “gateway URL”
- “gateway token”
- “OpenClaw workspace plugin”
- “OpenClaw desktop cowork client”

### Replace with

- “built-in local engine”
- “provider-neutral engine”
- “local-first runtime”
- “workspace-aware AI coworker”
- “governed approvals”
- “internal engine health”

---

## 3. Add missing docs now

These should exist immediately after the rebrand commit:

- `PLAN.md`
- `ARCHITECTURE.md`
- `REBRAND_CHECKLIST.md`

Optionally add later:

- `MIGRATION_TRACKER.md`
- `ENGINE_CONTRACT.md`
- `CONTRIBUTING.md`

---

## 4. Search-and-replace targets

Run repo-wide searches for these terms and classify each hit as:

- visible branding
- code identifier
- protocol/runtime contract
- docs only
- legacy compatibility note

### Search terms

- `Relay`
- `relay`
- `OpenClaw`
- `openclaw`
- `gateway`
- `gatewayUrl`
- `gatewayToken`
- `openclaw-gateway-client`
- `openclaw-config`
- `relay_actions`
- `openclaw-relay-workspace`

Do not blindly replace all lowercase `relay` occurrences until you inspect whether they refer to app naming, historical docs, or internal code concepts.

---

## 5. First-pass file areas to review

Prioritize these categories:

### Product identity
- root `README.md`
- root `package.json`
- Electron app metadata
- installer/build config
- app title strings

### Runtime coupling
- `src/lib/openclaw-gateway-client.ts`
- any gateway discovery/config code
- health checks and startup wiring
- OpenClaw plugin install logic

### Settings and config
- `AppConfig`
- config file names
- saved preference keys
- environment variables

### Tests
- E2E fixtures mentioning OpenClaw
- mock gateway files
- approval-flow fixtures with gateway assumptions

### Assets
- icons
- logos
- screenshot captions
- docs images

---

## 6. Rename in layers

### Layer 1 — product/UI naming
Change immediately.

Examples:
- app name
- README
- repo description
- visible strings

### Layer 2 — internal package/module naming
Change early, but with care.

Examples:
- package names
- folder names tied to product identity
- config file names

### Layer 3 — runtime contract naming
Change as part of the engine migration, not prematurely.

Examples:
- `GatewayClient` → `EngineClient`
- `gatewayUrl` → engine transport/config shape
- `GatewayDiscoveryResult` → engine health/startup types

### Layer 4 — historical compatibility notes
Keep temporarily where helpful.

Examples:
- migration notes
- comments stating “formerly Relay/OpenClaw path”

---

## 7. Recommended first commits

### Commit 1 — identity rebrand
- rename product strings to Cloffice
- update README
- update repo description references
- add `ARCHITECTURE.md`
- add `REBRAND_CHECKLIST.md`

### Commit 2 — docs and positioning cleanup
- remove OpenClaw-first language from docs
- add architecture overview
- document internal engine direction

### Commit 3 — config naming cleanup
- rename obvious config and settings names that are purely branding/runtime-surface related
- keep compatibility shims if needed

### Commit 4+ — engine migration
- start replacing OpenClaw runtime coupling with the internal engine plan

---

## 8. What not to do during rebrand

- do not do a giant blind search-and-replace without review
- do not rename every historical symbol before the architecture migration starts
- do not break tests and startup paths just to remove old naming instantly
- do not leave README branding out of sync with product direction

---

## 9. Immediate “done enough” bar for the rebrand

The rebrand is in a good first state when:

- the repo is named `Cloffice`
- the README consistently describes Cloffice, not Relay-for-OpenClaw
- `PLAN.md` and `ARCHITECTURE.md` are present
- user-visible product strings say Cloffice
- new architectural docs describe the internal engine direction
- OpenClaw still appears only where it is still technically present and pending migration

