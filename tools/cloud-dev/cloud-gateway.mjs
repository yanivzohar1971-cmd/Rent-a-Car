// AGENT-129/130: isolated cloud read gateway for the `rentcar-cloud-dev` connector.
//
// Speaks the same HTTP contract as the Android gateway (/v1/health, /v1/tools, /v1/execute) so the
// unchanged MCP host can front it. Data comes ONLY from the Firebase Emulator Suite:
//   - project id MUST start with "demo-" (Firebase guarantees demo projects never reach production)
//   - emulator hosts MUST be loopback
//   - every Firestore read uses the signed-in emulator user's ID token, so the repository's real
//     firestore.rules are enforced (users/{uid}/... owner-only); the uid comes from the token,
//     never from the request.
// Collections and field names mirror CloudDeltaSyncWorker uploads (users/{uid}/suppliers, ...).
// Read-only: every operation outside READ_OPERATIONS is rejected.

import http from "node:http";
import { randomBytes, timingSafeEqual } from "node:crypto";

export const READ_OPERATIONS = {
  "supplier.list": { collection: "suppliers", desc: "List/search suppliers in the cloud mirror", params: ["query", "limit", "offset"] },
  "supplier.get": { collection: "suppliers", desc: "Get supplier from the cloud mirror", params: ["id"], required: ["id"] },
  "customer.list": { collection: "customers", desc: "List/search customers in the cloud mirror", params: ["query", "limit", "offset"] },
  "customer.get": { collection: "customers", desc: "Get customer from the cloud mirror", params: ["id"], required: ["id"] },
  "reservation.list.manage": { collection: "reservations", desc: "List/search reservations in the cloud mirror", params: ["query", "limit", "offset"] },
  "reservation.get": { collection: "reservations", desc: "Get reservation from the cloud mirror", params: ["id"], required: ["id"] },
  "reservation.list.bySupplier": { collection: "reservations", desc: "List cloud reservations by supplier", params: ["supplierId", "limit", "offset"], required: ["supplierId"] },
  "reservation.list.byCustomer": { collection: "reservations", desc: "List cloud reservations by customer", params: ["customerId", "limit", "offset"], required: ["customerId"] },
  "carSale.list": { collection: "carSales", desc: "List car sales with commission payment status from the cloud mirror", params: ["query", "commissionFilter", "limit", "offset"] },
  "carSale.commission.totals": { collection: "carSales", desc: "Car-sale commission totals (persisted payments) from the cloud mirror", params: ["query", "commissionFilter"] },
};

const INT_PARAMS = new Set(["id", "supplierId", "customerId", "limit", "offset"]);
// CarSaleCommissionPaymentLogic (docs/agent-api/04-BUSINESS-RULES.md §4): MONEY_EPS = 1e-4.
const MONEY_EPS = 1e-4;

export const CLOUD_WARNINGS = [
  "Read from the cloud mirror (Firestore). Records created or changed on the device but not yet uploaded are NOT included.",
  "Local deletes are not propagated to the cloud (no tombstones); deleted records may still appear.",
  "There is no global sync watermark, so freshness cannot be verified.",
];

function assertIsolated({ projectId, firestoreHost, authHost }) {
  if (!/^demo-[a-z0-9-]+$/.test(projectId || "")) {
    throw new Error(`refusing project "${projectId}": rentcar-cloud-dev only runs against demo-* emulator projects`);
  }
  for (const h of [firestoreHost, authHost]) {
    if (!/^(127\.0\.0\.1|localhost|\[::1\]):\d+$/.test(h || "")) throw new Error(`refusing non-loopback emulator host "${h}"`);
  }
}

export function decodeValue(v) {
  if (v == null) return null;
  if ("nullValue" in v) return null;
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return Number(v.doubleValue);
  if ("booleanValue" in v) return v.booleanValue;
  if ("timestampValue" in v) return v.timestampValue;
  if ("mapValue" in v) return decodeFields(v.mapValue.fields || {});
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(decodeValue);
  return null;
}
export function decodeFields(fields) {
  const out = {};
  for (const [k, v] of Object.entries(fields || {})) out[k] = decodeValue(v);
  return out;
}
export function encodeValue(x) {
  if (x === null || x === undefined) return { nullValue: null };
  if (typeof x === "boolean") return { booleanValue: x };
  if (typeof x === "number") return Number.isInteger(x) ? { integerValue: String(x) } : { doubleValue: x };
  if (typeof x === "string") return { stringValue: x };
  if (Array.isArray(x)) return { arrayValue: { values: x.map(encodeValue) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(x).map(([k, v]) => [k, encodeValue(v)])) } };
}

/** Sign in to the Auth emulator. Returns { idToken, uid, expiresAtMs }. */
export async function emulatorSignIn({ authHost, email, password }) {
  const url = `http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-api-key`;
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  const body = await r.json();
  if (!r.ok) throw new Error(`auth emulator sign-in failed: ${body?.error?.message || r.status}`);
  return { idToken: body.idToken, uid: body.localId, expiresAtMs: Date.now() + (Number(body.expiresIn || 3600) - 60) * 1000 };
}

