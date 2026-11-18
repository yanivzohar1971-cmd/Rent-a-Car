// AGENT-121: recovery behavior — the host survives an offline device and recovers without
// re-registration; stdout carries protocol messages only; auth failures never bypass.
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHost } from "../src/host.mjs";

const entry = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src/index.mjs");

/** Fake AgentDev gateway that can be started/stopped on a fixed port and rotate its token. */
function fakeGateway({ token }) {
  const calls = [];
  let currentToken = token;
  const server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const send = (status, obj) => {
        res.writeHead(status, { "Content-Type": "application/json" });
        res.end(JSON.stringify(obj));
      };
      if (req.url === "/v1/health") return send(200, { status: "ok", mode: "DEVELOPMENT_ONLY" });
      if (req.headers.authorization !== `Bearer ${currentToken}`) {
        return send(401, { success: false, error: { code: "UNAUTHORIZED" } });
      }
      if (req.url === "/v1/tools") {
        return send(200, { tools: [{ name: "supplier.list", description: "List suppliers", inputSchema: { type: "object" } }] });
      }
      if (req.url === "/v1/execute") {
        const body = JSON.parse(raw);
        calls.push(body);
        if (body.operation === "supplier.create") {
          return send(200, { success: false, error: { code: "OPERATION_NOT_EXECUTABLE", message: "writes disabled" } });
        }
        return send(200, {
          success: true,
          operation: body.operation,
          data: { items: [{ id: 9001, name: "Alpha Rentals" }] },
          metadata: { source: "LOCAL" },
        });
      }
      send(404, {});
    });
  });
  return {
    calls,
    rotate(next) {
      currentToken = next;
    },
    listen(port = 0) {
      return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve(server.address().port)));
    },
    close() {
      return new Promise((resolve) => {
        server.closeAllConnections?.();
        server.close(() => resolve());
      });
    },
  };
}

test("offline at start, then device comes online: same host recovers and announces list_changed", async () => {
  const gw = fakeGateway({ token: "rac1.a" });
  const port = await gw.listen(0);
  await gw.close(); // reserve a port, then go offline
  const notes = [];
  const host = createHost({
    gatewayUrl: `http://127.0.0.1:${port}`,
    token: "rac1.a",
    timeoutMs: 1500,
    notify: (n) => notes.push(n),
  });
  await host.handleMessage({ jsonrpc: "2.0", method: "notifications/initialized" });
  const off = await host.handleMessage({ jsonrpc: "2.0", id: 1, method: "tools/list" });
  assert.deepEqual(off.result.tools.map((t) => t.name), ["connection.status"]);
  assert.equal(host.getState().connection, "DEVICE_UNAVAILABLE");

  const status = await host.handleMessage({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "connection.status" } });
  assert.equal(status.result.isError, false);
  const s = JSON.parse(status.result.content[0].text).data;
  assert.equal(s.connection, "DEVICE_UNAVAILABLE");
  assert.equal(s.gatewayReachable, false);
  assert.equal(s.writesEnabled, false);

  const gw2 = fakeGateway({ token: "rac1.a" });
  await gw2.listen(port);
  try {
    assert.equal(await host.refreshAvailability(), "ONLINE");
    assert.ok(notes.some((n) => n.method === "notifications/tools/list_changed"));
    const on = await host.handleMessage({ jsonrpc: "2.0", id: 3, method: "tools/list" });
    assert.deepEqual(on.result.tools.map((t) => t.name), ["connection.status", "supplier.list"]);
    const call = await host.handleMessage({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "supplier.list" } });
    assert.equal(call.result.isError, false);
    assert.equal(JSON.parse(call.result.content[0].text).metadata.deviceAvailability, "ONLINE");
  } finally {
    await gw2.close();
  }
});

test("device goes away mid-session: business call returns DEVICE_UNAVAILABLE and is not retried", async () => {
  const gw = fakeGateway({ token: "rac1.a" });
  const port = await gw.listen(0);
  const host = createHost({ gatewayUrl: `http://127.0.0.1:${port}`, token: "rac1.a", timeoutMs: 1500 });
  await host.handleMessage({ jsonrpc: "2.0", id: 1, method: "tools/list" });
  await gw.close();
  const call = await host.handleMessage({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "supplier.list" } });
  const body = JSON.parse(call.result.content[0].text);
  assert.equal(call.result.isError, true);
  assert.equal(body.error.code, "DEVICE_UNAVAILABLE");
  assert.equal(body.data, null);
  assert.equal(gw.calls.length, 0);
});

