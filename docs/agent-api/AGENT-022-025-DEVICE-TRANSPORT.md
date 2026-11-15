# AGENT-022..025 — Authenticated device transport (foundation)

Package: `com.rentacar.app.agentapi.transport` (+ `gateway` router). Pure Kotlin, no Android types,
JVM-unit-tested. **Nothing here is wired into `Application.onCreate` or any production path.**

## Trust model

```
 Claude Code ──stdio──> tools/mcp-host ──HTTP + Bearer <device token>──> gateway
                                                                          │
   token  ──validate──> DevicePairingService ──> BoundSessionIdentity ────┤
                                                                          ▼
                                              AgentAuthContext(userUid from token) ──> RentCarAgentAPI
```

- The **only** source of `userUid` is `BoundSessionIdentity`, which has a private constructor and a single
  factory, `fromTrustedBinder(TrustedSessionBinder)`. Trusted app-side code (e.g. an adapter over the in-app
  Firebase session) implements the binder. There is no factory that accepts a raw uid.
- `AgentGatewayRequest` has **no** `userUid`, roles, permissions or deviceId field. The gateway additionally
  rejects identity-looking keys (`userUid`, `uid`, `userId`, `roles`, `permissions`, `deviceId`, `tenantId`,
  `auth`; case-insensitive, nested maps included) in `parameters` with `FORBIDDEN_FIELD`, and the HTTP router
  rejects them at the top level of the body.

## Components

| Task | Type | Notes |
|------|------|-------|
| 022 | `DeviceIdentity(deviceId, displayName)` | public, non-secret |
| 022 | `BoundSessionIdentity` | verified `userUid` + permissions (always includes `AUTHENTICATED`) |
| 022 | `DeviceAccessToken` + `DeviceTokenSigner` | record: `tokenId`, `deviceId`, session binding, `issuedAt`, `expiresAt`, `signature`, `revoked`. HMAC-SHA256 over the immutable fields with a server-side secret (≥16 bytes) passed at construction. Wire token: `rac1.<tokenId>.<signature>` (contains no user data). Tampering with a stored record invalidates it. |
| 022 | `DeviceTokenStore`, `InMemoryDeviceTokenStore` | volatile (dev/test) |
| 022 | `DevicePairingService` | `pair(device, session, ttlMs)` (ttl 1ms..30d), `revoke(tokenId)`, `validate(presented)` → `Valid(session)` / `Invalid(MALFORMED, UNKNOWN_TOKEN, SIGNATURE_MISMATCH, EXPIRED, REVOKED)` |
| 023 | `AgentGatewayRequest` / `AgentGatewayResponse` / `AgentGatewayError` | `operation`, `parameters`, `requestId`, `correlationId`, `idempotencyKey`, optional `expiresAtEpochMs` |
| 023 | `AuthenticatedAgentGateway` | `execute(token, request)` and `listTools(token)`; builds `AgentAuthContext` only from the bound session; calls `RentCarAgentAPI.execute` |
| 024 | `ConnectivityState` (`ONLINE`, `OFFLINE`, `BACKGROUND`, `UNAVAILABLE`), `DevicePresence`, `DevicePresenceTracker` | heartbeat on every authenticated call; silence > stale window → `OFFLINE`; never seen → `UNAVAILABLE` |
| 025 | Request TTL | `expiresAtEpochMs` in the past → `REQUEST_EXPIRED` (does not consume the requestId) |
| 025 | `ReplayGuard`, `InMemoryReplayGuard` | scope = device id + user uid; repeated `requestId` → `REPLAY_DETECTED`; repeated `idempotencyKey` + same fingerprint → cached response with `replayed=true`; same key + different request → `REPLAY_DETECTED`; TTL window (default 5 min) and bounded size |

### Gateway error codes

`UNAUTHORIZED` (missing/malformed/unknown/bad signature — deliberately indistinguishable), `TOKEN_EXPIRED`,
`TOKEN_REVOKED`, `FORBIDDEN_FIELD`, `INVALID_REQUEST`, `REQUEST_EXPIRED`, `REPLAY_DETECTED`, `INTERNAL_ERROR`;
Agent API codes (`WRITE_DISABLED`, `NOT_FOUND`, `EXECUTION_DISABLED`, …) are passed through by name.

## Loopback HTTP gateway — DEVELOPMENT ONLY

| Piece | Location | Notes |
|-------|----------|-------|
| `LoopbackGatewayRouter` | `app/src/main/.../agentapi/gateway/` | Socket-free `handle(method, path, headers, body)`; no Android or JDK-internal HTTP types. Not referenced by any production class. |
| `LoopbackAgentGatewayServer` | `app/src/test/.../agentapi/gateway/` | Binds `127.0.0.1` only using plain `java.net` sockets. Lives in the **unit-test source set** so it can never ship in the APK or be started from `Application.onCreate`. |

> `com.sun.net.httpserver` was tried first but is not resolvable on the AGP Kotlin unit-test classpath,
> and does not exist on Android; the test server therefore uses `ServerSocket`.

| Endpoint | Auth | Behavior |
|----------|------|----------|
| `GET /v1/health` | none | `{"status":"ok","mode":"DEVELOPMENT_ONLY","apiVersion":…}` — no business data |
| `GET /v1/tools` | Bearer token | `{"tools":[{name, description, inputSchema}]}` (wired read tools only) |
| `POST /v1/execute` | Bearer token | body `{operation, parameters?, requestId, correlationId?, idempotencyKey?, expiresAtEpochMs?}`; HTTP 200 for executed requests (check `success`), 400 invalid/forbidden field, 401 token, 408 request expired, 409 replay |
| `POST /v1/pair` | header `X-Rentacar-Dev-Pairing-Secret` | **test-only**; disabled (404) unless a secret **and** a `TrustedSessionBinder` are configured; identity comes from the binder, body may contain only `deviceId`, `displayName`, `ttlMs` (any identity field → 400) |

A unit test scans production sources to assert the dev server / `com.sun.net.httpserver` are never
imported and that `App.kt` references no gateway class.

## Not implemented (honest status)

- No on-device listener or relay; no TLS; no persistent/encrypted token store; no production
  `TrustedSessionBinder`; no rate limiting; no tool-call audit log; presence is in-memory.
- `MCP_CONNECTED_TO_REAL_ANDROID` and `MCP_CONNECTED_TO_CLAUDE_CODE` remain **false**.

## Tests

`DevicePairingAndGatewayTest` (pair→execute, wrong/tampered/foreign-secret tokens, client uid rejected,
revoked, expired, request TTL, replay/idempotency, presence, writes still disabled) and
`gateway/LoopbackGatewayHttpTest` (HTTP tools/list + execute with bearer token, pairing secret, 400/401/405/408/409).
