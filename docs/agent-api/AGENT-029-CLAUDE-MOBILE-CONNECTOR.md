# AGENT-029 — Claude Mobile connector (documentation only)

**No code in this task.** Nothing here is implemented or tested; it records requirements so the
architecture stays compatible.

## Why the Windows stdio host cannot serve Claude Mobile

Claude Mobile (and claude.ai) cannot launch local processes or reach `localhost` on a PC or on the phone.
Custom connectors are **Remote MCP servers**: Claude's cloud connects to a public URL. Therefore:

- `tools/mcp-host` (stdio) is for Claude Code on Windows only.
- The app's loopback gateway is development-only and unreachable from Claude's cloud.

## Requirements for a Remote MCP connector

| Requirement | Notes |
|-------------|-------|
| **Public HTTPS endpoint** | Valid TLS certificate on a public hostname; Streamable HTTP MCP transport (SSE legacy). No self-signed certs, no private IPs/ports behind NAT. |
| **OAuth 2.1-style authorization** | Remote connectors authenticate via OAuth (authorization-code + PKCE; dynamic client registration or a pre-registered client). The MCP server acts as/fronts an authorization server and issues short-lived access tokens bound to the **Firebase-authenticated user**. A static bearer token is not an acceptable consumer-facing design. |
| **Identity binding** | Token → `BoundSessionIdentity` server-side. Never accept `userUid` from tool arguments (same rule as the local gateway). |
| **Tool list from the registry** | Only allowlisted read tools; writes only after the Batch C confirmation pipeline is activated. |
| **Reachability of data** | A cloud MCP server can only read cloud-mirrored data (12 synced collections, may be stale). Local-only/unsynced Room data requires the device to be online via a relay (outbound connection from the phone) — see `07-REMOTE-ANDROID-ACCESS.md`. Responses must carry freshness/`DEVICE_UNAVAILABLE` metadata. |

## Voice mode limitation

Claude's voice mode on mobile does not (currently) expose custom connector tools: voice conversations should be
assumed **not** to invoke these tools. Plan documentation/UX around text chat for tool use; re-verify
against current Anthropic documentation before promising voice access.

## Remote MCP notes

- Connector setup is done in claude.ai settings (Custom connector → server URL); once added it is available on
  mobile for the same account. Team/Enterprise plans may require an admin to enable custom connectors.
- Keep tool names/descriptions stable; changing schemas requires reconnecting in some clients.
- Rate-limit and audit every call server-side (ROADMAP AGENT-221, AGENT-203).
- Prompt-injection posture: tool results contain business data (customer names, notes); treat them as untrusted
  text and keep writes behind explicit confirmation tokens bound to a command hash.

## Secrets: no Anthropic key in the APK

- The Android app must **never** embed an Anthropic API key or Claude credentials. Claude calls *into* our
  MCP server; our server never needs to call Claude.
- The APK may hold only its own user session and a device pairing token (stored encrypted, revocable).
- Server-side secrets (token HMAC secret, OAuth signing keys, confirmation-token secret) live in a secret
  manager, are rotated, and are never in source control or the APK.

## Open questions (before implementation)

1. Hosting for the remote MCP + relay (Cloud Run vs. Functions) and the dev project for it.
2. OAuth provider: self-hosted authorization server vs. Firebase Auth bridge.
3. Pairing UX in the app (QR / code) producing a relay-bound, revocable device token.
