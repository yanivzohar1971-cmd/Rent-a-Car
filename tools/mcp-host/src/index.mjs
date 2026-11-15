#!/usr/bin/env node
// stdio entry point. Newline-delimited JSON-RPC on stdin/stdout; logs go to stderr only.
import { createInterface } from "node:readline";
import { assertGatewayReachable, createHost, loadConfig, validateConfig } from "./host.mjs";

const config = loadConfig();
const log = (message) => process.stderr.write(`[rentacar-mcp-host] ${message}\n`);

log(`mode=${config.executionMode} gateway=${config.gatewayUrl}`);

const problems = validateConfig(config);
if (problems.length > 0) {
  for (const problem of problems) log(`config error: ${problem}`);
  process.exit(2);
}

if (config.executionMode === "EMULATOR_REAL_ROOM") {
  // Fail hard: no fixture fallback. The AgentDev gateway must be reachable before we speak MCP.
  try {
    await assertGatewayReachable(config);
  } catch (err) {
    log(`fatal: ${err.message}`);
    log("EMULATOR_REAL_ROOM has no fixture fallback. Start the emulator + AgentDev APK and run: adb forward tcp:18765 tcp:18765");
    process.exit(3);
  }
} else if (!config.token) {
  log("RENTACAR_DEVICE_TOKEN is not set; tools/list and tools/call will fail until it is configured.");
}

const host = createHost({ ...config, log });
const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
const pending = new Set();

rl.on("line", (line) => {
  const work = host
    .handleLine(line)
    .then((out) => {
      if (out) process.stdout.write(out + "\n");
    })
    .catch((err) => log(`unexpected error: ${err?.message || err}`))
    .finally(() => pending.delete(work));
  pending.add(work);
});

rl.on("close", async () => {
  await Promise.allSettled([...pending]);
  process.exit(0);
});
