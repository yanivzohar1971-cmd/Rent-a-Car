# YZ DEV BRIDGE V2 — Non-Destructive Evolution Plan

**Document type:** Architecture + migration + execution plan  
**Date:** 2026-08-21  
**Target:** `C:\Users\Yaniv\source\repos\Rent_a_Car\tools\yz-dev-bridge`  
**Primary objective:** Evolve the existing YZ Dev Bridge into a durable multi-project, multi-execution-provider control plane without breaking the working V1 path.

---

## 0. Executive decision

Do **not** rewrite YZ Dev Bridge.

V2 must be implemented as a backward-compatible layer around the current system, using a strangler/evolution pattern:

- V1 remains operational throughout the upgrade.
- Existing task IDs, Store, project registry, Firebase relay, GitHub relay, MCP tools and dashboard remain the source of truth.
- New execution engines are introduced behind adapters and feature flags.
- The first V2 execution provider is the existing legacy path wrapped behind an interface.
- Cursor SDK is introduced as an optional provider, isolated in a worker process.
- Cursor ACP is introduced as a second optional provider/fallback path.
- Playwright becomes an independent verification layer.
- The dashboard becomes the control plane view, not the source of truth.
- No project is switched to V2 by default until it passes isolated, canary and rollback tests.
- The legacy path is not deleted during this EPIC.

The upgrade is successful only if the bridge can still execute the exact V1 flow after every major phase.

---

# 1. What exists today and must be preserved

The current bridge already has important foundations that must not be duplicated or replaced.

Observed/current concepts include:

- JSON-backed persistent Bridge Store.
- Atomic Store writes and lock handling.
- Existing `TASK-xxxxx` identity.
- Existing MCP tools:
  - `bridge_status`
  - `bridge_create_task`
  - `bridge_list_tasks`
  - `bridge_get_task`
  - `bridge_claim_task`
  - `bridge_claim_next_task`
  - `bridge_update_task`
  - `bridge_put_context`
  - `bridge_get_context`
  - `bridge_list_projects`
- Project registry in `config/projects.json`.
- Logical project IDs instead of arbitrary workspace paths.
- Project aliases.
- Project → GitHub repository mapping.
- Project → local workspace mapping.
- Firebase relay.
- GitHub issue relay.
- Cursor Agent launcher / visible Agent path.
- Agent session/liveness handling.
- Structured result handling.
- E2E debug tooling.
- Supervisor / local Control Center dashboard work.
- Existing Store lifecycle recovery logic.
- Existing GitHub stale/backlog protections.
- Existing security rule that the bridge itself does not accept arbitrary workspace paths from untrusted task text.
- Existing `npm test`, syntax checks and diagnostic CLI.

The local working tree is the authority during implementation. GitHub is only a reference snapshot and may lag behind local dashboard/Supervisor changes.

**Never reset local work to match GitHub.**

---

# 2. V1 compatibility contract

The following are frozen compatibility contracts until V2 is proven.

## 2.1 MCP/API compatibility

Existing V1 MCP tool names and existing required arguments must continue to work.

Existing HTTP behavior must remain available:

- `/mcp`
- `/health`

Existing Firebase relay routes must not be renamed or removed.

Existing GitHub relay issue semantics must remain valid.

Existing clients that know nothing about V2 must continue to function.

New fields may be additive.

Breaking changes require a future explicit V3 migration and are out of scope.

## 2.2 Store compatibility

The current Store remains the primary durable truth for bridge task state.

Do not replace it with:

- Cursor SDK persistence
- SQLite
- Firebase
- GitHub issues
- browser state
- an in-memory scheduler

Provider-native state may be stored as references, but never becomes the bridge authority.

Keep root Store schema compatibility unless a migration is genuinely unavoidable.

Prefer adding optional data under task metadata instead of changing existing required task fields.

## 2.3 Task compatibility

Existing statuses keep their original semantics.

Do not invent a new mandatory task status if the same information can be represented as additive metadata.

A V2 task waiting for operator input should normally remain:

`IN_PROGRESS`

with a derived V2 gate state in metadata.

V1 readers then continue seeing a valid known status.

## 2.4 Project compatibility

Existing project resolution precedence must not be changed accidentally.

Keep the current logical project ID safety boundary.

Never accept a raw filesystem path from a GitHub issue or remote task as a replacement for a registered project ID.

## 2.5 Runtime compatibility

Existing commands must keep working:

- `npm run relay`
- `npm run github-relay`
- `npm test`
- `npm run check`
- existing CLI diagnostics

New scripts are additive.

## 2.6 Security compatibility

The V2 upgrade must not weaken:

- loopback restrictions
- bearer authentication
- Firebase authorization
- project path validation
- Store sanitization
- process ownership rules
- secret handling
- GitHub author/repository validation

---

# 3. Target architecture

```text
                         ┌──────────────────────────────┐
                         │          ChatGPT             │
                         └──────────────┬───────────────┘
                                        │
                  ┌─────────────────────┼─────────────────────┐
                  │                     │                     │
          Firebase HTTPS           Remote MCP           GitHub Issues
                  │                     │                     │
                  └──────────────┬──────┴──────────────┬─────┘
                                 │                     │
                          ┌──────▼─────────────────────▼──────┐
                          │       YZ BRIDGE SUPERVISOR        │
                          │                                   │
                          │  ingress / routing / leases       │
                          │  task orchestration               │
                          │  lifecycle / recovery             │
                          │  events / dashboard API           │
                          └──────────────┬────────────────────┘
                                         │
                                Bridge Store
                                 (authority)
                                         │
                          ┌──────────────▼──────────────┐
                          │     EXECUTION ROUTER        │
                          └───────┬────────┬────────────┘
                                  │        │
                       ┌──────────┘        └───────────┐
                       │                              │
              Legacy Provider                 Cursor Providers
              (current path)                  ┌───────────────┐
                       │                      │ SDK Provider   │
                       │                      │ ACP Provider   │
                       │                      └───────┬───────┘
                       │                              │
                       └──────────────┬───────────────┘
                                      │
                               Project workspace
                                      │
                           ┌──────────▼──────────┐
                           │ Verification Layer │
                           │ syntax/unit/custom │
                           │ Playwright         │
                           └──────────┬──────────┘
                                      │
                              PASS / FAIL / GATE
                                      │
                           ┌──────────▼──────────┐
                           │ Dashboard + result │
                           └─────────────────────┘
```

