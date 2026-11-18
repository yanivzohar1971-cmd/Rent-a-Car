# AGENT-138 — Secure relay: hardening and deployment readiness

**Date:** 2026-11-18 · **Branch:** `feature/claude-agent-api` · **Status:** IMPLEMENTED + TESTED (isolated TLS).
**Not deployed.** Public deployment requires explicit owner approval.

## Architecture (outbound-only device)

```
Claude MCP host (run-device-stdio.mjs)
  └─ sealed fetch (e2e.mjs): AES-256-GCM per request under the pairing channel key
       │  POST https://<relay>/d/<deviceId>/v1/sealed   Authorization: Client <clientId>.<secret>
       ▼
Relay (relay.mjs) — router only: client credential check, rate limits, queueing, timeouts, audit
       ▲  outbound HTTPS long-poll   Authorization: Device <deviceId>.<secret>
       │
Phone app: RelayDeviceLoop → decrypt + expiry + replay check → ProductionAgentGateway (opt-in, live
           Firebase session, token↔uid, READ-only) → AuthenticatedAgentGateway → repositories → Room
```

## What the relay can and cannot see (end-to-end confidentiality)

| Item | Visible to relay? | Why |
|------|-------------------|-----|
| Operation name, parameters, request body | **No** | sealed (AES-256-GCM, AAD binds device/client/msg/direction) |
| Device access token (`rac1…`) | **No** | travels inside the ciphertext |
| Business responses (customers, suppliers, reservations, financials) | **No** | sealed by the phone |
| Pairing token / channel key / client secret | **No** | pairing offer sealed under the one-time code (PBKDF2-SHA256 210k + AES-GCM) |
| deviceId, clientId, msgId (correlation), sizes, timing, HTTP status | Yes | routing / audit metadata |
| Client secret / device secret | Hash only (SHA-256) | credential checks |

Residual risk: a malicious relay operator could attempt an offline brute force of a captured pairing
offer (~50-bit code × 210 000 PBKDF2 iterations) during its 5-minute validity; the code is single-use.
Verified by test: the relay's forwarded payloads and audit log contain no token, operation name,
supplier name, channel key or secrets.

## Controls implemented

| Control | Where |
|---------|-------|
| TLS required (dev cert only in agentstage + dev launcher; production: proxy TLS or provided cert) | `relay.mjs`, `dev-relay.mjs` |
| No trust-all / no custom TrustManager or HostnameVerifier on Android | `HttpsRelayDeviceClient.kt` (https enforced) |
| Device credential bound at first registration; rotation endpoint | `/device/register`, `/device/rotate` |
| Per-client credential, activated on pairing redeem, re-announced by the phone, removed on revoke | `/pair/redeem`, `/device/register`, `/device/clients/remove` |
| End-to-end sealing + request lifetime ≤120 s + ±120 s skew + replay cache | `RelayE2E.kt`, `RelayDeviceLoop.kt`, `e2e.mjs` |
| Phone re-checks opt-in, live session, token/uid, READ-only on every request | `ProductionAgentGateway.kt` |
| Body ≤64 KiB, header timeout 10 s, max connections, per-client 120 req/min, redeem 10/min/IP | `relay.mjs` |
| Bounded per-device queue (50), request timeout 20 s, undelivered requests dropped, never re-sent | `relay.mjs` |
| Health `/healthz` (no identifiers), device online window | `relay.mjs` |
| Non-sensitive JSON audit events with correlation ids | `audit` callback, `dev-relay.mjs` stdout |
| Graceful shutdown (503 to pending, drain), stale-state sweeper | `close()`, sweeper |
| `behindProxy` mode must listen on loopback only | `listen()` guard |

## Tests (actual)

`tools/relay`: **10/10** — Kotlin↔Node pairing + E2E vectors; relay never sees token/data; writes refused;
unknown client, wrong secret, revoked client, wrong channel key; replay (409), expired (408), malformed,
oversized; device impostor + rotation; offers single-use/expiry/binding/rate limit; relay restart +
10 concurrent reads; **real TLS** (untrusted cert refused, trusted cert accepted).
Android `RelayDeviceTest`: **8/8**. Emulator: see `AGENT-137-BACKGROUND-CONNECTIVITY.md`.

## Deployment contract (prepared, NOT executed)

Environment: `RELAY_MODE=production`, `RELAY_BEHIND_PROXY=1` (recommended) **or**
`RELAY_TLS_CERT_FILE`/`RELAY_TLS_KEY_FILE`, `RELAY_HOST=127.0.0.1`, `RELAY_PORT=18443`.
No other secrets exist on the relay (device/client secrets are hashes created at runtime).

Reverse proxy (e.g. Caddy): `relay.<owner-domain> { reverse_proxy 127.0.0.1:18443 }` — automatic
publicly trusted certificate; set proxy read timeout ≥ 40 s (long-poll 25 s).
Service: systemd unit with `Restart=always`, `NoNewPrivileges`, dedicated user, `node dev-relay.mjs`.
Monitoring: HTTP check on `/healthz`; alert on restart loops; ship stdout audit lines.
State/backup: none required — state is in memory; after a restart the phone re-registers itself and its
clients automatically (verified); pending pairing offers are lost (owner re-pairs).
Rollback: stop the service / remove DNS record — the phone shows "הממסר אינו זמין" and serves nothing.
Single instance only (in-memory routing); horizontal scaling would need shared state.

Then: set `AGENT_RELAY_URL=https://relay.<owner-domain>` for the release candidate build (AGENT-139).

### Hosting options (prices checked 2026-11-18, verify before purchase)

| Option | Approx. cost | Fit | Notes |
|--------|-------------|-----|-------|
| Small VPS (e.g. Hetzner shared vCPU) + Caddy | ~€4.4–5.5/mo + VAT | **Best fit** | full control, long-poll friendly, single instance; plan names/prices changed in 2026 |
| Fly.io shared-cpu-1x 256 MB | ~$2.19/mo (+ egress, IPv4) | Good | automatic TLS; keep 1 machine always running (in-memory state) |
| Google Cloud Run (min instances 1) | instance-based billing, higher | Possible | timeout up to 60 min; must pin to 1 instance; more ops complexity |
| Owner's PC + tunnel | ~0 | Not recommended | relay offline when PC is off; exposes a local service |

No infrastructure was purchased or deployed.

## Security checklist before going public

- [ ] Owner approval for public endpoint + domain.
- [ ] Publicly trusted certificate; HTTP→HTTPS only; HSTS at proxy.
- [ ] `RELAY_MODE=production`; dev cert absent on server.
- [ ] Firewall: only 443 open; relay port bound to loopback.
- [ ] Log retention defined (audit lines contain ids, no data).
- [ ] Penetration-style review of `relay.mjs` (rate limits, DoS) — not yet done.
- [ ] OAuth remote-MCP endpoint for Claude mobile (separate step; not implemented).
