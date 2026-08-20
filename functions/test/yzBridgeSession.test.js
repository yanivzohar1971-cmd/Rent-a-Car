"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { MemoryFirestore } = require("./memoryFirestore");
const { createYzBridgeStore } = require("../lib/yzBridge/store");
const { createYzBridgeApp } = require("../lib/yzBridge/api");
const { InMemoryRateLimiter } = require("../lib/yzBridge/auth");

const TOKEN = "unit-test-yz-bridge-token";
const CHATGPT_KEY = "unit-test-yz-chatgpt-key";
const SESSION_KEY = "unit-test-yz-chatgpt-session-key";
const FUTURE = "2099-01-01T00:00:00.000Z";
const PAST = "2000-01-01T00:00:00.000Z";

function createHarness({ sessionExpiresAt = FUTURE, now } = {}) {
  const db = new MemoryFirestore();
  const store = createYzBridgeStore(db);
  const app = createYzBridgeApp({
    store,
    getExpectedToken: () => TOKEN,
    getChatGptKey: () => CHATGPT_KEY,
    getChatGptSessionKey: () => SESSION_KEY,
    getChatGptSessionExpiresAt: () => sessionExpiresAt,
    now,
    rateLimiter: new InMemoryRateLimiter({ maxMutating: 1000, maxRead: 1000 }),
    chatGptRateLimiter: new InMemoryRateLimiter({ maxMutating: 1000, maxRead: 1000 }),
    enableGetEnqueue: false,
  });
  return { db, store, app };
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

async function get(base, path) {
  const res = await fetch(`${base}${path}`);
  const json = await res.json();
  return { status: res.status, json, raw: JSON.stringify(json) };
}

function withKey(path, key) {
  const join = path.includes("?") ? "&" : "?";
  return `${path}${join}key=${encodeURIComponent(key)}`;
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
  return { status: res.status, json };
}

test("permanent ChatGPT key still works for INLINE enqueue", async () => {
  const { app } = createHarness();
  const { server, base } = await listen(app);
  try {
    const result = await get(base, withKey("/chatgpt/enqueue?title=Perm&instructions=Keep", CHATGPT_KEY));
    assert.equal(result.status, 200);
    assert.equal(result.json.ok, true);
    assert.ok(result.json.taskId);
    assert.equal(result.raw.includes(CHATGPT_KEY), false);
    assert.equal(result.raw.includes(SESSION_KEY), false);
  } finally {
    server.close();
  }
});

test("valid session key works for INLINE enqueue", async () => {
  const { app } = createHarness();
  const { server, base } = await listen(app);
  try {
    const result = await get(
      base,
      withKey("/chatgpt/enqueue?title=SessionInline&instructions=Do%20not%20modify", SESSION_KEY),
    );
    assert.equal(result.status, 200);
    assert.equal(result.json.status, "QUEUED");
    assert.equal(result.raw.includes(SESSION_KEY), false);
  } finally {
    server.close();
  }
});

test("valid session key works for task read", async () => {
  const { app } = createHarness();
  const { server, base } = await listen(app);
  try {
    const created = await get(
      base,
      withKey("/chatgpt/enqueue?title=ReadMe&instructions=Read", SESSION_KEY),
    );
    const read = await get(base, withKey(`/chatgpt/task?id=${created.json.taskId}`, SESSION_KEY));
    assert.equal(read.status, 200);
    assert.equal(read.json.task.title, "ReadMe");
    assert.equal(read.raw.includes(SESSION_KEY), false);
  } finally {
    server.close();
  }
});

test("valid session key works for CHUNKS create append status commit", async () => {
  const { app, store } = createHarness();
  const { server, base } = await listen(app);
  try {
    const created = await get(base, withKey("/chatgpt/chunks/create?title=SessionChunks", SESSION_KEY));
    assert.equal(created.status, 200);
    const id = created.json.bufferId;
    const appended = await get(
      base,
      withKey(`/chatgpt/chunks/append?bufferId=${id}&index=0&data=${encodeURIComponent("hello")}`, SESSION_KEY),
    );
    assert.equal(appended.status, 200);
    const status = await get(base, withKey(`/chatgpt/chunks/status?bufferId=${id}`, SESSION_KEY));
    assert.equal(status.status, 200);
    assert.equal(status.json.receivedChunks, 1);
    const committed = await get(base, withKey(`/chatgpt/chunks/commit?bufferId=${id}`, SESSION_KEY));
    assert.equal(committed.status, 200);
    const task = await store.getTask(committed.json.taskId);
    assert.equal(task.instructions, "hello");
    assert.equal(task.source, "chatgpt-chunks");
    assert.equal(JSON.stringify(committed.json).includes(SESSION_KEY), false);
  } finally {
    server.close();
  }
});

test("expired session key returns 401", async () => {
  const { app } = createHarness({ sessionExpiresAt: PAST });
  const { server, base } = await listen(app);
  try {
    const result = await get(base, withKey("/chatgpt/enqueue?title=T&instructions=I", SESSION_KEY));
    assert.equal(result.status, 401);
    assert.equal(result.json.code, "unauthorized");
    assert.equal(result.json.ok, false);
    assert.equal(result.raw.includes("expired"), false);
    assert.equal(result.raw.includes(SESSION_KEY), false);
  } finally {
    server.close();
  }
});

test("wrong session key returns 401", async () => {
  const { app } = createHarness();
  const { server, base } = await listen(app);
  try {
    const result = await get(base, withKey("/chatgpt/enqueue?title=T&instructions=I", "wrong-session-key"));
    assert.equal(result.status, 401);
    assert.equal(result.json.code, "unauthorized");
  } finally {
    server.close();
  }
});

test("missing key returns 401", async () => {
  const { app } = createHarness();
  const { server, base } = await listen(app);
  try {
    const result = await get(base, "/chatgpt/enqueue?title=T&instructions=I");
    assert.equal(result.status, 401);
    assert.equal(result.json.code, "unauthorized");
  } finally {
    server.close();
  }
});

test("session key cannot access bearer-only APIs", async () => {
  const { app } = createHarness();
  const { server, base } = await listen(app);
  try {
    const statusQuery = await get(base, withKey("/status", SESSION_KEY));
    assert.equal(statusQuery.status, 401);
    const statusHeader = await api(base, "GET", "/status", { token: SESSION_KEY });
    assert.equal(statusHeader.status, 401);
    const create = await api(base, "POST", "/tasks", {
      token: SESSION_KEY,
      body: { project: "Rent_a_Car", title: "Nope", instructions: "Nope" },
    });
    assert.equal(create.status, 401);
  } finally {
    server.close();
  }
});

test("bearer token and CHUNKS permanent-key behavior remain unchanged", async () => {
  const { app } = createHarness();
  const { server, base } = await listen(app);
  try {
    const bearer = await api(base, "GET", "/status");
    assert.equal(bearer.status, 200);
    assert.equal(bearer.json.ok, true);
    const created = await get(base, withKey("/chatgpt/chunks/create?title=PermChunks", CHATGPT_KEY));
    assert.equal(created.status, 200);
    const inline = await get(base, withKey("/chatgpt/enqueue?title=PermInline&instructions=Still", CHATGPT_KEY));
    assert.equal(inline.status, 200);
  } finally {
    server.close();
  }
});
