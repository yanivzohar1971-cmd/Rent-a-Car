# DEV-ENVIRONMENT-SAFETY

## 1. Critical clarification

`feature/claude-agent-api` protects **git history**. It does **not** isolate:

- Installed APK / `com.rentacar.app` private data
- Room `rentacar.db` on device
- Production Firebase project bound via `google-services.json`
- Shared Auth users
- Storage / Functions

## 2. Current build reality (verified)

| Item | Finding |
|------|---------|
| Product flavors | **None** |
| `applicationIdSuffix` | **None** |
| Debug `applicationId` | `com.rentacar.app` (same as release) |
| Coexistence with production install | **Impossible** on one device/profile |
| Dedicated dev Firebase project in Gradle | **Not found** |
| Emulator usage | Possible manually; not a separate product flavor |

**Phase 0 constraint:** Do not change application IDs or Gradle. Do not uninstall the user’s production app. Do not clear app data. Do not deploy Functions. Do not modify production Firebase config.

## 3. What already helps slightly

- Firebase Auth UID tenancy (separate test users still share same project)
- App Check / rules (do not bypass in prod)
- Local unit tests without device
- Firestore emulator (**recommended** for cloud Agent work — not configured in Phase 0)

## 4. Recommended safest setup (later phases — design only)

1. **Add** (when authorized): `debug` `applicationIdSuffix = ".agentdev"` or product flavor `agentdev` so Agent builds coexist with production APK.
2. Point flavor at a **separate Firebase project** (`google-services-agentdev.json`) — never prod.
3. Use emulators for Auth/Firestore/Storage when possible.
4. Use throwaway Auth accounts.
5. Prefer emulator/device dedicated to Agent testing; keep production phone on Play/release build.
6. Disable Agent write tools against prod project via server allowlist.
7. Never run backup restore / bulk import Agent tools against prod data.

## 5. Interim lab practice (before flavor exists)

| Practice | Why |
|----------|-----|
| Prefer JVM + Firestore emulator tests | No device clash |
| If device needed, use a secondary phone/emulator | Protects daily driver install |
| Read-only cloud experiments with test UID | Limits blast radius |
| No Agent MCP pointed at prod with write tools enabled | Prevent accidents |

## 6. Data classes of risk

| Resource | Risk if Agent misbehaves |
|----------|--------------------------|
| Production Room on daily phone | Data loss / corruption |
| Production Firestore | Permanent bad docs; sync pollution |
| Production Storage | Document loss |
| Admin APIs | Cross-tenant if rules bypassed |

## 7. Phase 0 compliance checklist

- [x] No applicationId / Gradle changes  
- [x] No uninstall / clear data  
- [x] No Firebase production modifications  
- [x] No cloud deploys  
- [x] Docs only under `docs/agent-api/`