---

# 4. Architectural rule: Supervisor must not host Cursor SDK directly

As of August 2026, Cursor SDK is still public beta and there are recent Windows reports of long-lived local SDK hosts entering an authentication/error state after extended idle periods.

Therefore:

**Do not import and hold long-lived SDK Agent handles inside the permanent Supervisor process.**

Instead use a provider worker boundary:

```text
Supervisor
   │
   ├─ spawn short-lived SDK worker
   │       └─ Agent.create / Agent.resume
   │
   ├─ receive normalized events
   │
   ├─ persist durable bridge state
   │
   └─ dispose worker at terminal state or operator gate
```

Benefits:

- SDK failure cannot poison the dashboard/Supervisor.
- SDK can be restarted without restarting the bridge.
- A fresh Node process can be used after auth/runtime failures.
- Provider dependency/version changes are contained.
- Worker logs can be sanitized independently.
- SDK billing loops can be bounded.
- Gate waiting does not require leaving a live SDK process idle.
- Future Claude/Codex/other providers can use the same worker contract.

---

# 5. Execution provider interface

Introduce an internal normalized provider contract.

Conceptual interface:

```text
ExecutionProvider
  id
  probe(project)
  start(task, project, executionContext)
  resume(task, providerSession)
  sendFollowUp(providerSession, instruction)
  cancel(providerSession)
  dispose(providerSession)
  normalizeEvent(nativeEvent)
```

Provider implementations:

1. `legacy`
2. `cursor-sdk`
3. `cursor-acp`

Future providers may be added later.

Do not let provider-specific objects leak into the rest of the bridge.

Normalized provider events should cover only bridge concepts such as:

- RUN_STARTED
- AGENT_MESSAGE
- TOOL_STARTED
- TOOL_FINISHED
- FILE_CHANGED
- COMMAND_STARTED
- COMMAND_FINISHED
- PERMISSION_REQUIRED
- QUESTION_REQUIRED
- PLAN_APPROVAL_REQUIRED
- HEARTBEAT
- RUN_COMPLETED
- RUN_FAILED
- RUN_CANCELLED
- PROVIDER_ERROR

Unknown native events should be safely logged/debugged, not crash the Supervisor.

---

# 6. Provider worker protocol

Use a minimal IPC contract between Supervisor and provider workers.

Preferred transport for local worker IPC:

- Node child process stdio
- newline-delimited JSON

Do not expose worker IPC on a network port.

Each message should include:

- protocolVersion
- requestId
- taskId
- executionId
- provider
- event/command type
- timestamp

Example conceptual command:

```json
{
  "protocolVersion": 1,
  "type": "START",
  "taskId": "TASK-00042",
  "executionId": "EXEC-...",
  "projectId": "rent-a-car",
  "workspaceRoot": "registered-value-only",
  "prompt": "...",
  "providerOptions": {}
}
```

Example conceptual event:

```json
{
  "protocolVersion": 1,
  "type": "RUN_STARTED",
  "taskId": "TASK-00042",
  "executionId": "EXEC-...",
  "provider": "cursor-sdk",
  "providerAgentId": "...",
  "providerRunId": "...",
  "at": "..."
}
```

Worker messages are not the durable source of truth. The Supervisor persists important state.

Malformed worker JSON:

- terminate/quarantine that worker
- mark provider error
- never crash Supervisor

---

# 7. Provider selection model

Each project may eventually carry additive execution metadata.

Conceptual project metadata:

```json
{
  "execution": {
    "mode": "legacy",
    "allowedProviders": [
      "legacy",
      "cursor-sdk",
      "cursor-acp"
    ],
    "preferredProvider": "cursor-sdk",
    "fallbackOrder": [
      "cursor-sdk",
      "cursor-acp",
      "legacy"
    ],
    "maxConcurrentTasks": 1
  }
}
```

Initial rollout rule:

`mode = legacy`

for every existing project.

No automatic migration.

Possible modes:

- `legacy`
- `cursor-sdk`
- `cursor-acp`
- `auto`

`auto` must not be enabled globally until canary criteria pass.

---

# 8. Critical fallback rule: never create two writers for the same task/workspace

Automatic fallback is safe only before workspace mutation or at a durable recovery boundary.

## Allowed automatic fallback

Examples:

- SDK cannot initialize before the run starts.
- required SDK credential missing.
- provider binary absent.
- provider probe fails before any file/command mutation.
- provider unavailable while task is still READY and unclaimed by a provider.

## Not allowed to blindly fallback

Examples:

- SDK changed files and then crashed.
- ACP executed a migration and disappeared.
- provider performed Git operations and then lost session.
- Agent modified a file while a second provider might repeat the same change.

In these cases:

1. Freeze the project execution lease.
2. Persist current git/worktree evidence.
3. Attempt same-provider resume/recovery.
4. If recovery fails, create a recovery gate.
5. Wait for operator/ChatGPT decision.
6. Never launch another provider concurrently.

This rule prevents duplicated edits and “going backward while trying to move forward.”

---

# 9. Project execution leases

Introduce a durable per-project execution lease.

Purpose:

- prevent two bridge agents editing the same registered workspace simultaneously
- prevent SDK and legacy providers both owning one project
- allow tasks on separate projects to execute concurrently

Lease fields conceptually include:

- projectId
- taskId
- executionId
- provider
- acquiredAt
- heartbeatAt
- ownerPid/worker identity
- leaseGeneration

Rules:

- one writer lease per project by default
- lease is not equivalent to task claim
- stale lease recovery must prove worker/session death or exceed a conservative timeout
- never steal a lease merely because a UI request wants faster execution
- terminal task releases lease
- operator gate may release the worker but retain logical ownership of the project for that task
- optionally permit read-only verification while a writer lease exists only if it cannot mutate

