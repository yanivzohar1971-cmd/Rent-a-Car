// AGENT-127/128/138: relay protocol, pairing/E2E crypto and MCP-through-relay security tests.
import test from "node:test";
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRelay } from "../relay.mjs";
import { seal, open, codeId, isWellFormed, normalize } from "../pairing.mjs";
import * as e2e from "../e2e.mjs";
import { createHost } from "../../mcp-host/src/host.mjs";

const DEV_ID = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";
const SECRET = "a".repeat(64);
const hashHex = (s) => createHash("sha256").update(s).digest("hex");

// ---------- shared vectors with app/src/test/.../RelayDeviceTest.kt ----------
test("pairing crypto matches the Kotlin vector and rejects a wrong code", () => {
  const o = seal("7KQ4M-ZX9TC", DEV_ID, '{"token":"rac1.abc.def"}', {
    salt: Buffer.from("000102030405060708090a0b0c0d0e0f", "hex"), iv: Buffer.from("a0a1a2a3a4a5a6a7a8a9aaab", "hex"), now: 1000,
  });
  assert.equal(o.codeId, "ea30aa1caafae4ed8cf04d6513b72257");
  assert.equal(o.ciphertextB64, "qxScKCF9NL0U3JGlPF+C67640fagICdyRBGg6Xy1mTgkySJxqTEbxw==");
  assert.equal(open("7kq4mzx9tc", o), '{"token":"rac1.abc.def"}');
  assert.throws(() => open("7KQ4M-ZX9TD", o));
  assert.throws(() => open("7KQ4M-ZX9TC", { ...o, deviceId: "other-device-id" }));
  assert.ok(isWellFormed("7KQ4M-ZX9TC") && !isWellFormed("SHORT"));
  assert.equal(normalize("o1l-i"), "0111");
});

test("E2E envelope matches the Kotlin vector; AAD binds device, client, message and direction", () => {
  const key = Buffer.alloc(32, 7);
  const a = e2e.aad("c2d", DEV_ID, "claude-1234abcd", "msg-00000001");
  const s = e2e.seal(key, a, '{"kind":"tools"}', Buffer.from("b0b1b2b3b4b5b6b7b8b9babb", "hex"));
  assert.equal(s.ctB64, "Cz1BoYhhTQzQDhB4lJGEtN+3KM47l+avtJ6ovCwCHek=");
  assert.equal(e2e.open(key, a, s.ivB64, s.ctB64), '{"kind":"tools"}');
  for (const bad of [
    e2e.aad("d2c", DEV_ID, "claude-1234abcd", "msg-00000001"),
    e2e.aad("c2d", "other-device-0000", "claude-1234abcd", "msg-00000001"),
    e2e.aad("c2d", DEV_ID, "claude-ffffffff", "msg-00000001"),
    e2e.aad("c2d", DEV_ID, "claude-1234abcd", "msg-00000002"),
  ]) assert.throws(() => e2e.open(key, bad, s.ivB64, s.ctB64));
});

