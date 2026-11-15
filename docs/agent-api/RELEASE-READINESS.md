# RELEASE READINESS — Claude Agent API

## Verdict: **NOT READY for production.** Do not merge to `main`, deploy, or install on a production device.

State on `feature/claude-agent-api` (uncommitted working tree on top of `a4dd203`):

- 33 Android-local **read** operations implemented and fixture-tested; 0 executable writes; 0 executable cloud operations.
- Authenticated gateway, MCP adapter, Node MCP host, command prepare/preview pipeline, workflow stubs, connection-diagnostics ViewModel/screen: all JVM/fixture-verified only.
- Room schema v44 unchanged. No sync, backup, Firebase, or secret changes.

## Blockers (must be resolved before any production use)

### Connectivity & transport
1. **No real device transport.** No foreground-service listener or outbound relay; the gateway is pure Kotlin and the loopback HTTP server exists only in the unit-test source set. `MCP_CONNECTED_TO_REAL_ANDROID = false`.
2. **No TLS / public endpoint** and no hardened network exposure design implemented.
3. **No Claude Code or Claude Mobile connection ever made** (`MCP_CONNECTED_TO_CLAUDE_CODE = false`); Mobile cannot use app localhost and the cloud path is a disabled stub.

### Identity & secrets
4. **No production `TrustedSessionBinder`** over the real app session; `BoundSessionIdentity` is only created by test/trusted-binder code.
5. **No persistent, encrypted token store** (Android Keystore); `InMemoryDeviceTokenStore` loses tokens on process death. Token signing secret provisioning/rotation is undefined.
6. **No pairing UX** (QR/code approval) and the diagnostics screen is not linked from any menu; its revoke button has no production `DevicePairingService` behind it (default source is `NotPairedConnectionSource`).
7. No rate limiting / brute-force lockout / audit log persistence for the gateway.

### Data safety
8. **No safe non-production environment**: debug APK shares the production `applicationId` and Firebase project; a dev flavor with isolated Firebase is design-only.
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
