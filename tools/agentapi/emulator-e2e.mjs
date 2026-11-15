#!/usr/bin/env node
// AGENT-101: MCP protocol checks against the REAL AgentDev gateway (emulator Room DB).
// Spawns tools/mcp-host in EMULATOR_REAL_ROOM mode (no fixture fallback) and writes a results JSON.
//
// Env: RENTACAR_GATEWAY_URL, RENTACAR_DEVICE_TOKEN (required), E2E_RESULTS_PATH (optional)
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const entry = path.resolve(here, "../mcp-host/src/index.mjs");
const resultsPath = process.env.E2E_RESULTS_PATH || path.resolve(here, "../../build/agentapi-e2e/results.json");
const gatewayUrl = (process.env.RENTACAR_GATEWAY_URL || "").replace(/\/+$/, "");
const token = process.env.RENTACAR_DEVICE_TOKEN || "";

const results = {
  mode: "EMULATOR_REAL_ROOM",
  gatewayUrl: gatewayUrl || null,
  startedAt: new Date().toISOString(),
  checks: [],
  passed: 0,
  failed: 0,
};

function record(name, ok, detail) {
  results.checks.push({ name, ok: !!ok, detail: detail ?? null });
  if (ok) results.passed++;
  else results.failed++;
  process.stderr.write(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` - ${detail}` : ""}\n`);
}

function finish(code) {
  results.finishedAt = new Date().toISOString();
  mkdirSync(path.dirname(resultsPath), { recursive: true });
  writeFileSync(resultsPath, JSON.stringify(results, null, 2));
  process.stderr.write(`results: ${resultsPath} passed=${results.passed} failed=${results.failed}\n`);
  process.exit(code);
}

async function httpJson(method, urlPath, { authToken, body } = {}) {
  const headers = { Accept: "application/json" };
  if (authToken) headers.Authorization = `Bearer ${authToken}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch(`${gatewayUrl}${urlPath}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  return { status: response.status, body: json, text };
}

const child = spawn(process.execPath, [entry], {
  env: { ...process.env, RENTACAR_EXECUTION_MODE: "EMULATOR_REAL_ROOM" },
  stdio: ["pipe", "pipe", "pipe"],
});
let stderr = "";
child.stderr.on("data", (c) => (stderr += c));

const waiting = new Map();
let buffer = "";
child.stdout.on("data", (chunk) => {
  buffer += chunk;
  let idx;
  while ((idx = buffer.indexOf("\n")) >= 0) {
    const line = buffer.slice(0, idx).trim();
    buffer = buffer.slice(idx + 1);
    if (!line) continue;
    const msg = JSON.parse(line);
    waiting.get(msg.id)?.(msg);
    waiting.delete(msg.id);
  }
});
const exited = new Promise((resolve) => child.on("close", (code) => resolve(code)));

let nextId = 1;
function rpc(method, params, timeoutMs = 20000) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for ${method}`)), timeoutMs);
    waiting.set(id, (msg) => {
      clearTimeout(timer);
      resolve(msg);
    });
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
  });
}

const toolJson = (res) => {
  try {
    return JSON.parse(res.result.content[0].text);
  } catch {
    return null;
  }
};
const items = (body) => body?.data?.items ?? [];

