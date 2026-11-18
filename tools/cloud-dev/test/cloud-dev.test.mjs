// AGENT-129/130/134: runs INSIDE the Firebase Emulator Suite (see package.json "test").
// Proves: isolated cloud reads through the unchanged MCP host, real firestore.rules enforcement,
// source/freshness metadata, no cross-tenant exposure, writes rejected, demo-only safety guard.
import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createCloudGateway, emulatorSignIn } from "../cloud-gateway.mjs";
import { seed, DEV_USERS, OWNER_DATA } from "../seed.mjs";

const projectId = process.env.GCLOUD_PROJECT || "demo-rentacar-agent";
const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST;
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const here = path.dirname(fileURLToPath(import.meta.url));

if (!firestoreHost || !authHost) {
  test("cloud-dev tests require the Firebase emulators", { skip: "run via npm test (firebase emulators:exec)" }, () => {});
} else {
  const seeded = await seed({ projectId, firestoreHost, authHost });

  function mcpClient() {
    const child = spawn(process.execPath, [path.resolve(here, "../run-cloud-dev-stdio.mjs")], {
      env: { ...process.env, RENTACAR_CLOUD_DEV_PROJECT: projectId },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let buf = "";
    const waiters = new Map();
    let id = 0;
    child.stdout.on("data", (d) => {
      buf += d;
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        const msg = JSON.parse(buf.slice(0, i));
        buf = buf.slice(i + 1);
        if (msg.id != null) waiters.get(msg.id)?.(msg);
      }
    });
    child.stderr.resume();
    const rpc = (method, params) =>
      new Promise((resolve) => {
        const myId = ++id;
        waiters.set(myId, resolve);
        child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: myId, method, params }) + "\n");
      });
    const call = async (name, args = {}) => {
      const r = await rpc("tools/call", { name, arguments: args });
      return { isError: r.result.isError, body: JSON.parse(r.result.content[0].text) };
    };
    return { rpc, call, close: () => child.kill() };
  }

  test("TEST E: MCP -> isolated cloud executor -> isolated cloud data (source CLOUD, PARTIAL)", async () => {
    const c = mcpClient();
    try {
      const init = await c.rpc("initialize", { protocolVersion: "2025-06-18" });
      assert.equal(init.result.serverInfo.dataEnvironment, "DEVELOPMENT_DATA");
      const tools = (await c.rpc("tools/list", {})).result.tools.map((t) => t.name);
      assert.ok(tools.includes("supplier.list") && tools.includes("carSale.commission.totals"));
      assert.ok(!tools.some((t) => /create|update|delete|set|approve/i.test(t)), "no write tools exposed");

      const s = await c.call("supplier.list");
      assert.equal(s.isError, false);
      assert.deepEqual(s.body.data.items.map((x) => x.name).sort(), OWNER_DATA.suppliers.map((x) => x.name).sort());
      assert.equal(s.body.metadata.source, "CLOUD");
      assert.equal(s.body.metadata.resultCompleteness, "PARTIAL");
      assert.equal(s.body.metadata.syncStatus, "UNKNOWN");
      assert.equal(s.body.metadata.lastSuccessfulSyncEpochMs, null, "no invented sync timestamp");
      assert.ok(s.body.metadata.warnings.some((w) => w.includes("not yet uploaded")));
      assert.equal(s.body.connector.dataEnvironment, "DEVELOPMENT_DATA");

      const r = await c.call("reservation.list.bySupplier", { supplierId: 8001 });
      assert.deepEqual(r.body.data.items.map((x) => x.supplierOrderNumber), ["ORD-DELTA-1"]);
      const cust = await c.call("customer.get", { id: 8301 });
      assert.equal(cust.body.data.item.firstName, "Avi");
      assert.ok(!("tzId" in cust.body.data.item), "tzId excluded like Android DTOs");

      const totals = await c.call("carSale.commission.totals", { commissionFilter: "OPEN" });
      assert.equal(totals.body.data.count, 2);
      assert.equal(totals.body.data.sumRemaining, 1800 + 1500);
      assert.equal(totals.body.data.financialLabel, "PAYMENT_TRACKED_BALANCE");
      const sales = await c.call("carSale.list", {});
      assert.deepEqual(sales.body.data.items.map((x) => x.commissionStatus).sort(), ["PARTIAL", "UNPAID"]);

      const missing = await c.call("supplier.get", { id: 9001 }); // AgentDev Room fixture id: not in cloud
      assert.equal(missing.isError, true);
      assert.equal(missing.body.error.code, "NOT_FOUND");
    } finally {
      c.close();
    }
  });

  test("TEST I: other tenant's data is never exposed; firestore.rules deny cross-user reads", async () => {
    const c = mcpClient();
    try {
      await c.rpc("initialize", {});
      const s = await c.call("supplier.list", { query: "Secret" });
      assert.equal(s.body.data.items.length, 0);
      const spoof = await c.rpc("tools/call", { name: "supplier.list", arguments: { userUid: seeded.otherUid } });
      const body = JSON.parse(spoof.result.content[0].text);
      assert.equal(spoof.result.isError, true);
      assert.ok(!JSON.stringify(body).includes("Secret"));
    } finally {
      c.close();
    }
    // Direct rules check with the owner's real emulator ID token against the other user's path.
    const { idToken } = await emulatorSignIn({ authHost, ...DEV_USERS.owner });
    const url = `http://${firestoreHost}/v1/projects/${projectId}/databases/(default)/documents/users/${seeded.otherUid}/suppliers`;
    const r = await fetch(url, { headers: { Authorization: `Bearer ${idToken}` } });
    assert.equal(r.status, 403);
  });

  test("TEST J + malformed/large input: writes and bad parameters are rejected", async () => {
    const g = createCloudGateway({ projectId, firestoreHost, authHost, ...DEV_USERS.owner });
    for (const op of ["supplier.create", "reservation.update", "carSale.commissionPayment.add"]) {
      const r = await g.execute(op, {}, "t");
      assert.equal(r.success, false);
      assert.equal(r.error.code, "OPERATION_NOT_EXECUTABLE");
    }
    assert.equal((await g.execute("supplier.get", {}, "t")).error.code, "INVALID_ARGUMENT");
    assert.equal((await g.execute("supplier.get", { id: "1; DROP" }, "t")).error.code, "INVALID_ARGUMENT");
    assert.equal((await g.execute("supplier.list", { sql: "select *" }, "t")).error.code, "INVALID_ARGUMENT");
    assert.equal((await g.execute("supplier.list", { limit: 100000 }, "t")).error.code, "INVALID_ARGUMENT");
  });

  test("prompt-injection text in business data is returned as inert data", async () => {
    const g = createCloudGateway({ projectId, firestoreHost, authHost, ...DEV_USERS.owner });
    const r = await g.execute("supplier.list", { query: "Delta" }, "t");
    assert.equal(r.success, true);
    assert.equal(typeof r.data.items[0].name, "string");
  });

  test("safety guard: non-demo project or non-loopback host is refused", () => {
    assert.throws(() => createCloudGateway({ projectId: "rentacar-prod", firestoreHost, authHost }), /demo-/);
    assert.throws(() => createCloudGateway({ projectId, firestoreHost: "firestore.googleapis.com:443", authHost }), /non-loopback/);
  });
}

