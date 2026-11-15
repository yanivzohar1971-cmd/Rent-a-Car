# AGENT-028 — Cloud read foundation (stub only)

> **Isolated-dev-only. No production deploy. No cloud reads are activated.**

## Delivered

Package `com.rentacar.app.agentapi.cloud`:

| Type | Behavior |
|------|----------|
| `CloudReadPort` | Marker interface (`activated: Boolean`) for a future cloud data source. No implementation exists. |
| `NotActivatedCloudReadPort` | The only port: `activated = false`. |
| `CloudAgentReadExecutor` | `AgentOperationExecutor` that **always** returns `EXECUTION_DISABLED` with the message *"Cloud reads are not activated: this is an isolated-dev-only stub with no production deployment"* (`metadata.source = CLOUD`, `executable = false`). It never calls the port, never touches the network, Firestore or Functions, regardless of operation or target. |

It is not wired into `RentCarAgentAPI`. `target = CLOUD` on the local API continues to return
`UNSUPPORTED_OPERATION`.

## Not done (deliberately)

- No Firestore/Cloud Functions/Cloud Run code, no deploy, no Firebase project changes.
- No cloud executor for the 12 synced collections (ROADMAP Phase 4).
- No dev/prod Firebase isolation yet (`DEV-ENVIRONMENT-SAFETY.md` still applies: debug builds share the
  production applicationId).

## Preconditions before activating cloud reads

1. Isolated non-production Firebase project + distinct applicationId flavor.
2. Server-side authorization by Firebase ID token uid (never client-supplied uid).
3. `coverage=CLOUD_PARTIAL` metadata and explicit denial of local-only operations (ROADMAP AGENT-031/032).
4. Separate approval to deploy.

Tests: `CloudAgentReadExecutorTest`.
