# 10 — Target Architecture

## 1. Decision

**Selected:** **Public Remote MCP + dual executors (Cloud + Device) + capability registry**, with **read-cloud-first vertical slice** and **device channel for local/unsynced data**. Autonomous **cloud writes deferred** until a validated command API exists.

Adapted to verified stack: Firebase UID tenancy + Room v44 + WorkManager dirty sync (12 entity types).

```
                 CLAUDE CODE (Windows)          CLAUDE MOBILE
                        \                         /
                         \    Remote MCP HTTPS    /
                          \   (streamable HTTP)  /
                           \         |          /
                            v        v         v
                           Rent a Car Agent API
                           (authn/authz, schemas)
                                    |
                            Data Source Router
                     +--------------+--------------+
                     |                             |
              Cloud Executor                 Device Gateway
                     |                             |
              Firestore (UID)              Paired Android app
              (+ future Cmd API)                   |
                                            Device Executor
                                                   |
                                             Repositories
                                                   |
                                                Room
```

## 2. Component placement

| Component | Where |
|-----------|-------|
| MCP server (HTTP) | Cloud (Cloud Run / Functions / dedicated host) |
| Operation schemas + registry contracts | Shared (published schema pack) |
| Cloud Executor | Cloud |
| Device Gateway (relay) | Cloud |
| Device Executor + audit buffer | Android `:app` |
| Business rules | Prefer Android repos/domain; port pure functions for cloud cmds later |
| Sync | Existing Android WorkManager (unchanged initially) |

## 3. How it works

| Concern | Approach |
|---------|----------|
| Discovery | MCP tools generated from capability registry |
| Auth | MCP OAuth → maps to Rent a Car user; Firebase UID for data |
| Source selection | Client hint + router policy: `auto` prefers cloud reads for synced types, device for LOCAL_ONLY / `preferLocal` |
| Local-only access | Device executor only; else `LOCAL_ONLY` |
| Validation | Handlers call repositories / shared validators |
| Sync after device write | Existing `SyncDirtyMarker` |
| Errors | Structured codes + `coverage` metadata |
| Financial protection | Confirmation levels + shared calc logic |
| Tenant boundaries | Firebase UID everywhere |
| Audit | Cloud audit log + device audit append |
| Device unavailable | Explicit error; cloud partial results with warning |

## 4. Architecture alternatives compared

### Alt 1 — Selected dual-executor Remote MCP

| Criterion | Score |
|-----------|-------|
| Security | Strong if OAuth + pairing + no raw SQL |
| Simplicity | Medium |
| Reliability | Medium (device offline reality) |
| Maintenance | Medium |
| Effort | Medium–High |
| Cloud cost | Moderate (MCP + relay) |
| Android lifecycle | Explicitly handled |
| Consistency | Honest partial coverage |
| App compatibility | Reuses repos |

### Alt 2 — Cloud-only MCP (Firestore reads/writes only)

| Criterion | Score |
|-----------|-------|
| Security | Weak on writes (no business rules) |
| Simplicity | Higher |
| Reliability | Higher for online |
| Effort | Lower short-term |
| Consistency | **Poor** — misses LOCAL_ONLY & unsynced |
| Fit to requirements | **Fails** unsynced Android access |

### Alt 3 — On-device localhost MCP only

Fails Claude Mobile (Anthropic cloud egress). Acceptable only as lab adjunct.

## 5. Why dual-executor wins

Requirements demand both synchronized cloud data **and** unsynchronized Room data from Mobile and Windows. Official Claude Mobile connectors mandate public HTTPS MCP. Existing sync is partial. Therefore the system must route, label incompleteness, and keep Room private behind a paired outbound channel.

## 6. Explicit non-goals (near term)

- No YZ Dev Bridge dependency
- No screen automation
- No arbitrary SQL
- No assuming Git branch isolates Firebase/Room
- No production cloud writes without command API
