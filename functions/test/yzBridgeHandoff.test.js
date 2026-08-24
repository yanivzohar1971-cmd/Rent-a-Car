"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { createHash } = require("node:crypto");
const { MemoryFirestore } = require("./memoryFirestore");
const { createYzBridgeStore } = require("../lib/yzBridge/store");
const { createYzBridgeApp } = require("../lib/yzBridge/api");
const { createChatGptSessionStore, sha256Hex } = require("../lib/yzBridge/sessions");
const { InMemoryRateLimiter } = require("../lib/yzBridge/auth");
const {
  YZ_BRIDGE_CHATGPT_HANDOFFS_COLLECTION,
  YZ_BRIDGE_CHATGPT_SESSIONS_COLLECTION,
} = require("../lib/yzBridge/types");

const TOKEN = "unit-test-yz-bridge-token";
const CHATGPT_KEY = "unit-test-yz-chatgpt-key";
const ENV_SESSION = "unit-test-env-session-key";
const FUTURE = "2099-01-01T00:00:00.000Z";

function createHarness(options = {}) {
  const db = new MemoryFirestore();
  const store = createYzBridgeStore(db);
  const sessionStore = createChatGptSessionStore(db, {
    now: options.now,
    generateToken: options.generateToken,
  });
  const app = createYzBridgeApp({
    store,
    sessionStore,
    getExpectedToken: () => TOKEN,
    getChatGptKey: () => (options.permanentKey === undefined ? CHATGPT_KEY : options.permanentKey),
    getChatGptSessionKey: () => (options.envSessionKey === undefined ? ENV_SESSION : options.envSessionKey),
    getChatGptSessionExpiresAt: () => options.envExpiresAt || FUTURE,
    getPublicApiBase: () => "https://example.test/yzBridgeApi",
    now: options.now,
    rateLimiter: new InMemoryRateLimiter({ maxMutating: 1000, maxRead: 1000 }),
    chatGptRateLimiter: new InMemoryRateLimiter({ maxMutating: 1000, maxRead: 1000 }),
    adminRateLimiter: new InMemoryRateLimiter({ maxMutating: 1000, maxRead: 1000 }),
    enableGetEnqueue: false,
  });
  return { db, store, sessionStore, app };
}

function listen(app) {
  return new Promise((resolve) => {
    const server = http.createServer(app);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve({ server, base: `http://127.0.0.1:${address.port}` });
    });
  });
}

async function api(base, method, path, { token = TOKEN, body } = {}) {
  const headers = { "content-type": "application/json" };
  if (token !== null) headers.authorization = `Bearer ${token}`;
  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  return { status: res.status, json, raw: JSON.stringify(json) };
}

async function get(base, path) {
  const res = await fetch(`${base}${path}`);
  const json = await res.json();
  return { status: res.status, json, raw: JSON.stringify(json) };
}

function withKey(path, key) {
  const join = path.includes("?") ? "&" : "?";
  return `${path}${join}key=${encodeURIComponent(key)}`;
}

test("generate handoff does not store plaintext code", async () => {
  const { db, app } = createHarness();
  const { server, base } = await listen(app);
  try {
    const created = await api(base, "POST", "/admin/chatgpt/handoffs", {
      body: { sessionDurationSeconds: 3600, label: "unit" },
    });
    assert.equal(created.status, 201);
    assert.ok(created.json.bootstrapUrl.includes("/chatgpt/bootstrap?code="));
    assert.equal(created.raw.includes(TOKEN), false);
    assert.equal(created.raw.includes(CHATGPT_KEY), false);
    const code = new URL(created.json.bootstrapUrl).searchParams.get("code");
    assert.ok(code);
    const hash = sha256Hex(code);
    const doc = await db.collection(YZ_BRIDGE_CHATGPT_HANDOFFS_COLLECTION).doc(hash).get();
    assert.equal(doc.exists, true);
    const data = doc.data();
    assert.equal(data.status, "OPEN");
    assert.equal(JSON.stringify(data).includes(code), false);
  } finally {
    server.close();
  }
});

