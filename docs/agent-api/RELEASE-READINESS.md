# RELEASE READINESS — Claude Agent API

## Verdict: **NOT READY for production.** Do not merge to `main`, deploy, or install on a production device.

State on `feature/claude-agent-api` after AGENT-101:

- 33 Android-local **read** operations; 0 executable writes; 0 executable cloud operations.
- **Emulator path verified:** Windows MCP → ADB forward → AgentDev APK (`com.rentacar.app.agentdev`) → real Room repositories (see `AGENT-101-E2E-TEST-RESULTS.md`).
- Production / `standard` flavor and production Firebase remain untouched. Room schema v44 unchanged.
- Claude Code MCP server `rentcar-emulator` registered locally; **live NL query not executed** (`CLAUDE_CODE_LOGIN_REQUIRED`).

## Blockers (must be resolved before any production use)

### Connectivity & transport
1. **No physical-device production transport.** Emulator loopback + ADB forward only; no FGS listener, outbound relay, or TLS public endpoint. `MCP_CONNECTED_TO_REAL_ANDROID = true` for **emulator AgentDev only**.
2. **No TLS / public endpoint** and no hardened network exposure design implemented.
3. **Claude Code not authenticated** (`MCP_CONNECTED_TO_CLAUDE_CODE = false`); Mobile cannot use app localhost; cloud path remains a disabled stub.

### Identity & secrets
4. **No production `TrustedSessionBinder`** over the real app session; `BoundSessionIdentity` is only created by test/trusted-binder code.
5. **No persistent, encrypted token store** (Android Keystore); `InMemoryDeviceTokenStore` loses tokens on process death. Token signing secret provisioning/rotation is undefined.
6. **No pairing UX** (QR/code approval) and the diagnostics screen is not linked from any menu; its revoke button has no production `DevicePairingService` behind it (default source is `NotPairedConnectionSource`).
7. No rate limiting / brute-force lockout / audit log persistence for the gateway.

### Data safety
8. **`standard` debug still shares production `applicationId` / Firebase.** AGENT-101 added isolated `agentdev` (`com.rentacar.app.agentdev`, offline) for emulator tests — not a full non-prod Firebase project.
9. **Writes are not implemented.** The prepare/preview pipeline is sandbox-only; no Room commit path, no transactional multi-row commands, no duplicate detection, in-memory pending/idempotency stores. Catalog write schemas still list only placeholder fields.
10. **Sync risks inherited by any future write**: no delete tombstones, `sync_queue` not UID-scoped / may duplicate dirty rows, cloud writes lack server business validation (see `03-SYNC-ARCHITECTURE.md`, PROGRESS risks).
11. Reads may return stale data: results carry "sync freshness unknown" warnings; no sync-state integration.
12. Blocked reads: `terms.load.effective`, `reservation.terms.effective` (global `CurrentUserProvider`), `settings.sync.check` (cloud comparison). 66 further reads are `NOT_ELIGIBLE` (`READ-ELIGIBILITY.md`).

### Verification gaps
13. Acceptance **TEST A–L** have not been executed against a real device or real Claude client (`ACCEPTANCE-CHECKLIST.md`); the A–L list itself is a reconstruction and must be reconciled with the master mission.
14. The Hebrew RTL diagnostics screen has never been rendered on a device/emulator (compiles only).
15. No penetration-style review of gateway/MCP (Phase 11), no prompt-injection allowlist review beyond unit tests, no app regression run (reservations, sync, backup, commissions) for this branch.
16. Workflows are engine-level only; not exposed via gateway/MCP, so their end-to-end behavior is unverified.

## Residual hardening notes (this slice)

- Fixed during hardening: gateway identity-key screening now also inspects maps nested inside lists/arrays; SQL screening additionally rejects destructive statement fragments (`drop table`, `delete from`, `insert into`, `union select`, …) and collapses whitespace; the write pipeline now applies the same screening as reads.
- Known limitation: SQL screening is a deny-pattern backstop, not the primary defense — the primary defenses are the typed executors and the absence of any raw-SQL path.

## Minimum path to a first safe release candidate

1. Non-production flavor (`applicationId` suffix + isolated Firebase project).
2. Keystore-backed token store + production session binder + pairing UX + diagnostics screen wired to the real service.
3. On-device FGS listener or outbound relay with TLS; run TEST A–F, J, K on that flavor with real Claude Code.
4. Reads-only release first; writes stay `WRITE_DISABLED` until the commit path, duplicate/idempotency stores, and sync consistency checks (roadmap Phase 9–10) are done and approved.
5. Explicit approval before any merge to `main`, deploy, or APK installation on production data.
