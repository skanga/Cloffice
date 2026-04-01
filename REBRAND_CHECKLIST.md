# REBRAND_CHECKLIST.md - Cloffice Rebrand Status

## 1. Current status

The rebrand is complete.

Cloffice is the live product identity and the live runtime path is internal-engine-first.

## 2. Completed items

- [x] Repo and product identity are Cloffice
- [x] User-visible app flow is Cloffice-first
- [x] README and architecture docs exist for the Cloffice product direction
- [x] Onboarding is internal-engine-first
- [x] Legacy compatibility discovery and plugin-install flow are removed from the product path
- [x] Main engine setup is internal-only
- [x] Provider-backed chat and cowork run through the built-in engine
- [x] Cloffice-native config storage is in place
- [x] Provider credentials are separated from plain config JSON
- [x] Active storage and config keys use Cloffice-native naming
- [x] Current docs describe Cloffice rather than the previous product identity

## 3. Product language status

Product-facing language is aligned with the Cloffice architecture.

Preferred concepts now used in the product:

- built-in internal engine
- provider-backed cowork
- local-first runtime
- governed approvals
- internal runtime diagnostics

No longer part of the main product story:

- external compatibility endpoint
- gateway URL as a required setup concept
- gateway token as a required setup concept
- legacy workspace compatibility plugin
- legacy desktop compatibility client

## 4. Current completion bar

The rebrand should be treated as complete because:

- the repo is Cloffice
- the visible product is Cloffice
- the runtime is Cloffice-owned
- no external compatibility runtime is required for core flows
- active config, storage, and test identifiers use Cloffice-native naming
- current docs describe only the Cloffice product architecture

## 5. Practical completion estimate

Rebrand completion: 100 percent.

What remains in the repo is normal product evolution work, not rebrand debt.
