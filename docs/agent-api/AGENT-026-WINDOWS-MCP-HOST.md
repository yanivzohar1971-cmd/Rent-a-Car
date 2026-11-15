# AGENT-026 — Windows MCP host

**Location:** `tools/mcp-host/` (Node.js ESM, zero dependencies). Usage and `claude mcp add` instructions:
[`tools/mcp-host/README.md`](../../tools/mcp-host/README.md).

## Decision: minimal JSON-RPC stdio host (no SDK)

`@modelcontextprotocol/sdk` was not added. The host only needs `initialize`, `ping`, `tools/list`,
`tools/call`, so a ~150-line stdio JSON-RPC implementation avoids a dependency tree, a lockfile, and
supply-chain surface for a security-sensitive bridge. Swapping to the SDK later is a drop-in change in
`src/index.mjs`; `src/host.mjs` holds the protocol logic and is transport-agnostic.

## Flow

```
Claude Code ──stdio JSON-RPC──> node src/index.mjs
                                   │ tools/list  → GET  /v1/tools    (Bearer)
                                   └ tools/call  → POST /v1/execute  (Bearer, requestId=mcp-<uuid>)
                                            │
                                            ▼
                               Authenticated gateway (AGENT-022..025)
```

- Config: `RENTACAR_GATEWAY_URL` (default `http://127.0.0.1:8742`), `RENTACAR_DEVICE_TOKEN`,
  optional `RENTACAR_REQUEST_TIMEOUT_MS`.
- The host sends **no identity fields**. It cannot choose a user; the token's bound session decides.
- Unconfigured token → JSON-RPC error `-32001`; unreachable/timeout gateway → `-32603`;
  gateway rejection on `tools/call` → `isError: true` with the gateway's JSON body as text.
- Protocol versions echoed when supported: `2025-06-18`, `2025-03-26`, `2024-11-05`.

## Verified (automated)

`node --test test/*.test.mjs` — 6 tests against an in-process fake gateway: config, handshake,
list/call with bearer header and no `userUid`, bad/missing token, param validation/unreachable gateway,
and the real stdio entry point end-to-end.

## What this does NOT give you yet

| Missing | Why it matters |
|---------|----------------|
| A running gateway on a **real Android device** | `127.0.0.1:8742` only exists if you run a dev gateway; the Kotlin loopback HTTP server is in the unit-test source set and is not an app feature. |
| Device pairing UX | tokens come from `DevicePairingService`/dev `POST /v1/pair` in tests only |
| TLS / relay | needed before any non-loopback use |
| Real Claude Code session test | not performed in this batch; `MCP_CONNECTED_TO_CLAUDE_CODE` stays `false` |

Writes are not exposed: only tools the gateway lists (wired read operations) can be called.
