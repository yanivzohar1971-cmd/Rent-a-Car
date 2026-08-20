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

function createHarness(limitOverrides) {
  const db = new MemoryFirestore();
  const store = createYzBridgeStore(db, limitOverrides || {});
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

async function get(base, path) {
  const res = await fetch(`${base}${path}`);
  const json = await res.json();
  return { status: res.status, json, raw: JSON.stringify(json) };
}

function withKey(path) {
  const join = path.includes("?") ? "&" : "?";
  return `${path}${join}key=${encodeURIComponent(CHATGPT_KEY)}`;
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

test("chunks create without key returns 401", async () => {
  const { app } = createHarness();
  const { server, base } = await listen(app);
  try {
    const result = await get(base, "/chatgpt/chunks/create?title=T");
    assert.equal(result.status, 401);
    assert.equal(result.json.code, "unauthorized");
  } finally {
    server.close();
  }
});

test("chunks append without key returns 401", async () => {
  const { app } = createHarness();
  const { server, base } = await listen(app);
  try {
    const result = await get(base, "/chatgpt/chunks/append?bufferId=x&index=0&data=a");
    assert.equal(result.status, 401);
  } finally {
    server.close();
  }
});

test("chunks status without key returns 401", async () => {
  const { app } = createHarness();
  const { server, base } = await listen(app);
  try {
    const result = await get(base, "/chatgpt/chunks/status?bufferId=x");
    assert.equal(result.status, 401);
  } finally {
    server.close();
  }
});

test("chunks commit without key returns 401", async () => {
  const { app } = createHarness();
  const { server, base } = await listen(app);
  try {
    const result = await get(base, "/chatgpt/chunks/commit?bufferId=x");
    assert.equal(result.status, 401);
  } finally {
    server.close();
  }
});

test("chunks wrong key returns 401", async () => {
  const { app } = createHarness();
  const { server, base } = await listen(app);
  try {
    const result = await get(base, "/chatgpt/chunks/create?key=wrong-key&title=T");
    assert.equal(result.status, 401);
    assert.equal(result.json.code, "unauthorized");
  } finally {
    server.close();
  }
});

test("chunks create buffer succeeds", async () => {
  const { app } = createHarness();
  const { server, base } = await listen(app);
  try {
    const result = await get(base, withKey("/chatgpt/chunks/create?title=Epic&priority=high"));
    assert.equal(result.status, 200);
    assert.equal(result.json.ok, true);
    assert.equal(result.json.status, "OPEN");
    assert.equal(result.json.nextChunk, 0);
    assert.ok(result.json.bufferId);
    assert.equal(result.raw.includes(CHATGPT_KEY), false);
  } finally {
    server.close();
  }
});

test("chunks create missing title rejected", async () => {
  const { app } = createHarness();
  const { server, base } = await listen(app);
  try {
    const result = await get(base, withKey("/chatgpt/chunks/create"));
    assert.equal(result.status, 400);
  } finally {
    server.close();
  }
});

test("chunks create invalid project rejected", async () => {
  const { app } = createHarness();
  const { server, base } = await listen(app);
  try {
    const result = await get(base, withKey("/chatgpt/chunks/create?title=T&project=Other"));
    assert.equal(result.status, 400);
  } finally {
    server.close();
  }
});

test("chunks duplicate requestId is idempotent", async () => {
  const { app } = createHarness();
  const { server, base } = await listen(app);
  try {
    const path = withKey("/chatgpt/chunks/create?title=Once&requestId=buf-dup-1");
    const first = await get(base, path);
    const second = await get(base, path);
    assert.equal(first.json.bufferId, second.json.bufferId);
  } finally {
    server.close();
  }
});

test("chunks append 0 and 1 succeed and identical retry is idempotent", async () => {
  const { app } = createHarness();
  const { server, base } = await listen(app);
  try {
    const created = await get(base, withKey("/chatgpt/chunks/create?title=T"));
    const id = created.json.bufferId;
    const a0 = await get(base, withKey(`/chatgpt/chunks/append?bufferId=${id}&index=0&data=${encodeURIComponent("Hello")}`));
    const a1 = await get(base, withKey(`/chatgpt/chunks/append?bufferId=${id}&index=1&data=${encodeURIComponent("World")}`));
    const dup = await get(base, withKey(`/chatgpt/chunks/append?bufferId=${id}&index=0&data=${encodeURIComponent("Hello")}`));
    assert.equal(a0.status, 200);
    assert.equal(a1.status, 200);
    assert.equal(dup.status, 200);
    assert.equal(a1.json.receivedChunks, 2);
    assert.equal(a1.json.totalCharacters, 10);
  } finally {
    server.close();
  }
});

test("chunks duplicate index with different data conflicts", async () => {
  const { app } = createHarness();
  const { server, base } = await listen(app);
  try {
    const created = await get(base, withKey("/chatgpt/chunks/create?title=T"));
    const id = created.json.bufferId;
    await get(base, withKey(`/chatgpt/chunks/append?bufferId=${id}&index=0&data=AAA`));
    const bad = await get(base, withKey(`/chatgpt/chunks/append?bufferId=${id}&index=0&data=BBB`));
    assert.equal(bad.status, 409);
  } finally {
    server.close();
  }
});

test("chunks invalid negative index rejected", async () => {
  const { app } = createHarness();
  const { server, base } = await listen(app);
  try {
    const created = await get(base, withKey("/chatgpt/chunks/create?title=T"));
    const id = created.json.bufferId;
    const bad = await get(base, withKey(`/chatgpt/chunks/append?bufferId=${id}&index=-1&data=A`));
    assert.equal(bad.status, 400);
  } finally {
    server.close();
  }
});

test("chunks oversized chunk returns 413", async () => {
  const { app } = createHarness({ maxChunkChars: 4 });
  const { server, base } = await listen(app);
  try {
    const created = await get(base, withKey("/chatgpt/chunks/create?title=T"));
    const id = created.json.bufferId;
    const bad = await get(base, withKey(`/chatgpt/chunks/append?bufferId=${id}&index=0&data=ABCDE`));
    assert.equal(bad.status, 413);
  } finally {
    server.close();
  }
});

test("chunks too many chunks rejected", async () => {
  const { app } = createHarness({ maxChunks: 2 });
  const { server, base } = await listen(app);
  try {
    const created = await get(base, withKey("/chatgpt/chunks/create?title=T"));
    const id = created.json.bufferId;
    await get(base, withKey(`/chatgpt/chunks/append?bufferId=${id}&index=0&data=A`));
    await get(base, withKey(`/chatgpt/chunks/append?bufferId=${id}&index=1&data=B`));
    const bad = await get(base, withKey(`/chatgpt/chunks/append?bufferId=${id}&index=2&data=C`));
    assert.equal(bad.status, 413);
  } finally {
    server.close();
  }
});

test("chunks status reports counts and hides contents", async () => {
  const { app } = createHarness();
  const { server, base } = await listen(app);
  try {
    const created = await get(base, withKey("/chatgpt/chunks/create?title=T"));
    const id = created.json.bufferId;
    await get(base, withKey(`/chatgpt/chunks/append?bufferId=${id}&index=0&data=${encodeURIComponent("SECRETTEXT")}`));
    const status = await get(base, withKey(`/chatgpt/chunks/status?bufferId=${id}`));
    assert.equal(status.status, 200);
    assert.equal(status.json.receivedChunks, 1);
    assert.equal(status.json.totalCharacters, 10);
    assert.equal(status.raw.includes("SECRETTEXT"), false);
    assert.equal(status.json.content, undefined);
  } finally {
    server.close();
  }
});

test("chunks unknown buffer handled safely", async () => {
  const { app } = createHarness();
  const { server, base } = await listen(app);
  try {
    const status = await get(base, withKey("/chatgpt/chunks/status?bufferId=missing-buffer"));
    assert.equal(status.status, 404);
    assert.equal(status.raw.includes(CHATGPT_KEY), false);
  } finally {
    server.close();
  }
});

test("chunks commit reconstructs exact prompt and is idempotent", async () => {
  const { app, store } = createHarness();
  const { server, base } = await listen(app);
  try {
    const created = await get(base, withKey("/chatgpt/chunks/create?title=Exact&priority=high&requestId=exact-1"));
    const id = created.json.bufferId;
    const part0 = "Hello, \"World\"!\n";
    const part1 = "  indented";
    const part2 = "END";
    await get(base, withKey(`/chatgpt/chunks/append?bufferId=${id}&index=0&data=${encodeURIComponent(part0)}`));
    await get(base, withKey(`/chatgpt/chunks/append?bufferId=${id}&index=1&data=${encodeURIComponent(part1)}`));
    await get(base, withKey(`/chatgpt/chunks/append?bufferId=${id}&index=2&data=${encodeURIComponent(part2)}`));
    const committed = await get(base, withKey(`/chatgpt/chunks/commit?bufferId=${id}&chunkCount=3`));
    assert.equal(committed.status, 200);
    assert.equal(committed.json.status, "QUEUED");
    const task = await store.getTask(committed.json.taskId);
    assert.equal(task.instructions, part0 + part1 + part2);
    assert.equal(task.source, "chatgpt-chunks");
    assert.equal(task.project, "Rent_a_Car");
    assert.equal(task.priority, "high");
    assert.equal(task.metadata.promptBufferId, id);
    assert.equal(task.metadata.transport, "chunks");
    const again = await get(base, withKey(`/chatgpt/chunks/commit?bufferId=${id}`));
    assert.equal(again.json.taskId, committed.json.taskId);
    const listed = await store.listTasks({ project: "Rent_a_Car", limit: 50 });
    assert.equal(listed.length, 1);
  } finally {
    server.close();
  }
});

test("chunks commit with no chunks rejected", async () => {
  const { app } = createHarness();
  const { server, base } = await listen(app);
  try {
    const created = await get(base, withKey("/chatgpt/chunks/create?title=T"));
    const bad = await get(base, withKey(`/chatgpt/chunks/commit?bufferId=${created.json.bufferId}`));
    assert.equal(bad.status, 400);
  } finally {
    server.close();
  }
});

test("chunks commit with gap rejected", async () => {
  const { app } = createHarness();
  const { server, base } = await listen(app);
  try {
    const created = await get(base, withKey("/chatgpt/chunks/create?title=T"));
    const id = created.json.bufferId;
    await get(base, withKey(`/chatgpt/chunks/append?bufferId=${id}&index=0&data=A`));
    await get(base, withKey(`/chatgpt/chunks/append?bufferId=${id}&index=2&data=C`));
    const bad = await get(base, withKey(`/chatgpt/chunks/commit?bufferId=${id}`));
    assert.equal(bad.status, 409);
  } finally {
    server.close();
  }
});

test("chunks commit chunkCount mismatch rejected", async () => {
  const { app } = createHarness();
  const { server, base } = await listen(app);
  try {
    const created = await get(base, withKey("/chatgpt/chunks/create?title=T"));
    const id = created.json.bufferId;
    await get(base, withKey(`/chatgpt/chunks/append?bufferId=${id}&index=0&data=A`));
    const bad = await get(base, withKey(`/chatgpt/chunks/commit?bufferId=${id}&chunkCount=2`));
    assert.equal(bad.status, 400);
  } finally {
    server.close();
  }
});

test("chunks assembled oversized prompt rejected on append", async () => {
  const { app } = createHarness({ maxAssembledChars: 5, maxChunkChars: 10 });
  const { server, base } = await listen(app);
  try {
    const created = await get(base, withKey("/chatgpt/chunks/create?title=T"));
    const id = created.json.bufferId;
    await get(base, withKey(`/chatgpt/chunks/append?bufferId=${id}&index=0&data=AAAA`));
    const bad = await get(base, withKey(`/chatgpt/chunks/append?bufferId=${id}&index=1&data=BB`));
    assert.equal(bad.status, 413);
  } finally {
    server.close();
  }
});

test("chunks append to committed buffer rejected", async () => {
  const { app } = createHarness();
  const { server, base } = await listen(app);
  try {
    const created = await get(base, withKey("/chatgpt/chunks/create?title=T"));
    const id = created.json.bufferId;
    await get(base, withKey(`/chatgpt/chunks/append?bufferId=${id}&index=0&data=A`));
    await get(base, withKey(`/chatgpt/chunks/commit?bufferId=${id}`));
    const bad = await get(base, withKey(`/chatgpt/chunks/append?bufferId=${id}&index=1&data=B`));
    assert.equal(bad.status, 409);
  } finally {
    server.close();
  }
});

test("existing INLINE enqueue, task read, and bearer API still work", async () => {
  const { app } = createHarness();
  const { server, base } = await listen(app);
  try {
    const inline = await get(
      base,
      withKey("/chatgpt/enqueue?title=InlineStillWorks&instructions=Keep%20INLINE"),
    );
    assert.equal(inline.status, 200);
    const read = await get(base, withKey(`/chatgpt/task?id=${inline.json.taskId}`));
    assert.equal(read.status, 200);
    assert.equal(read.json.task.title, "InlineStillWorks");
    const bearer = await api(base, "POST", "/tasks", {
      body: { project: "Rent_a_Car", title: "Bearer", instructions: "still works" },
    });
    assert.equal(bearer.status, 201);
  } finally {
    server.close();
  }
});
