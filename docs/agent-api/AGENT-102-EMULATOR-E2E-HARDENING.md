# AGENT-102 — Emulator E2E Hardening

**Status:** DONE  
**Runner:** `tools/agentapi/run-emulator-e2e.ps1`

## Improvements

- Auto-start AVD `RentacarAgentDev` when no emulator is online (unless `-SkipStartEmulator`)
- Physical devices refused (`emulator-*` serial required)
- ADB via `nodaemon server` when `start-server` hangs
- Gateway health wait + one force-stop/relaunch recovery
- Fixture idempotency check (re-SEED → still 3 suppliers)
- Token written to gitignored `build/agentapi-e2e/token.env`
- Machine-readable `build/agentapi-e2e/verdict.json` (`PASS`/`FAIL`)
- Cleanup only owned port forwards (no broad taskkill)

## Verification levels

| Level | Meaning |
|-------|---------|
| TESTED_ON_EMULATOR | MCP → real Room via AgentDev |
| TESTED_WITH_FIXTURES | In-process/fake gateway only |
| TESTED_WITH_REAL_CLAUDE | Requires Claude login |
