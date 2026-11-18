// AGENT-128: Rent a Car Agent relay (development implementation).
//
// The phone never accepts inbound connections. It long-polls this relay over TLS and answers the
// requests queued for it. MCP clients talk to the relay with the SAME contract as any gateway:
//   GET  /d/{deviceId}/v1/health      (200 only while the device polled recently)
//   GET  /d/{deviceId}/v1/tools       -> forwarded to the device
//   POST /d/{deviceId}/v1/execute     -> forwarded to the device
// The relay is a router: it never validates or issues device access tokens (the phone does), never
// sees a pairing token in clear text (offers are AES-GCM sealed under the one-time code), and keeps
// nothing on disk. Requests are never re-delivered once handed to the device (no business retries).
//
// Device side (credential: `Authorization: Device <deviceId>.<secret>`, secret bound at first register):
//   POST /device/register | /device/poll (long-poll) | /device/respond | /device/pairing-offer
// Pairing redemption (rate-limited, single use, 5 min TTL):
//   POST /pair/redeem {codeId} -> sealed offer (client decrypts locally with the code)

import https from "node:https";
import http from "node:http";
import { createHash, randomUUID, timingSafeEqual } from "node:crypto";

const DEVICE_ID_RE = /^[A-Za-z0-9-]{8,64}$/;
const sha256 = (s) => createHash("sha256").update(s).digest();

