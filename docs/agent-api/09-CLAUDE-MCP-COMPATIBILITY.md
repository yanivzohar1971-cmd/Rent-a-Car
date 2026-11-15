# 09 — Claude & MCP Compatibility

**Research date:** 2026-11-15  
**Primary sources:**  
- https://code.claude.com/docs/en/mcp  
- https://code.claude.com/docs/en/mcp-quickstart  
- https://modelcontextprotocol.io/  
- https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp  
- https://support.claude.com/en/articles/11176164-use-connectors-to-extend-claude-s-capabilities  
- https://claude.com/docs/connectors/building  

## 1. Client distinctions (do not conflate)

| Client | How it reaches MCP | Localhost to Rent a Car? |
|--------|--------------------|---------------------------|
| Claude Code on Windows | stdio MCP and/or remote HTTP MCP | stdio local bridge possible; remote MCP is public HTTPS |
| Claude Code remote/cloud sessions | Connectors via Anthropic proxy | No private localhost |
| Claude Desktop / claude.ai | Custom connectors → Anthropic cloud → your HTTPS MCP | No |
| Claude Mobile (Android/iOS) | Same connectors (often added on web/desktop first) | **No** peer-app localhost |

## 2. Claude Code on Windows

**Add remote MCP (recommended for production Agent API):**

```bash
claude mcp add --transport http rentacar https://<your-host>/mcp
```

JSON configs: `"type": "http"` (alias `"streamable-http"` accepted). A `url` without `type` is treated as stdio and skipped.

**OAuth:** Server returns 401/403 → user runs `/mcp` → Authenticate → browser OAuth.  
Token endpoints must be HTTPS (or localhost loopback).

**Static bearer:** `--header "Authorization: Bearer …"` for non-OAuth setups (lab only; prefer OAuth for production).

**Anthropic API key:** Required for Claude Code usage generally; **separate** from MCP auth to Rent a Car and from Firebase credentials.

## 3. Claude Mobile

- Supports **remote** connectors synced from account (web/desktop primary for adding custom connectors).
- Anthropic cloud must reach MCP on **HTTPS port 443**.
- Free plan: limited custom connectors (docs: one custom connector).
- Does **not** enable calling Rent a Car’s on-device localhost server.

## 4. MCP protocol features to plan for

| Feature | Plan |
|---------|------|
| Tool discovery | Capability registry → MCP `tools/list` |
| Tool execution | Map tool name → `OPERATION_ID` |
| Streamable HTTP | Host Remote MCP with streamable HTTP transport |
| OAuth | Rent a Car / Agent API authorization server or Firebase-linked OAuth bridge |
| list_changed | Optional later |
| Confirmations | Encode via tool schema + application-level confirm tokens (Phase 9) |

## 5. Credential matrix

| Secret | Purpose |
|--------|---------|
| Anthropic / Claude account | Runs the model client |
| MCP OAuth access token | Authorizes Claude → Rent a Car Agent MCP |
| Firebase ID token / session | Authorizes Agent → user data |
| Device channel token | Authorizes gateway → paired phone |
| Google service account | Server-side Admin SDK only on backend — never in Claude |

## 6. Integration strategy by environment

### A. Claude Code Windows — Slice 1 (cloud reads)

Remote MCP → Cloud Executor → Firestore synced suppliers.

### B. Claude Code Windows — Device lab

Optional stdio bridge + adb reverse for Device Executor (**dev only**).

### C. Claude Mobile — production

Custom remote MCP connector → same public Agent API → Cloud Executor and/or Device Gateway.

### D. Unsynchronized Room from Mobile

Requires Option A device channel (doc 07). Not optional if Mobile must see local-only data.

## 7. Account restrictions (document as operational risk)

- Plan limits on custom connectors
- Team/Enterprise owner roles for adding connectors
- Org managed MCP allowlists (`managed-mcp` docs)

Exact entitlements should be re-checked against the operator’s Claude plan at implementation time.

## 8. Conclusions

1. **One public Remote MCP** serves both Windows Claude Code and Claude Mobile.
2. **Do not design** around Mobile localhost access to Rent a Car.
3. Keep Anthropic, MCP, Firebase, and device credentials strictly separated.
4. Prefer OAuth for Remote MCP; use streamable HTTP on :443.
