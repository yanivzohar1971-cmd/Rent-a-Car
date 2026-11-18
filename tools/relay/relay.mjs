// AGENT-128/138: Rent a Car Agent relay.
//
// Trust model
//  - The phone never accepts inbound connections; it long-polls this relay over TLS.
//  - Every request body is END-TO-END sealed between the paired MCP client and the phone
//    (AES-256-GCM under a channel key the relay never receives). The relay sees only routing
//    metadata: deviceId, clientId, msgId (correlation id), sizes, timing, status codes.
//  - The device access token travels inside the ciphertext; the relay validates nothing business-
//    related and holds no database credentials. The phone authorizes every request itself.
//  - The relay does enforce transport-level access: a device credential (first-register binds the
//    secret hash) and per-device client credentials (hashes only), activated when the client
//    redeems a pairing offer; the phone re-announces its active clients at every registration and
//    removes revoked ones.
//
// Client (MCP) API — header `Authorization: Client <clientId>.<secret>`
//   GET  /d/{deviceId}/v1/health   200 while the device polled recently, else 503
//   POST /d/{deviceId}/v1/sealed   { v, clientId, msgId, ivB64, ctB64 } -> sealed reply from the phone
// Device API — header `Authorization: Device <deviceId>.<secret>`
//   POST /device/register {clients:[{clientId,secretHash}]} | /device/poll | /device/respond
//   POST /device/pairing-offer | /device/clients/remove | /device/rotate {newSecret}
// Pairing:  POST /pair/redeem {codeId}   (single use, 5 min, rate-limited per IP)
// Ops:      GET /healthz   (no device or client information)

import https from "node:https";
import http from "node:http";
import { createHash, randomUUID, timingSafeEqual } from "node:crypto";

const ID_RE = "[A-Za-z0-9-]{8,64}";
const SECRET_RE = "[A-Za-z0-9]{32,128}";
const sha256 = (s) => createHash("sha256").update(s).digest();
const short = (id) => (id ? String(id).slice(0, 8) : null);

