#!/usr/bin/env node
// AGENT-128: development relay on 127.0.0.1:18443 (TLS). The Android emulator reaches it as
// https://10.0.2.2:18443. Generates (once) a local self-signed certificate valid for 127.0.0.1,
// 10.0.2.2 and localhost into build/relay/ (gitignored) and copies the PUBLIC certificate to
// app/src/agentstage/res/raw/agentstage_relay_ca.pem (gitignored) so only the agentstage build
// trusts it. The private key never leaves build/relay/. Not a production deployment.
//
//   node tools/relay/dev-relay.mjs            start (generates the cert if missing)
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
  ensureCert();
  if (process.argv.includes("--cert-only")) process.exit(0);
  const relay = createRelay({
    tls: { key: readFileSync(keyPath), cert: readFileSync(certPath) },
    log: (m) => process.stderr.write(`[relay] ${m}\n`),
  });
  const port = await relay.listen(Number(process.env.RENTACAR_RELAY_PORT || 18443), "127.0.0.1");
  process.stderr.write(`[relay] listening https://127.0.0.1:${port} (emulator: https://10.0.2.2:${port})\n`);
}