test("TEST G/H (cloud): emulator unavailable -> connector stays up, reports unavailable, no data", async () => {
  const child = spawn(process.execPath, [path.resolve(here, "../run-cloud-dev-stdio.mjs")], {
    env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, FIRESTORE_EMULATOR_HOST: "127.0.0.1:9", FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9", RENTACAR_REQUEST_TIMEOUT_MS: "3000" },
    stdio: ["pipe", "pipe", "pipe"],
  });
  let out = "";
  child.stdout.on("data", (d) => (out += d));
  child.stderr.resume();
  const lines = [
    { jsonrpc: "2.0", id: 1, method: "initialize", params: {} },
    { jsonrpc: "2.0", id: 2, method: "tools/list" },
    { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "supplier.list", arguments: {} } },
  ];
  for (const l of lines) child.stdin.write(JSON.stringify(l) + "\n");
  child.stdin.end();
  await new Promise((r) => child.on("close", r));
  const msgs = out.trim().split("\n").map((l) => JSON.parse(l));
  assert.deepEqual(msgs.find((m) => m.id === 2).result.tools.map((t) => t.name), ["connection.status"]);
  const call = msgs.find((m) => m.id === 3).result;
  assert.equal(call.isError, true);
  assert.equal(JSON.parse(call.content[0].text).data, null);
});
