import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createHost, loadConfig, DEFAULT_GATEWAY_URL } from "../src/host.mjs";

const TOKEN = "rac1.fake-token-id.fake-signature";

function startFakeGateway() {
  const seen = [];
  const server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      seen.push({ method: req.method, url: req.url, auth: req.headers.authorization, body: raw ? JSON.parse(raw) : null });
      const send = (status, obj) => {
        res.writeHead(status, { "Content-Type": "application/json" });
        res.end(JSON.stringify(obj));
      };
      if (req.headers.authorization !== `Bearer ${TOKEN}`) {
        return send(401, { success: false, error: { code: "UNAUTHORIZED", message: "Invalid device token" } });
      }
      if (req.method === "GET" && req.url === "/v1/tools") {
        return send(200, {
          tools: [{ name: "supplier.list", description: "List suppliers", inputSchema: { type: "object", properties: {} } }],
        });
      }
      if (req.method === "POST" && req.url === "/v1/execute") {
        const body = JSON.parse(raw);
        if (body.operation === "supplier.list") {
          return send(200, { success: true, operation: "supplier.list", requestId: body.requestId, data: { items: [{ name: "Alpha" }] } });
        }
        return send(200, { success: false, error: { code: "UNKNOWN_OPERATION", message: "nope" } });
      }
      send(404, { success: false });
    });
  });
  return new Promise((resolve) =>
    server.listen(0, "127.0.0.1", () => resolve({ server, seen, url: `http://127.0.0.1:${server.address().port}` })),
  );
}

test("loadConfig defaults and env", () => {
  const d = loadConfig({});
  assert.equal(d.gatewayUrl, DEFAULT_GATEWAY_URL);
  assert.equal(d.token, "");
  const c = loadConfig({ RENTACAR_GATEWAY_URL: "http://example.test:1/", RENTACAR_DEVICE_TOKEN: "t" });
  assert.equal(c.gatewayUrl, "http://example.test:1");
  assert.equal(c.token, "t");
});

test("initialize, ping, unknown method and notifications", async () => {
  const host = createHost({ gatewayUrl: "http://unused", token: "" });
  const init = await host.handleMessage({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05" } });
  assert.equal(init.result.protocolVersion, "2024-11-05");
  assert.ok(init.result.capabilities.tools);
  assert.deepEqual((await host.handleMessage({ jsonrpc: "2.0", id: 2, method: "ping" })).result, {});
  assert.equal((await host.handleMessage({ jsonrpc: "2.0", id: 3, method: "nope" })).error.code, -32601);
  assert.equal(await host.handleMessage({ jsonrpc: "2.0", method: "notifications/initialized" }), null);
  const bad = JSON.parse(await host.handleLine("{not json"));
  assert.equal(bad.error.code, -32700);
});

test("tools/list and tools/call go through the gateway with bearer auth", async () => {
  const { server, seen, url } = await startFakeGateway();
  try {
    const host = createHost({ gatewayUrl: url, token: TOKEN });
    const list = await host.handleMessage({ jsonrpc: "2.0", id: 1, method: "tools/list" });
    assert.equal(list.result.tools[0].name, "supplier.list");
    assert.equal(seen[0].method, "GET");
    assert.equal(seen[0].url, "/v1/tools");
    assert.equal(seen[0].auth, `Bearer ${TOKEN}`);

    const call = await host.handleMessage({
      jsonrpc: "2.0", id: 2, method: "tools/call",
      params: { name: "supplier.list", arguments: { limit: 5 } },
    });
    assert.equal(call.result.isError, false);
    assert.equal(JSON.parse(call.result.content[0].text).data.items[0].name, "Alpha");
    const post = seen[1];
    assert.equal(post.method, "POST");
    assert.equal(post.url, "/v1/execute");
    assert.equal(post.auth, `Bearer ${TOKEN}`);
    assert.equal(post.body.operation, "supplier.list");
    assert.deepEqual(post.body.parameters, { limit: 5 });
    assert.match(post.body.requestId, /^mcp-/);
    // The host must never send identity fields.
    assert.ok(!("userUid" in post.body));
    assert.ok(!JSON.stringify(post.body).toLowerCase().includes("useruid"));

    const failed = await host.handleMessage({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "x.y" } });
    assert.equal(failed.result.isError, true);
  } finally {
    server.close();
  }
});

test("bad token and missing token surface errors", async () => {
  const { server, url } = await startFakeGateway();
  try {
    const bad = createHost({ gatewayUrl: url, token: "wrong" });
    const r = await bad.handleMessage({ jsonrpc: "2.0", id: 1, method: "tools/list" });
    assert.ok(r.error);
    const call = await bad.handleMessage({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "supplier.list" } });
    assert.equal(call.result.isError, true);

    const missing = createHost({ gatewayUrl: url, token: "" });
    const m = await missing.handleMessage({ jsonrpc: "2.0", id: 3, method: "tools/list" });
    assert.equal(m.error.code, -32001);
  } finally {
    server.close();
  }
});

test("tools/call validates params; unreachable gateway is a JSON-RPC error", async () => {
  const host = createHost({ gatewayUrl: "http://127.0.0.1:1", token: TOKEN, timeoutMs: 2000 });
  assert.equal((await host.handleMessage({ jsonrpc: "2.0", id: 1, method: "tools/call", params: {} })).error.code, -32602);
  assert.equal(
    (await host.handleMessage({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "a", arguments: [1] } })).error.code,
    -32602,
  );
  const down = await host.handleMessage({ jsonrpc: "2.0", id: 3, method: "tools/list" });
  assert.equal(down.error.code, -32603);
});

test("stdio entrypoint speaks newline-delimited JSON-RPC", async () => {
  const { server, url } = await startFakeGateway();
  const entry = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src/index.mjs");
  const child = spawn(process.execPath, [entry], {
    env: { ...process.env, RENTACAR_GATEWAY_URL: url, RENTACAR_DEVICE_TOKEN: TOKEN },
    stdio: ["pipe", "pipe", "pipe"],
  });
  try {
    let out = "";
    child.stdout.on("data", (c) => (out += c));
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }) + "\n");
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }) + "\n");
    child.stdin.end();
    await new Promise((resolve) => child.on("close", resolve));
    const lines = out.trim().split("\n").map((l) => JSON.parse(l));
    assert.equal(lines.length, 2);
    assert.equal(lines.find((l) => l.id === 2).result.tools[0].name, "supplier.list");
  } finally {
    child.kill();
    server.close();
  }
});