---

# 10. Durable V2 metadata without breaking V1

Prefer additive task metadata.

Conceptual structure:

```json
{
  "metadata": {
    "v2": {
      "execution": {
        "executionId": "EXEC-...",
        "provider": "cursor-sdk",
        "providerAgentId": "...",
        "providerRunId": "...",
        "attempt": 1,
        "state": "RUNNING",
        "startedAt": "...",
        "heartbeatAt": "...",
        "lastProgressAt": "..."
      },
      "gate": null,
      "verification": {
        "state": "NOT_STARTED"
      },
      "recovery": {
        "providerRestartCount": 0,
        "fallbackCount": 0
      }
    }
  }
}
```

Do not require V1 clients to understand these fields.

---

# 11. Operator/ChatGPT control gate protocol

The bridge must support controlled pauses.

A V2 task waiting for a decision remains `IN_PROGRESS`.

Example metadata:

```json
{
  "gate": {
    "gateId": "GATE-...",
    "type": "PLAN_APPROVAL",
    "status": "WAITING",
    "reasonCode": "ARCHITECTURE_DECISION",
    "summary": "Short factual summary",
    "options": [
      "CONTINUE",
      "CHANGE",
      "ABORT"
    ],
    "recommended": "CONTINUE",
    "createdAt": "...",
    "taskRevision": 17
  }
}
```

Operator decision:

```json
{
  "gateId": "GATE-...",
  "decision": "CONTINUE",
  "instruction": "Continue with the approved plan",
  "at": "...",
  "by": "chatgpt"
}
```

Safety requirements:

- Decision must match current task ID.
- Decision must match current gate ID.
- Decision must not be accepted for a stale gate.
- Duplicate CONTINUE must be idempotent.
- CHANGE creates a follow-up instruction, not a new task.
- ABORT cancels current execution safely.
- A gate waiting state must be visible in dashboard.
- Provider worker should normally be disposed while waiting.
- Resume should use provider-native resume when safe.
- If native resume is unavailable, reconstruct from durable task summary + git evidence and require a recovery gate before further mutation.

The gate protocol must not require changing existing task status values.

---

# 12. Mandatory gates for this upgrade EPIC

The Cursor implementation agent should pause at these points unless the plan can prove no production impact.

## GATE A — Baseline truth

Before structural edits:

- local git status captured
- current bridge tests run
- dashboard current behavior captured
- current processes/ports identified
- current Store location identified
- current project registry captured
- local-only/uncommitted files identified

Proceed automatically if baseline is healthy and no ambiguity threatens data.

If baseline is already failing, create a checkpoint before changing structural code.

## GATE B — Provider architecture proven in isolation

After:

- provider interface
- legacy adapter
- worker protocol
- unit tests

No production config changed.

Proceed automatically if all V1 tests still pass.

## GATE C — Cursor SDK/ACP capability result

Report:

- installed/selected SDK version
- API capability probe
- ACP capability probe
- authentication mode available
- Windows behavior
- cost/billing implication
- which provider is recommended

Do not enable new provider for production yet.

## GATE D — Dashboard/Playwright acceptance

After Playwright tests pass on isolated Supervisor/test Store.

Proceed automatically if all acceptance gates pass.

## GATE E — Production cutover approval

Before any action that changes the active production execution provider or restarts the production Supervisor:

- write a bridge checkpoint JSON
- include exact changes
- include exact rollback
- include V1 smoke result
- wait for `CONTINUE`

This is the main human/ChatGPT checkpoint.

## GATE F — Final migration report

After cutover/canary:

- V1 smoke
- V2 canary
- rollback simulation
- dashboard Playwright
- no leaked processes
- no Store corruption
- no orphan leases

Only then mark EPIC complete.

---

# 13. Self-upgrade safety

The bridge is being upgraded by an Agent that may itself depend on the bridge.

This creates a self-hosting risk.

Rules:

1. Never run destructive tests against the production Store.
2. Never restart the active production bridge as part of ordinary test setup.
3. Run V2 integration tests in an isolated instance.
4. Use a temporary Store.
5. Use a separate/ephemeral port.
6. Mock external relay/process actions where practical.
7. Do not let Playwright buttons start real Cursor Agents during automated dashboard tests.
8. Do not let test GitHub relay create real issues/tasks.
9. Do not let test Firebase relay mutate production data.
10. Final production restart is a controlled cutover action behind GATE E.
11. If the running Cursor task depends on the process being restarted, do not kill its control plane. Produce a handoff/restart command and use a successor process or operator-controlled restart.
12. Code edits on disk must not be confused with a successful runtime cutover.

---

# 14. Isolated V2 test instance

Create a reusable test harness.

Conceptual environment:

```text
YZ_BRIDGE_TEST_MODE=1
BRIDGE_DATA_FILE=<temp>/bridge.json
YZ_BRIDGE_PROJECTS_FILE=<fixture>/projects.json
YZ_BRIDGE_HOST=127.0.0.1
YZ_BRIDGE_PORT=0
YZ_BRIDGE_DISABLE_FIREBASE=1
YZ_BRIDGE_DISABLE_GITHUB=1
YZ_BRIDGE_DISABLE_REAL_AGENT_LAUNCH=1
```

Port `0` is preferred if implementation supports returning the actual bound port.

If the current server architecture cannot use port `0`, reserve a non-production test port and detect conflicts.

Test-mode restrictions must be enforced server-side, not only by hiding dashboard buttons.

---

# 15. Playwright strategy

Playwright is a verification provider, not an execution provider.

Add it without changing application task semantics.

## 15.1 Scope

Use Playwright for the YZ Bridge Control Center itself.

Test:

- rendering
- RTL layout
- responsive sizing
- filters
- scrolling
- buttons
- service state cards
- project selection
- task state rendering
- provider rendering
- gate rendering
- SSE/live update behavior
- error state behavior

Do not use Playwright to “prove” backend lifecycle alone. Backend unit/integration tests remain required.

## 15.2 Required dashboard viewports

At minimum:

