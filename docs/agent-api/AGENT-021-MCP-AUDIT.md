# AGENT-021 — MCP adapter audit (pre-connectivity)

**Date:** 2026-11-15 · **Branch:** `feature/claude-agent-api` · **Baseline:** `7eebc9a`

Audit of the AGENT-020 in-process MCP foundation, performed before building the authenticated
transport (AGENT-022..025) and the Windows MCP host (AGENT-026).

## What exists (as of `7eebc9a`)

| Component | File | Role |
|-----------|------|------|
| `AgentMcpAdapter` | `agentapi/mcp/AgentMcpAdapter.kt` | `listTools()` + `callTool(name, arguments, authContext)`; builds an `AgentRequest` (`ANDROID_LOCAL`) and returns `AgentMcpCallResult` / `AgentMcpError`. |
| `AgentMcpToolRegistry` | `agentapi/mcp/AgentMcpToolRegistry.kt` | Tools = `api.wiredExecutableOperations` ∩ `AgentExecutableAllowlist.ANDROID_LOCAL_READS`, `READ`, `sideEffect == NONE`, status ≠ `REGISTERED`. Registration alone never creates a tool. |
| `AgentMcpToolDescriptor` | `agentapi/mcp/AgentMcpToolDescriptor.kt` | `name`, `description`, `inputSchema`, `operationId`. |
| `AgentMcpStatus` | `agentapi/mcp/AgentMcpStatus.kt` | Maturity flags: adapter implemented, fixture-tested; **not** connected to real Android / Claude Code. |

### Properties verified

- **Read-only by construction:** write operations are never in the tool list; calling a write operation
  through the API yields `WRITE_DISABLED`.
- **Runtime-wiring based discovery:** the tool list shrinks to what ports are wired (e.g. 2 tools with only
  the supplier port, up to 33 when everything is wired).
- **Auth is a caller-supplied `AgentAuthContext`:** the adapter trusts whatever the caller passes. This is
  correct for an in-process boundary and is exactly why a transport must never let a remote client build
  that context.
- **No network, no sockets, no Android `Looper`:** pure Kotlin; JVM-testable.
- **Cloud target rejected** (`UNSUPPORTED_OPERATION`).

## Gaps found

| # | Gap | Resolved by |
|---|-----|-------------|
| 1 | No authentication/authorization of *who* may call the adapter (auth context is caller-supplied). | AGENT-022..025 `DevicePairingService` + `AuthenticatedAgentGateway` (identity only from token-bound session). |
| 2 | No device identity, pairing, token issuance, revocation or expiry. | `DeviceIdentity`, `DeviceAccessToken` (HMAC-signed), `DeviceTokenStore`. |
| 3 | No request TTL, replay protection, or idempotency handling. | `AgentGatewayRequest.expiresAtEpochMs`, `InMemoryReplayGuard`. |
| 4 | No presence/connectivity model. | `DevicePresenceTracker` / `ConnectivityState`. |
| 5 | **No Windows host:** nothing Claude Code can launch with `claude mcp add`. | AGENT-026 `tools/mcp-host` (Node stdio MCP). |
| 6 | **No device transport:** no HTTP/WebSocket server inside the app and no relay; the phone is not reachable. | Partially: JVM-only loopback HTTP binding (test source set, DEV ONLY). A real device transport (FGS server or outbound relay) is **not** implemented. |
| 7 | **No real Android integration:** nothing constructs the gateway from an Android context; no `TrustedSessionBinder` over the Firebase session; Room-backed ports only tested via fixtures. | Out of scope; tracked in blockers below. |
| 8 | No audit trail for tool calls. | Future (Batch C audit records exist for commands only). |
| 9 | No rate limiting. | Future (ROADMAP AGENT-221). |
| 10 | No Claude Mobile path (needs public HTTPS + OAuth). | AGENT-029 docs only. |

## Status flags after this batch

| Flag | Value |
|------|-------|
| `MCP_ADAPTER_IMPLEMENTED` | true |
| `MCP_TESTED_WITH_FIXTURES` | true |
| `AUTHENTICATED_GATEWAY_IMPLEMENTED` | true (fixture/JVM tested) |
| `WINDOWS_MCP_HOST_IMPLEMENTED` | true (tested against a fake gateway) |
| `LOOPBACK_HTTP_DEV_ONLY` | true (unit-test source set only) |
| `MCP_CONNECTED_TO_REAL_ANDROID` | **false** |
| `MCP_CONNECTED_TO_CLAUDE_CODE` | **false** |

## Remaining blockers for a real connection

1. An Android-side listener (foreground service) or outbound secure relay hosting `AuthenticatedAgentGateway`.
2. A production `TrustedSessionBinder` over the in-app authenticated user and a persistent, encrypted
   `DeviceTokenStore` (Keystore-backed secret). The in-memory store loses tokens on restart.
3. A non-production Firebase/applicationId flavor for safe testing (see `DEV-ENVIRONMENT-SAFETY.md`).
4. TLS for anything beyond loopback.