test("rotated token is reloaded from the provider; a wrong token never bypasses auth", async () => {
  const gw = fakeGateway({ token: "rac1.new" });
  const port = await gw.listen(0);
  try {
    let fileToken = "rac1.old";
    const host = createHost({ gatewayUrl: `http://127.0.0.1:${port}`, tokenProvider: () => fileToken, timeoutMs: 1500 });
    const denied = await host.handleMessage({ jsonrpc: "2.0", id: 1, method: "tools/list" });
    assert.deepEqual(denied.result.tools.map((t) => t.name), ["connection.status"]);
    assert.equal(host.getState().connection, "AUTH_FAILED");
    const call = await host.handleMessage({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "supplier.list" } });
    assert.equal(JSON.parse(call.result.content[0].text).error.code, "AUTH_FAILED");
    assert.equal(gw.calls.length, 0, "rejected token must not reach the executor");
    fileToken = "rac1.new"; // the AgentDev runner rewrote token.env after an emulator restart
    const ok = await host.handleMessage({ jsonrpc: "2.0", id: 3, method: "tools/list" });
    assert.equal(ok.result.tools.length, 2);
    assert.equal(host.getState().connection, "ONLINE");
  } finally {
    await gw.close();
  }
});

test("write attempt through the read-only connector is rejected and surfaced as an error", async () => {
  const gw = fakeGateway({ token: "rac1.a" });
  const port = await gw.listen(0);
  try {
    const host = createHost({ gatewayUrl: `http://127.0.0.1:${port}`, token: "rac1.a" });
    const call = await host.handleMessage({
      jsonrpc: "2.0", id: 1, method: "tools/call",
      params: { name: "supplier.create", arguments: { name: "X" } },
    });
    assert.equal(call.result.isError, true);
    assert.equal(JSON.parse(call.result.content[0].text).error.code, "OPERATION_NOT_EXECUTABLE");
  } finally {
    await gw.close();
  }
});

test("stdio process starts with gateway down and no token; stdout is protocol-only; token never logged", async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "rentacar-mcp-"));
  const tokenFile = path.join(dir, "token.env");
  const child = spawn(process.execPath, [entry], {
    env: {
      PATH: process.env.PATH,
      SystemRoot: process.env.SystemRoot,
      RENTACAR_EXECUTION_MODE: "EMULATOR_REAL_ROOM",
      RENTACAR_GATEWAY_URL: "http://127.0.0.1:1",
      RENTACAR_TOKEN_FILE: tokenFile,
      RENTACAR_REQUEST_TIMEOUT_MS: "1000",
    },
    stdio: ["pipe", "pipe", "pipe"],
  });
  let out = "";
  let err = "";
  child.stdout.on("data", (c) => (out += c));
  child.stderr.on("data", (c) => (err += c));
  const send = (o) => child.stdin.write(JSON.stringify(o) + "\n");
  const waitFor = async (id) => {
    for (let i = 0; i < 100; i++) {
      const hit = out.split("\n").filter(Boolean).map((l) => JSON.parse(l)).find((l) => l.id === id);
      if (hit) return hit;
      await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error(`no response for id ${id}; stderr=${err}`);
  };
  try {
    send({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } });
    send({ jsonrpc: "2.0", method: "notifications/initialized" });
    send({ jsonrpc: "2.0", id: 2, method: "tools/list" });
    const init = (await waitFor(1)).result;
    const list = (await waitFor(2)).result;
    writeFileSync(tokenFile, "rac1.later\n");
    send({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "connection.status" } });
    const status = JSON.parse((await waitFor(3)).result.content[0].text).data;
    child.stdin.end();
    const code = await new Promise((resolve) => child.on("close", resolve));
    assert.equal(code, 0, err);
    for (const l of out.trim().split("\n")) assert.equal(JSON.parse(l).jsonrpc, "2.0");
    assert.equal(init.serverInfo.dataEnvironment, "DEVELOPMENT_DATA");
    assert.equal(init.capabilities.tools.listChanged, true);
    assert.deepEqual(list.tools.map((t) => t.name), ["connection.status"]);
    assert.equal(status.connection, "DEVICE_UNAVAILABLE");
    assert.equal(status.tokenConfigured, true);
    assert.ok(!out.includes("rac1.later"), "token must never be written to stdout");
    assert.ok(!err.includes("rac1.later"), "token must never be written to stderr");
  } finally {
    child.kill();
    rmSync(dir, { recursive: true, force: true });
  }
});
