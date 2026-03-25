# Relay Cowork Projects - Implementation and E2E Checklist

> Last updated: March 25, 2026

Use this checklist as the test gate before considering project behavior complete.

## Implementation Checklist

- [ ] `CoworkProject` model includes id, name, optional description, workspaceFolder, createdAt, updatedAt.
- [ ] Projects persist in local storage (`relay.cowork.projects.v1`).
- [ ] Active project id persists (`relay.cowork.projects.active.v1`).
- [ ] Sidebar renders project list and supports project selection.
- [ ] Project creation supports native folder picker in Electron.
- [ ] Selecting a project updates current Cowork working folder.
- [ ] Updating working folder while a project is active updates that project's folder.
- [ ] App gracefully handles missing/deleted active project.

## Runtime Integrity Checklist

- [ ] Run start captures immutable project snapshot (project id + root folder) for that run.
- [ ] Project switch during an active run does not alter current run root.
- [ ] New run always uses currently active project.
- [ ] Path normalization happens before local action boundary checks.
- [ ] Out-of-root path actions are blocked or sent through approval gate.

## Safety and Approval Checklist

- [ ] Approval payload includes project context.
- [ ] Out-of-root attempts are marked high risk.
- [ ] Safety policy scopes still enforce allow/block/approval decisions with project mode enabled.

## E2E Test Checklist

### Happy Path

- [ ] Create project with Browse picker and select it.
- [ ] Run a task that creates a file inside project root.
- [ ] Verify receipt path belongs to selected project root.

### Switching and Isolation

- [ ] Create Project A and Project B with different roots.
- [ ] Run task under Project A and verify writes in A only.
- [ ] Switch to Project B and run task; verify writes in B only.

### Boundary Protection

- [ ] Submit action targeting path outside root.
- [ ] Verify action is blocked or requires explicit approval.

### Persistence and Recovery

- [ ] Restart app and verify active project restores.
- [ ] Simulate missing folder for active project and verify write actions are prevented until rebind.

## Exit Criteria

Feature can be marked complete only when:

- [ ] All implementation items pass.
- [ ] All runtime integrity items pass.
- [ ] All safety items pass.
- [ ] All E2E scenarios pass on Electron desktop mode.