- 375 × 812
- 390 × 844
- 430 × 932
- 768 × 1024
- 1366 × 768
- 1920 × 1080

## 15.3 Existing UI regression requirements

Explicitly test the problems already observed in the Control Center:

- Nothing is clipped on the right side in RTL.
- No unwanted document-level horizontal overflow.
- Task table area has a fixed usable height.
- Large task lists scroll inside the task table area.
- Task table header remains usable.
- Filters are clickable.
- Active filter state changes visually.
- Filter result count/rows change correctly.
- UI must not feel frozen because an overlay intercepts pointer events.
- Buttons must be reachable and enabled according to state.
- Dashboard remains usable after SSE updates.

## 15.4 Stable selectors

Add `data-testid` only where needed.

Do not build tests around brittle CSS hierarchy.

## 15.5 Playwright artifact policy

Recommended:

- `screenshot: 'only-on-failure'`
- `trace: 'retain-on-failure'` or `on-first-retry`
- video disabled by default
- HTML report for local inspection
- JSON/JUnit-style machine-readable report for bridge summary

Do not generate screenshots/videos for every passing test.

## 15.6 Retry policy

A test that passes only after retry is **FLAKY**, not clean PASS.

Dashboard acceptance should fail if core gating tests are flaky.

Retries may collect diagnosis evidence, but must not hide instability.

## 15.7 Browser matrix

Gating path:

- Chromium

Optional/non-blocking later:

- Firefox
- WebKit

Do not turn every local bridge edit into a heavy three-browser test unless a browser-specific regression is suspected.

---

# 16. Dashboard test fixtures

Use deterministic fixtures, not the production Store.

Fixtures should include:

- zero tasks
- one READY task
- one IN_PROGRESS task
- COMPLETED task
- FAILED task
- tasks from multiple projects
- long titles
- long project names
- many rows requiring table scroll
- provider `legacy`
- provider `cursor-sdk`
- provider `cursor-acp`
- waiting operator gate
- verification PASS
- verification FAIL
- stale worker state
- relay stopped/running/restarting
- simulated Store error card
- simulated provider error

Fixtures should not contain secrets or real tokens.

---

# 17. Dashboard action test doubles

Dashboard automated tests must not start real services.

Create interfaces/test doubles for:

- start relay
- stop relay
- restart relay
- launch agent/provider
- cancel task
- approve gate

Unit/integration tests verify the real adapters separately.

Playwright verifies that UI action → HTTP request → expected state/event works against test doubles.

---

# 18. Verification pipeline

After an implementation run:

```text
Implementation
   ↓
Static/syntax checks
   ↓
Unit tests
   ↓
Project-specific tests
   ↓
Playwright (when configured)
   ↓
Verification classification
   ↓
PASS / FAIL / FLAKY / BLOCKED
```

Never mark task COMPLETE merely because the Agent says it finished.

Task completion policy should be configurable, but V2 Bridge development tasks require mandatory verification.

---

# 19. Verification result model

Conceptual metadata:

```json
{
  "verification": {
    "state": "PASS",
    "startedAt": "...",
    "completedAt": "...",
    "checks": [
      {
        "id": "syntax",
        "state": "PASS",
        "command": "npm run syntax"
      },
      {
        "id": "unit",
        "state": "PASS",
        "command": "npm test"
      },
      {
        "id": "dashboard-playwright",
        "state": "PASS",
        "command": "npm run test:dashboard"
      }
    ],
    "artifacts": []
  }
}
```

Do not put absolute secret-bearing paths into public/remote task summaries.

---

# 20. Git/worktree safety

Bridge Agents operate on real workspaces.

Before V2 execution, capture:

- repository root
- current branch
- HEAD
- `git status --short`
- relevant diff summary

Rules:

- dirty worktree is not automatically an error
- never `git reset --hard`
- never `git clean`
- never auto-stash user work
- never discard unrelated changes
- never force push
- do not silently checkout another branch
- do not stage unrelated files
- do not claim that all diffs belong to the Agent if they existed before the run

Capture a baseline so the bridge can distinguish pre-existing state from task changes as accurately as possible.

If another actor changes the same workspace while a V2 lease is active:

- detect unexpected divergence where possible
- stop risky mutation
- create a conflict gate
- do not overwrite

---

# 21. Multi-project scheduling

Target behavior:

```text
Rent_a_Car task   ─┐
                   ├─ may run concurrently if independent
Glasses task      ─┤
NexusValley task  ─┤
Clockwise task    ─┘

Two Rent_a_Car writer tasks:
Task A → RUNNING
Task B → QUEUED_FOR_PROJECT
```

Default:

`maxConcurrentTasks = 1` per project.

Global max concurrency should also be bounded to protect:

- CPU
- RAM
- disk
- Cursor token spend
- browser test load

Do not spawn unlimited agents.

---

# 22. Resource budgets and loop prevention

Every execution needs bounded retry/recovery behavior.

Track:

- provider start attempts
- provider restarts
- fallback transitions
- verification retries
- no-progress time
- total execution time
- optional token/cost metadata when available

Recommended philosophy:

- transient startup retry: bounded
- provider restart: bounded
- fallback: bounded
- deterministic test failure: do not loop
- repeated identical failure: stop and gate
- no-progress: stop/gate rather than continue indefinitely

A generic “retry until it works” loop is forbidden.

---

# 23. No-progress detector

Progress should be based on meaningful events, not mere heartbeats.

Meaningful progress examples:

- file change
- command completion
- new Agent reasoning/result event
- test result
- explicit question/gate
- provider state transition

Heartbeat alone does not reset the no-progress clock forever.

If no meaningful progress exceeds threshold:

1. request provider status if possible
2. persist diagnostics
3. attempt one safe recovery if classified transient
4. otherwise gate

---

# 24. Circuit breaker

Maintain provider health at Supervisor level.

Example states:

- HEALTHY
- DEGRADED
- OPEN
- PROBING

If repeated SDK initialization/auth errors occur:

- open SDK circuit breaker for a bounded period
- stop launching new SDK tasks
- keep legacy bridge alive
- show health in dashboard
- do not keep burning tokens/start attempts

