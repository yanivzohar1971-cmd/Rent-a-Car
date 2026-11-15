# AGENT-101 — E2E Test Results

**Run date:** 2026-11-15  
**Mode:** `EMULATOR_REAL_ROOM` (no fixture fallback)  
**Gateway:** `http://127.0.0.1:18765` via `adb -s emulator-5554 forward`  
**Package:** `com.rentacar.app.agentdev`  
**Results JSON:** `build/agentapi-e2e/results.json` (gitignored)

## Levels

| Level | Status |
|-------|--------|
| Fixture MCP tests | Prior work (still available via `FIXTURE_TEST`) |
| Real emulator Room tests | **PASS** (18/18 checks) |
| Real Claude Code NL query | **NOT EXECUTED** — CLI installed, not logged in |
| Production readiness | **NOT READY** |

## MCP / Room checks (executed)

| ID | Check | Result |
|----|-------|--------|
| — | mcp-host starts EMULATOR_REAL_ROOM | PASS |
| — | initialize reports mode | PASS |
| — | tools/list (33 read tools) | PASS |
| E2E-001 | supplier.list → Alpha/Beta/Gamma | PASS |
| E2E-002 | supplier.get id=9001 → Alpha Rentals | PASS |
| E2E-003 | customer.list ≥ 2 | PASS (3) |
| E2E-004 | customer.get id=9301 → Dana Levi | PASS |
| E2E-005 | reservation.list.manage ≥ 4 | PASS (6) |
| — | order/contract numbers present | PASS |
| E2E-006 | reservation.get id=9402 → ORD-ALPHA-1002 | PASS |
| E2E-007 | commission.summary.totals payoutMonth=2026-03 | PASS (Room calc; totals may be 0 for month) |
| E2E-008 | unknown operation rejected | PASS |
| E2E-009 | write (supplier.create) disabled | PASS |
| E2E-010 | missing/invalid auth rejected | PASS |
| E2E-011 | client userUid → FORBIDDEN_FIELD | PASS |
| E2E-012 | unreachable gateway ≠ fake data | PASS (ECONNREFUSED) |
| E2E-014 | MCP list ≡ direct gateway Room list | PASS |
| E2E-015 | production package not installed on emulator | PASS (pm path empty for `com.rentacar.app`) |

E2E-013 (restart recover): transport restored by re-forward + healthy `/v1/health` during the same session; full cold reboot not re-run in final pass.

## Regression

| Suite | Result |
|-------|--------|
| `:app:testStandardDebugUnitTest` | **736 tests, 0 failures** (Room schema still v44) |
| `tools/mcp-host` Node tests | **9/9 PASS** (with clean env) |

## Errors encountered / fixes

1. **No system-images on disk** despite sdkmanager metadata → installed `android-34;google_apis;x86_64`
2. **`adb start-server` hangs (SYN_SENT)** → use `adb nodaemon server`; runner updated
3. **No AVD** → created `RentacarAgentDev`
4. **get operations require `id`** (not supplierId) → E2E args fixed
5. **commission.summary.totals requires `payoutMonth`** → E2E args fixed
6. **Env pollution** (`RENTACAR_EXECUTION_MODE`) broke MCP stdio unit test → clear env; pin FIXTURE_TEST in that test

## Claude Code

| Item | Result |
|------|--------|
| `claude --version` | 2.1.292 |
| `claude mcp add rentcar-emulator` | Local scope registered |
| `claude mcp get rentcar-emulator` | Connected when emulator gateway up |
| Live NL business query | **BLOCKED** — `CLAUDE_CODE_LOGIN_REQUIRED` |
