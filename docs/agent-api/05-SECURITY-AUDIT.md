# 05 — Security & Permissions Audit

**Verified:** 2026-11-15. **No secrets** are documented here.

## 1. Authentication (existing)

| Item | Finding |
|------|---------|
| Mechanism | Firebase Authentication |
| App entry | `FirebaseAuthRepository` / `AuthRepository` patterns; `AuthViewModel`; `AuthProvider.auth` |
| UI | `Routes.Auth` and related setup/profile flows in `NavGraph` |
| Persistence | Firebase Auth SDK local persistence (standard) |
| Post-login | `UserUidBackfill.backfillUserUidForCurrentUser` stamps Room rows with UID |

**Claude Agent implication:** Every operation must run as an authenticated Rent a Car user (Firebase UID), never as an anonymous superuser.

## 2. Roles & admin

| Control | Evidence |
|---------|----------|
| Admin claim | `firestore.rules` `isAdminClaim()` — `admin` / `isAdmin` custom claims |
| Profile flag | `users/{uid}.isAdmin` |
| Allowlist | `config/admins.uids` |
| UI | `Routes.AdminRoleManagement`, `AdminHome`, `AdminYards` |
| Owner update caps | Rules block owner from elevating `primaryRole`, billing, `isAdmin`, etc. |

**Finding:** There is a platform admin model for yard/marketplace-style features. Core rental CRUD is primarily **UID ownership**, not fine-grained RBAC per reservation field.

## 3. Tenant / customer boundaries

- Firestore: `users/{uid}/...` — only owner (or admin rules where defined) can access.
- Room: DAO methods take `currentUid` / `user_uid` filters via `CurrentUserProvider`.
- **Gap:** `sync_queue` not UID-scoped (device-local risk if multi-account).

## 4. Where permissions are enforced

| Layer | Enforcement |
|-------|-------------|
| UI | Hides/shows admin routes; not sufficient alone |
| Repositories / DAOs | UID filtering on queries — primary local enforcement |
| Firestore rules | Authenticated UID path isolation; admin exceptions; **no business-field validation** |
| Cloud Functions | Present under `functions/` — **not** verified as full rental command authorizer |
| Storage rules | Document access (see `storage.rules`) — UID-oriented |

**Verdict:** Permissions are **not** “UI only,” but cloud does **not** re-validate business invariants. Agent cloud writes need new server command authorization.

## 5. Device identity / App Check

- Firebase App Check Play Integrity dependency in `app/build.gradle`.
- RTDB presence heartbeats for online device detection.
- No Agent device-pairing protocol exists yet.

## 6. Token mechanisms

| Credential type | Exists? | Reuse for Agent? |
|-----------------|---------|------------------|
| Firebase ID token | Yes | Yes for cloud executor (user-scoped) |
| Anthropic API key | N/A to app | Separate — only if calling Anthropic APIs; **not** for MCP tool auth to Rent a Car |
| MCP OAuth / bearer | Not in app | Required for remote MCP (Claude Code / connectors) |
| Device channel token | No | Must design in Phase 3 |

**Do not confuse:** Anthropic keys ≠ MCP OAuth ≠ Firebase tokens ≠ Google service accounts.

## 7. Required Agent API controls vs today

| Control | Today | Later phase |
|---------|-------|-------------|
| User authentication | Firebase Auth | Reuse |
| OAuth for remote Claude connectors | Absent | Phase 5–7 |
| Tenant isolation | UID paths / DAO filters | Preserve + test |
| Device pairing | Absent | Phase 3 |
| Scoped permissions / capability registry | Absent | Phase 1 |
| Token expiration / revocation | Firebase session; no Agent tokens | Phase 3/5/11 |
| Command confirmation | UI dialogs only | Phase 9 |
| Audit logging | Partial (Crashlytics/Analytics; not Agent command audit) | Phase 9/11 |
| Replay protection | Absent for Agent | Phase 9 |
| Rate limiting | Absent for Agent | Phase 11 |
| Input validation | Android forms/repos | Reuse + server for cloud |
| Request correlation | Absent | Phase 1 envelope |
| Data minimization | Not Agent-aware | Schema design |
| Prompt-injection protection | N/A | MCP tool descriptions + confirmations + allowlists |

## 8. Sensitive surfaces

- PII: customers, reservations, phones, national IDs (`tzId`)
- Financial: payments, commissions, reconciliation
- Admin: yard management, role caps
- Debug: `Routes.DebugDbBrowser`, Firestore `debug_rentacar` (authenticated write — **review for production Agent exposure**; should be NOT_ELIGIBLE)

## 9. Security risks for Claude Agent API

1. **CRITICAL:** Raw Firestore writes without business validation.
2. **CRITICAL:** Exposing Debug DB browser operations via MCP.
3. **HIGH:** Device channel without pairing/attestation.
4. **HIGH:** Prompt injection causing unintended HIGH/CRITICAL tools.
5. **HIGH:** Treating cloud mirror as complete → wrong financial decisions.
6. **MEDIUM:** Sync queue cross-account residue on shared device DB.
7. **MEDIUM:** Over-broad OAuth scopes on remote MCP.

## 10. Phase 0 conclusion

Existing auth gives a solid **UID tenant root**. It does **not** yet provide Agent-grade command authorization, device remote access security, or cloud business enforcement. Those are mandatory before production Agent writes.
