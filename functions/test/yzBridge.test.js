"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { MemoryFirestore } = require("./memoryFirestore");
const { createYzBridgeStore } = require("../lib/yzBridge/store");
const { createYzBridgeApp } = require("../lib/yzBridge/api");
const { assertAuthenticated, InMemoryRateLimiter } = require("../lib/yzBridge/auth");
const { YzBridgeError } = require("../lib/yzBridge/types");

const TOKEN = "unit-test-yz-bridge-token";
const CHATGPT_KEY = "unit-test-yz-chatgpt-key";

function createHarness() {
  const db = new MemoryFirestore();
  const store = createYzBridgeStore(db);
  const app = createYzBridgeApp({
    store,
    getExpectedToken: () => TOKEN,
    getChatGptKey: () => CHATGPT_KEY,
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

test("create task via POST /tasks", async () => {
  const { app } = createHarness();
  const { server, base } = await listen(app);
  try {
    const created = await api(base, "POST", "/tasks", {
      body: {
        project: "Rent_a_Car",
        title: "Diagnose Shagrir reconciliation",
        instructions: "Inspect matching code.",
        priority: "high",
        source: "chatgpt",
      },
    });
    assert.equal(created.status, 201);
    assert.equal(created.json.ok, true);
    assert.equal(created.json.status, "QUEUED");
    assert.ok(created.json.taskId);
  } finally {
    server.close();
  }
});

test("invalid authentication is rejected", async () => {
  const { app } = createHarness();
  const { server, base } = await listen(app);
  try {
    const missing = await api(base, "POST", "/tasks", {
      token: null,
      body: { project: "Rent_a_Car", title: "T", instructions: "I" },
    });
    assert.equal(missing.status, 401);

    const wrong = await api(base, "GET", "/status", { token: "wrong-token" });
    assert.equal(wrong.status, 401);
  } finally {
    server.close();
  }
});

test("missing required fields are rejected", async () => {
  const { app } = createHarness();
  const { server, base } = await listen(app);
  try {
    const created = await api(base, "POST", "/tasks", {
      body: { project: "Rent_a_Car", title: "Only title" },
    });
    assert.equal(created.status, 400);
    assert.equal(created.json.ok, false);
  } finally {
    server.close();
  }
});

test("retrieve task by id", async () => {
  const { app } = createHarness();
  const { server, base } = await listen(app);
  try {
    const created = await api(base, "POST", "/tasks", {
      body: { project: "Rent_a_Car", title: "T1", instructions: "Do the thing" },
    });
    const id = created.json.taskId;
    const fetched = await api(base, "GET", `/task?id=${id}`);
    assert.equal(fetched.status, 200);
    assert.equal(fetched.json.task.title, "T1");
    assert.equal(fetched.json.task.status, "QUEUED");
  } finally {
    server.close();
  }
});

test("atomic claim moves QUEUED to CLAIMED", async () => {
  const { store } = createHarness();
  const task = await store.createTask({
    project: "Rent_a_Car",
    title: "Claim me",
    instructions: "Instructions",
  });
  const claimed = await store.claimTask(task.id, { actor: "agent-a" });
  assert.equal(claimed.status, "CLAIMED");
  assert.equal(claimed.claimedBy, "agent-a");
});

test("two simultaneous claim attempts produce exactly one winner", async () => {
  const { store } = createHarness();
  const task = await store.createTask({
    project: "Rent_a_Car",
    title: "Race",
    instructions: "Only one agent may claim this",
  });

  const results = await Promise.allSettled([
    store.claimTask(task.id, { actor: "agent-1" }),
    store.claimTask(task.id, { actor: "agent-2" }),
  ]);

  const fulfilled = results.filter((r) => r.status === "fulfilled");
  const rejected = results.filter((r) => r.status === "rejected");
  assert.equal(fulfilled.length, 1);
  assert.equal(rejected.length, 1);
  assert.equal(fulfilled[0].value.status, "CLAIMED");
  const loser = rejected[0].reason;
  assert.ok(loser instanceof YzBridgeError);
  assert.equal(loser.httpStatus, 409);

  const latest = await store.getTask(task.id);
  assert.equal(latest.status, "CLAIMED");
  assert.ok(latest.claimedBy === "agent-1" || latest.claimedBy === "agent-2");
});

test("status transition CLAIMED -> RUNNING", async () => {
  const { store } = createHarness();
  const task = await store.createTask({
    project: "Rent_a_Car",
    title: "Running",
    instructions: "Go",
  });
  await store.claimTask(task.id, { actor: "agent-a" });
  const running = await store.updateStatus(task.id, { status: "RUNNING" });
  assert.equal(running.status, "RUNNING");
});

test("completion result persistence", async () => {
  const { store } = createHarness();
  const task = await store.createTask({
    project: "Rent_a_Car",
    title: "Complete me",
    instructions: "Finish",
  });
  await store.claimTask(task.id, { actor: "agent-a" });
  await store.updateStatus(task.id, { status: "RUNNING" });
  const completed = await store.writeResult(task.id, {
    status: "COMPLETED",
    resultSummary: "Done",
    changedFiles: ["functions/src/yzBridge/api.ts"],
    tests: ["functions test:yz-bridge passed"],
  });
  assert.equal(completed.status, "COMPLETED");
  assert.equal(completed.resultSummary, "Done");
  assert.deepEqual(completed.changedFiles, ["functions/src/yzBridge/api.ts"]);
  const fetched = await store.getTask(task.id);
  assert.equal(fetched.status, "COMPLETED");
  assert.equal(fetched.resultSummary, "Done");
});

test("failed task persistence", async () => {
  const { store } = createHarness();
  const task = await store.createTask({
    project: "Rent_a_Car",
    title: "Fail me",
    instructions: "Break",
  });
  await store.claimTask(task.id, { actor: "agent-a" });
  const failed = await store.writeResult(task.id, {
    status: "FAILED",
    resultSummary: "Tests failed",
    error: "unit tests returned non-zero",
    tests: ["npm test failed"],
  });
  assert.equal(failed.status, "FAILED");
  assert.equal(failed.error, "unit tests returned non-zero");
  const fetched = await store.getTask(task.id);
  assert.equal(fetched.status, "FAILED");
});

test("assertAuthenticated rejects missing configuration and bad tokens", () => {
  assert.throws(() => assertAuthenticated("Bearer abc", ""), YzBridgeError);
  assert.throws(() => assertAuthenticated(undefined, TOKEN), YzBridgeError);
  assert.doesNotThrow(() => assertAuthenticated(`Bearer ${TOKEN}`, TOKEN));
});

async function chatgptGet(base, path) {
  const res = await fetch(`${base}${path}`);
  const json = await res.json();
  return { status: res.status, json, raw: JSON.stringify(json) };
}

test("chatgpt enqueue without key returns 401", async () => {
  const { app } = createHarness();
  const { server, base } = await listen(app);
  try {
    const result = await chatgptGet(base, "/chatgpt/enqueue?title=T&instructions=I");
    assert.equal(result.status, 401);
    assert.equal(result.json.ok, false);
    assert.equal(result.json.code, "unauthorized");
    assert.equal(result.json.key, undefined);
  } finally {
    server.close();
  }
});

test("chatgpt enqueue with wrong key returns 401", async () => {
  const { app } = createHarness();
  const { server, base } = await listen(app);
  try {
    const result = await chatgptGet(base, "/chatgpt/enqueue?key=wrong-key&title=T&instructions=I");
    assert.equal(result.status, 401);
    assert.equal(result.json.ok, false);
    assert.equal(result.json.code, "unauthorized");
    assert.equal(Object.prototype.hasOwnProperty.call(result.json, "error"), false);
  } finally {
    server.close();
  }
});

test("chatgpt enqueue with correct key creates a Rent_a_Car task", async () => {
  const { app } = createHarness();
  const { server, base } = await listen(app);
  try {
    const result = await chatgptGet(
      base,
      `/chatgpt/enqueue?key=${encodeURIComponent(CHATGPT_KEY)}&title=${encodeURIComponent("ChatGPT enqueue")}&instructions=${encodeURIComponent("Do not modify source.")}`,
    );
    assert.equal(result.status, 200);
    assert.equal(result.json.ok, true);
    assert.equal(result.json.status, "QUEUED");
    assert.ok(result.json.taskId);
    assert.equal(result.raw.includes(CHATGPT_KEY), false);

    const fetched = await api(base, "GET", `/task?id=${result.json.taskId}`);
    assert.equal(fetched.json.task.project, "Rent_a_Car");
    assert.equal(fetched.json.task.source, "chatgpt-get");
  } finally {
    server.close();
  }
});

test("chatgpt enqueue rejects non-Rent_a_Car project", async () => {
  const { app } = createHarness();
  const { server, base } = await listen(app);
  try {
    const result = await chatgptGet(
      base,
      `/chatgpt/enqueue?key=${encodeURIComponent(CHATGPT_KEY)}&title=T&instructions=I&project=OtherProject`,
    );
    assert.equal(result.status, 400);
    assert.equal(result.json.code, "invalid_argument");
  } finally {
    server.close();
  }
});

test("chatgpt enqueue missing title returns 400", async () => {
  const { app } = createHarness();
  const { server, base } = await listen(app);
  try {
    const result = await chatgptGet(
      base,
      `/chatgpt/enqueue?key=${encodeURIComponent(CHATGPT_KEY)}&instructions=I`,
    );
    assert.equal(result.status, 400);
  } finally {
    server.close();
  }
});

test("chatgpt enqueue missing instructions returns 400", async () => {
  const { app } = createHarness();
  const { server, base } = await listen(app);
  try {
    const result = await chatgptGet(
      base,
      `/chatgpt/enqueue?key=${encodeURIComponent(CHATGPT_KEY)}&title=T`,
    );
    assert.equal(result.status, 400);
  } finally {
    server.close();
  }
});

test("chatgpt enqueue oversized title is rejected", async () => {
  const { app } = createHarness();
  const { server, base } = await listen(app);
  try {
    const title = "T".repeat(201);
    const result = await chatgptGet(
      base,
      `/chatgpt/enqueue?key=${encodeURIComponent(CHATGPT_KEY)}&title=${title}&instructions=I`,
    );
    assert.equal(result.status, 400);
  } finally {
    server.close();
  }
});

test("chatgpt enqueue oversized instructions is rejected", async () => {
  const { app } = createHarness();
  const { server, base } = await listen(app);
  try {
    const instructions = "I".repeat(8001);
    const result = await chatgptGet(
      base,
      `/chatgpt/enqueue?key=${encodeURIComponent(CHATGPT_KEY)}&title=T&instructions=${instructions}`,
    );
    assert.equal(result.status, 400);
  } finally {
    server.close();
  }
});

test("chatgpt duplicate requestId does not create a second task", async () => {
  const { app, store } = createHarness();
  const { server, base } = await listen(app);
  try {
    const qs = `key=${encodeURIComponent(CHATGPT_KEY)}&title=Once&instructions=Only%20once&requestId=req-dup-1`;
    const first = await chatgptGet(base, `/chatgpt/enqueue?${qs}`);
    const second = await chatgptGet(base, `/chatgpt/enqueue?${qs}`);
    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.equal(first.json.taskId, second.json.taskId);
    const listed = await store.listTasks({ project: "Rent_a_Car", limit: 50 });
    assert.equal(listed.length, 1);
  } finally {
    server.close();
  }
});

test("chatgpt task read returns created task without the key", async () => {
  const { app } = createHarness();
  const { server, base } = await listen(app);
  try {
    const created = await chatgptGet(
      base,
      `/chatgpt/enqueue?key=${encodeURIComponent(CHATGPT_KEY)}&title=ReadMe&instructions=Poll%20me`,
    );
    const fetched = await chatgptGet(
      base,
      `/chatgpt/task?key=${encodeURIComponent(CHATGPT_KEY)}&id=${created.json.taskId}`,
    );
    assert.equal(fetched.status, 200);
    assert.equal(fetched.json.task.id, created.json.taskId);
    assert.equal(fetched.json.task.title, "ReadMe");
    assert.equal(fetched.json.task.status, "QUEUED");
    assert.equal(fetched.json.task.instructions, undefined);
    assert.equal(fetched.raw.includes(CHATGPT_KEY), false);
  } finally {
    server.close();
  }
});

test("chatgpt task read handles invalid id safely", async () => {
  const { app } = createHarness();
  const { server, base } = await listen(app);
  try {
    const fetched = await chatgptGet(
      base,
      `/chatgpt/task?key=${encodeURIComponent(CHATGPT_KEY)}&id=does-not-exist`,
    );
    assert.equal(fetched.status, 404);
    assert.equal(fetched.json.ok, false);
    assert.equal(fetched.raw.includes(CHATGPT_KEY), false);
  } finally {
    server.close();
  }
});

test("bearer token API still works alongside chatgpt GET endpoints", async () => {
  const { app } = createHarness();
  const { server, base } = await listen(app);
  try {
    const created = await api(base, "POST", "/tasks", {
      body: { project: "Rent_a_Car", title: "Bearer still works", instructions: "Keep bearer auth." },
    });
    assert.equal(created.status, 201);
    const status = await api(base, "GET", "/status");
    assert.equal(status.status, 200);
    assert.equal(status.json.ok, true);
  } finally {
    server.close();
  }
});
