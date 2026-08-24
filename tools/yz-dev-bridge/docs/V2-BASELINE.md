# YZ Dev Bridge V2 — Phase 0 Baseline

**Captured:** 2026-08-24  
**Branch:** `main`  
**HEAD:** `4f8b04a864901bfd72d3cb2f43e7af900dad4957`  
**Remote:** `origin https://github.com/yanivzohar1971-cmd/Rent-a-Car.git`  
**Bridge task:** `TASK-00049`  
**Authority:** local working tree (contains newer Supervisor/dashboard than GitHub)

## Plan files

Copied verbatim into:

- `docs/YZ-DEV-BRIDGE-V2-UPGRADE-PLAN.md`
- `docs/YZ-DEV-BRIDGE-V2-CURSOR-EPIC.md`

## Git status (relevant)

Local uncommitted Bridge work already present (must preserve):

- `src/dashboard/**`, `dashboard/**`
- dashboard tests + harness
- `src/github/relayRuntimeStatus.js`
- docs/package.json updates
- Unrelated: `tools/userDataCompletion/**` (out of EPIC scope — do not modify)

## Processes / ports

- Production Store: `data/bridge.json` (~344 KB)
- No dashboard listener observed on common bridge ports during baseline
- `netstat` showed unrelated `30001` listener only
- **Do not restart production Supervisor during development**

## Project registry

| id | enabled | workspace | github |
|----|---------|-----------|--------|
| rent-a-car | true | Rent_a_Car | yanivzohar1971-cmd/Rent-a-Car |
| glasses | true | Glasses | yanivzohar1971-cmd/Glasses |

No per-project `execution` metadata yet → V2 default will be `legacy`.

## Baseline checks

Commands:

```text
npm run check   # syntax + npm test
```

Result:

- **syntax:** PASS
- **tests:** `# tests 224` / `# pass 224` / `# fail 0`

Classification of failures: **none**

## Existing architecture inventory

### Core

- Store authority: `src/store.js`
- MCP HTTP/stdio: `src/http.js`, `src/stdio.js`, `src/server.js`
- Project registry: `src/projects/projectRegistry.js`
- Workspace resolution: `src/projects/resolveTaskWorkspace.js`
- Legacy launcher: `src/agent/cursorAgentLauncher.js`, `launchVisibleAgent.js`
- Session liveness: `src/agent/agentSessionLiveness.js`
- Firebase relay: `src/relay/**`
- GitHub relay: `src/github/**`, `src/githubRelay.js`

### Dashboard / Supervisor (local newer than remote)

- Entry: `src/dashboard/index.js`
- HTTP API + SSE: `src/dashboard/server.js`
- Relay supervisor: `src/dashboard/supervisor.js`
- Snapshot/present/sanitize/events
- Static UI: `dashboard/`
- Isolated harness: `test/dashboardHarness.js` (temp Store, port `0`, dummy relay)
- Scripts: `dashboard`, `control-center`, `syntax:dashboard`

### Scripts preserved

`start`, `http`, `relay`, `github-relay`, `relay:status`, `dashboard`, `control-center`, `debug:e2e`, `test`, `syntax`, `syntax:core`, `syntax:dashboard`, `check`, `cli`

## V1 contracts to freeze

MCP tools: status/create/list/get/claim/claim_next/update/put_context/get_context/list_projects  
Task IDs: `TASK-xxxxx`  
HTTP: `/mcp`, `/health`  
Dashboard already loopback-bound; test harness uses isolated Store.

## GATE A assessment

- Baseline healthy
- No structural ambiguity blocking forward progress
- Proceed automatically to Phase 1 (characterization) then Phase 2+

## Safety reminders for this EPIC

- Never use production Store for V2 tests
- Never restart production Supervisor before GATE E
- Keep all projects on `legacy` by default
- SDK/ACP opt-in only
- Do not modify `tools/userDataCompletion/**` or app business logic