// ---------- simulated phone (mirror of RelayDeviceLoop.handle; the real one is tested in Kotlin + emulator) ----------
const TOOLS = [{ name: "supplier.list", description: "List suppliers", inputSchema: { type: "object" } }];
function simulatedPhone(base, { token, clients, secret = SECRET }) {
  let running = true;
  const seen = [];
  const replay = new Set();
  const auth = () => ({ Authorization: `Device ${DEV_ID}.${secret}`, "Content-Type": "application/json" });
  const post = (p, body = {}) => fetch(base + p, { method: "POST", headers: auth(), body: JSON.stringify(body) });
  const reply = (q, ch, msgId, status, body) => {
    const s = e2e.seal(ch.key, e2e.aad("d2c", DEV_ID, ch.clientId, msgId), JSON.stringify({ status, body: JSON.stringify(body) }));
    return { status: 200, body: { v: 1, msgId, ...s } };
  };
  async function handle(q) {
    seen.push(q);
    const ch = clients.find((c) => c.clientId === q.clientId);
    if (q.kind !== "sealed" || !ch) return { status: 401, body: { success: false, error: { code: "UNKNOWN_CLIENT" } } };
    const w = JSON.parse(q.body);
    let inner;
    try {
      inner = JSON.parse(e2e.open(ch.key, e2e.aad("c2d", DEV_ID, ch.clientId, w.msgId), w.ivB64, w.ctB64));
    } catch {
      return { status: 401, body: { success: false, error: { code: "E2E_AUTH_FAILED" } } };
    }
    if (inner.expiresAt < Date.now()) return reply(q, ch, w.msgId, 408, { success: false, error: { code: "REQUEST_EXPIRED" } });
    if (replay.has(w.msgId)) return reply(q, ch, w.msgId, 409, { success: false, error: { code: "REPLAY_DETECTED" } });
    replay.add(w.msgId);
    if (inner.token !== token) return reply(q, ch, w.msgId, 401, { success: false, error: { code: "UNAUTHORIZED" } });
    if (inner.kind === "tools") return reply(q, ch, w.msgId, 200, { success: true, tools: TOOLS });
    const req = JSON.parse(inner.body);
    if (req.operation === "supplier.create") return reply(q, ch, w.msgId, 200, { success: false, error: { code: "WRITE_NOT_ALLOWED" } });
    return reply(q, ch, w.msgId, 200, { success: true, operation: req.operation, data: { items: [{ id: 1, name: "Phone Supplier" }] }, metadata: { source: "LOCAL" } });
  }
  const loop = (async () => {
    while (running) {
      const reg = await post("/device/register", { clients: clients.map((c) => ({ clientId: c.clientId, secretHash: hashHex(c.secret) })) }).catch(() => null);
      if (!reg || reg.status !== 200) { await new Promise((r) => setTimeout(r, 100)); continue; }
      while (running) {
        const r = await post("/device/poll").catch(() => null);
        if (!r) break; // relay gone: re-register
        if (r.status === 204) continue;
        if (r.status !== 200) break;
        const { requests } = await r.json();
        for (const q of requests) {
          const { status, body } = await handle(q);
          await post("/device/respond", { relayId: q.relayId, status, body: JSON.stringify(body) }).catch(() => {});
        }
      }
    }
  })();
  return { seen, post, stop: async () => { running = false; await loop.catch(() => {}); } };
}

function newClient(clientId = "claude-1234abcd") {
  return { clientId, secret: randomBytes(32).toString("hex"), key: randomBytes(32) };
}
function hostFor(base, c, token, extra = {}) {
  const relayFetch = e2e.createSealedFetch({ relay: base, deviceId: DEV_ID, clientId: c.clientId, clientSecret: c.secret, channelKeyB64: c.key.toString("base64"), ...extra });
  return createHost({ gatewayUrl: `${base}/d/${DEV_ID}`, token, timeoutMs: 3000, fetchImpl: relayFetch, dataEnvironment: "DEVELOPMENT_DATA" });
}
const relayOpts = { allowInsecureHttpForTests: true, pollWaitMs: 300, onlineWindowMs: 1500, requestTimeoutMs: 2000 };

