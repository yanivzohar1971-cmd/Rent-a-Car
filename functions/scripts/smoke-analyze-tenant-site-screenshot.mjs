/**
 * Smoke-test analyzeTenantSiteScreenshot (Claude vision) with 3 synthetic PNGs.
 *
 * Prerequisites:
 *   - Admin user: TEST_ADMIN_UID (Firebase Auth uid) must be admin (claim or config/admins).
 *   - Auth to mint ID token EITHER:
 *       FIREBASE_ID_TOKEN (paste from browser DevTools → Network → callable request header)
 *     OR Application Default Credentials + FIREBASE_WEB_API_KEY:
 *       GOOGLE_APPLICATION_CREDENTIALS=path/to/serviceAccount.json (same project)
 *       FIREBASE_WEB_API_KEY=... (Web API key from Firebase console; optional if --read-web-api-key)
 *
 * Usage (from repo root or functions/):
 *   npm --prefix functions run smoke:analyze-screenshot
 *
 * Manual UI checks (builder):
 *   1) Clean hero homepage screenshot → preview colors/title shift meaningfully, Apply persists.
 *   2) Multi-section screenshot → homeSections order in preview updates, Apply persists.
 *   3) Noisy/text-heavy → still get payload or graceful empty; warnings in diagnostics.
 *   4) Revoke admin / break network → panel falls back to "local heuristics" (console.warn).
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import zlib from "zlib";
import admin from "firebase-admin";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const REGION = "us-central1";
const PROJECT_ID = "carexpert-94faa";
const CALLABLE = "analyzeTenantSiteScreenshot";

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let j = 0; j < 8; j++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typebuf = Buffer.from(type, "ascii");
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typebuf, data])), 0);
  return Buffer.concat([len, typebuf, data, crcBuf]);
}

/** RGB8, filter type 0 per scanline */
function encodePngRgb(width, height, rgbAt) {
  const raw = [];
  for (let y = 0; y < height; y++) {
    raw.push(0);
    for (let x = 0; x < width; x++) {
      const [r, g, b] = rgbAt(x, y);
      raw.push(r & 255, g & 255, b & 255);
    }
  }
  const zlibbed = zlib.deflateSync(Buffer.from(raw), { level: 6 });
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.writeUInt8(8, 8);
  ihdr.writeUInt8(2, 9);
  ihdr.writeUInt8(0, 10);
  ihdr.writeUInt8(0, 11);
  ihdr.writeUInt8(0, 12);
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    sig,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", zlibbed),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function caseCleanHero() {
  const w = 120;
  const h = 80;
  return encodePngRgb(w, h, (x, y) => {
    if (y < 28) return [30, 64, 175];
    return [245, 248, 252];
  });
}

function caseMultiSection() {
  const w = 120;
  const h = 100;
  const bands = [
    [220, 38, 38],
    [234, 179, 8],
    [34, 197, 94],
    [59, 130, 246],
    [168, 85, 247],
  ];
  return encodePngRgb(w, h, (_x, y) => {
    const i = Math.min(bands.length - 1, Math.floor((y / h) * bands.length));
    return bands[i];
  });
}

function caseNoisyTextHeavy() {
  const w = 140;
  const h = 90;
  let seed = 42;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed;
  };
  return encodePngRgb(w, h, () => {
    const g = rnd() % 200;
    return [g, (rnd() % 220) + 20, rnd() % 180];
  });
}

function readWebApiKeyFromRepo() {
  const p = path.join(__dirname, "..", "..", "web", "src", "firebase", "firebaseClient.ts");
  const s = fs.readFileSync(p, "utf8");
  const m = /apiKey:\s*"([^"]+)"/.exec(s);
  if (!m) throw new Error(`Could not parse apiKey from ${p}`);
  return m[1];
}

async function mintIdTokenFromCustomToken(webApiKey, uid) {
  const customToken = await admin.auth().createCustomToken(uid);
  const r = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${encodeURIComponent(webApiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: customToken, returnSecureToken: true }),
    }
  );
  const j = await r.json();
  if (!j.idToken) {
    throw new Error(`signInWithCustomToken failed: ${JSON.stringify(j)}`);
  }
  return j.idToken;
}

async function callAnalyze(idToken, imageBase64, mimeType, label) {
  const url = `https://${REGION}-${PROJECT_ID}.cloudfunctions.net/${CALLABLE}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ data: { imageBase64, mimeType } }),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`${label}: non-JSON response (${res.status}): ${text.slice(0, 500)}`);
  }
  if (json.error) {
    throw new Error(`${label}: callable error ${json.error.status}: ${json.error.message}`);
  }
  return json.result;
}

function summarizePayload(payload) {
  if (!payload || typeof payload !== "object") return "(empty)";
  const keys = Object.keys(payload);
  const parts = keys.map((k) => {
    const v = payload[k];
    if (v && typeof v === "object" && !Array.isArray(v)) {
      return `${k}:{${Object.keys(v).join(",")}}`;
    }
    return `${k}:${JSON.stringify(v).slice(0, 120)}`;
  });
  return parts.join(" | ");
}

async function main() {
  const readWeb = process.argv.includes("--read-web-api-key");
  const webApiKey =
    process.env.FIREBASE_WEB_API_KEY || (readWeb ? readWebApiKeyFromRepo() : null);
  const uid = process.env.TEST_ADMIN_UID;
  let idToken = process.env.FIREBASE_ID_TOKEN;

  if (!admin.apps.length) {
    admin.initializeApp({ projectId: PROJECT_ID });
  }

  if (!idToken) {
    if (!webApiKey || !uid) {
      console.error(
        "Set FIREBASE_ID_TOKEN, or set FIREBASE_WEB_API_KEY + TEST_ADMIN_UID (and ADC via GOOGLE_APPLICATION_CREDENTIALS).\n" +
          "Optional: pass --read-web-api-key to parse Web API key from web/src/firebase/firebaseClient.ts"
      );
      process.exit(1);
    }
    idToken = await mintIdTokenFromCustomToken(webApiKey, uid);
    console.log("Minted ID token via custom token for uid:", uid);
  } else {
    console.log("Using FIREBASE_ID_TOKEN from environment");
  }

  const cases = [
    { name: "1_clean_hero_homepage", buf: caseCleanHero() },
    { name: "2_multi_section_bands", buf: caseMultiSection() },
    { name: "3_noisy_text_heavy", buf: caseNoisyTextHeavy() },
  ];

  for (const c of cases) {
    const b64 = c.buf.toString("base64");
    console.log("\n===", c.name, "===");
    console.log("bytes:", c.buf.length);
    const t0 = Date.now();
    const result = await callAnalyze(idToken, b64, "image/png", c.name);
    console.log("latency_ms:", Date.now() - t0);
    console.log("ok:", result?.ok);
    console.log("diagnostics:", JSON.stringify(result?.diagnostics ?? null, null, 2));
    console.log("payload summary:", summarizePayload(result?.payload));
    console.log("payload JSON:", JSON.stringify(result?.payload ?? null, null, 2).slice(0, 2500));
  }

  console.log("\nDone. Cloud path verified if ok:true and payload printed above.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
