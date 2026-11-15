#!/usr/bin/env node
// stdio entry point. Newline-delimited JSON-RPC on stdin/stdout; logs go to stderr only.
import { createInterface } from "node:readline";
import { createHost, loadConfig } from "./host.mjs";

const config = loadConfig();
const log = (message) => process.stderr.write(`[rentacar-mcp-host] ${message}\n`);

if (!config.token) {
  log("RENTACAR_DEVICE_TOKEN is not set; tools/list and tools/call will fail until it is configured.");
}
log(`gateway=${config.gatewayUrl}`);

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
