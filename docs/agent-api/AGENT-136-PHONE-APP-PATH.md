# AGENT-136 — Phone-app path: in-app opt-in, pairing and outbound TLS relay

**Date:** 2026-11-18 · **Branch:** `feature/claude-agent-api` · **Owner decision:** "Phone app first".
**No real business data was accessed.** Verified end-to-end on the emulator with the isolated `agentstage`
build (synthetic data, Firebase *emulator*, local dev relay). Nothing was installed on a physical phone,
nothing deployed, `main` untouched.

## Architecture

```
Claude Code ──stdio──> MCP host (tools/relay/run-device-stdio.mjs, label from pairing)
                          │  GET/POST https://<relay>/d/<deviceId>/v1/{health,tools,execute}
                          ▼
                     Relay (tools/relay/relay.mjs)  — router only, TLS, no business authority
                          ▲  outbound HTTPS long-poll (the phone never listens on a socket)
                          │
Phone app ── RelayDeviceLoop ─> ProductionAgentGateway (per call: opt-in ✓, live Firebase user ✓,
                                 token uid == live uid ✓, READ only ✓)
                               ─> AuthenticatedAgentGateway (token sig/expiry/revocation, replay, identity fields)
                               ─> RentCarAgentAPI.forAndroidLocalReads ─> existing repositories ─> Room
```

## What was built

| Piece | File(s) |
|-------|---------|
| Persisted owner opt-in (default OFF) + app composition | `agentapi/production/ProductionAgentRuntime.kt` |
| Device relay loop, envelopes, HTTPS client (https enforced) | `agentapi/relay/RelayDeviceLoop.kt`, `HttpsRelayDeviceClient.kt` |
| One-time pairing code crypto (PBKDF2 210k + AES-256-GCM, AAD=deviceId) | `agentapi/relay/RelayPairingCrypto.kt` ⇄ `tools/relay/pairing.mjs` (shared test vector) |
| Owner UI (Hebrew RTL): toggle, pair, code, clients, revoke, relay status | `ClaudeAgentConnectionScreen/ViewModel.kt`; entry in Settings |
| Relay server (TLS required; device credential bound on first register; single-use 5-min offers; redeem rate limit; no re-delivery) | `tools/relay/relay.mjs`, `dev-relay.mjs` |
| Pairing CLI + MCP launcher | `tools/relay/pair.mjs`, `run-device-stdio.mjs` |
| Isolated test build `agentstage` (`com.rentacar.app.agentstage`, AGENT_DEV_MODE=false, demo Firebase project → emulators, relay 10.0.2.2:18443, dev CA trusted only there) | `app/build.gradle`, `app/src/agentstage/**`, `App.kt` |
| Emulator E2E through the real UI | `tools/agentapi/stage-e2e.mjs` |

Security properties:
- Pairing token is never displayed and never readable by the relay (sealed under the code; GCM-authenticated, bound to the device id).
- Relay holds no tokens and validates none; the phone validates every request.
- Token is bound to the Firebase uid at pairing; sign-out → `NOT_SIGNED_IN`; account switch → `SESSION_MISMATCH` + revoke.
- Opt-in re-read per request; turning it off stops service immediately (`AGENT_ACCESS_DISABLED`).
- Device credential (relay queue ownership) is a separate random secret in EncryptedSharedPreferences; device tokens are Keystore-HMAC-signed.
- `standard` (production) build: `AGENT_RELAY_URL=""` → no relay connection and pairing disabled ("לא הוגדר שרת ממסר מאושר בגרסה זו"). The only visible change is the Settings entry and the (off) toggle.

## Test results (actual runs)

| Suite | Result |
|-------|--------|
| App unit tests (all) | **903 / 0** (+7 `RelayDeviceTest`) |
| Relay Node tests | 6 / 6 (incl. Kotlin↔Node crypto vector, impostor device, single-use/expiry/rate limit) |
| MCP host | 13 / 13 |
| **Emulator E2E `stage-e2e.mjs`** | **25 / 25** — UI login (Auth emulator) → Settings → toggle OFF by default → ON → pairing code on screen → PC redeem (single-use, token not printed) → 34 tools via relay → suppliers/reservations/customers/financial labels from Room (`ANDROID_LOCAL`/`LOCAL`) → write `WRITE_NOT_ALLOWED` → spoofed uid `FORBIDDEN_FIELD` → UI revoke `TOKEN_REVOKED` → opt-out `AGENT_ACCESS_DISABLED` |
| Compile | `standardRelease`, `agentdevDebug`, `agentstageDebug` OK |

Run it again:
```powershell
cd tools\cloud-dev; npm run emulators        # terminal 1 (then: node seed.mjs)
node tools\relay\dev-relay.mjs                # terminal 2
.\gradlew :app:assembleAgentstageDebug
node tools\agentapi\stage-e2e.mjs
```

## Known limitations

- Relay polling runs only while the app process is alive (no foreground service yet); Android may stop it in the background.
- Relay state is in memory (restart = devices re-register, pending offers lost) — acceptable for dev; production needs persistence + monitoring.
- The emulator test logs in through the UI and uses an `agentstage`-only receiver (guarded by `android.permission.DUMP`) to seed synthetic rows.

## Remaining steps to the owner's real phone (each needs owner authorization)

1. **Deploy a relay** on an owner-controlled public HTTPS host (real certificate). Then set `AGENT_RELAY_URL` for a
   *signed release candidate* of the normal app — never changing the installed production app without approval.
2. **Foreground service** (or WorkManager windows) so the phone answers while the app is in the background, with a visible notification.
3. **Install** that build on the owner's phone (owner action), open Settings → "Claude AI — חיבור ושליטה", enable, pair.
4. On the PC: `node tools/relay/pair.mjs <code> --relay https://<relay> --name rentcar-phone --data-environment REAL_LOCAL_DATA`.
5. Claude Android/mobile needs a public **remote MCP** endpoint with OAuth in front of the relay (separate step).
