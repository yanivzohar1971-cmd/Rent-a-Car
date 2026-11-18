# AGENT-137 — Background connectivity (EMULATOR TESTED, not physical-device tested)

**Date:** 2026-11-18 · **Branch:** `feature/claude-agent-api`

## Design (verified against current Android rules, developer.android.com, 2026-11-18)

- Foreground service `AgentRelayService`, type **`specialUse`** with `PROPERTY_SPECIAL_USE_FGS_SUBTYPE`.
  `dataSync` was rejected: Android 15 caps it at 6 h/24 h and forbids starting it from `BOOT_COMPLETED`.
- Started only from allowed contexts: owner toggle (app visible), `BOOT_COMPLETED` / `MY_PACKAGE_REPLACED`
  (`AgentBootReceiver`, not exported), the notification. If Android refuses, the runtime falls back to
  "only while the app process lives" and the UI says so ("רק כשהאפליקציה פעילה").
- Persistent low-importance notification: "Rent a Car — גישת Claude פעילה", no business data,
  `VISIBILITY_PRIVATE`, action **"השבת"** (immutable PendingIntent) disables access and stops the service.
- `START_STICKY`; network callback wakes the loop on connectivity; bounded exponential backoff with full
  jitter 2 s → 60 s; no polling while disabled / signed out; no business request is ever retried.
- Owner UI shows: enabled, signed-in, relay configured, connection state, background mode, last relay
  contact, last successful request, relay error, paired clients (+ revoke), pairing code.
- Immediate stop: disable (toggle or notification), sign-out, account change (token revoked), revoke.

## Emulator acceptance (`tools/agentapi/stage-acceptance.mjs`, agentstage, 2026-11-18)

**32 / 33 PASS.** The one failure (T6, notification action) was a **test-harness defect** (collapsed
low-importance notification not expanded; its "removed" check read redacted output). The action was then
verified manually on the emulator: after tapping "השבת" → `enabled=false state=STOPPED background=OFF`,
notification gone. Harness fixed (expand + unredacted check); suite not re-run in full afterwards.

| Test | Result |
|------|--------|
| Opt-in OFF by default → ON via UI; pairing code shown; v2 pairing (channel key + client credential) | PASS |
| FGS active after opt-in, notification present without business data | PASS |
| T1 app open read (relay E2E → app → Room), metadata ANDROID_LOCAL/LOCAL/DEVELOPMENT_DATA | PASS |
| Relay audit log: no token, key, client secret or business data | PASS |
| T2 backgrounded (HOME 15 s) | PASS |
| T3 screen off; forced Doze (`deviceidle force-idle`) still reachable **on the emulator** | PASS (emulator only) |
| T4 network down → DEVICE_UNAVAILABLE, no data; restored → recovery in 4 s | PASS |
| T5 relay down → accurate error; relay restarted → recovery in 6 s, same pairing | PASS |
| Process killed → START_STICKY restart, serving again in 18 s | PASS |
| T15 MCP host restart | PASS |
| T13 financial labels (rental 282.05 calculated; car-sale open 1800 tracked) | PASS |
| T10 write → WRITE_NOT_ALLOWED; T9b spoofed uid → FORBIDDEN_FIELD | PASS |
| T14 emulator reboot → service restarted by BOOT_COMPLETED without opening the app; data/pairing/opt-in kept | PASS |
| T8 sign-out → no data; T9 account change → old pairing revoked, stays revoked | PASS |
| T7 re-pair works; UI revoke → next request rejected | PASS |
| T6 notification "השבת" | harness FAIL → manual PASS |

Startup smoke (`stage-startup-smoke.mjs`): fresh install → login; forced-logout race ×3 → login;
access ON + relay DOWN cold starts → dashboard usable; relay-down reported (`CONNECTING`/`RELAY_UNREACHABLE`);
no crash — 9/9 on repeated runs.

## Defects found and fixed during acceptance

| Defect | Class | Fix |
|--------|-------|-----|
| Splash screen forever (anonymous debug sign-in race; rejected profile write) — pre-existing, also on main | APPLICATION_DEFECT | `AuthViewModel.navigationStateFor`, NavGraph refresh (commit 62a00cb) |
| Pairing code erased by the 3 s status refresh | APPLICATION_DEFECT | ViewModel keeps code until expiry + `ClaudeAgentPairingCodeRefreshTest` |
| Connection state shown as STOPPED during first-round init | APPLICATION_DEFECT | loop reports CONNECTING; cheap `gateway()` short-circuit |
| Stale uiautomator file parsed; wrong package matched; errors read as "not installed" | TEST_HARNESS_DEFECT | delete-before-dump, package filter, verified fresh install |
| adb client churn / hung adb server and hung shell sessions | ADB_TRANSPORT_FAILURE | persistent self-healing shell (`adb-shell.mjs`), bounded timeouts, watchdogs; adb server restart when degraded |

## Remaining Android limits (not verified on a physical device)

- OEM battery managers may stop the service; Doze behaviour on a real phone is unverified.
- POST_NOTIFICATIONS denied → service still runs but the notification is hidden in the drawer (Android rule).
- No 24/7 guarantee: when the phone is off, offline, or the service is killed, Claude receives DEVICE_UNAVAILABLE.