export function createRelay({
  tls = null, // { key, cert } — required unless behindProxy or allowInsecureHttpForTests
  behindProxy = false, // TLS terminated by a reverse proxy on the same host; listen on loopback only
  allowInsecureHttpForTests = false,
  pollWaitMs = 25000,
  requestTimeoutMs = 20000,
  onlineWindowMs = 35000,
  maxQueuePerDevice = 50,
  maxBodyBytes = 64 * 1024,
  maxDevices = 1000,
  maxClientsPerDevice = 20,
  clientRatePerMinute = 120,
  maxConnections = 500,
  now = () => Date.now(),
  audit = () => {}, // receives non-sensitive event objects
} = {}) {
  if (!tls && !behindProxy && !allowInsecureHttpForTests) throw new Error("relay requires TLS (or behindProxy)");
  const devices = new Map(); // deviceId -> { secretHash, lastPollAt, queue, waiters, pending, clients: Map(clientId -> {secretHash}) }
  const offers = new Map(); // codeId -> { offer, clientId, clientSecretHash }
  const ipHits = new Map(); // ip -> timestamps (redeem)
  const clientHits = new Map(); // deviceId|clientId -> timestamps
  let draining = false;

  const ev = (event, fields = {}) => audit({ ts: new Date(now()).toISOString(), event, ...fields });

  function getDevice(id, create = false) {
    let d = devices.get(id);
    if (!d && create) {
      if (devices.size >= maxDevices) return null;
      d = { secretHash: null, lastPollAt: 0, queue: [], waiters: [], pending: new Map(), clients: new Map() };
      devices.set(id, d);
    }
    return d;
  }

  function parseAuth(req, scheme) {
    const m = new RegExp(`^${scheme} (${ID_RE})\\.(${SECRET_RE})$`).exec(req.headers.authorization || "");
    return m ? { id: m[1], secretHash: sha256(m[2]) } : null;
  }

  const sameHash = (a, b) => a && b && a.length === b.length && timingSafeEqual(a, b);
  const online = (d) => !!d && now() - d.lastPollAt <= onlineWindowMs;

  function limited(map, key, perMinute) {
    const t = now();
    const hits = (map.get(key) || []).filter((x) => t - x < 60000);
    hits.push(t);
    map.set(key, hits);
    return hits.length > perMinute;
  }

  function deliver(d) {
    while (d.waiters.length && d.queue.length) {
      const w = d.waiters.shift();
      const batch = d.queue.splice(0, d.queue.length);
      for (const item of batch) item.deliveredAt = now();
      w(batch);
    }
  }

  const relayError = (status, code, message, extra = {}) => ({ status, body: { success: false, data: null, error: { code, message, ...extra } } });

  function forward(deviceId, d, clientId, msgId, body) {
    if (!online(d)) return Promise.resolve(relayError(503, "DEVICE_UNAVAILABLE", "The phone is not connected to the relay", { retryable: true, maybeDelivered: false }));
    if (d.queue.length >= maxQueuePerDevice) return Promise.resolve(relayError(503, "DEVICE_BUSY", "Too many pending requests", { retryable: true, maybeDelivered: false }));
    return new Promise((resolve) => {
      const relayId = randomUUID();
      const item = { relayId, clientId, msgId, body, enqueuedAt: now(), deliveredAt: null };
      const timer = setTimeout(() => {
        d.pending.delete(relayId);
        const idx = d.queue.indexOf(item);
        if (idx >= 0) d.queue.splice(idx, 1); // never delivered: dropped, never re-sent later
        ev("request_timeout", { device: short(deviceId), client: short(clientId), correlationId: msgId, delivered: item.deliveredAt != null });
        resolve(relayError(504, "DEVICE_TIMEOUT", "The phone did not answer in time", { retryable: false, maybeDelivered: item.deliveredAt != null }));
      }, requestTimeoutMs);
      d.pending.set(relayId, (reply) => {
        clearTimeout(timer);
        resolve(reply);
      });
      d.queue.push(item);
      deliver(d);
    });
  }

  function readBody(req) {
    return new Promise((resolve, reject) => {
      let size = 0;
      const chunks = [];
      req.on("data", (c) => {
        size += c.length;
        if (size > maxBodyBytes) {
          reject(Object.assign(new Error("too large"), { status: 413 }));
          req.destroy();
        } else chunks.push(c);
      });
      req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
      req.on("error", reject);
    });
  }

  async function readJson(req) {
    try {
      const t = await readBody(req);
      return t ? JSON.parse(t) : {};
    } catch (e) {
      if (e.status === 413) throw e;
      throw Object.assign(new Error("bad json"), { status: 400 });
    }
  }

  async function handler(req, res) {
    const send = (status, obj) => {
      if (res.headersSent) return;
      res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
      res.end(obj === undefined ? "" : JSON.stringify(obj));
    };
    const ip = req.socket.remoteAddress || "?";
    try {
      if (draining) return send(503, { error: { code: "RELAY_SHUTTING_DOWN" } });
      const path = new URL(req.url, "https://relay.local").pathname;

      if (path === "/healthz" && req.method === "GET") return send(200, { status: "ok", devicesOnline: [...devices.values()].filter(online).length });

      // ---------------- client (MCP) side ----------------
      const m = new RegExp(`^/d/(${ID_RE})/v1/(health|sealed)$`).exec(path);
      if (m) {
        const [, deviceId, op] = m;
        const auth = parseAuth(req, "Client");
        const d = getDevice(deviceId);
        const c = auth && d?.clients.get(auth.id);
        if (!auth || !c || !sameHash(c.secretHash, auth.secretHash)) {
          ev("client_denied", { device: short(deviceId), client: short(auth?.id), ip });
          return send(401, { success: false, data: null, error: { code: "UNAUTHORIZED_CLIENT" } });
        }
        if (limited(clientHits, `${deviceId}|${auth.id}`, clientRatePerMinute)) {
          ev("client_rate_limited", { device: short(deviceId), client: short(auth.id) });
          return send(429, { success: false, data: null, error: { code: "RATE_LIMITED", retryable: true } });
        }
        if (op === "health" && req.method === "GET") {
          const ok = online(d);
          return send(ok ? 200 : 503, { status: ok ? "ok" : "device_offline", mode: "RELAY_E2E" });
        }
        if (op === "sealed" && req.method === "POST") {
          const env = await readJson(req);
          if (env?.v !== 1 || env.clientId !== auth.id || typeof env.msgId !== "string" || !new RegExp(`^${ID_RE}$`).test(env.msgId) ||
              typeof env.ivB64 !== "string" || typeof env.ctB64 !== "string") {
            return send(400, { success: false, data: null, error: { code: "INVALID_ENVELOPE" } });
          }
          const started = now();
          const r = await forward(deviceId, d, auth.id, env.msgId, JSON.stringify({ v: 1, clientId: env.clientId, msgId: env.msgId, ivB64: env.ivB64, ctB64: env.ctB64 }));
          ev("request", { device: short(deviceId), client: short(auth.id), correlationId: env.msgId, status: r.status, ms: now() - started });
          return send(r.status, r.body);
        }
        return send(405, { error: { code: "METHOD_NOT_ALLOWED" } });
      }

      if (path === "/pair/redeem" && req.method === "POST") {
        if (limited(ipHits, ip, 10)) {
          ev("redeem_rate_limited", { ip });
          return send(429, { error: { code: "RATE_LIMITED" } });
        }
        const body = await readJson(req);
        const entry = typeof body?.codeId === "string" ? offers.get(body.codeId) : null;
        if (!entry || entry.offer.expiresAtEpochMs < now()) {
          if (entry) offers.delete(body.codeId);
          ev("redeem_failed", { ip });
          return send(404, { error: { code: "PAIRING_CODE_NOT_FOUND" } });
        }
        offers.delete(body.codeId); // single use
        const d = getDevice(entry.offer.deviceId);
        if (d && d.clients.size < maxClientsPerDevice) d.clients.set(entry.clientId, { secretHash: Buffer.from(entry.clientSecretHash, "hex") });
        ev("client_paired", { device: short(entry.offer.deviceId), client: short(entry.clientId) });
        return send(200, entry.offer);
      }

      // ---------------- device side ----------------
      if (path.startsWith("/device/") && req.method === "POST") {
        const auth = parseAuth(req, "Device");
        if (!auth) return send(401, { error: { code: "UNAUTHORIZED" } });
        const d = getDevice(auth.id, path === "/device/register");
        if (!d) return send(path === "/device/register" ? 503 : 401, { error: { code: path === "/device/register" ? "RELAY_FULL" : "UNAUTHORIZED" } });
        if (path === "/device/register") {
          const body = await readJson(req);
          if (!d.secretHash) d.secretHash = auth.secretHash;
          else if (!sameHash(d.secretHash, auth.secretHash)) {
            ev("device_denied", { device: short(auth.id), ip });
            return send(401, { error: { code: "UNAUTHORIZED" } });
          }
          // The phone is authoritative for which clients are active (revocations, relay restarts).
          if (Array.isArray(body?.clients)) {
            const next = new Map();
            for (const c of body.clients.slice(0, maxClientsPerDevice)) {
              if (typeof c?.clientId === "string" && new RegExp(`^${ID_RE}$`).test(c.clientId) && /^[0-9a-f]{64}$/.test(c.secretHash || "")) {
                next.set(c.clientId, { secretHash: Buffer.from(c.secretHash, "hex") });
              }
            }
            d.clients = next;
          }
          d.lastPollAt = now();
          ev("device_registered", { device: short(auth.id), clients: d.clients.size });
          return send(200, { ok: true });
        }
        if (!sameHash(d.secretHash, auth.secretHash)) {
          ev("device_denied", { device: short(auth.id), ip });
          return send(401, { error: { code: "UNAUTHORIZED" } });
        }

        if (path === "/device/poll") {
          await readBody(req);
          d.lastPollAt = now();
          const shape = (batch) => ({ requests: batch.map(({ relayId, clientId, body }) => ({ relayId, kind: "sealed", clientId, body })) });
          if (d.queue.length) {
            const batch = d.queue.splice(0, d.queue.length);
            for (const item of batch) item.deliveredAt = now();
            return send(200, shape(batch));
          }
          let settled = false;
          const waiter = (batch) => {
            if (settled) return;
            settled = true;
            clearTimeout(t);
            send(200, shape(batch));
          };
          const t = setTimeout(() => {
            if (settled) return;
            settled = true;
            d.waiters = d.waiters.filter((w) => w !== waiter);
            d.lastPollAt = now();
            res.writeHead(204);
            res.end();
          }, pollWaitMs);
          req.on("close", () => {
            if (!settled) {
              settled = true;
              clearTimeout(t);
              d.waiters = d.waiters.filter((w) => w !== waiter);
            }
          });
          d.waiters.push(waiter);
          return;
        }
        if (path === "/device/respond") {
          const body = await readJson(req);
          const done = d.pending.get(body?.relayId);
          if (!done) return send(404, { error: { code: "UNKNOWN_RELAY_ID" } });
          d.pending.delete(body.relayId);
          let parsed;
          try {
            parsed = JSON.parse(body.body);
          } catch {
            parsed = { success: false, data: null, error: { code: "INVALID_DEVICE_RESPONSE" } };
          }
          const status = Number.isInteger(body.status) && body.status >= 200 && body.status < 600 ? body.status : 502;
          done({ status, body: parsed });
          return send(200, { ok: true });
        }
        if (path === "/device/pairing-offer") {
          const o = await readJson(req);
          const fields = ["codeId", "deviceId", "saltB64", "ivB64", "ciphertextB64", "expiresAtEpochMs"];
          if (!fields.every((f) => o?.[f] != null) || o.deviceId !== auth.id || !/^[0-9a-f]{32}$/.test(o.codeId) ||
              typeof o.clientId !== "string" || !new RegExp(`^${ID_RE}$`).test(o.clientId) || !/^[0-9a-f]{64}$/.test(o.clientSecretHash || "")) {
            return send(400, { error: { code: "INVALID_OFFER" } });
          }
          offers.set(o.codeId, {
            offer: { ...Object.fromEntries(fields.map((f) => [f, o[f]])), expiresAtEpochMs: Math.min(Number(o.expiresAtEpochMs), now() + 5 * 60 * 1000) },
            clientId: o.clientId,
            clientSecretHash: o.clientSecretHash,
          });
          ev("pairing_offer", { device: short(auth.id), client: short(o.clientId) });
          return send(200, { ok: true });
        }
        if (path === "/device/clients/remove") {
          const body = await readJson(req);
          const removed = d.clients.delete(body?.clientId);
          ev("client_removed", { device: short(auth.id), client: short(body?.clientId), removed });
          return send(200, { ok: true, removed });
        }
        if (path === "/device/rotate") {
          const body = await readJson(req);
          if (typeof body?.newSecret !== "string" || !new RegExp(`^${SECRET_RE}$`).test(body.newSecret)) return send(400, { error: { code: "INVALID_SECRET" } });
          d.secretHash = sha256(body.newSecret);
          ev("device_secret_rotated", { device: short(auth.id) });
          return send(200, { ok: true });
        }
      }
      send(404, { error: { code: "NOT_FOUND" } });
    } catch (err) {
      const status = err.status || 500;
      send(status, { error: { code: status === 413 ? "PAYLOAD_TOO_LARGE" : status === 400 ? "INVALID_REQUEST" : "RELAY_ERROR" } });
    }
  }

  const server = tls
    ? https.createServer({ key: tls.key, cert: tls.cert, minVersion: "TLSv1.2" }, handler)
    : http.createServer(handler);
  server.maxConnections = maxConnections;
  server.headersTimeout = 10000;
  server.requestTimeout = pollWaitMs + 15000;
  server.keepAliveTimeout = 5000;

  // Stale-state cleanup: expired offers, old rate-limit windows, devices silent for 7 days.
  const sweeper = setInterval(() => {
    const t = now();
    for (const [k, e] of offers) if (e.offer.expiresAtEpochMs < t) offers.delete(k);
    for (const map of [ipHits, clientHits]) for (const [k, v] of map) if (!v.some((x) => t - x < 60000)) map.delete(k);
    for (const [k, d] of devices) if (!d.pending.size && t - d.lastPollAt > 7 * 24 * 3600 * 1000) devices.delete(k);
  }, 60000);
  sweeper.unref();

  async function close() {
    draining = true;
    clearInterval(sweeper);
    for (const d of devices.values()) {
      for (const done of d.pending.values()) done(relayError(503, "RELAY_SHUTTING_DOWN", "Relay is restarting", { retryable: true }));
      d.pending.clear();
    }
    await new Promise((r) => {
      server.closeAllConnections?.();
      server.close(() => r());
    });
  }

  return {
    server,
    listen: (port = 0, host = "127.0.0.1") => {
      if (behindProxy && !["127.0.0.1", "::1"].includes(host)) throw new Error("behindProxy relay must listen on loopback only");
      return new Promise((r) => server.listen(port, host, () => r(server.address().port)));
    },
    close,
    _state: { devices, offers },
  };
}
