// AGENT-138: MCP-client side of the end-to-end channel. Byte-compatible with RelayE2E.kt.
import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from "node:crypto";

export const aad = (dir, deviceId, clientId, msgId) => Buffer.from(`rac-e2e-v1|${dir}|${deviceId}|${clientId}|${msgId}`, "utf8");

export function seal(key, aadBuf, plaintext, iv = randomBytes(12)) {
  const c = createCipheriv("aes-256-gcm", key, iv);
  c.setAAD(aadBuf);
  const ct = Buffer.concat([c.update(plaintext, "utf8"), c.final(), c.getAuthTag()]);
  return { ivB64: iv.toString("base64"), ctB64: ct.toString("base64") };
}

export function open(key, aadBuf, ivB64, ctB64) {
  const ct = Buffer.from(ctB64, "base64");
  const d = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
  d.setAAD(aadBuf);
  d.setAuthTag(ct.subarray(ct.length - 16));
  return Buffer.concat([d.update(ct.subarray(0, ct.length - 16)), d.final()]).toString("utf8");
}

/**
 * A fetch() replacement for the standard MCP host that turns gateway calls
 * (GET /v1/health, GET /v1/tools, POST /v1/execute against `<relay>/d/<deviceId>`) into sealed relay
 * requests. The device access token travels INSIDE the ciphertext, never in a relay-visible header.
 * The relay only sees: deviceId, clientId, msgId, sizes, timing.
 */
export function createSealedFetch({ relay, deviceId, clientId, clientSecret, channelKeyB64, ttlMs = 60000, baseFetch = globalThis.fetch }) {
  const key = Buffer.from(channelKeyB64, "base64");
  const clientAuth = `Client ${clientId}.${clientSecret}`;
  const base = `${relay.replace(/\/+$/, "")}/d/${deviceId}`;
  return async function sealedFetch(url, init = {}) {
    const path = new URL(url).pathname.replace(/^.*\/d\/[^/]+/, "");
    if (path === "/v1/health") {
      return baseFetch(`${base}/v1/health`, { method: "GET", headers: { Authorization: clientAuth }, signal: init.signal });
    }
    const kind = path === "/v1/tools" ? "tools" : path === "/v1/execute" ? "execute" : null;
    if (!kind) return new Response(JSON.stringify({ success: false, error: { code: "NOT_FOUND" } }), { status: 404 });
    const authz = (init.headers?.Authorization || init.headers?.authorization || "").replace(/^Bearer\s+/, "");
    const msgId = randomUUID();
    const now = Date.now();
    const inner = JSON.stringify({ kind, token: authz || null, body: kind === "execute" ? init.body ?? null : null, issuedAt: now, expiresAt: now + ttlMs });
    const { ivB64, ctB64 } = seal(key, aad("c2d", deviceId, clientId, msgId), inner);
    const r = await baseFetch(`${base}/v1/sealed`, {
      method: "POST",
      headers: { Authorization: clientAuth, "Content-Type": "application/json", "X-Correlation-Id": msgId },
      body: JSON.stringify({ v: 1, clientId, msgId, ivB64, ctB64 }),
      signal: init.signal,
    });
    const text = await r.text();
    let wire;
    try {
      wire = JSON.parse(text);
    } catch {
      return new Response(JSON.stringify({ success: false, error: { code: "RELAY_ERROR" } }), { status: 502 });
    }
    if (wire && wire.ctB64 && wire.msgId === msgId) {
      let payload;
      try {
        payload = JSON.parse(open(key, aad("d2c", deviceId, clientId, msgId), wire.ivB64, wire.ctB64));
      } catch {
        return new Response(JSON.stringify({ success: false, error: { code: "E2E_AUTH_FAILED", message: "device reply failed authentication" } }), { status: 502 });
      }
      return new Response(payload.body, { status: payload.status, headers: { "Content-Type": "application/json" } });
    }
    // Unsealed relay/device error (no business data by construction).
    return new Response(text, { status: r.status, headers: { "Content-Type": "application/json" } });
  };
}
