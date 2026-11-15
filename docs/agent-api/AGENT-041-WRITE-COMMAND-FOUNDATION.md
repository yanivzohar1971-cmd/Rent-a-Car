# AGENT-041 — Write command foundation (prepare only)

> **No production writes are enabled.** `RentCarAgentAPI` still rejects every write with `WRITE_DISABLED`;
> the new package is not wired into the API, gateway, MCP tool list or any Android path.

Package `com.rentacar.app.agentapi.commands` (pure Kotlin, no Room/Firestore dependency).

## Lifecycle

`CommandPhase`: `PREPARE → VALIDATE → AUTHORIZE → PREVIEW → AWAIT_CONFIRMATION → COMMIT → VERIFY → AUDIT`

`CommandRisk`: `NONE`, `SOFT`, `HARD`, `CRITICAL` (mirrors the catalog's confirmation policy).

## Types

| Type | Purpose |
|------|---------|
| `PreparedCommand` | immutable validated command: id, operation, parameters, `userUid`, `deviceId`, risk, idempotency key, `preparedAt`/`expiresAt`, `commandHash` (SHA-256 of operation + user + risk + canonical params) |
| `CommandPreview` / `PreviewChange` | human-readable effect; producing it never mutates anything |
| `CommandReceipt` | outcome (`REJECTED`, `PREPARED`, `SANDBOX_COMMITTED`), phase, error; `productionWritePerformed` is **always false** |
| `CommandAuditRecord`, `CommandAuditLog`, `InMemoryCommandAuditLog` | append-only audit of prepare/reject/commit |
| `CommandConfirmationToken` + `CommandConfirmationTokenService` | `cct1.<commandId>.<commandHash>.<expires>.<sig>`; HMAC-SHA256 over id, hash, **userUid**, expiry with a server-side secret (≥16 bytes). Not forgeable without the secret; bound to one command + user; expires (capped by the command's own expiry) |
| `CommandPipeline` | `prepare(AgentRequest)`, `commit(commandId, confirmationToken, auth)` |
| `DisabledWriteCommandPipeline` | rejects prepare **and** commit with `WRITE_DISABLED` (audited) |
| `PreparingWriteCommandPipeline` | prepares/previews only operations that have a `WriteCommandSpec` **and** are registered `WRITE` operations in the catalog; never commits to production |
| `WriteCommandSpec` | per-operation `risk`, `requiredPermissions`, pure `validate(params)` and `preview(params)` functions |
| `InMemoryCommandSandbox` | the only place a commit may land (optional; volatile) |

## Pipeline behavior

- `prepare`: not in specs → `WRITE_DISABLED`; no authenticated uid → `UNAUTHORIZED`; missing permission →
  `FORBIDDEN`; validator problems → `VALIDATION_FAILED`; otherwise returns command + preview + confirmation token
  (single pending command held in memory, TTL 5 min).
- `commit` without a sandbox: **always** `WRITE_DISABLED` (even with a valid token).
- `commit` with a sandbox: requires the same user, unexpired command, valid token for *that* command; consumes the
  command (single use) and records only in the sandbox; receipt says `sandboxOnly=true`,
  `productionWritePerformed=false`.

## Tests (`WriteCommandPipelineTest`)

Disabled pipeline rejection; prepare/preview without touching the fixture data layer (`mutationCount == 0`,
snapshot unchanged); validate/authorize failures; allowlist enforcement (reads and unlisted writes rejected);
commit without sandbox disabled; sandbox-only commit and single use; missing/garbled/foreign/expired tokens;
other-user commit; unforgeable token (different secret) and user binding; command hash sensitivity; **all catalog
write operations still `WRITE_DISABLED` on the Agent API**, none on the allowlist, none in MCP tools or discovery.

## Not done / next

- No production `WriteCommandSpec`s (the catalog's write schemas are placeholders: only `confirmationToken` /
  `idempotencyKey`).
- No persistent idempotency store, no transactions, no sync dirty-marking, no Room commit.
- Enabling any write requires: real validators extracted from ViewModels, repository-level commit with dirty
  marking, tombstone/delete policy, persistent audit, rate limits, and explicit approval.
