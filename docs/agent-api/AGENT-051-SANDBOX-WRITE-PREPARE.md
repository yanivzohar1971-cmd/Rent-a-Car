# AGENT-051 — Sandboxed write PREPARE + PREVIEW

**Status:** DONE (JVM / fixtures). **Production writes: 0.** Room v44 unchanged.

## Scope

First concrete write specs for `PreparingWriteCommandPipeline` (AGENT-041 foundation):

| Operation | Required | Optional | Notes |
|-----------|----------|----------|-------|
| `customer.create` | `firstName`, `lastName`, `phone` | `email`, `isCompany` | `tzId`, `address` deliberately **not accepted** (privacy-minimized, same as read DTOs) |
| `supplier.create` | `name` | `phone`, `email`, `address`, `taxId` | |
| `request.create` | `firstName`, `lastName`, `phone`, `carTypeName` | `isPurchase`, `isQuote` | Schema taken from the `Request` Room entity (clear) |

Implementation: `agentapi.commands.SandboxWriteSpecs` (`customerCreate()`, `supplierCreate()`, `requestCreate()`, `all()`).

All three are `CommandRisk.SOFT` and require the `AUTHENTICATED` permission.

## Pipeline changes

- `WriteCommandSpec` gained `normalize` (pure canonicalization applied after validation). The **normalized** map is what is hashed, previewed, confirmed and (sandbox-)committed, so `"  Alpha "` and `"Alpha"` produce the same `commandHash`.
- `PreparingWriteCommandPipeline.prepare` now runs `AgentRequestValidator.detectForbiddenParameters` (SQL / arbitrary-method screening, previously only on the read path) before the spec validator. `SQL_NOT_ALLOWED` / `ARBITRARY_METHOD_NOT_ALLOWED` are returned at the `VALIDATE` phase.
- `AgentRequestValidator.detectForbiddenParameters` is now a public companion function and additionally rejects `drop table`, `drop database`, `truncate table`, `delete from`, `insert into`, `union select` (whitespace-normalized) besides the existing `select … from` and `*sql*` / `*method*` / `*reflect*` keys.

## Validation rules (spec level)

- Unknown parameters rejected (`unknown parameters: …`), including `userUid`, `id`, `tzId`, `address`, and `confirmationToken` (a client cannot smuggle a confirmation into PREPARE).
- Text: must be strings, trimmed, max 200 chars (phone / taxId 32), no control characters; required text must be non-blank.
- Booleans must be real booleans.
- `idempotencyKey` is tolerated as a catalog envelope key but is dropped by `normalize` (does not affect the hash).

## Flow (unchanged lifecycle)

`PREPARE → VALIDATE → AUTHORIZE → PREVIEW → AWAIT_CONFIRMATION → COMMIT → VERIFY → AUDIT`

- PREVIEW: one `PreviewChange` per provided field (`before = null`), plus the warning *"Preview only: no data has been changed"*.
- COMMIT: HMAC confirmation token (bound to command id + hash + user + expiry), single use, owner-only. Lands **only** in `InMemoryCommandSandbox`; with no sandbox the result is `WRITE_DISABLED`. Receipts always have `productionWritePerformed = false`.
- Audit records never contain parameter values.

## What did NOT change

- The catalog write operations stay `REGISTERED` / `executable=false` and **off** `AgentExecutableAllowlist`; `RentCarAgentAPI`, `AuthenticatedAgentGateway` and the MCP adapter still answer every write with `WRITE_DISABLED` (or `INVALID_ARGUMENT` when business parameters not in the catalog schema are sent) and never list a write tool.
- No Room DAO/repository, Firestore, sync queue, or backup code was touched. No production wiring instantiates the pipeline.
- The catalog `inputSchema` for writes still only lists `confirmationToken` / `idempotencyKey`; the real field schemas live in `SandboxWriteSpecs` until a write executor + catalog update is approved.

## Tests

`WritePrepareSandboxTest` (18): normalized previews, required-field rejection per operation, optional/unknown parameters, length/control-char/type checks, SQL screening, no self-confirmation, idempotency-key hash neutrality, auth/permission, sandbox-only commit + single use, no-sandbox `WRITE_DISABLED`, expiry, other-user commit, specs reference only WRITE ops off the allowlist, prepared writes stay non-executable on API/gateway/MCP while fixture ports are unchanged, audit contains no PII.

Plus `AgentApiSecurityHardeningTest` (confirmation-token forgery against these specs).

## Open items before any real write

1. Decide the production commit path (repository call inside one Room transaction, dirty-sync flag behavior, cloud echo).
2. Duplicate detection (customer phone, supplier unique `name` index) at PREPARE time via a read port.
3. Persistent, uid-scoped pending-command store and idempotency store (current pending map is in-memory).
4. Update the catalog write `inputSchema` and add an explicit per-operation write allowlist.
