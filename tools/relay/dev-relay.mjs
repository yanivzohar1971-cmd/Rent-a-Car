#!/usr/bin/env node
// AGENT-128/138: relay launcher.
//
// DEVELOPMENT (default): https://127.0.0.1:18443 with a locally generated self-signed certificate
// (127.0.0.1, 10.0.2.2, localhost) in build/relay/ (gitignored). The PUBLIC cert is copied to
// app/src/agentstage/res/raw/agentstage_relay_ca.pem (gitignored) so ONLY the agentstage build
// trusts it. The private key never leaves build/relay/.
//
// PRODUCTION contract (see docs/agent-api/AGENT-138-SECURE-RELAY.md) — no dev cert is ever used:
//   RELAY_MODE=production
//   RELAY_BEHIND_PROXY=1            TLS terminated by Caddy/nginx on the same host; listen on loopback
//   or RELAY_TLS_CERT_FILE / RELAY_TLS_KEY_FILE   (publicly trusted certificate)
//   RELAY_HOST (default 127.0.0.1), RELAY_PORT (default 18443)
// Audit events are JSON lines on stdout (no bodies, tokens, keys or business data).
//
//   node tools/relay/dev-relay.mjs            start
//   node tools/relay/dev-relay.mjs --cert-only
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, copyFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRelay } from "./relay.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../..");
const dir = path.join(repo, "build", "relay");
const keyPath = path.join(dir, "relay-key.pem");
const certPath = path.join(dir, "relay-cert.pem");
const rawCert = path.join(repo, "app", "src", "agentstage", "res", "raw", "agentstage_relay_ca.pem");

export function ensureCert() {
  mkdirSync(dir, { recursive: true });
  if (!existsSync(keyPath) || !existsSync(certPath)) {
    const cnf = path.join(dir, "openssl.cnf");
    writeFileSync(
      cnf,
      [
        "[req]", "distinguished_name=dn", "x509_extensions=ext", "prompt=no",
        "[dn]", "CN=Rent a Car AgentStage dev relay",
        "[ext]", "basicConstraints=critical,CA:TRUE", "keyUsage=critical,digitalSignature,keyCertSign",
        "extendedKeyUsage=serverAuth", "subjectAltName=IP:127.0.0.1,IP:10.0.2.2,DNS:localhost",
      ].join("\n"),
    );
    execFileSync("openssl", ["req", "-x509", "-newkey", "ec", "-pkeyopt", "ec_paramgen_curve:prime256v1", "-nodes",
      "-keyout", keyPath, "-out", certPath, "-days", "365", "-config", cnf], { stdio: "ignore" });
  }
  mkdirSync(path.dirname(rawCert), { recursive: true });
  copyFileSync(certPath, rawCert);
  return { keyPath, certPath };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const production = process.env.RELAY_MODE === "production";
  const host = process.env.RELAY_HOST || "127.0.0.1";
  const port = Number(process.env.RELAY_PORT || 18443);
  let tls = null;
  let behindProxy = false;
  if (production) {
    if (process.env.RELAY_BEHIND_PROXY === "1") behindProxy = true;
    else if (process.env.RELAY_TLS_CERT_FILE && process.env.RELAY_TLS_KEY_FILE) {
      tls = { cert: readFileSync(process.env.RELAY_TLS_CERT_FILE), key: readFileSync(process.env.RELAY_TLS_KEY_FILE) };
    } else {
      process.stderr.write("RELAY_MODE=production requires RELAY_BEHIND_PROXY=1 or RELAY_TLS_CERT_FILE + RELAY_TLS_KEY_FILE\n");
      process.exit(2);
    }
  } else {
    ensureCert();
    if (process.argv.includes("--cert-only")) process.exit(0);
    tls = { key: readFileSync(keyPath), cert: readFileSync(certPath) };
  }
  const relay = createRelay({ tls, behindProxy, audit: (e) => process.stdout.write(JSON.stringify(e) + "\n") });
  const bound = await relay.listen(port, host);
  process.stderr.write(`[relay] ${production ? "production" : "development"} listening ${behindProxy ? "http(behind proxy)" : "https"}://${host}:${bound}\n`);
  const shutdown = async (sig) => {
    process.stderr.write(`[relay] ${sig}: draining\n`);
    await relay.close();
    process.exit(0);
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}
