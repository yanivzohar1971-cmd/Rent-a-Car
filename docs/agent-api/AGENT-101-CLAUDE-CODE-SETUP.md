# AGENT-101 — Claude Code Setup (Rent a Car emulator MCP)

**Verification level:** Claude Code configuration (registration verified; live NL query blocked)

## Detected environment

| Item | Result |
|------|--------|
| Claude Code CLI | Installed — `2.1.292` (`Anthropic.ClaudeCode` via WinGet) |
| Auth | `loggedIn: false` → **CLAUDE_CODE_LOGIN_REQUIRED** |
| Desktop | Not required for this path |

Do **not** buy a subscription or create an Anthropic API key from automation. Log in interactively when ready:

```powershell
claude auth login
```

## Local MCP registration (already applied on this machine)

Suggested name: `rentcar-emulator` (local scope — not committed).

```powershell
claude mcp add --scope local --transport stdio rentcar-emulator `
  -e RENTACAR_EXECUTION_MODE=EMULATOR_REAL_ROOM `
  -e RENTACAR_GATEWAY_URL=http://127.0.0.1:18765 `
  -- node C:\Users\Yaniv\source\repos\Rent_a_Car\tools\mcp-host\run-emulator-stdio.mjs
```

Launcher loads `RENTACAR_DEVICE_TOKEN` from:

1. Environment variable, or
2. `build/agentapi-e2e/token.env` (gitignored; written by the E2E runner / AgentDev bootstrap)

Verify:

```powershell
claude mcp list
claude mcp get rentcar-emulator
```

When the emulator + AgentDev APK + `adb forward tcp:18765 tcp:18765` are up, status should show **Connected**.

## Prerequisites before asking Claude

1. Emulator running (`RentacarAgentDev`)
2. AgentDev APK installed (`com.rentacar.app.agentdev`)
3. Port forward: `adb -s emulator-5554 forward tcp:18765 tcp:18765`
4. Token present in `build/agentapi-e2e/token.env`
5. Claude logged in

## Example prompts (after login)

- Use the Rent a Car emulator tools to list suppliers in the Android development database.
- Find reservation id `9402` and show supplier order number and rental dates.
- Calculate commission summary totals for payout month `2026-03` using the Rent a Car tools.

Only call existing read tools. Writes stay disabled.

## Docs

Official MCP reference: https://code.claude.com/docs/en/mcp