A manual probe can close the circuit after successful health check.

---

# 25. Cursor SDK integration rules

Cursor SDK is optional until proven.

Implementation rules:

- pin the package version in lockfile
- record detected version in diagnostics
- do not use `latest` at runtime
- run capability probe
- use local runtime with registered workspace only
- do not keep a permanently idle SDK worker
- dispose worker at terminal/gate state
- preserve provider agent/run IDs in metadata
- use fresh worker process for recovery
- classify auth/runtime errors
- do not expose API key in logs
- do not send API key through task metadata
- understand SDK usage is billed by Cursor token-based pricing
- add a project/global kill switch

Because SDK is beta, wrapper code must isolate API drift.

---

# 26. Cursor ACP integration rules

ACP provides an alternative local control path over stdio/JSON-RPC.

Implement as a separate adapter.

Expected flow:

1. spawn `agent acp`
2. initialize
3. authenticate or use pre-authenticated CLI
4. `session/new` or `session/load`
5. send `session/prompt`
6. process `session/update`
7. answer permission requests according to policy
8. handle Cursor blocking question/plan methods
9. cancel when required

Important:

- unanswered permission requests can block indefinitely
- blocking `cursor/ask_question` must become a bridge operator gate
- blocking `cursor/create_plan` must become a bridge operator gate
- team-level MCP limitations in ACP must be treated as a capability difference
- stderr is diagnostic, stdout is protocol; never mix them

ACP is not automatically “better” than SDK. It is another provider.

---

# 27. Permission policy

Do not auto-approve everything.

Create explicit policy classes:

## Safe to auto-run where configured

Examples:

- read files inside registered workspace
- search code
- run known test commands
- inspect git status
- start isolated test server

## Require gate or strict allowlist

Examples:

- file deletion
- destructive database commands
- force/reset Git operations
- credential changes
- production deployment
- external publication
- package install with unexpected lifecycle behavior
- changing Firebase production rules/functions
- changing GitHub repository visibility
- deleting branches

The exact policy should be project-configurable later.

For this EPIC, destructive actions remain blocked.

---

# 28. Firebase relay continuity

Firebase relay remains the primary remote ChatGPT ingress unless explicitly changed later.

V2 must not make Firebase depend on Cursor SDK availability.

Flow must remain valid:

```text
ChatGPT
  → Firebase API
  → local relay
  → Store
```

Then Supervisor may choose an execution provider.

If Firebase is unavailable:

- local MCP remains functional
- GitHub ingress remains functional
- dashboard remains functional
- queued local tasks remain visible
- no task is silently dropped

---

# 29. GitHub relay continuity

GitHub relay becomes an ingress/audit/fallback mechanism, not necessarily the only Agent launch path.

Existing issue identity and duplicate protection must remain.

If GitHub is unavailable:

- do not block Firebase-created tasks
- do not mark unrelated tasks failed
- show relay health separately

Never make a Cursor SDK failure close or modify a GitHub issue automatically unless existing policy explicitly requires it.

---

# 30. Store failure scenarios

## Lock timeout

- report Store lock issue
- do not invent task success
- do not run a second execution without durable ownership
- retry only under existing bounded policy

## EPERM / EBUSY / EACCES

- preserve existing Windows retry behavior
- surface sanitized diagnostics
- do not expose temp paths in remote cards

## Corrupt JSON

- fail closed
- preserve corrupt file for forensic recovery
- do not overwrite it with an empty Store
- require recovery action

## Disk full

- stop mutation
- do not continue Agent execution without durable progress persistence
- surface explicit failure/gate

---

# 31. Process failure scenarios

## Supervisor crash

On restart:

- load Store
- inspect leases
- reconcile owned workers/sessions
- do not assume all tasks failed
- do not relaunch blindly

## Worker crash before mutation

- bounded safe restart/fallback

## Worker crash after mutation

- same-provider recovery
- otherwise recovery gate

## Orphan worker

- identify via owned execution/worker metadata
- never kill unrelated processes
- terminate only provably owned worker/process tree

## Machine sleep

- tolerate time gaps
- revalidate leases and provider state
- do not interpret wall-clock gap alone as proof of failure

## Machine reboot

- recover durable Store
- worker PIDs are stale
- revalidate workspace/git
- resume or gate

---

# 32. Provider authentication scenarios

## SDK key missing

- provider probe = unavailable
- legacy remains available
- no task loss

## SDK key invalid

- circuit/degraded state
- do not retry endlessly
- no secret in log

## ACP CLI not logged in

- report actionable provider health
- legacy remains available

## Cursor executable missing

- provider unavailable
- dashboard still works
- legacy may be unavailable too depending on launcher
- task remains safely queued/gated

## Authentication expires while gate waits

Worker should normally be disposed during gate.

Resume occurs in a fresh worker, reducing stale auth risk.

---

# 33. Provider API/version drift

At startup/probe:

- detect installed SDK version
- detect ACP command availability
- validate expected minimum capabilities
- never assume event shape without guards

If API shape is incompatible:

- mark provider unsupported
- legacy stays enabled
- no production task should be attempted through incompatible provider

A beta SDK upgrade is a deliberate dependency update with tests, not an automatic runtime upgrade.

---

# 34. Cost/billing guardrails

SDK execution can incur Cursor usage charges.

Dashboard should eventually expose at least:

- provider
- model if known
- run duration
- provider request/run ID
- usage/cost if SDK exposes reliable data

Guardrails:

- no unbounded automatic retries
- no duplicate providers
- no re-running full EPIC after deterministic failure
- no automatic expensive browser matrix on every tiny task
- optional daily/provider budget later

Do not block the initial EPIC on perfect billing telemetry.

---

# 35. Dashboard target states

Dashboard should distinguish:

## Task state

- READY
- IN_PROGRESS
- COMPLETED
- FAILED
- CANCELLED

## Derived execution state

- QUEUED_FOR_PROJECT
- STARTING
- RUNNING
- WAITING_FOR_OPERATOR
- RECOVERING
- VERIFYING
- VERIFICATION_FAILED
- DONE

