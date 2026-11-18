// AGENT-127/128/134: relay protocol, pairing crypto and MCP-through-relay tests.
import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRelay } from "../relay.mjs";
import { seal, open, codeId, isWellFormed, normalize } from "../pairing.mjs";
import { createHost } from "../../mcp-host/src/host.mjs";

const DEV_ID = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";
const SECRET = "a".repeat(64);

// Shared vector with app/src/test/.../RelayPairingCryptoTest.kt — both sides must agree.
const VECTOR = {
  code: "7KQ4M-ZX9TC",
  deviceId: DEV_ID,
  plaintext: '{"token":"rac1.abc.def"}',
  salt: "000102030405060708090a0b0c0d0e0f",
  iv: "a0a1a2a3a4a5a6a7a8a9aaab",
  codeId: "ea30aa1caafae4ed8cf04d6513b72257",
  ciphertextB64: "qxScKCF9NL0U3JGlPF+C67640fagICdyRBGg6Xy1mTgkySJxqTEbxw==",
};

test("pairing crypto matches the Kotlin vector and rejects a wrong code", () => {
  const o = seal(VECTOR.code, VECTOR.deviceId, VECTOR.plaintext, { salt: Buffer.from(VECTOR.salt, "hex"), iv: Buffer.from(VECTOR.iv, "hex"), now: 1000 });
  assert.equal(o.codeId, VECTOR.codeId);
  assert.equal(o.ciphertextB64, VECTOR.ciphertextB64);
  assert.equal(open("7kq4mzx9tc", o), VECTOR.plaintext); // case/dash-insensitive
  assert.throws(() => open("7KQ4M-ZX9TD", o));
  assert.throws(() => open(VECTOR.code, { ...o, deviceId: "other-device-id" }), "AAD binds the device id");
  assert.ok(isWellFormed("7KQ4M-ZX9TC") && !isWellFormed("SHORT"));
  assert.equal(normalize("o1l-i"), "0111");
});

/** Minimal phone simulator speaking the device protocol (the real one is RelayDeviceLoop.kt). */
function simulatedPhone(base, { handle, deviceId = DEV_ID, secret = SECRET }) {
  let running = true;
  const auth = { Authorization: `Device ${deviceId}.${secret}`, "Content-Type": "application/json" };
  const post = (p, body = {}) => fetch(base + p, { method: "POST", headers: auth, body: JSON.stringify(body) });
  const loop = (async () => {
    await post("/device/register");
    while (running) {
      const r = await post("/device/poll").catch(() => null);
      if (!r || r.status === 204) continue;
      const { requests } = await r.json();
      for (const q of requests) {
        const { status, body } = await handle(q);
        await post("/device/respond", { relayId: q.relayId, status, body: JSON.stringify(body) });
      }
    }
  })();
  return { stop: async () => { running = false; await loop.catch(() => {}); }, post };
}

const TOOLS = [{ name: "supplier.list", description: "List suppliers", inputSchema: { type: "object" } }];
function phoneHandler(validToken) {
  const seen = [];
  return {
    seen,
    handle: async (q) => {
      seen.push(q);
      if (q.authorization !== `Bearer ${validToken}`) return { status: 401, body: { success: false, error: { code: "UNAUTHORIZED" } } };
      if (q.kind === "tools") return { status: 200, body: { success: true, tools: TOOLS } };
      const req = JSON.parse(q.body);
      if (req.operation === "supplier.create") return { status: 200, body: { success: false, error: { code: "WRITE_NOT_ALLOWED" } } };
      return { status: 200, body: { success: true, operation: req.operation, data: { items: [{ id: 1, name: "Phone Supplier" }] }, metadata: { source: "LOCAL" } } };
    },
  };
}

