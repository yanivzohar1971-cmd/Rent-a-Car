#!/usr/bin/env node
// AGENT-101/121: stdio launcher for Claude Code / MCP clients targeting the AgentDev emulator gateway.
// Points the host at the repo-local token file build/agentapi-e2e/token.env (gitignored), which the
// host re-reads on demand, so the server starts (and stays registered) even when the emulator is
// offline or the token rotates. Never prints the token. EMULATOR_REAL_ROOM has no fixture fallback.
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");

process.env.RENTACAR_TOKEN_FILE =
  process.env.RENTACAR_TOKEN_FILE || path.join(repoRoot, "build", "agentapi-e2e", "token.env");
process.env.RENTACAR_EXECUTION_MODE = process.env.RENTACAR_EXECUTION_MODE || "EMULATOR_REAL_ROOM";
process.env.RENTACAR_GATEWAY_URL = process.env.RENTACAR_GATEWAY_URL || "http://127.0.0.1:18765";
process.env.RENTACAR_DATA_ENVIRONMENT = process.env.RENTACAR_DATA_ENVIRONMENT || "DEVELOPMENT_DATA";

await import(pathToFileURL(path.join(here, "src", "index.mjs")).href);
