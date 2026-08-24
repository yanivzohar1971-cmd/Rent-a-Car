# YZ Dev Bridge V2 — Architecture (additive)

**Status:** Control-plane V2 implemented; production projects remain on **legacy**.  
**Task:** TASK-00049  
**Date:** 2026-08-24

## Compatibility

- V1 MCP tools unchanged
- Store remains authority
- Firebase / GitHub relays unchanged
- Legacy visible Agent launcher preserved
- Project `execution.mode` defaults to `legacy` for all registry projects

## New modules (`src/execution/`)

| Module | Role |
|--------|------|
| `types.js` | Provider IDs, normalized events, execution config |
| `router.js` | Provider selection (SDK/ACP require explicit flags) |
| `providers/legacyProvider.js` | Wraps existing launcher |
| `providers/cursorSdkProvider.js` | Opt-in SDK probe/adapter (disabled by default) |
| `providers/cursorAcpProvider.js` | Opt-in ACP probe/adapter (disabled by default) |
| `workerManager.js` | Child-process JSONL IPC |
| `leases.js` | Durable per-project writer leases |
| `gates.js` | Operator gate CONTINUE/CHANGE/ABORT |
| `verification.js` | PASS/FAIL/FLAKY/BLOCKED pipeline |
| `circuitBreaker.js` | Bounded provider start failures |

Worker: `workers/mockProviderWorker.js`  
Probe CLI: `npm run provider:probe` / `npm run v2:probe`

## Safety rules enforced in code/tests

- No automatic SDK selection when `allowSdk=false`
- No post-mutation auto-fallback (`canAutoFallback`)
- One writer lease per project
- Malformed worker JSON quarantines worker, not Supervisor
- Flaky verification is not PASS

## Dashboard / Playwright

- Isolated harness: temp Store + port `0` + dummy relay
- Command: `npm run test:playwright`
- Viewports: 375, 390, 430, 768, 1366, 1920
- Assertions: no document horizontal overflow (incl. RTL dir), fixed table scroll, filters, SSE

## Production cutover (GATE E — not done)

Proposed first cutover (when approved):

```text
Supervisor V2 code: ON (already in tree)
Projects execution: legacy (unchanged)
SDK/ACP: available but not default
AUTO: OFF
```

Rollback:

1. Keep `execution.mode=legacy` (already)
2. Feature flags leave SDK/ACP disabled
3. Revert V2 files via Git if needed — V1 path intact

Do **not** restart production Supervisor until GATE E CONTINUE.