export function createCloudGateway({ projectId, firestoreHost, authHost, email, password, token = randomBytes(24).toString("base64url") }) {
  assertIsolated({ projectId, firestoreHost, authHost });
  let session = null;
  const tokenBuf = Buffer.from(token);

  async function idSession() {
    if (!session || Date.now() >= session.expiresAtMs) session = await emulatorSignIn({ authHost, email, password });
    return session;
  }

  async function listCollection(collection) {
    const { idToken, uid } = await idSession();
    const base = `http://${firestoreHost}/v1/projects/${projectId}/databases/(default)/documents/users/${encodeURIComponent(uid)}/${collection}`;
    const docs = [];
    let pageToken = "";
    do {
      const r = await fetch(`${base}?pageSize=300${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`, {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const body = await r.json();
      if (!r.ok) {
        const e = new Error(`firestore ${collection}: ${body?.error?.status || r.status}`);
        e.status = r.status;
        throw e;
      }
      for (const d of body.documents || []) docs.push(decodeFields(d.fields));
      pageToken = body.nextPageToken || "";
    } while (pageToken);
    return docs;
  }

  async function health() {
    try {
      const r = await fetch(`http://${firestoreHost}/`, { signal: AbortSignal.timeout(2000) });
      const a = await fetch(`http://${authHost}/`, { signal: AbortSignal.timeout(2000) });
      return r.status < 500 && a.status < 500;
    } catch {
      return false;
    }
  }

  function tools() {
    return Object.entries(READ_OPERATIONS).map(([name, op]) => ({
      name,
      description: `${op.desc} (source CLOUD, isolated Firebase emulator)`,
      inputSchema: {
        type: "object",
        additionalProperties: false,
        properties: Object.fromEntries(
          op.params.map((p) => [p, INT_PARAMS.has(p) ? { type: "integer", minimum: p === "offset" ? 0 : 1 } : { type: "string" }]),
        ),
        required: op.required || [],
      },
    }));
  }

  const meta = (completeness, extra = []) => ({
    source: "CLOUD",
    executionTarget: "CLOUD",
    implementationStatus: "EXECUTABLE",
    executable: true,
    syncStatus: "UNKNOWN",
    resultCompleteness: completeness,
    lastSuccessfulSyncEpochMs: null,
    deviceAvailability: "UNKNOWN",
    warnings: [...CLOUD_WARNINGS, ...extra],
  });

  function failure(operation, requestId, code, message) {
    return { success: false, operation, requestId, data: null, error: { code, message, retryable: false }, metadata: { source: null, warnings: [] } };
  }

  function page(items, params) {
    const limit = params.limit ?? 50;
    const offset = params.offset ?? 0;
    const slice = items.slice(offset, offset + limit);
    return { slice, pagination: { limit, offset, totalHint: items.length, hasMore: offset + slice.length < items.length } };
  }

  function saleStatus(commission, paid) {
    if (commission <= 0) return "NO_COMMISSION";
    if (paid <= 0) return "UNPAID";
    if (paid < commission - MONEY_EPS) return "PARTIAL";
    return "PAID";
  }

  async function execute(operation, params, requestId) {
    const op = READ_OPERATIONS[operation];
    if (!op) {
      return failure(operation, requestId, "OPERATION_NOT_EXECUTABLE", `'${operation}' is not a cloud read operation; writes are disabled`);
    }
    for (const k of Object.keys(params)) {
      if (!op.params.includes(k)) return failure(operation, requestId, "INVALID_ARGUMENT", `unknown parameter '${k}'`);
      if (INT_PARAMS.has(k) && !(Number.isInteger(params[k]) && params[k] >= (k === "offset" ? 0 : 1))) {
        return failure(operation, requestId, "INVALID_ARGUMENT", `${k} must be a ${k === "offset" ? "non-negative" : "positive"} integer`);
      }
    }
    for (const k of op.required || []) {
      if (params[k] == null) return failure(operation, requestId, "INVALID_ARGUMENT", `${k} is required`);
    }
    if (params.limit != null && params.limit > 500) return failure(operation, requestId, "INVALID_ARGUMENT", "limit must be <= 500");

    let rows = await listCollection(op.collection);
    rows.sort((a, b) => (b.id ?? 0) - (a.id ?? 0));
    // Agent DTOs exclude tzId/address for customers (same as Android CustomerAgentDto).
    if (op.collection === "customers") rows = rows.map(({ tzId, address, ...rest }) => rest);
    const q = (params.query || "").trim().toLowerCase();

    if (operation.endsWith(".get")) {
      const item = rows.find((r) => r.id === params.id) || null;
      if (!item) return failure(operation, requestId, "NOT_FOUND", `no ${op.collection} record ${params.id} in the cloud mirror (it may exist only on the device)`);
      return { success: true, operation, requestId, data: { item }, metadata: meta("PARTIAL") };
    }
    if (operation === "reservation.list.bySupplier") rows = rows.filter((r) => r.supplierId === params.supplierId);
    if (operation === "reservation.list.byCustomer") rows = rows.filter((r) => r.customerId === params.customerId);
    if (q) {
      const fields = {
        suppliers: ["name", "phone", "email", "taxId"],
        customers: ["firstName", "lastName", "phone", "email"],
        reservations: ["supplierOrderNumber", "externalContractNumber", "status", "carTypeName"],
        carSales: ["firstName", "lastName", "phone", "carTypeName"],
      }[op.collection];
      rows = rows.filter((r) => fields.some((f) => String(r[f] ?? "").toLowerCase().includes(q)) || String(r.id) === q);
    }
    if (op.collection === "carSales") {
      const payments = await listCollection("carSaleCommissionPayments");
      const paid = new Map();
      for (const p of payments) paid.set(p.carSaleId, (paid.get(p.carSaleId) || 0) + (Number(p.amount) || 0));
      rows = rows.map((s) => {
        const totalPaid = paid.get(s.id) || 0;
        const commission = Number(s.commissionPrice) || 0;
        return { ...s, totalPaid, remaining: Math.max(0, commission - totalPaid), commissionStatus: saleStatus(commission, totalPaid) };
      });
      const filter = (params.commissionFilter || "ALL").toUpperCase();
      if (!["ALL", "OPEN", "CLOSED"].includes(filter)) return failure(operation, requestId, "INVALID_ARGUMENT", "commissionFilter must be ALL, OPEN, or CLOSED");
      if (filter === "OPEN") rows = rows.filter((s) => s.commissionStatus === "UNPAID" || s.commissionStatus === "PARTIAL");
      if (filter === "CLOSED") rows = rows.filter((s) => s.commissionStatus === "PAID" || s.commissionStatus === "NO_COMMISSION");
      if (operation === "carSale.commission.totals") {
        return {
          success: true,
          operation,
          requestId,
          data: {
            count: rows.length,
            sumCommissionPrice: rows.reduce((a, s) => a + (Number(s.commissionPrice) || 0), 0),
            sumPaid: rows.reduce((a, s) => a + s.totalPaid, 0),
            sumRemaining: rows.reduce((a, s) => a + s.remaining, 0),
            financialLabel: "PAYMENT_TRACKED_BALANCE",
            paymentStatusTracked: true,
          },
          metadata: meta("PARTIAL", ["Payments recorded on the device but not yet uploaded are not included."]),
        };
      }
    }
    const { slice, pagination } = page(rows, params);
    return { success: true, operation, requestId, data: { items: slice, totalMatching: rows.length }, pagination, metadata: meta("PARTIAL") };
  }

  function authorized(req) {
    const h = req.headers.authorization || "";
    const presented = Buffer.from(h.startsWith("Bearer ") ? h.slice(7) : "");
    return presented.length === tokenBuf.length && timingSafeEqual(presented, tokenBuf);
  }

  const server = http.createServer((req, res) => {
    let raw = "";
    let tooLarge = false;
    req.on("data", (c) => {
      raw += c;
      if (raw.length > 64 * 1024) tooLarge = true;
    });
    req.on("end", async () => {
      const send = (status, obj) => {
        res.writeHead(status, { "Content-Type": "application/json" });
        res.end(JSON.stringify(obj));
      };
      try {
        if (req.method === "GET" && req.url === "/v1/health") {
          const ok = await health();
          return send(ok ? 200 : 503, { status: ok ? "ok" : "unavailable", mode: "CLOUD_DEV_EMULATOR", projectId });
        }
        if (!authorized(req)) return send(401, { success: false, error: { code: "UNAUTHORIZED", message: "invalid connector token" } });
        if (tooLarge) return send(413, { success: false, error: { code: "PAYLOAD_TOO_LARGE" } });
        if (req.method === "GET" && req.url === "/v1/tools") {
          // Never advertise business tools whose backend cannot execute them.
          if (!(await health())) return send(503, { success: false, error: { code: "CLOUD_UNAVAILABLE", message: "Firebase emulator not reachable", retryable: true } });
          return send(200, { tools: tools() });
        }
        if (req.method === "POST" && req.url === "/v1/execute") {
          let body;
          try {
            body = JSON.parse(raw);
          } catch {
            return send(400, { success: false, error: { code: "INVALID_REQUEST", message: "body is not JSON" } });
          }
          if (body && typeof body === "object" && ("userUid" in body || "userUid" in (body.parameters || {}))) {
            return send(200, failure(body.operation, body.requestId, "INVALID_ARGUMENT", "userUid must not be supplied; identity comes from the signed-in session"));
          }
          const params = body?.parameters && typeof body.parameters === "object" && !Array.isArray(body.parameters) ? body.parameters : {};
          return send(200, await execute(String(body?.operation || ""), params, body?.requestId || null));
        }
        send(404, { success: false, error: { code: "NOT_FOUND" } });
      } catch (err) {
        send(503, { success: false, error: { code: "CLOUD_UNAVAILABLE", message: err.message, retryable: true }, data: null });
      }
    });
  });

  return {
    token,
    execute,
    listen: (port = 0) => new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve(server.address().port))),
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}