## Provider

- LEGACY
- CURSOR SDK
- CURSOR ACP

## Health

- Supervisor
- Store
- Firebase relay
- GitHub relay
- legacy launcher
- SDK provider
- ACP provider
- Playwright

Do not overload a single red/green light with all of these meanings.

---

# 36. Dashboard API behavior

UI must consume structured backend state.

Avoid scraping console output.

Recommended additive endpoints:

- `/api/status`
- `/api/projects`
- `/api/tasks`
- `/api/tasks/:id`
- `/api/providers`
- `/api/executions`
- `/api/verification`
- `/events` for SSE

If equivalent endpoints already exist locally, extend them instead of duplicating.

Existing endpoints must not be broken.

---

# 37. SSE robustness

Test:

- initial connection
- reconnect
- duplicate event tolerance
- event received during filtering
- event received while table is scrolled
- server restart behavior
- malformed event does not freeze UI

Client should refresh authoritative state after reconnect instead of relying only on missed events.

---

# 38. Dashboard RTL/layout acceptance criteria

At every required viewport:

- body/document has no unintended horizontal scroll
- main content fits viewport
- right edge is not clipped
- cards do not escape container
- long text uses wrapping/ellipsis intentionally
- buttons remain clickable
- overlays do not intercept unrelated pointer events
- task table owns vertical scrolling
- filter bar remains usable
- task table does not continuously grow page height
- mobile layout remains readable
- no controls are hidden behind fixed elements

---

# 39. Dashboard accessibility acceptance

Minimum:

- buttons use actual button semantics
- filter state exposed via `aria-pressed` or equivalent
- labels exist for controls
- keyboard focus visible
- no decorative layer blocks focus/click
- tables or list semantics are coherent
- status is not conveyed by color alone

---

# 40. Logging and observability

Use structured logs where possible.

Each execution log line should correlate to:

- taskId
- projectId
- executionId
- provider
- workerPid if local
- providerRunId if known

Never log:

- API keys
- bearer tokens
- Firebase secrets
- auth cookies
- full environment
- sensitive prompt fragments unnecessarily

Provide a sanitized debug export.

---

# 41. Task summary/checkpoint format

When Cursor pauses and needs ChatGPT/operator input, publish a concise machine-readable checkpoint plus a human summary.

Example:

```json
{
  "schema": "yz-bridge-checkpoint-v1",
  "taskId": "TASK-00042",
  "executionId": "EXEC-...",
  "projectId": "rent-a-car",
  "phase": "cursor-sdk-capability",
  "state": "WAITING_FOR_OPERATOR",
  "gateId": "GATE-...",
  "completed": [
    "Legacy provider adapter implemented",
    "V1 tests pass"
  ],
  "currentEvidence": {
    "sdkProbe": "PASS",
    "acpProbe": "PASS"
  },
  "recommendedDecision": "CONTINUE",
  "allowedDecisions": [
    "CONTINUE",
    "CHANGE",
    "ABORT"
  ],
  "nextActionIfContinue": "Implement isolated SDK canary",
  "rollback": "No production provider has been changed"
}
```

This checkpoint must not contain secrets.

---

# 42. Change-after-summary behavior

If ChatGPT/operator replies with a changed direction:

- do not restart the whole EPIC
- append the new instruction to the current execution control record
- recompute only affected remaining phases
- preserve completed verified phases
- invalidate only tests/assumptions actually affected
- record why the plan changed

This prevents circular work.

---

# 43. Decision tree for blocked progress

Use this order.

```text
Problem
  │
  ├─ Is it a deterministic code/test failure?
  │      └─ Fix root cause. Do not provider-switch.
  │
  ├─ Is it a transient provider startup/auth problem before mutation?
  │      └─ bounded retry → safe fallback if allowed
  │
  ├─ Did workspace mutation already occur?
  │      └─ same-provider resume → diagnostics → recovery gate
  │
  ├─ Is production data/process at risk?
  │      └─ gate immediately
  │
  ├─ Is required capability simply unavailable?
  │      └─ use supported alternative if architecture permits
  │
  └─ No safe forward path?
         └─ STOP WITH EVIDENCE. Do not improvise destructive recovery.
```

“No safe forward path” is an acceptable outcome. Repeated random attempts are not.

---

# 44. Phase plan

## Phase 0 — Baseline and freeze contract

Tasks:

- inspect local repo, not only GitHub
- capture current git status/HEAD
- inventory bridge files/processes/ports
- identify local dashboard/Supervisor changes
- run current tests
- capture current Store schema/examples safely
- snapshot project registry
- document existing public contracts
- verify no production secret is copied into test fixture

Deliverable:

`docs/V2-BASELINE.md` or equivalent internal report.

Exit gate:

- baseline known
- existing failures clearly classified
- no V2 mutation yet

Rollback:

not applicable; read-only.

---

## Phase 1 — Characterization tests

Before refactoring, write tests for existing behavior:

- task create/claim/update
- project resolution
- arbitrary-path rejection
- GitHub mapping
- Store lock behavior
- legacy launch eligibility
- lifecycle reconciliation
- structured result behavior
- existing dashboard APIs if present

Goal:

make V1 behavior executable as a compatibility contract.

Exit gate:

all baseline-compatible tests pass.

Rollback:

remove only new tests if they are invalid; no runtime change.

---

## Phase 2 — Internal execution abstraction

Add:

- normalized provider interface
- execution router
- LegacyExecutionProvider wrapping current launcher
- no behavior change
- feature flags defaulting to legacy

The old launcher remains intact.

Exit gate:

V1 execution path uses legacy adapter but behaves identically.

Tests:

- original tests
- provider router unit tests
- one legacy dry-run/fixture path

Rollback:

feature flag bypasses router or adapter can be reverted without Store migration.

---

## Phase 3 — Worker protocol

Add:

- child worker manager
- JSONL IPC
- heartbeat
- cancellation
- worker crash classification
- sanitized stderr handling
- owned PID/process tracking

Initially create a mock provider worker.

Do not integrate SDK yet.

