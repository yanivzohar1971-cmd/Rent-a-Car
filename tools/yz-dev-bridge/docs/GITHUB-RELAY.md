# GitHub inbox transport

GitHub Issues are an additional ChatGPT → Cursor path. They feed the **same** local YZ Dev Bridge queue that Firebase INLINE/CHUNKS already use. They do not replace Firebase.

```
ChatGPT
  -> GitHub Issue titled [YZ-BRIDGE] ...
  -> local npm run github-relay
  -> local YZ Bridge task (bridge.json)
  -> visible local Cursor Agent CLI window
  -> Cursor MCP tools
  -> Rent_a_Car working copy
  -> structured result comment on the GitHub issue
  -> ChatGPT
```

Firebase `npm run relay` continues to work unchanged.

## How ChatGPT creates a task

Open an issue on `yanivzohar1971-cmd/Rent-a-Car` with:

- Title starting with `[YZ-BRIDGE]`
- Author `yanivzohar1971-cmd`
- Body = task instructions (plain text, never a command to execute)

Example title: `[YZ-BRIDGE] Diagnose commission matching`

The issue body is stored as task instructions only. It is never passed to a shell.

## How to start the GitHub relay

```
cd C:\Users\Yaniv\source\repos\Rent_a_Car\tools\yz-dev-bridge
npm run github-relay
```

or:

```
powershell -ExecutionPolicy Bypass -File .\scripts\start-github-relay.ps1
```

Keep `npm run relay` running in another terminal if you still want Firebase INLINE/CHUNKS.

## Visible local Cursor Agent

When `YZ_BRIDGE_AGENT_AUTO_LAUNCH=true`, each new local `READY` task gets its **own** visible window.

Preferred launcher: Windows Terminal (`wt.exe`) via `Start-Process` so a real window is created. Fallback: `Start-Process powershell.exe` running `scripts/open-visible-agent.ps1` (non-persistent by default). Node `detached: true` is not used as the visibility mechanism.

The window runs `%LOCALAPPDATA%\cursor-agent\agent.cmd` (or the configured equivalent) against:

`C:\Users\Yaniv\source\repos\Rent_a_Car`

By default (`YZ_BRIDGE_AGENT_WINDOW_KEEP_OPEN=false`), the dedicated task host is launched **without** PowerShell `-NoExit`, so after a successful COMPLETED close-request the wrapper exits 0, the PowerShell host exits, and Windows Terminal can close the tab (`closeOnExit=graceful`). `YZ_BRIDGE_AGENT_WINDOW_KEEP_OPEN=true` adds `-NoExit` and leaves an interactive `PS>` prompt after the wrapper exits (manual diagnosis only). FAILED sessions exit non-zero so the tab stays open under `closeOnExit=graceful` even without `-NoExit`. If the launched window PID dies immediately, the relay records a launch error instead of treating a short-lived starter PID as success.

The Agent is instructed to:

1. `bridge_claim_task` for that local task ID
2. `bridge_get_task`
3. implement or verify according to the instructions
4. `bridge_update_task` with a structured result

Remote/background Cursor agents are not used.

`YZ_BRIDGE_AGENT_WINDOW_KEEP_OPEN=true` is the optional persistent-host override (`-NoExit`). The default is `false` so successful COMPLETED sessions can auto-close the dedicated tab.

Duplicate launches for the same task are prevented via `metadata.agentLaunchStartedAt`.

Unit tests mock process spawning and do not open real windows.

## Configuration

Set in gitignored `tools/yz-dev-bridge/.env`:

| Variable | Default | Purpose |
| --- | --- | --- |
| `YZ_BRIDGE_GITHUB_REPO` | `yanivzohar1971-cmd/Rent-a-Car` | Only this repository is polled |
| `YZ_BRIDGE_GITHUB_POLL_INTERVAL_MS` | `15000` | Poll interval (minimum 5000) |
| `YZ_BRIDGE_GITHUB_ALLOWED_AUTHOR` | `yanivzohar1971-cmd` | Hard author guard |
| `YZ_BRIDGE_GITHUB_TITLE_PREFIX` | `[YZ-BRIDGE]` | Hard title guard |
| `YZ_BRIDGE_AGENT_AUTO_LAUNCH` | `true` | Open a visible Agent window |
| `YZ_BRIDGE_AGENT_WINDOW_KEEP_OPEN` | `false` | Optional `-NoExit` persistent host (default closes after success) |
| `YZ_BRIDGE_WORKSPACE` | `C:\Users\Yaniv\source\repos\Rent_a_Car` | Agent working directory |
| `YZ_BRIDGE_CURSOR_AGENT_PATH` | (resolved) | Optional explicit CLI path |
| `YZ_BRIDGE_GITHUB_TOKEN` | (optional) | Only if `gh` / git credentials are unavailable |

Do not commit tokens. Auth preference: existing `gh auth`, then git GitHub credentials, then env token.

## How results return to ChatGPT

When the local task is `COMPLETED` or `FAILED`, the GitHub relay posts one markdown comment with:

status, resultSummary, rootCause, changedFiles, tests, build, behaviorChanged, behaviorPreserved, warnings, remainingIssues, nextRecommendedStep

Successful `COMPLETED` issues are closed. `FAILED` issues stay open. Restart will not post a second result comment (`<!-- yz-bridge-result:TASK-... -->` marker).

ChatGPT reads that comment on the issue.

## E2E Debug Diagnostics

YZ Dev Bridge now keeps a local per-task E2E debug journal for GitHub-driven runs:

- authoritative per-task file: `tools/yz-dev-bridge/data/debug/TASK-xxxxx.json`
- last updated snapshot: `tools/yz-dev-bridge/data/e2e-debug-latest.json`
- schema: `yz-bridge-e2e-debug-v1`

The journal records safe chronological evidence for:

- GitHub issue ingestion and ACK
- local task creation and status transitions
- Agent launch reservation / launcher selection / handoff / failure
- MCP tool calls that actually reach `yz-dev-bridge`
- GitHub result publication and issue close

Use:

```powershell
cd C:\Users\Yaniv\source\repos\Rent_a_Car\tools\yz-dev-bridge
npm run debug:e2e -- TASK-00018
```

That prints a compact safe summary with issue number, task status, Agent launch state, MCP tools seen in order, last observed tool, expected next tool, approval visibility, suspected approval blocking, unattended result, and failure stage.

Important limitation: Cursor MCP approval prompts are only recorded when they are directly exposed by Cursor. In the currently installed CLI, the public commands expose MCP configuration (`list`, `list-tools`, `enable`, `disable`, `login`) but not a machine-readable prompt event stream. Because of that, `approvalVisibility` is currently `unsupported`, and `suspectedApprovalBlock` is inferred only from observable facts such as:

- the Agent launched successfully
- one MCP tool arrived
- the expected next MCP tool never arrived
- the task stopped progressing

The full journal stays local. GitHub result comments include only a compact safe `debugSummary`.

## Troubleshooting

- Issue ignored: title must start with `[YZ-BRIDGE]`, author must be `yanivzohar1971-cmd`, issue must be open.
- No local task: GitHub relay not running, or GitHub auth missing.
- No visible window: `YZ_BRIDGE_AGENT_AUTO_LAUNCH=false`, or Cursor CLI missing/unauthenticated. Install with `irm 'https://cursor.com/install?win32=true' | iex`, then `agent login`.
- Duplicate tasks: prevented by `metadata.githubIssueNumber`.
- Firebase still works: `npm run relay` is a separate process and was not replaced.