test("MCP host -> relay -> phone -> answer; offline phone -> DEVICE_UNAVAILABLE; bad token rejected", async () => {
  const relay = createRelay({ allowInsecureHttpForTests: true, pollWaitMs: 300, onlineWindowMs: 1000, requestTimeoutMs: 2000 });
  const port = await relay.listen(0);
  const base = `http://127.0.0.1:${port}`;
  const gatewayUrl = `${base}/d/${DEV_ID}`;
  const token = "rac1.tok.sig";

  const offline = createHost({ gatewayUrl, token, timeoutMs: 3000 });
  assert.deepEqual((await offline.handleMessage({ jsonrpc: "2.0", id: 1, method: "tools/list" })).result.tools.map((t) => t.name), ["connection.status"]);
  const offCall = await offline.callTool("supplier.list", {});
  assert.equal(offCall.isError, true);

  const ph = phoneHandler(token);
  const phone = simulatedPhone(base, ph);
  try {
    await new Promise((r) => setTimeout(r, 100));
    const host = createHost({ gatewayUrl, token, timeoutMs: 3000, dataEnvironment: "DEVELOPMENT_DATA" });
    const list = await host.handleMessage({ jsonrpc: "2.0", id: 2, method: "tools/list" });
    assert.deepEqual(list.result.tools.map((t) => t.name), ["connection.status", "supplier.list"]);
    const ok = await host.callTool("supplier.list", { limit: 5 });
    assert.equal(ok.isError, false);
    assert.equal(JSON.parse(ok.content[0].text).data.items[0].name, "Phone Supplier");
    const fwd = ph.seen.find((q) => q.kind === "execute");
    assert.ok(!JSON.parse(fwd.body).userUid, "host never sends identity");

    const write = await host.callTool("supplier.create", { name: "x" });
    assert.equal(JSON.parse(write.content[0].text).error.code, "WRITE_NOT_ALLOWED");

    const bad = createHost({ gatewayUrl, token: "rac1.wrong.sig", timeoutMs: 3000 });
    const badCall = await bad.callTool("supplier.list", {});
    assert.equal(JSON.parse(badCall.content[0].text).error.code, "AUTH_FAILED");
  } finally {
    await phone.stop();
    await relay.close();
  }
});

test("device credential: first registration binds the secret; impostor cannot poll or hijack", async () => {
  const relay = createRelay({ allowInsecureHttpForTests: true, pollWaitMs: 200 });
  const port = await relay.listen(0);
  const base = `http://127.0.0.1:${port}`;
  const call = (p, secret, body = {}) =>
    fetch(base + p, { method: "POST", headers: { Authorization: `Device ${DEV_ID}.${secret}` }, body: JSON.stringify(body) });
  try {
    assert.equal((await call("/device/register", SECRET)).status, 200);
    assert.equal((await call("/device/register", "b".repeat(64))).status, 401);
    assert.equal((await call("/device/poll", "b".repeat(64))).status, 401);
    assert.equal((await fetch(base + "/device/poll", { method: "POST" })).status, 401);
    assert.equal((await call("/device/respond", SECRET, { relayId: "nope", status: 200, body: "{}" })).status, 404);
  } finally {
    await relay.close();
  }
});

test("pairing offers: single use, expire, bound to the posting device, redeem is rate-limited", async () => {
  let t = 1_000_000;
  const relay = createRelay({ allowInsecureHttpForTests: true, now: () => t });
  const port = await relay.listen(0);
  const base = `http://127.0.0.1:${port}`;
  const dev = (p, body) => fetch(base + p, { method: "POST", headers: { Authorization: `Device ${DEV_ID}.${SECRET}` }, body: JSON.stringify(body) });
  const redeem = (id) => fetch(base + "/pair/redeem", { method: "POST", body: JSON.stringify({ codeId: id }) });
  try {
    await dev("/device/register", {});
    const offer = seal("ABCDE-12345", DEV_ID, '{"token":"rac1.x.y"}', { now: t });
    assert.equal((await dev("/device/pairing-offer", { ...offer, deviceId: "someone-else-1234" })).status, 400);
    assert.equal((await dev("/device/pairing-offer", offer)).status, 200);
    const r1 = await redeem(codeId("abcde12345"));
    assert.equal(r1.status, 200);
    assert.equal(open("ABCDE12345", await r1.json()), '{"token":"rac1.x.y"}');
    assert.equal((await redeem(codeId("ABCDE12345"))).status, 404, "single use");

    const o2 = seal("ZZZZZ-99999", DEV_ID, "{}", { now: t });
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

test("relay refuses to start without TLS unless explicitly in test mode; oversize body rejected", async () => {
  assert.throws(() => createRelay({}), /TLS/);
  const relay = createRelay({ allowInsecureHttpForTests: true, maxBodyBytes: 1024 });
  const port = await relay.listen(0);
  try {
    const r = await fetch(`http://127.0.0.1:${port}/pair/redeem`, { method: "POST", body: "x".repeat(5000) }).catch(() => null);
    assert.ok(!r || r.status === 413);
  } finally {
    await relay.close();
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
  const msg = JSON.parse(out.trim().split("\n")[0]);
  assert.deepEqual(msg.result.tools.map((t) => t.name), ["connection.status"]);
});
