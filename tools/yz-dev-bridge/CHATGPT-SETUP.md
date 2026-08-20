# ChatGPT setup notes

## Firebase HTTPS relay (recommended for ChatGPT → this PC)

ChatGPT cannot call localhost. Prefer the Firebase function `yzBridgeApi` in `C:\Users\Yaniv\source\repos\Rent_a_Car\functions`.

After the function is deployed (manual, not part of this integration):

1. ChatGPT `POST /tasks` with `Authorization: Bearer <YZ_BRIDGE_API_TOKEN>`.
2. On this PC, run `npm run relay` from `tools\yz-dev-bridge`.
3. Cursor uses the existing local MCP tools.

See `docs/FIREBASE-RELAY.md` and `C:\Users\Yaniv\source\repos\Rent_a_Car\docs\YZ-DEV-BRIDGE.md`.

## Direct custom MCP

ChatGPT custom MCP apps require a supported workspace/plan and a remotely reachable HTTPS MCP endpoint. The bridge HTTP endpoint is `/mcp`.

Recommended production shape:

    ChatGPT -> HTTPS/OAuth gateway -> YZ Dev Bridge /mcp
                                  -> data/bridge.json
    Cursor  -> local stdio -------^

Do not expose the write-capable bridge to the public internet without authentication/access control.

## Local development

Start the HTTP endpoint:

    npm run http

Default endpoint:

    http://127.0.0.1:8787/mcp

Health check:

    http://127.0.0.1:8787/health

For a remote ChatGPT custom app, publish the MCP endpoint through your chosen secure HTTPS deployment/tunnel and configure that HTTPS URL in ChatGPT's app/developer settings.

## Authentication

`src/http.js` supports a static bearer token for MCP clients that can send custom headers:

    BRIDGE_AUTH_TOKEN=<long-random-token>

For ChatGPT deployments that require OAuth, use an OAuth-capable reverse proxy/gateway in front of the bridge. Do not disable authentication on an internet-reachable write endpoint.
