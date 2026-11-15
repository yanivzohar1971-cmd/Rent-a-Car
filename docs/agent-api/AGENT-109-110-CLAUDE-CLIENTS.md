# AGENT-109 / AGENT-110 — Claude Code & Mobile

## AGENT-109 Windows Claude Code

| Check | Result |
|-------|--------|
| CLI | 2.1.292 |
| `claude auth status` | `loggedIn: false` → **CLAUDE_CODE_LOGIN_REQUIRED** |
| MCP `rentcar-emulator` | Local scope registered; Connected when emulator gateway up |
| Real NL query | **NOT EXECUTED** (no auth bypass) |
| `CLAUDE_CODE_REAL_QUERY_PASSED` | **false** |

Independent MCP protocol clients work without Claude login (`EMULATOR_REAL_ROOM` + token).

Owner action: `claude auth login` then re-run NL prompts from `AGENT-101-CLAUDE-CODE-SETUP.md`.

## AGENT-110 Claude Mobile connector

| Client | Localhost MCP | Remote MCP |
|--------|---------------|------------|
| Claude Code CLI | Yes (stdio) | Via remote host |
| Claude Desktop | Config-dependent | Possible |
| Claude Android app | **No** (cannot use device localhost of another app) | Needs authenticated HTTPS Remote MCP |
| Voice mode | Do not assume custom MCP tools | Unknown / unsupported |

Prepared pieces:

- Emulator loopback + Windows MCP (dev)
- Diagnostics UI route `claude_agent_connection` (not menu-linked)
- Transport abstractions for future remote endpoint

**Blockers:** public TLS MCP endpoint, OAuth/account authorization, mobile client verification.

`CLAUDE_MOBILE_CONNECTED = false`
