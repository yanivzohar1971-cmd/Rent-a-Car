// AGENT-127: byte-compatible mirror of app RelayPairingCrypto.kt (see that file for the scheme).
import { createHash, createCipheriv, createDecipheriv, pbkdf2Sync, randomBytes } from "node:crypto";

export const PBKDF2_ITERATIONS = 210000;
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export function normalize(code) {
  return String(code).toUpperCase().replace(/[-\s]/g, "").replace(/O/g, "0").replace(/[IL]/g, "1");
}

export function isWellFormed(code) {
  const c = normalize(code);
  return c.length === 10 && [...c].every((ch) => ALPHABET.includes(ch));
}

export function codeId(code) {
  return createHash("sha256").update(`rentacar-pair-id:${normalize(code)}`, "utf8").digest("hex").slice(0, 32);
}

function key(code, salt) {
  return pbkdf2Sync(Buffer.from(normalize(code), "utf8"), salt, PBKDF2_ITERATIONS, 32, "sha256");
}

export function seal(code, deviceId, plaintext, { salt = randomBytes(16), iv = randomBytes(12), now = Date.now() } = {}) {
  const c = createCipheriv("aes-256-gcm", key(code, salt), iv);
  c.setAAD(Buffer.from(deviceId, "utf8"));
  const ct = Buffer.concat([c.update(plaintext, "utf8"), c.final(), c.getAuthTag()]);
  return {
    codeId: codeId(code),
    deviceId,
    saltB64: salt.toString("base64"),
    ivB64: iv.toString("base64"),
    ciphertextB64: ct.toString("base64"),
    expiresAtEpochMs: now + 5 * 60 * 1000,
  };
}

/** Throws on wrong code / tampering (GCM authentication). */
export function open(code, offer) {
  const ct = Buffer.from(offer.ciphertextB64, "base64");
  const d = createDecipheriv("aes-256-gcm", key(code, Buffer.from(offer.saltB64, "base64")), Buffer.from(offer.ivB64, "base64"));
  d.setAAD(Buffer.from(offer.deviceId, "utf8"));
  d.setAuthTag(ct.subarray(ct.length - 16));
  return Buffer.concat([d.update(ct.subarray(0, ct.length - 16)), d.final()]).toString("utf8");
}
