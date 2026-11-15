# 06 — Android Local Agent API Feasibility

**Mode:** Design only (no implementation in Phase 0).

## 1. Preferred local stack

```
Claude / MCP bridge
  → RentCarAgentAPI (capability registry)
    → AuthorizedCommandExecutor
      → Existing repositories / domain services
        → Room DAOs
```

**Manual DI:** Use `DatabaseModule` factories already used by `NavGraph` — do not introduce Hilt solely for Agent unless a later phase chooses to.

## 2. Feasibility verdict

| Concern | Verdict |
|---------|---------|
| Kotlin implementation | Feasible inside `:app` |
| Reuse repositories | Yes — primary strategy |
| Structured schemas | Need new `agentapi` package (contracts) |
| Query without SQL | Capability functions wrapping DAO/repo queries |
| Writes with validation | Call repository methods used by ViewModels |
| Transactions | Reuse `@Transaction` repo methods |
| Background execution | Coroutine scope + optional foreground service for remote channel |
| Lifecycle | Process death ⇒ in-flight Agent cmds must be idempotent / resumable |
| Arbitrary SQL / reflection | **Forbidden** |
| Capability registry | **Required** |

## 3. Capability registry strategy (anti-boilerplate)

Avoid one-off glue explosion:

1. **Declarative operation descriptors** (Kotlin + kotlinx.serialization): id, side, authz, confirmation, params schema, result schema.
2. **Handler interfaces** grouped by module (`ReservationsHandlers`, `CommissionsHandlers`, …).
3. **Codegen optional later** — Phase 2 can start with hand-written handlers for Slice 1–3; generate from descriptors if count becomes painful.
4. **Shared contracts module** (or `agentapi/contract` source set) usable by MCP server and Android.

## 4. Read path

- Prefer existing `*Dao` Flow/suspend queries already UID-scoped.
- Map to DTOs that include: local ids, supplier order numbers, sync metadata.
- Never return raw unrestricted cursor dumps (esp. DebugDbBrowser).

## 5. Write path

- Executor resolves `OPERATION_ID` → handler → repository method.
- Handler applies same preconditions as ViewModel (extract shared validators when logic is VM-embedded — refactor in later phases, not Phase 0).
- After success, rely on existing `SyncDirtyMarker` for cloud propagation.

## 6. ViewModel-embedded logic (refactor candidates)

Observed pattern: substantial logic in `*ViewModel` and Compose screens (commission reconciliation, terms editor, reservation editor).

**Phase 0 action:** document only.  
**Later:** extract use-cases so UI and Agent share one path.

## 7. Error model

Structured errors: `AUTH_REQUIRED`, `PERMISSION_DENIED`, `VALIDATION_FAILED`, `NOT_FOUND`, `CONFLICT`, `LOCAL_ONLY`, `DEVICE_BUSY`, `CONFIRMATION_REQUIRED`.

## 8. Audit

Local append-only audit table or file for Agent commands (new) — not present today.

## 9. Delivery shape on device

| Option | Use |
|--------|-----|
| In-process API | Always — Device Executor core |
| Bound Service / AIDL | Optional for same-device debug clients |
| Outbound secure channel | Required for remote Claude (see doc 07) |
| Localhost HTTP server | Useful for Claude Code on same machine via ADB reverse **only**; **not** for Claude Mobile |

## 10. Conclusion

Android local executor is **feasible and necessary** for LOCAL_ONLY + unsynced data. It should be a thin authorized façade over existing repositories, not a parallel data stack.
