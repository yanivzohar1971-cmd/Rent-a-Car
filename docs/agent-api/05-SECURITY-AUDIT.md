# 05 — Security & Permissions Audit

**Verified:** 2026-11-15. **No secrets** documented.  
**Follow-up:** App Check claim retracted; `database.rules.json` absent; admin Functions confirmed; anonymous bootstrap noted.

## 1. Authentication (existing)

| Item | Finding |
|------|---------|
| Mechanism | Firebase Authentication |
| Entry | `FirebaseAuthRepository`, `AuthViewModel`, `AuthProvider.auth` |
| Methods | Email/password, Google `signInWithGoogle` |
| Persistence | Firebase Auth SDK default (no custom `setPersistence` found) |
| Startup | `FirebaseAuthInitializer.ensureSignedIn()` may sign in **anonymously** if no user (debug logging path) |
| Post-login | `UserUidBackfill.backfillUserUidForCurrentUser` |

Claude Agent must operate as an authenticated Rent a Car user (Firebase UID), never anonymous superuser.

## 2. Roles & admin

| Control | Evidence |
|---------|----------|
| Roles | `PrimaryRole`: PRIVATE_USER, AGENT, YARD, ADMIN (+ legacy) |
| UI | `AdminRoleManagementScreen`, `AdminHome`, yards admin |
| Client allowlist | `FirebaseAdminRepository` → `config/admins.uids` |
| Cloud | Functions `setUserRole` / `resolveRoleRequest` + `isAdmin(callerUid)` |
| Rules | Owner blocked from self-granting admin/billing/role caps after bootstrap |

Core rental Room data is **UID-owned**, not fine-grained RBAC per field.

## 3. Tenant boundaries

- Firestore: `users/{uid}/...` owner R/W.
- Room: DAO filters by `user_uid` / `CurrentUserProvider`.
- Gap: `sync_queue` not UID-scoped.
- Admins: profile/admin APIs; **no** blanket subcollection access in rules comments.

## 4. Enforcement layers

| Layer | Finding |
|-------|---------|
| UI | Gates admin; reservation `canSave`; recon safety selection |
| Repo/domain | Strong for car-sale payments; weak for reservation field rules |
| Firestore rules | UID path isolation; **no** rental business schema validation |
| Functions | Role admin callables — not reservation command API |
| Storage | UID paths + some weakly owned public image paths |

## 5. Device identity / App Check

| Claim | Status |
|-------|--------|
| App Check / Play Integrity | **Not** in `app/build.gradle`; no `FirebaseAppCheck` install found |
| Device pairing for Agent | **Missing** |
| RTDB presence worker | **Not found** in Android tree |
| Screenshot policy | `ScreenSecurityUtils` / DataStore `allow_screenshots` |

## 6. Credential matrix

| Credential | Exists? | Agent reuse |
|------------|---------|-------------|
| Firebase ID token | Yes | Cloud executor user scope |
| Anthropic API key | Client-side Claude only | Separate |
| MCP OAuth / bearer | Not in app | Required for Remote MCP |
| Device channel token | No | Phase 3 |

## 7. Rules gaps (high signal)

- Own subcollections: authenticated write without field validation.
- `debug_rentacar/{docId}`: any authenticated R/W.
- `config/admins` readable by authenticated users.
- Storage: some gallery/logo paths allow any authenticated valid image write.
- Card PAN/CVV may land in reservation `notes` and sync — treat as sensitive leakage risk.

## 8. Required Agent controls vs today

| Control | Today |
|---------|-------|
| User auth | Firebase |
| OAuth for Claude connectors | Absent |
| Device pairing | Absent |
| Capability registry / scoped perms | Absent |
| Command confirmation | UI only |
| Audit log for Agent cmds | Absent |
| Replay / idempotency | Absent |
| Rate limiting | Absent |
| Prompt-injection hardening | N/A until MCP tools |
| Server business validation | Absent for rental mirrors |

## 9. Highest Agent risk commands

Recon approve, commission alignment, reservation mutate/cancel, sale payment writes, snapshot import, cloud restore, admin role set, debug DB browse (**NOT_ELIGIBLE**).

## 10. Conclusion

Solid UID tenant root; **not** Agent-grade command authz, device remote security, or cloud business enforcement yet.
