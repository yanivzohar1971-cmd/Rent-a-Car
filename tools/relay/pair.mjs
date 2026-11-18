#!/usr/bin/env node
// AGENT-127: redeem a one-time pairing code shown on the phone ("Claude AI — חיבור ושליטה").
//
//   node tools/relay/pair.mjs <CODE> [--relay https://127.0.0.1:18443] [--name rentcar-device-stage]
//                             [--data-environment DEVELOPMENT_DATA|REAL_LOCAL_DATA] [--no-register]
//
// Fetches the sealed offer by codeId, decrypts it locally with the code (the relay cannot), writes
// build/relay/<name>.json (gitignored, mode 600; device token + E2E channel key + relay client secret — never printed), and
// registers a stdio MCP server <name> with Claude Code (local scope, no token in the config).
// The data environment label is mandatory knowledge of the operator: the staging app is
// DEVELOPMENT_DATA; only a pairing with the owner's real phone may be labelled REAL_LOCAL_DATA.
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { codeId, isWellFormed, open } from "./pairing.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../..");
const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : def;
};
const code = args.find((a) => !a.startsWith("--") && !args[args.indexOf(a) - 1]?.startsWith("--"));
const relay = opt("--relay", "https://127.0.0.1:18443").replace(/\/+$/, "");
const name = opt("--name", "rentcar-device-stage");
const dataEnvironment = opt("--data-environment", "DEVELOPMENT_DATA");

if (!code || !isWellFormed(code)) {
  process.stderr.write("usage: pair.mjs <10-character code shown on the phone>\n");
  process.exit(2);
}
if (!["DEVELOPMENT_DATA", "REAL_LOCAL_DATA"].includes(dataEnvironment)) {
  process.stderr.write("--data-environment must be DEVELOPMENT_DATA or REAL_LOCAL_DATA\n");
  process.exit(2);
}
if (!/^[a-z0-9-]{3,40}$/.test(name)) {
  process.stderr.write("--name must be lowercase letters, digits and dashes\n");
  process.exit(2);
}

const certPath = path.join(repo, "build", "relay", "relay-cert.pem");
if (relay.startsWith("https://127.0.0.1") && !process.env.NODE_EXTRA_CA_CERTS && existsSync(certPath)) {
  // Re-run with the dev relay certificate trusted (Node reads NODE_EXTRA_CA_CERTS at startup only).
  execFileSync(process.execPath, process.argv.slice(1), { stdio: "inherit", env: { ...process.env, NODE_EXTRA_CA_CERTS: certPath } });
  process.exit(0);
}

const r = await fetch(`${relay}/pair/redeem`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ codeId: codeId(code) }),
});
if (r.status !== 200) {
  process.stderr.write(`pairing failed: relay answered HTTP ${r.status} (code wrong, used or expired)\n`);
  process.exit(1);
}
const offer = await r.json();
let payload;
try {
  payload = JSON.parse(open(code, offer));
} catch {
  process.stderr.write("pairing failed: the offer could not be decrypted with this code\n");
  process.exit(1);
}
if (!/^rac1\./.test(payload.token || "") || payload.relayDeviceId !== offer.deviceId || payload.v !== 2 ||
    !/^[0-9a-f]{64}$/.test(payload.clientSecret || "") || Buffer.from(payload.channelKeyB64 || "", "base64").length !== 32) {
  process.stderr.write("pairing failed: unexpected offer contents\n");
  process.exit(1);
}

const out = path.join(repo, "build", "relay", `${name}.json`);
mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(
  out,
  JSON.stringify({
    name,
    relay,
    deviceId: offer.deviceId,
    gatewayUrl: `${relay}/d/${offer.deviceId}`,
    token: payload.token,
    tokenId: payload.tokenId,
    clientId: payload.clientId,
    clientSecret: payload.clientSecret,
    channelKeyB64: payload.channelKeyB64,
    expiresAtEpochMs: payload.expiresAtEpochMs,
    dataEnvironment,
    pairedAt: new Date().toISOString(),
  }, null, 2),
  { mode: 0o600 },
);
process.stderr.write(`paired: device ${offer.deviceId.slice(0, 8)}…, token ${String(payload.tokenId).slice(0, 6)}… (not printed), saved ${path.relative(repo, out)}\n`);

if (!args.includes("--no-register")) {
  const launcher = path.join(here, "run-device-stdio.mjs");
  try {
    execFileSync("claude", ["mcp", "remove", "--scope", "local", name], { cwd: repo, stdio: "ignore" });
  } catch {}
  execFileSync("claude", ["mcp", "add", "--scope", "local", name, "--", process.execPath, launcher, name], { cwd: repo, stdio: "inherit" });
}
