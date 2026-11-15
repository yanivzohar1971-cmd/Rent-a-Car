# 07 — Remote Access to Unsynchronized Android Data

## 1. Hard constraint (verified from Anthropic docs)

Claude Mobile / claude.ai custom connectors call MCP servers from **Anthropic’s cloud**, over **public HTTPS :443**.

Therefore:

- Claude Android app **cannot** call `localhost` inside another app (Rent a Car).
- A phone-local HTTP server in Rent a Car is **not** reachable by Claude Mobile connectors.
- Corporate VPN-only or non-443 endpoints will fail.

Sources:

- https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp
- https://support.claude.com/en/articles/11176164-use-connectors-to-extend-claude-s-capabilities
- https://code.claude.com/docs/en/mcp

## 2. Options evaluated

### OPTION A — Remote MCP + authenticated device command channel (RECOMMENDED)

```
Claude Mobile / Claude Code
  → Public HTTPS Remote MCP (Anthropic → your server)
    → Agent API AuthZ + router
      → Device Gateway (request queue / WebSocket relay)
        → Rent a Car app (outbound connection)
          → Device Executor → Room
```

**Pros:** Works for Mobile + Windows; no dependency on user’s Windows PC; Room never exposed to internet.  
**Cons:** Requires cloud relay component; Android background limits; device may be offline.

### OPTION B — Local Android Agent API for Claude Code only

- Claude Code on Windows via `adb reverse` / USB to on-device loopback, or emulator.
- **Pros:** Simple for lab.  
- **Cons:** Does not satisfy Claude Mobile; fragile; not production.

### OPTION C — Other official mechanisms

- Claude Code **stdio MCP** on Windows talking to a local bridge that uses Firebase device channel — still needs relay for phone data.
- Claude Code Remote Control sessions: still use connectors proxied via Anthropic for remote MCP — does not magically reach Room.

**No verified official path** for Claude Mobile → peer app localhost.

## 3. Device channel design requirements

| Topic | Recommendation |
|-------|----------------|
| Connection direction | **Outbound** from Android to gateway (firewall friendly) |
| Transport | WebSocket with auth **or** HTTPS long-poll |
| Availability | **No verified Android presence heartbeat worker** in-tree today — Agent must add explicit pairing/heartbeat (RTDB or gateway ping) |
| Background | Foreground service while Agent session active; expect OS kills |
| Battery | User-visible “Claude Agent connected” notification |
| Lock / doze | Queue requests; expire stale commands |
| Duplicate protection | Idempotency keys on command envelopes |
| Request expiry | Mandatory TTL (e.g. 30–120s for interactive reads) |
| Data plane | Ship operation requests/responses only — **never** mirror full Room to cloud |

## 4. Supported device states

| State | Agent behavior |
|-------|----------------|
| Foreground + connected | Full device executor |
| Background + FGS connected | Limited; prefer short reads |
| Doze / killed | `DEVICE_UNAVAILABLE` |
| Locked | May run if FGS permitted; treat as constrained |
| Logged out of Firebase | Reject |

## 5. Independence requirements (satisfied by Option A)

- No YZ Dev Bridge
- No requirement that Windows PC is on for Mobile users
- Room not exposed on public internet
- No assumption of permanent background connectivity

## 6. Minimal routing endpoint

Yes — a **request-routing gateway** is necessary for production Mobile access to unsynced data. It stores:

- Device registration / pairing
- Short-lived command envelopes
- Correlation IDs / results

It must **not** become a second database of record for reservations.

## 7. Phase mapping

- Phase 3: device pairing + channel + executor wiring  
- Phase 5: Remote MCP exposes `source=device` operations  
- Phase 7: Claude Mobile connector validation
