#!/usr/bin/env node
// AGENT-123: MCP smoke check used by start-rentcar-claude.ps1.
// Starts the registered stdio launcher exactly as Claude Code does, performs initialize ->
// tools/list -> connection.status -> one read-only Room query (supplier.list), checks the Claude
// Code registration, and prints ONE JSON summary line on stdout. Business records are summarised
// as counts only; the device token is never printed.
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");
const launcher = path.join(repoRoot, "tools", "mcp-host", "run-emulator-stdio.mjs");
const serverName = process.env.RENTACAR_MCP_NAME || "rentcar-emulator";

const summary = {
  mcpHostStarted: false,
  protocolVersion: null,
  dataEnvironment: null,
  connection: null,
  toolCount: 0,
  businessToolCount: 0,
  readQuery: { operation: "supplier.list", ok: false, count: null, source: null, executionTarget: null },
  claudeCodeRegistration: { registered: false, scope: null, launcherMatches: false },
  errors: [],
};

function checkRegistration() {
  const cfgPath = path.join(os.homedir(), ".claude.json");
  if (!existsSync(cfgPath)) return;
  let cfg;
  try {
    cfg = JSON.parse(readFileSync(cfgPath, "utf8"));
  } catch (e) {
    summary.errors.push(`cannot parse ~/.claude.json: ${e.message}`);
    return;
  }
  const norm = (p) => path.resolve(p).toLowerCase();
  const consider = (servers, scope) => {
    const s = servers?.[serverName];
    if (!s || summary.claudeCodeRegistration.registered) return;
    summary.claudeCodeRegistration.registered = true;
    summary.claudeCodeRegistration.scope = scope;
    summary.claudeCodeRegistration.launcherMatches = (s.args || []).some((a) => norm(a) === norm(launcher));
  };
  for (const [proj, v] of Object.entries(cfg.projects || {})) {
    if (norm(proj) === norm(repoRoot)) consider(v.mcpServers, "local");
  }
  consider(cfg.mcpServers, "user");
  const projectFile = path.join(repoRoot, ".mcp.json");
  if (existsSync(projectFile)) {
    try {
      consider(JSON.parse(readFileSync(projectFile, "utf8")).mcpServers, "project");
    } catch {}
  }
}

async function run() {
  const child = spawn(process.execPath, [launcher], { stdio: ["pipe", "pipe", "pipe"], env: process.env });
  let buf = "";
  const waiters = new Map();
  let id = 0;
  child.stdout.on("data", (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line) continue;
      let msg;
      try {
        msg = JSON.parse(line);
      } catch {
        summary.errors.push("non-JSON line on MCP stdout");
        continue;
      }
      if (msg.id != null) waiters.get(msg.id)?.(msg);
    }
  });
  child.stderr.resume();
  const rpc = (method, params) =>
    new Promise((resolve, reject) => {
      const myId = ++id;
      const t = setTimeout(() => reject(new Error(`${method} timed out`)), 30000);
      waiters.set(myId, (m) => {
        clearTimeout(t);
        waiters.delete(myId);
        resolve(m);
      });
      child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: myId, method, params }) + "\n");
    });
  try {
    const init = await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "rentcar-smoke", version: "1" } });
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");
    summary.mcpHostStarted = Boolean(init.result);
    summary.protocolVersion = init.result?.protocolVersion ?? null;
    summary.dataEnvironment = init.result?.serverInfo?.dataEnvironment ?? null;
    const list = await rpc("tools/list", {});
    const tools = list.result?.tools || [];
    summary.toolCount = tools.length;
    summary.businessToolCount = tools.filter((t) => t.name !== "connection.status").length;
    const st = await rpc("tools/call", { name: "connection.status", arguments: {} });
    summary.connection = JSON.parse(st.result.content[0].text).data.connection;
    if (summary.businessToolCount > 0) {
      const r = await rpc("tools/call", { name: "supplier.list", arguments: { limit: 200 } });
      const body = JSON.parse(r.result.content[0].text);
      summary.readQuery.ok = r.result.isError === false && body.success === true;
      summary.readQuery.count = Array.isArray(body.data?.items) ? body.data.items.length : null;
      summary.readQuery.source = body.metadata?.source ?? null;
      summary.readQuery.executionTarget = body.metadata?.executionTarget ?? null;
      if (!summary.readQuery.ok) summary.errors.push(`supplier.list failed: ${body.error?.code || "unknown"}`);
    }
  } catch (e) {
    summary.errors.push(e.message);
  } finally {
    child.stdin.end();
    setTimeout(() => child.kill(), 2000).unref();
  }
}

await run();
checkRegistration();
process.stdout.write(JSON.stringify(summary) + "\n");
process.exit(0);