test("E2E: MCP host -> relay -> phone; relay never sees token or business data; writes refused", async () => {
  const events = [];
  const relay = createRelay({ ...relayOpts, audit: (e) => events.push(e) });
  const port = await relay.listen(0);
  const base = `http://127.0.0.1:${port}`;
  const token = "rac1.tok.sig";
  const c = newClient();
  const phone = simulatedPhone(base, { token, clients: [c] });
  try {
    await new Promise((r) => setTimeout(r, 150));
    const host = hostFor(base, c, token);
    const list = await host.handleMessage({ jsonrpc: "2.0", id: 1, method: "tools/list" });
    assert.deepEqual(list.result.tools.map((t) => t.name), ["connection.status", "supplier.list"]);
    const ok = await host.callTool("supplier.list", { limit: 5 });
    assert.equal(ok.isError, false);
    assert.equal(JSON.parse(ok.content[0].text).data.items[0].name, "Phone Supplier");
    const w = await host.callTool("supplier.create", { name: "x" });
    assert.equal(JSON.parse(w.content[0].text).error.code, "WRITE_NOT_ALLOWED");

    // What the relay forwarded: ciphertext only.
    const forwarded = JSON.stringify(phone.seen);
    assert.ok(!forwarded.includes(token), "token not visible to relay");
    assert.ok(!forwarded.includes("supplier.list") && !forwarded.includes("Phone Supplier"), "operation/data not visible to relay");
    // Audit events: no secrets, no bodies, correlation ids present.
    const audit = JSON.stringify(events);
    assert.ok(!audit.includes(token) && !audit.includes(c.secret) && !audit.includes(SECRET) && !audit.includes("Phone Supplier"));
    assert.ok(events.some((e) => e.event === "request" && e.correlationId));

    const bad = hostFor(base, c, "rac1.wrong.sig");
    assert.equal(JSON.parse((await bad.callTool("supplier.list", {})).content[0].text).error.code, "AUTH_FAILED");
  } finally {
    await phone.stop();
    await relay.close();
  }
});

test("client authorization: unknown client, wrong secret, revoked client and wrong channel key are rejected", async () => {
  const relay = createRelay(relayOpts);
  const port = await relay.listen(0);
  const base = `http://127.0.0.1:${port}`;
  const token = "rac1.tok.sig";
  const c = newClient();
  const phone = simulatedPhone(base, { token, clients: [c] });
  try {
    await new Promise((r) => setTimeout(r, 150));
    const stranger = newClient("claude-99999999");
    const s1 = await hostFor(base, stranger, token).callTool("supplier.list", {});
    assert.equal(s1.isError, true);
    const wrongSecret = { ...c, secret: "b".repeat(64) };
    assert.equal((await hostFor(base, wrongSecret, token).callTool("supplier.list", {})).isError, true);
    const wrongKey = { ...c, key: randomBytes(32) };
    const wk = await hostFor(base, wrongKey, token).callTool("supplier.list", {});
    assert.equal(wk.isError, true);
    assert.ok(!JSON.stringify(wk).includes("Phone Supplier"));

    assert.equal((await hostFor(base, c, token).callTool("supplier.list", {})).isError, false);
    await phone.post("/device/clients/remove", { clientId: c.clientId });
    const after = await fetch(`${base}/d/${DEV_ID}/v1/health`, { headers: { Authorization: `Client ${c.clientId}.${c.secret}` } });
    assert.equal(after.status, 401, "revoked client can no longer reach the device");
  } finally {
    await phone.stop();
    await relay.close();
  }
});

test("replay, expired request, malformed and oversized envelopes are rejected", async () => {
  const relay = createRelay({ ...relayOpts, maxBodyBytes: 4096 });
  const port = await relay.listen(0);
  const base = `http://127.0.0.1:${port}`;
  const token = "rac1.tok.sig";
  const c = newClient();
  const phone = simulatedPhone(base, { token, clients: [c] });
  const clientAuth = { Authorization: `Client ${c.clientId}.${c.secret}`, "Content-Type": "application/json" };
  try {
    await new Promise((r) => setTimeout(r, 150));
    // Capture one sealed request and replay it verbatim.
    let captured;
    const capturingFetch = async (url, init) => {
      if (String(url).endsWith("/v1/sealed")) captured = init.body;
      return fetch(url, init);
    };
    const host = hostFor(base, c, token, { baseFetch: capturingFetch });
    assert.equal((await host.callTool("supplier.list", {})).isError, false);
    const replayed = await fetch(`${base}/d/${DEV_ID}/v1/sealed`, { method: "POST", headers: clientAuth, body: captured });
    const w = await replayed.json();
    const inner = JSON.parse(e2e.open(c.key, e2e.aad("d2c", DEV_ID, c.clientId, w.msgId), w.ivB64, w.ctB64));
    assert.equal(inner.status, 409);
    assert.equal(JSON.parse(inner.body).error.code, "REPLAY_DETECTED");

    const expired = hostFor(base, c, token, { ttlMs: -1000 });
    assert.equal(JSON.parse((await expired.callTool("supplier.list", {})).content[0].text).error.code, "REQUEST_EXPIRED");

    assert.equal((await fetch(`${base}/d/${DEV_ID}/v1/sealed`, { method: "POST", headers: clientAuth, body: "{not json" })).status, 400);
    assert.equal((await fetch(`${base}/d/${DEV_ID}/v1/sealed`, { method: "POST", headers: clientAuth, body: JSON.stringify({ v: 1, clientId: "claude-other000", msgId: "m-12345678", ivB64: "", ctB64: "" }) })).status, 400);
    const big = await fetch(`${base}/d/${DEV_ID}/v1/sealed`, { method: "POST", headers: clientAuth, body: "x".repeat(10000) }).catch(() => null);
    assert.ok(!big || big.status === 413);
  } finally {
    await phone.stop();
    await relay.close();
  }
});

