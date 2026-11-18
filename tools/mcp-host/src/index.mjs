#!/usr/bin/env node
// stdio entry point. Newline-delimited JSON-RPC on stdin/stdout; logs go to stderr only.
//
// AGENT-121: the process starts even when the device gateway is down (no exit on unreachable
// gateway). Availability is polled in the background and the client is told via
// notifications/tools/list_changed when business tools appear/disappear.
import { createInterface } from "node:readline";
import { readFileSync, existsSync } from "node:fs";
import { createHost, loadConfig, validateConfig } from "./host.mjs";

const config = loadConfig();
const log = (message) => process.stderr.write(`[rentacar-mcp-host] ${message}\n`);

log(`mode=${config.executionMode} env=${config.dataEnvironment} gateway=${config.gatewayUrl}`);

const problems = validateConfig(config);
if (problems.length > 0) {
  for (const problem of problems) log(`config error: ${problem}`);
  process.exit(2);
}

// Token source: explicit env wins; otherwise re-read RENTACAR_TOKEN_FILE on every use so a
// token rotated by an emulator/app restart is picked up without re-registering the server.
const tokenFile = (process.env.RENTACAR_TOKEN_FILE || "").trim();
const tokenProvider = () => {
  if (config.token) return config.token;
  if (tokenFile && existsSync(tokenFile)) return readFileSync(tokenFile, "utf8").trim();
  return "";
};
if (!tokenProvider()) log("no device token yet; host will report NOT_CONFIGURED until one is available");

const write = (obj) => process.stdout.write((typeof obj === "string" ? obj : JSON.stringify(obj)) + "\n");

const host = createHost({ ...config, tokenProvider, log, notify: write });

const initial = await host.refreshAvailability().catch((err) => `ERROR ${err?.message || err}`);
log(`initial connection state: ${initial}`);

const poller = setInterval(() => {
  host.refreshAvailability().catch((err) => log(`availability probe error: ${err?.message || err}`));
}, config.healthPollMs);
poller.unref();

const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
const pending = new Set();

rl.on("line", (line) => {
  const work = host
    .handleLine(line)
    .then((out) => {
      if (out) write(out);
    })
    .catch((err) => log(`unexpected error: ${err?.message || err}`))
    .finally(() => pending.delete(work));
  pending.add(work);
});

rl.on("close", async () => {
  await Promise.allSettled([...pending]);
  process.exit(0);
});