Exit gate:

mock worker can start, emit progress, wait, fail, crash and cancel without harming Supervisor.

---

## Phase 4 — Project leases

Add durable project execution lease.

Test:

- two tasks same project serialize
- two projects may run concurrently
- stale worker does not permit duplicate writer without reconciliation
- terminal task releases
- waiting gate behavior
- Supervisor restart recovery

Exit gate:

no duplicate writers in test suite.

---

## Phase 5 — Cursor SDK provider spike

Add SDK only behind disabled flag.

Requirements:

- pinned SDK package
- capability probe
- worker isolation
- local registered `cwd`
- fresh worker lifecycle
- event normalization
- cancellation
- provider IDs captured
- error classification
- no secret logging

Run against a disposable test repository or a safe read-only prompt first.

Do not run mutation against the main Rent_a_Car project until canary.

Exit gate:

SDK smoke passes in worker, Supervisor remains healthy after worker kill/restart.

---

## Phase 6 — Cursor ACP provider spike

Add ACP behind disabled flag.

Requirements:

- detect `agent acp`
- initialize
- auth capability
- session create/load
- prompt
- stream events
- permission handling
- Cursor question/plan gate mapping
- cancel
- stderr/stdout separation

Exit gate:

ACP smoke passes or is explicitly classified unavailable without blocking V2.

ACP is valuable but not required to force success if SDK + legacy are sufficient.

---

## Phase 7 — Operator gates / resumability

Implement durable gate metadata and command handling.

Test:

- create gate
- duplicate CONTINUE
- stale gate decision rejected
- CHANGE follow-up
- ABORT
- Supervisor restart while waiting
- worker disposed while waiting
- fresh resume after decision

Exit gate:

a task can safely stop for hours and continue without a permanently idle provider process.

---

## Phase 8 — Verification provider layer

Add normalized verification checks.

Initial checks for bridge:

- syntax
- unit
- integration
- dashboard Playwright

Verification runs after implementation and before success.

Exit gate:

Agent self-report alone cannot mark the EPIC verified.

---

## Phase 9 — Playwright dashboard harness

Install/configure Playwright.

Implement isolated Supervisor test instance and fixtures.

Add tests for:

- RTL overflow
- fixed task table scroll region
- filters clickable
- multi-project filter
- task states
- provider state
- gate state
- relay controls using test doubles
- SSE update
- reconnect
- mobile/desktop viewports

Exit gate:

all core dashboard tests pass first attempt.

---

## Phase 10 — Dashboard V2 UI

Only after Playwright baseline exists:

- fix current clipping/filters/scroll regressions
- add provider display
- add execution state
- add verification state
- add operator gate action area
- add provider health
- preserve current visual language

Exit gate:

Playwright acceptance + backend tests.

---

## Phase 11 — Failure/recovery hardening

Test fault injection:

- Store lock
- worker immediate crash
- worker crash after simulated mutation
- SDK unavailable
- ACP unavailable
- relay down
- SSE disconnect
- Supervisor restart
- machine-like stale PID
- port conflict
- malformed worker message
- invalid gate decision
- duplicate task launch request

Exit gate:

each scenario reaches a deterministic safe state.

---

## Phase 12 — Security review

Check:

- no arbitrary workspace path path introduced
- no token logging
- no remote route can launch arbitrary commands
- no dashboard test mode available on non-loopback/production accidentally
- test actions cannot reach production Firebase/GitHub
- provider prompt cannot override project registry
- child process args do not leak secrets
- HTML dashboard escapes task content
- logs/result cards sanitize paths/secrets

Exit gate:

security tests + review.

---

## Phase 13 — Canary

Do not begin with Rent_a_Car production work.

Use a safe canary project/task.

Suggested sequence:

1. legacy provider through new router
2. SDK read-only task
3. SDK harmless file/test task in disposable fixture repo
4. ACP read-only if available
5. gate/resume test
6. verification pipeline
7. dashboard observation

Then one real project can be enabled explicitly.

Exit gate:

multiple successful canaries with rollback proven.

---

## Phase 14 — Controlled cutover

At GATE E:

Report exact production changes.

Possible first cutover:

- Supervisor V2 code active
- all projects still `legacy`
- Playwright available
- provider health visible
- SDK/ACP disabled for production tasks

This is the safest first production deployment.

Then enable SDK per project one by one.

Do not flip all projects to `auto`.

---

## Phase 15 — Post-cutover observation

Observe:

- duplicate launches
- stuck leases
- Store growth
- worker leaks
- SDK auth errors
- relay behavior
- dashboard SSE
- verification duration
- task completion truthfulness

Keep legacy available.

---

# 45. Rollback strategy

Rollback must be possible without Store surgery.

## Level 1 — Provider rollback

Set project provider back to `legacy`.

No Store migration.

## Level 2 — V2 execution off

Disable V2 execution router feature flag.

Keep dashboard and new code installed.

## Level 3 — Supervisor V2 off

Run known V1 entry point if preserved.

## Level 4 — code rollback

Revert only V2 code changes using Git.

Never reset user/project application changes.

## Data rule

Because V2 metadata is additive, V1 should be able to ignore it.

This is the core reason to avoid mandatory schema replacement.

---

# 46. “Do not do” list

Do not:

- rewrite the whole bridge
- delete legacy launcher
- make SDK mandatory
- make ACP mandatory
- move Store authority into SDK
- run two writers on one project
- retry forever
- fallback after mutation without recovery logic
- reset Git
- clean the worktree
- kill unrelated Cursor/Windows Terminal processes
- let tests use production Store
- let Playwright start real Agents
- expose test mode remotely
- auto-approve destructive permission prompts
- restart production bridge during ordinary implementation
- silently spend unlimited Cursor tokens
- make dashboard state authoritative
- claim PASS after flaky retry
- close task just because Agent said “done”
- overwrite a corrupt Store with empty data
- rework unrelated Firebase User Data Completion Engine code
- merge unrelated Rent_a_Car application work into this EPIC

---

# 47. Test matrix

