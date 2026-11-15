#!/usr/bin/env node
// AGENT-101: stdio launcher for Claude Code / MCP clients targeting the AgentDev emulator gateway.
// Loads RENTACAR_DEVICE_TOKEN from env, or from repo-local build/agentapi-e2e/token.env (gitignored).
// Never prints the token. Requires EMULATOR_REAL_ROOM (no fixture fallback).
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");
const tokenFile = path.join(repoRoot, "build", "agentapi-e2e", "token.env");

if (!process.env.RENTACAR_DEVICE_TOKEN && existsSync(tokenFile)) {
  const token = readFileSync(tokenFile, "utf8").trim();
  if (token) process.env.RENTACAR_DEVICE_TOKEN = token;
}

process.env.RENTACAR_EXECUTION_MODE = process.env.RENTACAR_EXECUTION_MODE || "EMULATOR_REAL_ROOM";
process.env.RENTACAR_GATEWAY_URL = process.env.RENTACAR_GATEWAY_URL || "http://127.0.0.1:18765";

if (!process.env.RENTACAR_DEVICE_TOKEN) {
  process.stderr.write(
    "RENTACAR_DEVICE_TOKEN missing. Start AgentDev on the emulator (tools/agentapi/run-emulator-e2e.ps1) so build/agentapi-e2e/token.env is written, or export the token.\n",
  );
  process.exit(2);
}

await import(pathToFileURL(path.join(here, "src", "index.mjs")).href);