test("device credential: first registration binds the secret; impostor cannot register, poll or rotate", async () => {
  const relay = createRelay(relayOpts);
  const port = await relay.listen(0);
  const base = `http://127.0.0.1:${port}`;
  const call = (p, secret, body = {}) => fetch(base + p, { method: "POST", headers: { Authorization: `Device ${DEV_ID}.${secret}` }, body: JSON.stringify(body) });
  try {
    assert.equal((await call("/device/register", SECRET)).status, 200);
    assert.equal((await call("/device/register", "b".repeat(64))).status, 401);
    assert.equal((await call("/device/poll", "b".repeat(64))).status, 401);
    assert.equal((await call("/device/rotate", "b".repeat(64), { newSecret: "c".repeat(64) })).status, 401);
    assert.equal((await fetch(base + "/device/poll", { method: "POST" })).status, 401);
    assert.equal((await call("/device/respond", SECRET, { relayId: "nope", status: 200, body: "{}" })).status, 404);
    // Rotation: old secret stops working, new one works.
    assert.equal((await call("/device/rotate", SECRET, { newSecret: "c".repeat(64) })).status, 200);
    assert.equal((await call("/device/register", SECRET)).status, 401);
    assert.equal((await call("/device/register", "c".repeat(64))).status, 200);
  } finally {
    await relay.close();
  }
});

test("pairing offers: single use, expire, bound to the posting device, activate the client, rate-limited", async () => {
  let t = 1_000_000;
  const relay = createRelay({ allowInsecureHttpForTests: true, now: () => t });
  const port = await relay.listen(0);
  const base = `http://127.0.0.1:${port}`;
  const dev = (p, body) => fetch(base + p, { method: "POST", headers: { Authorization: `Device ${DEV_ID}.${SECRET}` }, body: JSON.stringify(body) });
  const redeem = (id) => fetch(base + "/pair/redeem", { method: "POST", body: JSON.stringify({ codeId: id }) });
  try {
    await dev("/device/register", { clients: [] });
    const c = newClient();
    const offer = { ...seal("ABCDE-12345", DEV_ID, '{"v":2}', { now: t }), clientId: c.clientId, clientSecretHash: hashHex(c.secret) };
    assert.equal((await dev("/device/pairing-offer", { ...offer, deviceId: "someone-else-1234" })).status, 400);
    assert.equal((await dev("/device/pairing-offer", { ...offer, clientSecretHash: "short" })).status, 400);
    assert.equal((await dev("/device/pairing-offer", offer)).status, 200);
    const r1 = await redeem(codeId("abcde12345"));
    assert.equal(r1.status, 200);
    assert.equal(open("ABCDE12345", await r1.json()), '{"v":2}');
    assert.equal((await redeem(codeId("ABCDE12345"))).status, 404, "single use");
    assert.ok(relay._state.devices.get(DEV_ID).clients.has(c.clientId), "redeem activates the client credential");

    const o2 = { ...seal("ZZZZZ-99999", DEV_ID, "{}", { now: t }), clientId: "claude-22222222", clientSecretHash: hashHex("x") };
    await dev("/device/pairing-offer", o2);
    t += 6 * 60 * 1000;
    assert.equal((await redeem(o2.codeId)).status, 404, "expired");

    let limited = false;
    for (let i = 0; i < 12; i++) if ((await redeem("0".repeat(32))).status === 429) limited = true;
    assert.ok(limited, "brute force is rate limited");
  } finally {
    await relay.close();
  }
});

