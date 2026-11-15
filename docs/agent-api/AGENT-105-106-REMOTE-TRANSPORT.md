# AGENT-105 / AGENT-106 — Remote Transport & Recovery

**Status:** IMPLEMENTED (abstractions + unit tests); production remote endpoint DISABLED

## AGENT-105

Package `agentapi.transport.remote`:

- `RemoteDeviceTransport` / `RemoteTransportResult`
- `LoopbackAdbDevTransport` — wraps loopback gateway (dev)
- `OutboundRelayTransport` — queues while offline; returns DeviceUnavailable (no network)
- `DisabledRemoteProductionEndpoint` — always errors

ADB loopback remains the only verified path. A local TLS probe does **not** count as internet-reachable remote access.

## AGENT-106

- `AuthenticatedAgentGateway.requireReachable` → `DEVICE_UNAVAILABLE` (HTTP 503)
- Failed auth does not heartbeat presence online
- `RequestRecoveryPolicy` / `ExecutionCertainty`: no auto-replay of non-idempotent ops; expired stays rejected; unknown outcomes explicit

## Blockers for real remote phone access

- Public TLS endpoint + auth
- Outbound Android connection under background limits
- Keystore-backed production pairing UX
