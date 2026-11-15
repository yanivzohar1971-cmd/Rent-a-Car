# AGENT-020 — Read-only MCP Foundation

The `agentapi.mcp` package provides an in-process MCP-shaped adapter:

- tool descriptors are derived only from allowlisted operations that are
  implemented **and wired** in the current `RentCarAgentAPI`;
- `callTool` creates an authenticated `ANDROID_LOCAL` `AgentRequest` and
  returns a JSON-serializable result or error;
- write, unwired, registered-only, and cloud operations are not tools.

Windows Claude Code cannot invoke Android Room directly. This adapter runs
inside the same process as the wired Agent API; access to a real Android device
will require an authenticated gateway and device routing. Development tests use
in-memory port fixtures.

No unauthenticated network server was created. ADB may be useful for a
development lab, but it is not a production transport or authentication path.

Status: adapter implemented and fixture-tested; not connected to real Android
and not connected to Claude Code.