export function createRelay({
  tls = null, // { key, cert } — required unless allowInsecureHttpForTests
  allowInsecureHttpForTests = false,
  pollWaitMs = 25000,
  requestTimeoutMs = 20000,
  onlineWindowMs = 35000,
  maxQueue = 50,
  maxBodyBytes = 256 * 1024,
  now = () => Date.now(),
  log = () => {},
} = {}) {
  if (!tls && !allowInsecureHttpForTests) throw new Error("relay requires TLS");
  const devices = new Map(); // deviceId -> { secretHash, lastPollAt, queue: [], waiters: [], pending: Map }
  const offers = new Map(); // codeId -> offer
  const redeemHits = new Map(); // ip -> [timestamps]

  function device(id) {
    let d = devices.get(id);
    if (!d) {
      d = { secretHash: null, lastPollAt: 0, queue: [], waiters: [], pending: new Map() };
      devices.set(id, d);
    }
    return d;
  }

  function deviceAuth(req) {
    const h = req.headers.authorization || "";
    const m = /^Device ([A-Za-z0-9-]{8,64})\.([A-Za-z0-9]{32,128})$/.exec(h);
    if (!m) return null;
    return { id: m[1], secretHash: sha256(m[2]) };
  }

  function online(d) {
    return d && now() - d.lastPollAt <= onlineWindowMs;
  }

  function deliver(d) {
    while (d.waiters.length && d.queue.length) {
      const w = d.waiters.shift();
      const batch = d.queue.splice(0, d.queue.length);
      for (const item of batch) item.deliveredAt = now();
      w(batch);
    }
  }

  /** Queues a request for the device and resolves with { status, body } or a relay error. */
  function forward(deviceId, kind, authorization, body) {
    const d = devices.get(deviceId);
    if (!d || !d.secretHash || !online(d)) {
      return Promise.resolve({ status: 503, body: { success: false, data: null, error: { code: "DEVICE_UNAVAILABLE", message: "The phone is not connected to the relay", retryable: true, maybeDelivered: false } } });
    }
    if (d.queue.length >= maxQueue) {
      return Promise.resolve({ status: 503, body: { success: false, data: null, error: { code: "DEVICE_BUSY", message: "Too many pending requests", retryable: true, maybeDelivered: false } } });
    }
    return new Promise((resolve) => {
      const relayId = randomUUID();
      const item = { relayId, kind, authorization: authorization || null, body: body ?? null, enqueuedAt: now(), deliveredAt: null };
      const timer = setTimeout(() => {
        d.pending.delete(relayId);
        const idx = d.queue.indexOf(item);
        if (idx >= 0) d.queue.splice(idx, 1); // never delivered: safe to drop
        resolve({
          status: 504,
          body: { success: false, data: null, error: { code: "DEVICE_TIMEOUT", message: "The phone did not answer in time", retryable: false, maybeDelivered: item.deliveredAt != null } },
        });
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

  function rateLimited(ip) {
    const t = now();
    const hits = (redeemHits.get(ip) || []).filter((x) => t - x < 60000);
    hits.push(t);
    redeemHits.set(ip, hits);
    return hits.length > 10;
  }

  async function handler(req, res) {
    const send = (status, obj) => {
      res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      res.end(obj === undefined ? "" : JSON.stringify(obj));
    };
    try {
      const url = new URL(req.url, "https://relay.local");
      const path = url.pathname;

      // ---------------- client (MCP) side ----------------
      const m = /^\/d\/([A-Za-z0-9-]{8,64})\/v1\/(health|tools|execute)$/.exec(path);
      if (m) {
        const [, deviceId, op] = m;
        if (op === "health" && req.method === "GET") {
          const d = devices.get(deviceId);
          const ok = online(d);
          return send(ok ? 200 : 503, { status: ok ? "ok" : "device_offline", mode: "RELAY", deviceLastSeenMs: d?.lastPollAt || null });
        }
        if (op === "tools" && req.method === "GET") {
          const r = await forward(deviceId, "tools", req.headers.authorization, null);
          return send(r.status, r.body);
        }
        if (op === "execute" && req.method === "POST") {
          const body = await readBody(req);
          const r = await forward(deviceId, "execute", req.headers.authorization, body);
          return send(r.status, r.body);
        }
        return send(405, { error: { code: "METHOD_NOT_ALLOWED" } });
      }

      if (path === "/pair/redeem" && req.method === "POST") {
        if (rateLimited(req.socket.remoteAddress || "?")) return send(429, { error: { code: "RATE_LIMITED" } });
        let body;
        try {
          body = JSON.parse(await readBody(req));
        } catch {
          return send(400, { error: { code: "INVALID_REQUEST" } });
        }
        const offer = typeof body?.codeId === "string" ? offers.get(body.codeId) : null;
        if (!offer || offer.expiresAtEpochMs < now()) {
          if (offer) offers.delete(body.codeId);
          return send(404, { error: { code: "PAIRING_CODE_NOT_FOUND" } });
        }
        offers.delete(body.codeId); // single use
        return send(200, offer);
      }

      // ---------------- device side ----------------
      if (path.startsWith("/device/") && req.method === "POST") {
        const auth = deviceAuth(req);
        if (!auth) return send(401, { error: { code: "UNAUTHORIZED" } });
        const d = device(auth.id);
        if (path === "/device/register") {
          await readBody(req);
          if (!d.secretHash) d.secretHash = auth.secretHash;
          else if (!timingSafeEqual(d.secretHash, auth.secretHash)) return send(401, { error: { code: "UNAUTHORIZED" } });
          d.lastPollAt = now();
          log(`device registered ${auth.id.slice(0, 8)}…`);
          return send(200, { ok: true });
        }
        if (!d.secretHash || !timingSafeEqual(d.secretHash, auth.secretHash)) return send(401, { error: { code: "UNAUTHORIZED" } });

        if (path === "/device/poll") {
          await readBody(req);
          d.lastPollAt = now();
          if (d.queue.length) {
            const batch = d.queue.splice(0, d.queue.length);
            for (const item of batch) item.deliveredAt = now();
            return send(200, { requests: batch.map(({ relayId, kind, authorization, body }) => ({ relayId, kind, authorization, body })) });
          }
          let settled = false;
          const waiter = (batch) => {
            if (settled) return;
            settled = true;
            clearTimeout(t);
            send(200, { requests: batch.map(({ relayId, kind, authorization, body }) => ({ relayId, kind, authorization, body })) });
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
          let body;
          try {
            body = JSON.parse(await readBody(req));
          } catch {
            return send(400, { error: { code: "INVALID_REQUEST" } });
          }
          const done = d.pending.get(body?.relayId);
          if (!done) return send(404, { error: { code: "UNKNOWN_RELAY_ID" } });
          d.pending.delete(body.relayId);
          let parsed;
          try {
            parsed = JSON.parse(body.body);
          } catch {
            parsed = { success: false, error: { code: "INVALID_DEVICE_RESPONSE" } };
          }
          const status = Number.isInteger(body.status) && body.status >= 200 && body.status < 600 ? body.status : 502;
          done({ status, body: parsed });
          return send(200, { ok: true });
        }
        if (path === "/device/pairing-offer") {
          let offer;
          try {
            offer = JSON.parse(await readBody(req));
          } catch {
            return send(400, { error: { code: "INVALID_REQUEST" } });
          }
          const fields = ["codeId", "deviceId", "saltB64", "ivB64", "ciphertextB64", "expiresAtEpochMs"];
          if (!fields.every((f) => offer?.[f] != null) || offer.deviceId !== auth.id || !/^[0-9a-f]{32}$/.test(offer.codeId)) {
            return send(400, { error: { code: "INVALID_OFFER" } });
          }
          offers.set(offer.codeId, {
            ...Object.fromEntries(fields.map((f) => [f, offer[f]])),
            expiresAtEpochMs: Math.min(Number(offer.expiresAtEpochMs), now() + 5 * 60 * 1000),
          });
          return send(200, { ok: true });
        }
      }
      send(404, { error: { code: "NOT_FOUND" } });
    } catch (err) {
      if (!res.headersSent) send(err.status || 500, { error: { code: err.status === 413 ? "PAYLOAD_TOO_LARGE" : "RELAY_ERROR" } });
    }
  }

  const server = tls ? https.createServer({ key: tls.key, cert: tls.cert, minVersion: "TLSv1.2" }, handler) : http.createServer(handler);
  return {
    server,
    listen: (port = 0, host = "127.0.0.1") => new Promise((r) => server.listen(port, host, () => r(server.address().port))),
    close: () =>
      new Promise((r) => {
        server.closeAllConnections?.();
        server.close(() => r());
      }),
    _state: { devices, offers },
  };
}