test("handoff expires and second consumption fails; concurrent consumption yields one session", async () => {
  let nowMs = Date.parse("2026-01-01T00:00:00.000Z");
  const tokens = ["code-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "session-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"];
  let tokenIdx = 0;
  const { app, sessionStore } = createHarness({
    now: () => nowMs,
    generateToken: () => tokens[Math.min(tokenIdx++, tokens.length - 1)],
  });
  const { server, base } = await listen(app);
  try {
    const created = await api(base, "POST", "/admin/chatgpt/handoffs", {
      body: { sessionDurationSeconds: 86400, handoffTtlSeconds: 60 },
    });
    const code = new URL(created.json.bootstrapUrl).searchParams.get("code");

    nowMs += 120_000;
    const expired = await get(base, `/chatgpt/bootstrap?code=${encodeURIComponent(code)}`);
    assert.equal(expired.status, 410);

    const fresh = await sessionStore.createHandoff({ sessionDurationSeconds: 86400 });
    const results = await Promise.allSettled([
      sessionStore.exchangeHandoff(fresh.code),
      sessionStore.exchangeHandoff(fresh.code),
    ]);
    const ok = results.filter((r) => r.status === "fulfilled");
    const bad = results.filter((r) => r.status === "rejected");
    assert.equal(ok.length, 1);
    assert.equal(bad.length, 1);

    const reuse = await get(base, `/chatgpt/bootstrap?code=${encodeURIComponent(fresh.code)}`);
    assert.ok([401, 409].includes(reuse.status));
  } finally {
    server.close();
  }
});

test("bootstrap returns AI-friendly session and authenticates CHUNKS into one task", async () => {
  const { app, store, db } = createHarness();
  const { server, base } = await listen(app);
  try {
    const created = await api(base, "POST", "/admin/chatgpt/handoffs", {
      body: { sessionDurationSeconds: 86400 },
    });
    const boot = await get(base, created.json.bootstrapUrl.replace("https://example.test/yzBridgeApi", ""));
    assert.equal(boot.status, 200);
    assert.equal(boot.json.ok, true);
    assert.equal(boot.json.protocol, "yz-dev-bridge-chatgpt-v1");
    assert.ok(boot.json.sessionKey);
    assert.ok(boot.json.transports.chunks.commit);
    assert.equal(boot.raw.includes(TOKEN), false);
    assert.equal(boot.raw.includes(CHATGPT_KEY), false);

    const sessionKey = boot.json.sessionKey;
    const sessionHash = sha256Hex(sessionKey);
    const stored = await db.collection(YZ_BRIDGE_CHATGPT_SESSIONS_COLLECTION).doc(sessionHash).get();
    assert.equal(stored.exists, true);
    assert.equal(JSON.stringify(stored.data()).includes(sessionKey), false);

    const partA = "AAA".repeat(100);
    const partB = "BBB".repeat(100);
    const partC = "CCC".repeat(100);
    const prompt = `${partA}${partB}${partC}`;

    const buf = await get(base, withKey("/chatgpt/chunks/create?title=HandoffChunks&project=Rent_a_Car", sessionKey));
    assert.equal(buf.status, 200);
    const bufferId = buf.json.bufferId;
    await get(base, withKey(`/chatgpt/chunks/append?bufferId=${bufferId}&index=0&data=${encodeURIComponent(partA)}`, sessionKey));
    await get(base, withKey(`/chatgpt/chunks/append?bufferId=${bufferId}&index=1&data=${encodeURIComponent(partB)}`, sessionKey));
    await get(base, withKey(`/chatgpt/chunks/append?bufferId=${bufferId}&index=2&data=${encodeURIComponent(partC)}`, sessionKey));
    const status = await get(base, withKey(`/chatgpt/chunks/status?bufferId=${bufferId}`, sessionKey));
    assert.equal(status.json.receivedChunks, 3);
    assert.equal(status.json.totalCharacters, prompt.length);

    const commit1 = await get(base, withKey(`/chatgpt/chunks/commit?bufferId=${bufferId}&chunkCount=3`, sessionKey));
    assert.equal(commit1.status, 200);
    assert.ok(commit1.json.taskId);
    const commit2 = await get(base, withKey(`/chatgpt/chunks/commit?bufferId=${bufferId}&chunkCount=3`, sessionKey));
    assert.equal(commit2.json.taskId, commit1.json.taskId);

    const task = await store.getTask(commit1.json.taskId);
    assert.equal(task.project, "Rent_a_Car");
    assert.equal(task.instructions, prompt);
    assert.equal(task.instructions.length, prompt.length);

    const reuseBoot = await get(base, created.json.bootstrapUrl.replace("https://example.test/yzBridgeApi", ""));
    assert.ok([401, 409].includes(reuseBoot.status));
  } finally {
    server.close();
  }
});

test("permanent key and env session key still work; revoke blocks firestore session", async () => {
  const { app, sessionStore } = createHarness();
  const { server, base } = await listen(app);
  try {
    const permanent = await get(base, withKey("/chatgpt/enqueue?title=Perm&instructions=Keep", CHATGPT_KEY));
    assert.equal(permanent.status, 200);

    const envOk = await get(base, withKey("/chatgpt/enqueue?title=Env&instructions=Keep", ENV_SESSION));
    assert.equal(envOk.status, 200);

    const handoff = await sessionStore.createHandoff({ sessionDurationSeconds: 3600 });
    const exchanged = await sessionStore.exchangeHandoff(handoff.code);
    const before = await get(base, withKey("/chatgpt/enqueue?title=Fs&instructions=Keep", exchanged.sessionKey));
    assert.equal(before.status, 200);

    await sessionStore.revokeSession(exchanged.sessionId);
    const after = await get(base, withKey("/chatgpt/enqueue?title=Fs2&instructions=Keep", exchanged.sessionKey));
    assert.equal(after.status, 401);

    const listed = await api(base, "GET", "/admin/chatgpt/sessions");
    assert.equal(listed.status, 200);
    assert.equal(listed.raw.includes(exchanged.sessionKey), false);
    assert.ok(listed.json.sessions.some((s) => s.id === exchanged.sessionId && s.status === "REVOKED"));

    const bad = await get(base, withKey("/chatgpt/enqueue?title=X&instructions=Y", "not-a-real-key"));
    assert.equal(bad.status, 401);
    const malformed = await get(base, "/chatgpt/enqueue?title=X&instructions=Y");
    assert.equal(malformed.status, 401);
  } finally {
    server.close();
  }
});

test("session list and revoke-all require bearer token", async () => {
  const { app } = createHarness();
  const { server, base } = await listen(app);
  try {
    const denied = await api(base, "GET", "/admin/chatgpt/sessions", { token: null });
    assert.equal(denied.status, 401);
    const wrong = await api(base, "POST", "/admin/chatgpt/handoffs", { token: "wrong", body: {} });
    assert.equal(wrong.status, 401);

    await api(base, "POST", "/admin/chatgpt/handoffs", { body: { sessionDurationSeconds: 3600 } });
    // create a session via exchange
    const created = await api(base, "POST", "/admin/chatgpt/handoffs", { body: {} });
    await get(base, created.json.bootstrapUrl.replace("https://example.test/yzBridgeApi", ""));
    const revoked = await api(base, "POST", "/admin/chatgpt/sessions/revoke-all", { body: {} });
    assert.equal(revoked.status, 200);
    assert.ok(revoked.json.revoked >= 1);
  } finally {
    server.close();
  }
});

test("sha256Hex helper is stable", () => {
  assert.equal(sha256Hex("abc"), createHash("sha256").update("abc", "utf8").digest("hex"));
});