test("relay restart: phone re-registers its clients and the same MCP host recovers; concurrent reads", async () => {
  const relay1 = createRelay(relayOpts);
  const port = await relay1.listen(0);
  const base = `http://127.0.0.1:${port}`;
  const token = "rac1.tok.sig";
  const c = newClient();
  const phone = simulatedPhone(base, { token, clients: [c] });
  let relay2;
  try {
    await new Promise((r) => setTimeout(r, 150));
    const host = hostFor(base, c, token);
    const results = await Promise.all(Array.from({ length: 10 }, () => host.callTool("supplier.list", {})));
    assert.ok(results.every((r) => r.isError === false), "10 concurrent reads succeed");

    await relay1.close();
    const down = await host.callTool("supplier.list", {});
    assert.equal(JSON.parse(down.content[0].text).error.code, "DEVICE_UNAVAILABLE");

    relay2 = createRelay(relayOpts);
    await relay2.listen(port);
    let ok = false;
    for (let i = 0; i < 30 && !ok; i++) {
      await new Promise((r) => setTimeout(r, 200));
      ok = (await host.callTool("supplier.list", {})).isError === false;
    }
    assert.ok(ok, "recovered after relay restart without re-pairing (phone re-announced clients)");
  } finally {
    await phone.stop();
    await relay2?.close();
  }
});

test("TLS: real certificate verification — untrusted cert is refused, trusted cert works; no TLS refused", async (t) => {
  assert.throws(() => createRelay({}), /TLS/);
  assert.throws(() => createRelay({ behindProxy: true }).listen(0, "0.0.0.0"), /loopback/);
  let tmp;
  try {
    tmp = mkdtempSync(path.join(os.tmpdir(), "relay-tls-"));
    execFileSync("openssl", ["req", "-x509", "-newkey", "ec", "-pkeyopt", "ec_paramgen_curve:prime256v1", "-nodes", "-keyout", path.join(tmp, "k.pem"),
      "-out", path.join(tmp, "c.pem"), "-days", "1", "-subj", "/CN=test", "-addext", "subjectAltName=IP:127.0.0.1"], { stdio: "ignore" });
  } catch {
    t.skip("openssl not available");
    return;
  }
  const relay = createRelay({ tls: { key: readFileSync(path.join(tmp, "k.pem")), cert: readFileSync(path.join(tmp, "c.pem")) } });
  const port = await relay.listen(0);
  try {
    await assert.rejects(fetch(`https://127.0.0.1:${port}/healthz`), "untrusted self-signed cert must fail verification");
    // Async child (a sync one would block this process, which is serving the relay).
    const child = spawn(process.execPath, ["-e", `fetch("https://127.0.0.1:${port}/healthz").then(r=>r.json()).then(j=>console.log(j.status))`],
      { env: { ...process.env, NODE_EXTRA_CA_CERTS: path.join(tmp, "c.pem") } });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    await new Promise((r) => child.on("close", r));
    assert.equal(out.trim(), "ok");
  } finally {
    await relay.close();
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("stdio device launcher starts unpaired without crashing (status tool only)", async () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const child = spawn(process.execPath, [path.resolve(here, "../run-device-stdio.mjs"), "test-unpaired-xyz"], { stdio: ["pipe", "pipe", "pipe"] });
  let out = "";
  child.stdout.on("data", (d) => (out += d));
  child.stderr.resume();
  child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) + "\n");
  child.stdin.end();
  await new Promise((r) => child.on("close", r));
  assert.deepEqual(JSON.parse(out.trim().split("\n")[0]).result.tools.map((t) => t.name), ["connection.status"]);
});