| Area | Test | Expected |
|---|---|---|
| V1 | Existing MCP create/claim/update | unchanged |
| V1 | Firebase relay | unchanged |
| V1 | GitHub relay | unchanged |
| V1 | legacy Agent launch | unchanged |
| Project | valid ID | resolves |
| Project | alias | resolves |
| Project | arbitrary path | rejected |
| Project | disabled project | rejected |
| Lease | same project two tasks | serialized |
| Lease | different projects | concurrent if global budget allows |
| Worker | crash pre-mutation | bounded retry/fallback |
| Worker | crash post-mutation | recovery gate |
| SDK | missing key | unavailable, no task loss |
| SDK | worker restart | Supervisor healthy |
| ACP | permission request | gate/policy response |
| ACP | ask question | operator gate |
| Gate | duplicate continue | idempotent |
| Gate | stale gate | rejected |
| Gate | Supervisor restart | waiting state survives |
| Verify | unit failure | not complete |
| Verify | Playwright failure | not complete |
| Verify | flaky core test | FLAKY/not accepted |
| UI | 375px RTL | no clipping |
| UI | 390px RTL | no clipping |
| UI | 430px RTL | no clipping |
| UI | desktop | no clipping |
| UI | large task list | inner scroll |
| UI | filters | clickable/result changes |
| UI | SSE | updates safely |
| UI | SSE reconnect | authoritative refresh |
| Store | lock contention | bounded safe behavior |
| Store | corrupt JSON | fail closed |
| Process | orphan worker | only owned process affected |
| Process | stale PID | reconciled |
| Security | task HTML | escaped |
| Security | secret | not logged |
| Self-upgrade | isolated tests | production untouched |

---

# 48. Definition of Done

This EPIC is done only when all are true:

1. V1 compatibility tests pass.
2. Existing Firebase relay still works.
3. Existing GitHub relay still works.
4. Existing legacy Agent route still works.
5. Project registry protections still work.
6. No production Store migration was required, or migration is proven reversible.
7. Legacy provider exists behind normalized execution interface.
8. SDK provider exists behind disabled/per-project flag and worker isolation.
9. ACP provider exists or is explicitly documented as unsupported/unavailable after probe.
10. Project leases prevent duplicate writers.
11. Operator gate survives restart.
12. Waiting gates do not require a permanently idle SDK worker.
13. Verification layer exists.
14. Playwright dashboard suite exists.
15. RTL clipping regression is covered.
16. Task-table fixed-height scrolling is covered.
17. Filters-clickable regression is covered.
18. SSE behavior is covered.
19. Core dashboard Playwright tests pass without retry.
20. Provider failures do not crash Supervisor.
21. SDK failure cannot take down legacy path.
22. No provider secret appears in Store/log/report.
23. No unrelated app code is changed.
24. No unowned process is killed.
25. No duplicate execution occurs after worker failure.
26. Production cutover was explicit.
27. Rollback to legacy was actually tested.
28. Final bridge status/report clearly says which provider each project uses.
29. Documentation is updated.
30. A final checkpoint/result is written to the bridge task.

---

# 49. Recommended first production configuration

After V2 code is installed:

```text
Supervisor V2: ON
V2 metadata: ON
Verification framework: ON
Dashboard Playwright: ON

Rent_a_Car execution: legacy
Glasses execution: legacy
NexusValley execution: legacy
Clockwise execution: legacy

Cursor SDK provider: available but not default
Cursor ACP provider: available but not default
AUTO routing: OFF
Legacy fallback: ON
```

Then migrate projects individually.

This gives almost all architectural benefits without risking immediate execution-engine replacement.

---

# 50. Recommended later configuration

After canary maturity:

```text
Rent_a_Car → cursor-sdk
Glasses → cursor-sdk
NexusValley → cursor-sdk or legacy depending Unity behavior
Clockwise → cursor-sdk

Fallback policy:
pre-mutation only → ACP → legacy

Post-mutation failure:
same provider recovery → operator gate
```

Do not interpret this as a requirement to migrate every project.

---

# 51. Future extension points

Once V2 is stable, the same control plane can support:

- Codex execution adapter
- Claude Code adapter
- remote/cloud Cursor Agent adapter
- PR review Agent
- scheduled maintenance Agent
- test-only Agent
- security review Agent
- project-specific verification recipes
- richer cost telemetry
- task dependencies/DAG
- priority scheduling
- human approval roles
- audit export

These are intentionally outside the current EPIC.

The current EPIC builds the seams needed for them.

---

# 52. Source notes used for this design

Current official Cursor capabilities checked on 2026-08-21:

- Cursor SDK release / local Agent:
  - https://cursor.com/changelog/sdk-release
- Cursor SDK June 2026 updates:
  - https://cursor.com/changelog/sdk-updates-jun-2026
- Cursor ACP:
  - https://cursor.com/docs/cli/acp
- Cursor CLI:
  - https://cursor.com/docs/cli/using
- Cursor SDK Bridge:
  - https://cursor.com/docs/sdk/bridge
- Playwright configuration:
  - https://playwright.dev/docs/test-configuration
- Playwright use options / trace / screenshot:
  - https://playwright.dev/docs/test-use-options
- Playwright projects:
  - https://playwright.dev/docs/test-projects
- Playwright best practices:
  - https://playwright.dev/docs/best-practices

Important current risk signal:

- Recent Cursor community report on Windows long-lived SDK local Agent authentication failure after extended idle:
  - https://forum.cursor.com/t/cursor-sdk-1-0-28-local-send-dies-after-1h-idle-with-log-out-and-back-in-same-api-key-works-only-after-node-restart/168907

This community issue is not treated as a formal API contract. It is a reason to isolate SDK in restartable workers and to keep the legacy path.

---

# 53. Final architecture principle

The goal is not:

> “Replace our bridge with Cursor SDK.”

The goal is:

> “Make YZ Dev Bridge the stable control plane, while Cursor SDK, ACP and the existing launcher become replaceable execution engines beneath it.”

That distinction is what prevents the project from reaching a dead end when any single provider, SDK version, login mode, network dependency or UI changes in the future.
