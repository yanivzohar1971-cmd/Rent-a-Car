# 08 — Cloud Agent API Feasibility

## 1. Verified cloud architecture

| Item | Value |
|------|-------|
| Provider | **Firebase** |
| Primary DB | Cloud Firestore (`users/{uid}/...`) |
| Auth | Firebase Auth |
| Files | Cloud Storage |
| Presence | Realtime Database |
| Functions | `functions/` (Node) — not a full business command façade today |
| Rules | `firestore.rules`, `storage.rules`, `database.rules.json` |
| Indexes | `firestore.indexes.json` |

## 2. What cloud can do today (safely-ish)

| Capability | Feasibility |
|------------|-------------|
| Read synchronized suppliers/customers/reservations/… | Yes via Admin SDK or user token + rules |
| Search/filter with indexes | Partial — depends on existing indexes + client queries |
| Reports on cloud data | Possible but may diverge from LOCAL_ONLY reconciliation |
| Write via client SDK | Technically allowed by UID rules; **business-unsafe** |
| Write via new HTTPS command API + Functions | Required for Agent writes |

## 3. Entities cloud can represent

**Cloud-capable (mirrored):** the 12 synchronized types listed in entity/sync audits.

**Not cloud-complete:** price lists, supplier import runs, commission reconciliation items/events/overrides, email fingerprints, car catalog taxonomy, terms customizations (partial), unsynced dirty rows.

## 4. Claude Code on Windows → cloud path

```
Claude Code (Windows)
  → Remote MCP HTTPS (streamable HTTP)
    → Agent API (Cloud Executor)
      → Firebase Auth identity of user
        → Firestore reads (and later command writes)
```

First vertical slice (recommended): **suppliers.search / suppliers.get** against synchronized Firestore.

## 5. Write safety evaluation

| Question | Answer |
|----------|--------|
| Direct DB writes safe? | **No** for Agent |
| Cloud validations complete? | **No** |
| Which rules must move server-side? | Reservation invariants, payment math, commission settlement, delete policy, tenant checks |
| Entities unsafe to modify in cloud without architecture work | Reconciliation pipeline; anything LOCAL_ONLY; deletes; multi-doc imports |

## 6. Cloud executor design

1. **Read-only MVP** using user Firebase ID token + UID queries.
2. **Command API** (Cloud Functions / Cloud Run) that:
   - Authenticates user
   - Validates operation schema
   - Applies shared business rules (port pure Kotlin logic to shared lib **or** duplicate carefully tested server rules — prefer shared)
   - Writes Firestore in a way Android restore understands (`updatedAt`, field shapes matching sync payloads)
   - Emits audit log
3. Mark responses with `coverage=CLOUD_PARTIAL` when device may have newer data.

## 7. Compatibility with Android sync

Agent cloud writes must:

- Use same document IDs (`localId` string)
- Include fields expected by `CloudToLocalRestoreRepository`
- Avoid deletes until tombstones exist
- Prefer bumping `updatedAt` so devices can pull

Until then, prefer **Device Executor writes** for mutations that must obey full Android logic.

## 8. Conclusion

Cloud Agent API is **excellent for synchronized reads** and **not ready for autonomous writes** without a validated command layer. Architecture selection in doc 10 reflects this.
