# TEST-STRATEGY — Claude Agent API

**Rule:** Do not claim a test passed unless executed. No destructive tests against production Firebase or the user’s installed production APK data.

## 1. Existing test infrastructure (verified presence)

| Area | Location | Phase 0 note |
|------|----------|--------------|
| Unit tests | `app/src/test/` | Partial domain/util coverage |
| Instrumented | `app/src/androidTest/` | Not full business surface |
| Room schemas | `app/schemas/` | Migration artifacts |
| Functions | `functions/` | Own npm test story if present |

**Missing for Agent API:** contract tests, MCP protocol tests, device-gateway tests, cloud executor isolation tests, sync conflict suites for Agent writes.

## 2. UNIT TESTS

| Target | Examples |
|--------|----------|
| Operation schemas | Serialize/deserialize envelopes; reject unknown fields |
| Validation rules | Shared reservation validators; money EPS |
| Permissions | Capability denied without role/UID |
| Source selection | LOCAL_ONLY → device; synced → cloud/auto |
| Result formatting | `coverage` / warnings mandatory |
| Business calc consistency | `CarSaleCommissionPaymentLogic` statuses; reconciliation direction mapper |

## 3. INTEGRATION TESTS

| Target | Notes |
|--------|-------|
| Room + executor | In-memory or temp DB; UID isolation |
| Repository handlers | Create reservation marks dirty |
| Firestore emulator | **Preferred** for cloud executor — never prod |
| Sync worker | Dirty upload field shapes match restore |
| MCP protocol | tools/list, tools/call against test server |
| Device commands | Fake gateway + executor idempotency |

## 4. END-TO-END TESTS

| Scenario | Environments |
|----------|--------------|
| Claude Code cloud suppliers query | Staging MCP + emulator Firebase |
| Claude Mobile cloud query | Staging connector |
| Android local-only recon query | Paired device channel |
| Authorized create/update | Device executor |
| Financial confirm flow | Reject without token; succeed with |
| Device disconnect | TTL expiry → DEVICE_UNAVAILABLE |
| Network recovery | Resume dirty sync |
| Sync conflict | Local newer vs cloud |
| Tenant isolation | User A token cannot read user B |

## 5. REGRESSION TESTS (existing app)

Must remain green / manually verified before Agent release:

- Reservations CRUD
- Suppliers / customers
- Sales requests / car sales
- Commission reconciliation import/match
- Synchronization seed + delta
- Backup/restore local
- Reports/export
- Auth login/logout
- Yard flows (if touched)

## 6. Environments

| Env | Use |
|-----|-----|
| JVM unit | Default CI |
| Android emulator + debug APK with **future** applicationIdSuffix | Agent device tests |
| Firebase **emulator** / separate Firebase project | Cloud executor |
| Production | Read-only monitoring only; no Agent write soak tests |

See [DEV-ENVIRONMENT-SAFETY.md](./DEV-ENVIRONMENT-SAFETY.md).

## 7. Quality gates per phase

| Phase | Gate |
|-------|------|
| 1 | Schema unit tests |
| 2 | Executor+Room integration |
| 3 | Device channel E2E lab |
| 4 | Firestore emulator reads |
| 5–7 | MCP connect + tool call |
| 9 | Confirm/idempotency tests |
| 10 | Sync conflict suite |
| 12 | Full matrix + app regression |

## 8. Explicit non-claims

Phase 0 executed **no** Agent API tests (none exist). Existing app test suite was **not** re-run as part of this documentation-only phase.