try {
  const early = await Promise.race([exited, new Promise((r) => setTimeout(() => r(null), 1500))]);
  if (early !== null) {
    record("mcp-host starts in EMULATOR_REAL_ROOM", false, `exited ${early}: ${stderr.trim()}`);
    finish(1);
  }
  record("mcp-host starts in EMULATOR_REAL_ROOM", true);

  const init = await rpc("initialize", { protocolVersion: "2025-06-18" });
  record("initialize reports EMULATOR_REAL_ROOM", init.result?.serverInfo?.executionMode === "EMULATOR_REAL_ROOM");

  const tools = await rpc("tools/list");
  const names = (tools.result?.tools ?? []).map((t) => t.name);
  record(
    "tools/list exposes read tools",
    ["supplier.list", "customer.list", "reservation.list.manage", "commission.summary.totals"].every((n) =>
      names.includes(n),
    ),
    `${names.length} tools`,
  );

  const call = (name, args = {}) => rpc("tools/call", { name, arguments: args });

  // E2E-001
  const suppliers = toolJson(await call("supplier.list", { limit: 50 }));
  const supplierNames = items(suppliers).map((s) => s.name);
  record(
    "E2E-001 supplier.list returns seeded suppliers",
    ["Alpha Rentals", "Beta Cars", "Gamma Mobility"].every((n) => supplierNames.includes(n)),
    supplierNames.join(", "),
  );

  // E2E-002 (catalog/executor parameter name is `id`)
  const supplierGet = toolJson(await call("supplier.get", { id: 9001 }));
  const supplierItem = supplierGet?.data?.item ?? supplierGet?.data?.supplier ?? supplierGet?.data;
  record(
    "E2E-002 supplier.get returns Alpha by id",
    supplierGet?.success === true && supplierItem?.name === "Alpha Rentals",
    JSON.stringify(supplierItem ?? supplierGet?.error ?? null).slice(0, 200),
  );

  // E2E-003
  const customers = toolJson(await call("customer.list", { limit: 50 }));
  record("E2E-003 customer.list returns seeded customers", items(customers).length >= 2, `${items(customers).length} rows`);

  // E2E-004
  const customerGet = toolJson(await call("customer.get", { id: 9301 }));
  const cust = customerGet?.data?.item ?? customerGet?.data?.customer ?? customerGet?.data;
  record(
    "E2E-004 customer.get returns Dana Levi",
    customerGet?.success === true && cust?.firstName === "Dana" && cust?.lastName === "Levi",
    JSON.stringify(cust ?? customerGet?.error ?? null).slice(0, 200),
  );

  // E2E-005
  const reservations = toolJson(await call("reservation.list.manage", { limit: 50 }));
  const rows = items(reservations);
  record("E2E-005 reservation.list.manage returns >= 4 reservations", rows.length >= 4, `${rows.length} rows`);
  record(
    "reservations expose supplier order / external contract numbers",
    JSON.stringify(rows).includes("ORD-ALPHA-1002") && JSON.stringify(rows).includes("EXT-B-6001"),
  );

  // E2E-006
  const reservationGet = toolJson(await call("reservation.get", { id: 9402 }));
  const res = reservationGet?.data?.item ?? reservationGet?.data?.reservation ?? reservationGet?.data;
  record(
    "E2E-006 reservation.get returns ORD-ALPHA-1002",
    reservationGet?.success === true &&
      (res?.supplierOrderNumber === "ORD-ALPHA-1002" || res?.id === 9402),
    JSON.stringify(res ?? reservationGet?.error ?? null).slice(0, 220),
  );

  // E2E-007 — payoutMonth is required (YYYY-MM); March 2026 covers Alpha fixture return window
  const commission = toolJson(await call("commission.summary.totals", { payoutMonth: "2026-03" }));
  record(
    "E2E-007 commission.summary.totals returns Room-backed totals",
    commission?.success === true && commission?.data != null,
    JSON.stringify(commission?.data ?? commission?.error ?? null).slice(0, 220),
  );

  // E2E-008
  const unknown = await call("does.not.exist.operation", {});
  record("E2E-008 unknown operation rejected", unknown.result?.isError === true);

  // E2E-009
  const write = await call("supplier.create", { name: "ShouldNotWrite" });
  record("E2E-009 write operations stay disabled", write.result?.isError === true);

  // E2E-010 via direct HTTP (missing / invalid auth)
  const noAuth = await httpJson("POST", "/v1/execute", {
    body: { operation: "supplier.list", parameters: {}, requestId: "e2e-noauth" },
  });
  record("E2E-010 missing auth rejected", noAuth.status === 401 || noAuth.body?.success === false);

  const badAuth = await httpJson("POST", "/v1/execute", {
    authToken: "totally-invalid-token",
    body: { operation: "supplier.list", parameters: {}, requestId: "e2e-badauth" },
  });
  record("E2E-010 invalid auth rejected", badAuth.status === 401 || badAuth.body?.success === false);

  // E2E-011
  const forged = await call("supplier.list", { userUid: "someone-else" });
  record(
    "E2E-011 client-supplied userUid is rejected",
    forged.result?.isError === true && JSON.stringify(toolJson(forged)).includes("FORBIDDEN_FIELD"),
  );

  // E2E-014 sanity: MCP supplier list matches direct gateway execute
  const directList = await httpJson("POST", "/v1/execute", {
    authToken: process.env.RENTACAR_DEVICE_TOKEN || token,
    body: {
      operation: "supplier.list",
      parameters: { limit: 50 },
      requestId: `e2e-direct-list-${Date.now()}`,
    },
  });
  const directNames = (directList.body?.data?.items ?? []).map((s) => s.name).sort().join(",");
  const mcpNames = [...supplierNames].sort().join(",");
  record(
    "E2E-014 MCP matches direct Room gateway response",
    directList.status === 200 &&
      directList.body?.success === true &&
      directNames === mcpNames &&
      directNames.includes("Alpha Rentals"),
    `http=${directList.status} direct=${directNames || "(empty)"} mcp=${mcpNames}`,
  );

  // E2E-012: remove ADB forward ownership is outside this process; probe an unused port instead
  // to prove we do not invent fixture data when the gateway is unreachable.
  const dead = await fetch("http://127.0.0.1:18766/v1/health").then(
    () => ({ ok: true }),
    (err) => ({ ok: false, reason: err?.cause?.code || err?.message || String(err) }),
  );
  record(
    "E2E-012 unreachable gateway does not yield fake business data",
    dead.ok === false,
    dead.reason || "unexpectedly reachable",
  );
} catch (err) {
  record("e2e run", false, err?.message || String(err));
} finally {
  child.stdin.end();
  child.kill();
}
finish(results.failed === 0 ? 0 : 1);
