#!/usr/bin/env node
// AGENT-132/138: stdio launcher for a phone paired through the relay: `run-device-stdio.mjs <name>`.
// Reads build/relay/<name>.json (written by pair.mjs) and runs the standard MCP host with an
// END-TO-END sealed transport: requests/responses are encrypted with the channel key from pairing,
// the device token travels inside the ciphertext, and the relay authenticates this client with its
// client credential. Labelled with the data environment chosen at pairing time. If the phone is
// offline the host still starts and reports DEVICE_UNAVAILABLE (AGENT-121).
import { readFileSync, existsSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createSealedFetch } from "./e2e.mjs";
import { runStdioHost } from "../mcp-host/src/stdio.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../..");
const name = process.argv[2] || "rentcar-device-stage";
const cfgPath = path.join(repo, "build", "relay", `${name}.json`);
const certPath = path.join(repo, "build", "relay", "relay-cert.pem");

if (!existsSync(cfgPath)) process.stderr.write(`[${name}] not paired: ${cfgPath} missing (run tools/relay/pair.mjs <code>)\n`);
const cfg = existsSync(cfgPath) ? JSON.parse(readFileSync(cfgPath, "utf8")) : null;

// Trust the DEV relay certificate only for a loopback dev relay (Node reads NODE_EXTRA_CA_CERTS at startup).
if (cfg?.relay?.startsWith("https://127.0.0.1") && existsSync(certPath) && !process.env.NODE_EXTRA_CA_CERTS) {
  const child = spawn(process.execPath, process.argv.slice(1), { stdio: "inherit", env: { ...process.env, NODE_EXTRA_CA_CERTS: certPath } });
  child.on("exit", (c) => process.exit(c ?? 0));
} else {
  process.env.RENTACAR_EXECUTION_MODE = "FIXTURE_TEST";
  process.env.RENTACAR_GATEWAY_URL = cfg?.gatewayUrl || "https://127.0.0.1:18443/d/unpaired-device";
  process.env.RENTACAR_DEVICE_TOKEN = cfg?.token || "";
  process.env.RENTACAR_DATA_ENVIRONMENT = cfg?.dataEnvironment || "DEVELOPMENT_DATA";
  delete process.env.RENTACAR_TOKEN_FILE;
  const fetchImpl = cfg?.channelKeyB64
    ? createSealedFetch({ relay: cfg.relay, deviceId: cfg.deviceId, clientId: cfg.clientId, clientSecret: cfg.clientSecret, channelKeyB64: cfg.channelKeyB64 })
    : undefined;
  await runStdioHost({ fetchImpl });
}
