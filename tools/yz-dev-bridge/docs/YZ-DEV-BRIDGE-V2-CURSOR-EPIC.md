```text
You are Cursor Agent working on the existing YZ DEV BRIDGE.

THIS IS A REAL, WORKING SYSTEM. YOUR JOB IS TO EVOLVE IT SAFELY, NOT REWRITE IT.

Canonical local bridge workspace:
C:\Users\Yaniv\source\repos\Rent_a_Car\tools\yz-dev-bridge

Primary Rent_a_Car repository:
C:\Users\Yaniv\source\repos\Rent_a_Car

Companion architecture/migration document:
YZ-DEV-BRIDGE-V2-UPGRADE-PLAN.md

EXPECTED PLAN LOCATIONS, IN ORDER:
1. C:\Users\Yaniv\source\repos\Rent_a_Car\tools\yz-dev-bridge\docs\YZ-DEV-BRIDGE-V2-UPGRADE-PLAN.md
2. C:\Users\Yaniv\Downloads\YZ-DEV-BRIDGE-V2-UPGRADE-PLAN.md
3. Current workspace root\YZ-DEV-BRIDGE-V2-UPGRADE-PLAN.md

MISSION

Implement the YZ DEV BRIDGE V2 upgrade described by the companion MD.

The target is a backward-compatible control plane with:

- current V1 behavior preserved
- multi-project routing preserved
- existing Store preserved as authority
- legacy Cursor execution wrapped as a provider
- Cursor SDK provider behind an opt-in feature flag
- Cursor ACP provider behind an opt-in feature flag where available
- execution provider worker isolation
- project execution leases
- safe recovery/fallback logic
- durable operator/ChatGPT checkpoints
- independent verification pipeline
- Playwright tests for the Control Center/dashboard
- explicit regression coverage for RTL clipping, fixed-height task-table scrolling and broken/non-clickable filters
- production-safe self-upgrade procedure
- rollback to legacy at all times

DO NOT DO A BIG-BANG REWRITE.

DO NOT DELETE THE LEGACY PATH.

DO NOT SWITCH ALL PROJECTS TO CURSOR SDK.

DO NOT CHANGE THE PRODUCTION EXECUTION PROVIDER UNTIL THE FINAL CUTOVER GATE.

==================================================
0. READ THE PLAN BEFORE TOUCHING CODE
==================================================

Find and read the entire:

YZ-DEV-BRIDGE-V2-UPGRADE-PLAN.md

If it is found in Downloads but not under bridge\docs:

- copy it verbatim into:
  C:\Users\Yaniv\source\repos\Rent_a_Car\tools\yz-dev-bridge\docs\YZ-DEV-BRIDGE-V2-UPGRADE-PLAN.md

Do not rewrite its content.

If the plan file cannot be found anywhere:

STOP BEFORE CODE CHANGES.

Publish/report:

PLAN_FILE_MISSING

with the exact locations checked.

Do not invent a replacement plan.

==================================================
1. LOCAL WORKING TREE IS THE SOURCE OF TRUTH
==================================================

The local working tree may contain newer Supervisor/dashboard changes than GitHub.

DO NOT:

- reset to GitHub
- checkout over local changes
- use git reset --hard
- use git clean
- auto-stash user work
- delete unknown local files
- overwrite newer local dashboard code with older repository versions

Before modifying anything, inspect from:

C:\Users\Yaniv\source\repos\Rent_a_Car

Run and record:

git status --short
git branch --show-current
git rev-parse HEAD
git remote -v

Then inspect the bridge itself:

tools\yz-dev-bridge\package.json
tools\yz-dev-bridge\README.md
tools\yz-dev-bridge\config\projects.json
tools\yz-dev-bridge\src\
tools\yz-dev-bridge\test\
tools\yz-dev-bridge\tests\
tools\yz-dev-bridge\docs\
and any current Supervisor/dashboard directories/files

Do not assume directory names from an older snapshot.

Discover the actual implementation.

==================================================
2. BASELINE BEFORE REFACTORING
==================================================

From the bridge directory, run the existing checks that are currently valid.

At minimum attempt:

npm test
npm run syntax
npm run check

If a command does not exist, inspect package.json and use the current equivalent.

Also inspect:

- active bridge/Supervisor processes
- current local dashboard port
- current Store file
- project registry
- currently owned relay/Agent process model
- current dashboard APIs
- current SSE endpoint
- current filter/table implementation
- current test coverage

DO NOT STOP MERELY BECAUSE AN EXISTING BASELINE TEST FAILS.

Instead classify it:

A. pre-existing deterministic failure
B. environment/dependency failure
C. failure caused by current uncommitted work
D. unknown

If a baseline failure materially threatens safe refactoring, publish a bridge checkpoint and wait.

Otherwise continue while preserving the evidence.

==================================================
3. SELF-UPGRADE SAFETY — NON-NEGOTIABLE
==================================================

You are upgrading a bridge that may currently be helping run your own task.

DO NOT use the production Store for automated V2 tests.

DO NOT restart the active production Supervisor during ordinary development.

DO NOT let Playwright buttons launch real Cursor Agents.

DO NOT let test mode call production Firebase or GitHub.

Create/use an isolated test instance with:

- temporary Bridge Store
- fixture project registry
- loopback only
- separate or ephemeral port
- disabled external Firebase mutation
- disabled external GitHub mutation
- disabled real Agent launch
- test doubles for service/process actions

Production runtime cutover is a separate final gate.

==================================================
4. PRESERVE V1 CONTRACTS
==================================================

The following behavior must remain valid unless the companion MD explicitly allows an additive extension:

Existing MCP tools:
- bridge_status
- bridge_create_task
- bridge_list_tasks
- bridge_get_task
- bridge_claim_task
- bridge_claim_next_task
- bridge_update_task
- bridge_put_context
- bridge_get_context
- bridge_list_projects

Existing task IDs:
TASK-xxxxx

Existing Store remains authority.

Existing project logical ID security remains.

Existing Firebase relay remains.

Existing GitHub relay remains.

Existing legacy Agent launcher remains.

Existing HTTP /mcp and /health remain.

Existing npm scripts remain functional.

New behavior must be additive.

Prefer optional task metadata under metadata.v2 rather than mandatory task schema changes.

Do not require V1 clients to understand V2 fields.

==================================================
5. IMPLEMENT IN PHASES, NOT ALL AT ONCE
==================================================

Execute the phases in the companion MD in order.

For every phase:

1. inspect current code
2. make the smallest structural change
3. add/extend tests
4. run relevant tests
5. run V1 compatibility tests
6. record progress
7. continue only if the forward path remains safe

Do not start later phases while an earlier phase has an unexplained compatibility regression.

==================================================
6. CHARACTERIZATION TESTS FIRST
==================================================

Before extracting execution architecture, ensure executable tests cover current behavior, including as applicable:

- task create/claim/update
- task identity
- project aliases
- GitHub repository → project mapping
- arbitrary filesystem path rejection
- project disabled behavior
- Store lock/atomic behavior
- Agent launch eligibility
- stale lifecycle reconciliation
- GitHub backlog safety
- structured result behavior
- existing Supervisor APIs
- current dashboard SSE

Do not “improve” semantics while writing characterization tests.

Capture what V1 actually does.

==================================================
7. EXECUTION PROVIDER ABSTRACTION
==================================================

Introduce a small internal provider contract.

At minimum support:

legacy
cursor-sdk
cursor-acp

The first provider implementation must wrap the existing legacy launcher.

Initial/default routing for every current project remains:

legacy

The router must not alter production provider selection just because SDK code exists.

Keep provider-native event/data isolated from the rest of the bridge.

Normalize meaningful events.

Unknown provider events must not crash the Supervisor.

==================================================
8. WORKER BOUNDARY
==================================================

DO NOT embed a permanently live Cursor SDK Agent handle in the Supervisor.

Implement a restartable child-worker boundary.

Preferred local IPC:

stdin/stdout newline-delimited JSON

The Supervisor owns:

- execution ID
- task ID correlation
- process ownership
- event normalization
- Store persistence
- retries
- circuit breaker
- lease
- gate state

The provider worker owns:

- Cursor SDK/ACP runtime interaction
- provider session/run
- provider-specific event translation

A provider worker crash must never crash the Supervisor.

Malformed worker protocol must fail that worker safely.

==================================================
9. CURSOR SDK — ISOLATED AND OPT-IN
==================================================

Use the current official Cursor SDK, but pin the installed version in package-lock.

Do not call npm install @cursor/sdk@latest during normal runtime.

At development time, inspect current official SDK/API behavior before implementation if necessary.

Build a capability probe.

Rules:

- local runtime only for the initial V2
- cwd comes only from registered project workspace
- API key never enters task metadata
- API key never enters logs
- worker disposed at terminal state
- worker normally disposed while waiting at an operator gate
- preserve provider agent/run IDs as non-secret metadata
- classify auth/start/runtime failures
- implement bounded recovery
- add kill switch
- SDK remains disabled as production default

IMPORTANT WINDOWS RELIABILITY DESIGN:

Treat long-lived SDK host authentication/runtime failure after idle as a real operational risk.

Therefore the Supervisor must be able to throw away/restart the SDK worker without restarting the bridge.

Do not keep one SDK worker idle forever.

==================================================
10. CURSOR ACP — SEPARATE OPTIONAL PROVIDER
==================================================

Implement ACP separately if `agent acp` is available.

Use stdio JSON-RPC correctly.

Do not mix stderr protocol logs into stdout parsing.

Support:

- initialize
- authentication capability
- session/new
- session/load when supported
- session/prompt
- session/update
- session/cancel
- session/request_permission
- cursor/ask_question
- cursor/create_plan

Blocking question/plan requests must map to a Bridge operator gate.

If ACP is unavailable, record that fact and continue with legacy + SDK.

Do not sabotage the EPIC trying endlessly to make ACP available.

==================================================
11. PROJECT EXECUTION LEASE
==================================================

Implement a durable per-project writer lease.

Default:

one active writer task per project.

Allow different projects to run concurrently within a bounded global limit.

Test:

- same project task A runs
- same project task B does not launch concurrently
- different project can run
- stale lease reconciliation
- Supervisor restart
- terminal release
- gate behavior

Never create two execution providers editing the same workspace.

==================================================
12. FALLBACK SAFETY
==================================================

Automatic fallback is allowed only before mutation or at a proven safe recovery boundary.

If provider fails after workspace mutation:

DO NOT automatically launch another provider from the start.

Instead:

1. freeze project lease
2. capture git/worktree evidence
3. attempt same-provider resume/recovery
4. if unsafe/unavailable, publish recovery gate
5. wait for instruction

This rule is mandatory.

==================================================
13. GIT/WORKTREE SAFETY
==================================================

Before V2 execution, capture:

git status --short
git branch --show-current
git rev-parse HEAD

Do not require a clean worktree.

But never:

git reset --hard
git clean
auto-stash user work
force push
discard unrelated diffs
silently switch branch

Do not claim that pre-existing diffs were created by the Agent.

If external/user edits conflict with the task while a lease is active:

stop risky mutation
publish a conflict gate
do not overwrite

==================================================
14. OPERATOR / CHATGPT CHECKPOINT PROTOCOL
==================================================

Implement durable operator gates without adding a mandatory new V1 task status.

Normally keep task:

IN_PROGRESS

and represent the derived waiting state under additive V2 metadata.

Gate must have:

- gateId
- taskId relationship
- executionId
- type
- status
- reasonCode
- factual summary
- allowed decisions
- recommended decision
- task revision/version
- createdAt

Supported decisions:

CONTINUE
CHANGE
ABORT

Requirements:

- stale gate command rejected
- duplicate CONTINUE idempotent
- CHANGE continues same task with new instruction
- ABORT cancels safely
- decision must match current gateId
- waiting state survives Supervisor restart

When waiting, do not keep an SDK worker idle unnecessarily.

==================================================
15. USE THE BRIDGE TO REPORT YOUR OWN CHECKPOINTS
==================================================

If this Cursor session has access to the YZ Dev Bridge MCP tools, use them.

Update the current task with a structured checkpoint when a gate is required.

Preferred JSON shape:

{
  "schema": "yz-bridge-checkpoint-v1",
  "taskId": "<current task>",
  "executionId": "<current execution>",
  "projectId": "rent-a-car",
  "phase": "<phase>",
  "state": "WAITING_FOR_OPERATOR",
  "gateId": "<gate id>",
  "completed": [],
  "currentEvidence": {},
  "recommendedDecision": "CONTINUE",
  "allowedDecisions": ["CONTINUE", "CHANGE", "ABORT"],
  "nextActionIfContinue": "...",
  "rollback": "..."
}

Do not put secrets in it.

If Bridge MCP is temporarily unavailable because of the self-upgrade:

- persist the checkpoint safely in the test/progress mechanism
- do not invent success
- restore/publish it when bridge connectivity returns

When a checkpoint is WAITING:

STOP EXECUTION AT THAT GATE.

Do not continue modifying production-sensitive areas until the matching CONTINUE/CHANGE decision arrives.

==================================================
16. DO NOT ASK THE USER FOR ROUTINE IMPLEMENTATION DECISIONS
==================================================

You have the companion architecture plan.

Use it.

Do not stop for minor naming, formatting or internal implementation choices.

Only create an operator gate for material decisions such as:

- baseline is unsafe
- destructive/production action
- provider recovery after mutation is ambiguous
- production cutover/restart
- security concern
- contradictory local architecture that makes the plan unsafe
- no safe forward path

Minimize user involvement.

==================================================
17. CHANGE OF DIRECTION AFTER A CHECKPOINT
==================================================

If ChatGPT/operator replies with CHANGE:

Do not restart the EPIC.

Preserve already completed verified work.

Apply the new instruction only to affected remaining work.

Re-run only tests invalidated by the change plus compatibility gates.

Record the plan delta.

Avoid circular rework.

==================================================
18. VERIFICATION PROVIDER LAYER
==================================================

Create a normalized verification pipeline.

For this bridge EPIC, success requires:

- syntax/static checks
- bridge unit tests
- integration tests
- dashboard Playwright tests

Do not mark implementation successful based on Agent narrative.

Verification states should distinguish at least:

NOT_STARTED
RUNNING
PASS
FAIL
FLAKY
BLOCKED

A flaky core dashboard test is not accepted as PASS.

==================================================
19. PLAYWRIGHT — REQUIRED
==================================================

Add Playwright for the Control Center/dashboard.

Use an isolated test server and fixture Store.

The Playwright test process must not:

- launch real Cursor Agents
- mutate production GitHub
- mutate production Firebase
- use production Store

Use test doubles/server-side test mode.

Use stable test selectors such as data-testid where needed.

Recommended artifact policy:

screenshot: only-on-failure
trace: retain-on-failure or on-first-retry
video: off by default

Do not fill disk with passing-test media.

==================================================
20. REQUIRED PLAYWRIGHT VIEWPORTS
==================================================

Test at minimum:

375x812
390x844
430x932
768x1024
1366x768
1920x1080

Chromium is the required gating browser.

Firefox/WebKit may be optional/non-blocking unless a real compatibility reason exists.

==================================================
21. DASHBOARD REGRESSIONS THAT MUST BE PROVEN FIXED
==================================================

These are explicit acceptance gates.

A. RTL/right-side clipping

At every required viewport:

- no unintended document horizontal overflow
- main content fits
- right edge is visible
- cards/tables do not escape container

Assert with DOM geometry, not only screenshots.

B. Task table fixed scroll area

Create enough fixture rows to overflow.

Verify:

- table/list area has stable bounded height
- rows scroll inside that area
- the entire page does not become an endless task list
- header/filter controls remain usable

C. Filters

Verify:

- every filter is actually clickable
- no invisible overlay blocks pointer input
- selected/active state changes
- visible rows/count changes correctly
- filter still works after SSE update
- keyboard activation works where appropriate

D. Mobile

375
390
430

No clipping.
No inaccessible controls.
No table causing horizontal page drift.

E. SSE

Verify:

- connect
- update
- reconnect
- authoritative refresh after reconnect
- filter state survives/reconciles correctly

==================================================
22. DASHBOARD V2 UI
==================================================

Only after Playwright baseline/tests exist, extend UI.

Show separately:

- task status
- derived execution state
- project
- provider
- verification state
- gate/waiting state
- Supervisor health
- Store health
- Firebase relay health
- GitHub relay health
- legacy provider health
- SDK provider health
- ACP provider health
- Playwright health/configuration

Do not collapse all health into one generic red/green flag.

Preserve current visual language.

Do not redesign unrelated UI.

==================================================
23. TEST FIXTURES
==================================================

Create deterministic fixtures for:

- zero tasks
- READY
- IN_PROGRESS
- COMPLETED
- FAILED
- multiple projects
- many task rows
- very long title
- provider legacy
- provider cursor-sdk
- provider cursor-acp
- waiting operator gate
- verification pass
- verification fail
- provider error
- relay stopped/running/restarting
- simulated Store error

No real secrets.

==================================================
24. FAULT INJECTION
==================================================

Add tests for:

- Store lock contention
- worker crash before mutation
- worker crash after mutation
- malformed worker JSON
- SDK provider unavailable
- ACP provider unavailable
- missing SDK credential
- relay down
- SSE disconnect
- Supervisor restart
- stale PID
- duplicate launch attempt
- stale gate decision
- duplicate CONTINUE
- port conflict

Every fault must converge to a known safe state.

No infinite retry loops.

==================================================
25. RETRY / NO-PROGRESS / CIRCUIT BREAKER
==================================================

Implement bounded retry classification.

Do not retry deterministic failures blindly.

Track meaningful progress.

Heartbeat alone must not keep a dead/no-progress execution alive forever.

After repeated provider startup/auth failures:

open a provider circuit breaker or mark provider degraded.

Legacy bridge remains available.

Do not burn Cursor usage endlessly.

==================================================
26. PROCESS OWNERSHIP
==================================================

Never kill a process merely because its executable name looks like Cursor or Windows Terminal.

Only stop processes provably owned by the bridge/execution.

Track owned worker/session identity.

Preserve current ownership safety.

==================================================
27. SECURITY
==================================================

Verify the V2 upgrade does not introduce:

- arbitrary workspace paths from remote task text
- arbitrary shell execution API
- secret/token logging
- production test mode exposure
- raw task HTML injection in dashboard
- unauthenticated remote write route
- Firebase production mutation from tests
- GitHub production mutation from tests

Escape untrusted dashboard content.

Keep test mode loopback-only and explicitly disabled in production.

==================================================
28. COST/BILLING AWARENESS
==================================================

Cursor SDK can incur token-based usage charges.

Do not add automatic loops that can create uncontrolled usage.

Track provider/model/run identifiers and usage when reliably exposed.

Do not block the EPIC if exact cost telemetry is unavailable.

But make provider execution count/retries visible enough to diagnose waste.

==================================================
29. DOCUMENTATION
==================================================

Update bridge docs after implementation.

At minimum document:

- V1 compatibility
- V2 architecture
- provider modes
- worker isolation
- project leases
- operator gates
- verification pipeline
- Playwright commands
- test mode
- SDK/ACP prerequisites
- rollback
- troubleshooting
- production cutover

Do not remove useful existing docs.

==================================================
30. PACKAGE SCRIPTS
==================================================

Preserve existing scripts.

Add only useful additive scripts, for example according to the actual project shape:

test:dashboard
test:integration
v2:probe
provider:probe

Do not rename existing commands simply for style.

==================================================
31. PRODUCTION CUTOVER GATE — MANDATORY STOP
==================================================

After all isolated implementation and verification work passes, but BEFORE:

- switching a real project from legacy
- enabling AUTO routing
- restarting/replacing the production Supervisor
- changing production execution behavior

publish GATE E.

The checkpoint must include:

1. exact files changed
2. exact architecture now implemented
3. V1 compatibility test result
4. Playwright result
5. SDK probe result
6. ACP probe result
7. current production provider settings
8. proposed production cutover
9. exact rollback
10. known risks
11. recommended decision

Then WAIT.

Do not interpret silence as approval.

==================================================
32. EXPECTED FIRST CUTOVER
==================================================

The safest first production cutover is:

- V2 Supervisor/code active
- V2 metadata available
- verification available
- Playwright available
- provider health visible
- ALL EXISTING PROJECTS STILL USE LEGACY

That proves V2 control-plane compatibility before changing the execution engine.

Only later migrate projects individually.

Do not flip all projects to cursor-sdk.

==================================================
33. POST-CUTOVER CANARY
==================================================

After explicit CONTINUE at the production gate:

Run a controlled smoke/canary.

Verify:

- production Store opens
- V1 MCP status
- V1 task create/read path if safe
- Firebase relay health
- GitHub relay health
- dashboard
- SSE
- legacy provider
- no orphan workers
- no duplicate project lease
- rollback switch available

If the first production activation is control-plane-only, keep project execution = legacy.

Then report.

==================================================
34. FINAL DEFINITION OF DONE
==================================================

Do not mark this EPIC complete until:

- companion plan has been followed
- V1 tests pass
- legacy provider still works
- Firebase relay still works
- GitHub relay still works
- Store authority preserved
- project routing preserved
- path-injection protections preserved
- execution abstraction exists
- worker isolation exists
- project leases exist
- SDK provider exists behind flag
- ACP provider exists or is explicitly classified unavailable
- operator gate exists and survives restart
- verification provider exists
- Playwright dashboard suite exists
- right-side RTL clipping is covered and passing
- task table fixed-height scroll is covered and passing
- filters are covered and passing
- SSE is covered and passing
- fault-injection core cases pass
- SDK/provider failure cannot crash Supervisor
- no uncontrolled retry loop exists
- no production secret is logged/stored
- production cutover was explicit
- rollback to legacy was tested
- final docs are updated
- final structured bridge result is published

==================================================
35. FINAL REPORT FORMAT
==================================================

Publish a concise but complete final report containing:

1. Baseline discovered
2. Files added/changed
3. V1 compatibility status
4. New architecture
5. Execution providers and availability
6. Provider versions/capability probes
7. Project lease behavior
8. Operator gate behavior
9. Verification pipeline
10. Playwright tests and viewport results
11. Dashboard regressions fixed
12. Fault-injection results
13. Security checks
14. Production configuration
15. Rollback procedure
16. Known remaining risks
17. Exact tests/commands run
18. Final git status
19. Final task/execution IDs
20. Recommendation for the next project/provider canary

==================================================
36. ABSOLUTE SAFETY RULES
==================================================

DO NOT:

- rewrite the bridge from scratch
- delete working code
- delete legacy launcher
- reset Git
- clean Git
- force push
- discard unrelated changes
- overwrite the production Store
- use production Store in tests
- let Playwright launch real Agents
- expose test mode publicly
- log credentials
- launch two writers for one project
- blind-fallback after mutation
- retry indefinitely
- restart production bridge before GATE E
- silently enable SDK for every project
- claim tests passed when they did not
- treat flaky core tests as clean PASS
- modify unrelated Rent_a_Car application functionality
- modify unrelated Firebase User Data Completion Engine work
- make a large cosmetic redesign unrelated to the bridge upgrade

MOVE FORWARD IN VERIFIED INCREMENTS.

WHEN A PATH IS BLOCKED, CLASSIFY IT, TAKE THE SAFE ALTERNATIVE IF ONE EXISTS, OR CREATE A CHECKPOINT.

DO NOT GO IN CIRCLES.
DO NOT REPEAT THE SAME FAILED APPROACH.
DO NOT GO BACKWARD BY DESTROYING WORKING V1 FUNCTIONALITY.
```
