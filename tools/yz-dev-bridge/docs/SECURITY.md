# Security model

## What the bridge is allowed to do

- Store task text, metadata, and results.
- Authenticate machine callers to the Firebase HTTPS API.
- Poll Firestore-backed tasks and mirror them into the local JSON store.
- Expose MCP tools to Cursor.

## What the bridge must never do

- Execute arbitrary shell commands from Firebase or ChatGPT payloads.
- Patch Rent_a_Car source by itself.
- Mix relay documents with reservations, suppliers, cars, commissions, users, or other app collections.
- Log or commit API tokens.
- Accept unauthenticated public task creation.
- Put permanent secrets in query strings.
- GitHub issue bodies are instructions only; they are never executed as shell commands.

ChatGPT GET `/chatgpt/*` may use a **temporary session capability** (`YZ_BRIDGE_CHATGPT_SESSION_KEY`) that expires at `YZ_BRIDGE_CHATGPT_SESSION_EXPIRES_AT`. That credential is ChatGPT-GET-only. It must never authorize the bearer API, claim/result routes, or business data.

## Trust boundaries

1. **ChatGPT → Firebase**  
   TLS + `Authorization: Bearer`. Invalid tokens are rejected. Missing server token configuration returns 503, not an open endpoint.

2. **Firebase → Firestore**  
   Admin SDK only. Client rules deny `yzDevBridgeTasks` and `yzDevBridgeAgents`.

3. **Local relay → Firebase**  
   Same bearer token. The relay treats task bodies as data, not as commands.

4. **Cursor → repository**  
   Normal Cursor/MCP approval and workspace security. This is the only place code execution happens.

5. **Local HTTP MCP (`npm run http`)**  
   Optional. Loopback may run without a token; non-loopback bind requires `BRIDGE_AUTH_TOKEN` unless an explicit unsafe override is set.

## Token handling

- Store the production token in Firebase Functions config / env, not in git.
- Store the local copy in `tools\yz-dev-bridge\.env` (gitignored).
- Compare bearer tokens with a constant-time check.
- Do not print token values in logs, scripts, or MCP output.

## Rate protection

The HTTPS API applies a coarse per-instance limiter. This is not a global WAF. Keep the token long and random.

## Data isolation

Relay collections are namespaced:

- `yzDevBridgeTasks`
- `yzDevBridgeAgents`

Existing business collections are unchanged.

## GET enqueue compatibility

`GET /compat/enqueue` is disabled by default because GET with side effects is easy to cache, prefetch, or leak via URLs. If enabled, it still requires the Authorization header and rejects `?token=`.
