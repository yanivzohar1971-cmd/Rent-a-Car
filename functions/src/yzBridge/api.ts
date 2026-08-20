import * as express from "express";
import * as admin from "firebase-admin";
import * as functions from "firebase-functions";
import {
  assertAuthenticated,
  clientKey,
  InMemoryRateLimiter,
  readExpectedApiToken,
  readExpectedChatGptKey,
  readExpectedChatGptSessionKey,
  readChatGptSessionExpiresAt,
  assertChatGptAccess,
} from "./auth";
import { createYzBridgeStore, YzBridgeStore } from "./store";
import { isPriority, isTaskStatus, YzBridgeError, YzBridgeTask } from "./types";

const CHATGPT_PROJECT = "Rent_a_Car";
const CHATGPT_MAX_TITLE = 200;
const CHATGPT_MAX_INSTRUCTIONS = 8000;
const CHATGPT_MAX_REQUEST_ID = 128;

export interface YzBridgeApiDeps {
  store: YzBridgeStore;
  getExpectedToken: () => string;
  getChatGptKey?: () => string;
  getChatGptSessionKey?: () => string;
  getChatGptSessionExpiresAt?: () => string;
  now?: () => number;
  rateLimiter?: InMemoryRateLimiter;
  chatGptRateLimiter?: InMemoryRateLimiter;
  enableGetEnqueue?: boolean;
}

function jsonError(res: express.Response, error: unknown): void {
  if (error instanceof YzBridgeError) {
    res.status(error.httpStatus).json({ ok: false, error: error.message, code: error.code });
    return;
  }
  const message = error instanceof Error ? error.message : "Internal error";
  console.error("[yzBridgeApi] unexpected error:", message);
  res.status(500).json({ ok: false, error: "Internal error", code: "internal" });
}

function requestIp(req: express.Request): string | undefined {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0].trim();
  }
  return req.ip;
}

function queryString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function authorizeChatGpt(req: express.Request, deps: YzBridgeApiDeps, mutating = true): void {
  assertChatGptAccess(req.query.key, {
    permanentKey: deps.getChatGptKey ? deps.getChatGptKey() : "",
    sessionKey: deps.getChatGptSessionKey ? deps.getChatGptSessionKey() : "",
    sessionExpiresAt: deps.getChatGptSessionExpiresAt ? deps.getChatGptSessionExpiresAt() : "",
    now: deps.now,
  });
  const limiter = deps.chatGptRateLimiter || deps.rateLimiter;
  if (limiter) {
    limiter.check(clientKey(requestIp(req), "chatgpt"), mutating);
  }
}

function chatgptUnauthorized(res: express.Response, error: unknown): boolean {
  if (error instanceof YzBridgeError && error.httpStatus === 401) {
    res.status(401).json({ ok: false, code: "unauthorized" });
    return true;
  }
  return false;
}

function toChatGptTaskView(task: YzBridgeTask) {
  return {
    id: task.id,
    project: task.project,
    title: task.title,
    status: task.status,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    claimedAt: task.claimedAt,
    completedAt: task.completedAt,
    resultSummary: task.resultSummary,
    changedFiles: task.changedFiles,
    tests: task.tests,
    error: task.error,
  };
}

function parseChatGptEnqueueQuery(req: express.Request): {
  title: string;
  instructions: string;
  project: string;
  priority: string;
  requestId: string | undefined;
} {
  const title = queryString(req.query.title).trim();
  const instructions = queryString(req.query.instructions).trim();
  const projectRaw = queryString(req.query.project).trim();
  const project = projectRaw || CHATGPT_PROJECT;
  const priorityRaw = queryString(req.query.priority).trim();
  const priority = priorityRaw || "normal";
  const requestIdRaw = queryString(req.query.requestId).trim();

  if (!title) throw new YzBridgeError(400, "invalid_argument", "title is required");
  if (!instructions) throw new YzBridgeError(400, "invalid_argument", "instructions is required");
  if (title.length > CHATGPT_MAX_TITLE) {
    throw new YzBridgeError(400, "invalid_argument", "title exceeds maximum length");
  }
  if (instructions.length > CHATGPT_MAX_INSTRUCTIONS) {
    throw new YzBridgeError(400, "invalid_argument", "instructions exceeds maximum length");
  }
  if (project !== CHATGPT_PROJECT) {
    throw new YzBridgeError(400, "invalid_argument", "project is not allowed");
  }
  if (!isPriority(priority)) {
    throw new YzBridgeError(400, "invalid_argument", "priority is invalid");
  }
  if (requestIdRaw && requestIdRaw.length > CHATGPT_MAX_REQUEST_ID) {
    throw new YzBridgeError(400, "invalid_argument", "requestId exceeds maximum length");
  }
  return {
    title,
    instructions,
    project,
    priority,
    requestId: requestIdRaw || undefined,
  };
}

function authorize(req: express.Request, deps: YzBridgeApiDeps, mutating: boolean): void {
  assertAuthenticated(req.headers.authorization, deps.getExpectedToken());
  const limiter = deps.rateLimiter;
  if (limiter) {
    limiter.check(clientKey(requestIp(req), req.header("x-yz-bridge-agent")), mutating);
  }
}

export function createYzBridgeApp(deps: YzBridgeApiDeps): express.Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "512kb" }));

  app.use((req, res, next) => {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Authorization, Content-Type, X-YZ-Bridge-Agent");
    res.set("Cache-Control", "no-store");
    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }
    next();
  });

  app.get("/status", async (req, res) => {
    try {
      authorize(req, deps, false);
      const status = await deps.store.status();
      res.json({ ...status, relay: "firestore", executeLocalCommands: false });
    } catch (error) {
      jsonError(res, error);
    }
  });

  app.get("/tasks", async (req, res) => {
    try {
      authorize(req, deps, false);
      const statusRaw = typeof req.query.status === "string" ? req.query.status : undefined;
      if (statusRaw && !isTaskStatus(statusRaw)) {
        throw new YzBridgeError(400, "invalid_argument", `Invalid status: ${statusRaw}`);
      }
      const tasks = await deps.store.listTasks({
        project: typeof req.query.project === "string" ? req.query.project : undefined,
        status: statusRaw && isTaskStatus(statusRaw) ? statusRaw : undefined,
        claimedBy: typeof req.query.claimedBy === "string" ? req.query.claimedBy : undefined,
        limit: req.query.limit ? Number(req.query.limit) : 50,
      });
      res.json({ ok: true, tasks });
    } catch (error) {
      jsonError(res, error);
    }
  });

  app.get("/task", async (req, res) => {
    try {
      authorize(req, deps, false);
      const id = typeof req.query.id === "string" ? req.query.id : "";
      if (!id) throw new YzBridgeError(400, "invalid_argument", "id is required");
      const task = await deps.store.getTask(id);
      if (!task) throw new YzBridgeError(404, "not_found", `Task not found: ${id}`);
      res.json({ ok: true, task });
    } catch (error) {
      jsonError(res, error);
    }
  });

  app.get("/task/:id", async (req, res) => {
    try {
      authorize(req, deps, false);
      const task = await deps.store.getTask(req.params.id);
      if (!task) throw new YzBridgeError(404, "not_found", `Task not found: ${req.params.id}`);
      res.json({ ok: true, task });
    } catch (error) {
      jsonError(res, error);
    }
  });

  app.post("/tasks", async (req, res) => {
    try {
      authorize(req, deps, true);
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const task = await deps.store.createTask({
        project: body.project,
        title: body.title,
        instructions: body.instructions,
        priority: body.priority,
        source: body.source,
        requestId: body.requestId,
      });
      res.status(201).json({ ok: true, taskId: task.id, status: task.status, task });
    } catch (error) {
      jsonError(res, error);
    }
  });

  app.get("/compat/enqueue", async (req, res) => {
    try {
      authorize(req, deps, true);
      if (!deps.enableGetEnqueue) {
        throw new YzBridgeError(
          405,
          "method_not_allowed",
          "GET enqueue is disabled. Use POST /tasks with an Authorization bearer token.",
        );
      }
      if (typeof req.query.token === "string" && req.query.token.length > 0) {
        throw new YzBridgeError(
          400,
          "invalid_argument",
          "Do not put API tokens in the query string. Use the Authorization header.",
        );
      }
      const task = await deps.store.createTask({
        project: typeof req.query.project === "string" ? req.query.project : "",
        title: typeof req.query.title === "string" ? req.query.title : "",
        instructions: typeof req.query.instructions === "string" ? req.query.instructions : "",
        priority: typeof req.query.priority === "string" ? req.query.priority : undefined,
        source: typeof req.query.source === "string" ? req.query.source : "chatgpt-get-compat",
        requestId: typeof req.query.requestId === "string" ? req.query.requestId : undefined,
      });
      res.json({ ok: true, taskId: task.id, status: task.status, task });
    } catch (error) {
      jsonError(res, error);
    }
  });

  app.post("/task/:id/claim", async (req, res) => {
    try {
      authorize(req, deps, true);
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const actor = String(body.actor || body.agentId || req.header("x-yz-bridge-agent") || "local-bridge");
      const task = await deps.store.claimTask(req.params.id, { actor, agentId: actor });
      await deps.store.heartbeat(actor, task.project, "claim");
      res.json({ ok: true, taskId: task.id, status: task.status, task });
    } catch (error) {
      jsonError(res, error);
    }
  });

  app.post("/task/:id/status", async (req, res) => {
    try {
      authorize(req, deps, true);
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const task = await deps.store.updateStatus(req.params.id, {
        status: body.status,
        actor: body.actor,
        error: body.error,
      });
      res.json({ ok: true, taskId: task.id, status: task.status, task });
    } catch (error) {
      jsonError(res, error);
    }
  });

  app.post("/task/:id/result", async (req, res) => {
    try {
      authorize(req, deps, true);
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const task = await deps.store.writeResult(req.params.id, {
        status: body.status,
        resultSummary: body.resultSummary ?? body.summary,
        changedFiles: body.changedFiles,
        tests: body.tests,
        error: body.error,
        actor: body.actor,
      });
      res.json({ ok: true, taskId: task.id, status: task.status, task });
    } catch (error) {
      jsonError(res, error);
    }
  });

  app.get("/chatgpt/enqueue", async (req, res) => {
    try {
      authorizeChatGpt(req, deps);
      const parsed = parseChatGptEnqueueQuery(req);
      const task = await deps.store.createTask({
        project: parsed.project,
        title: parsed.title,
        instructions: parsed.instructions,
        priority: parsed.priority,
        source: "chatgpt-get",
        requestId: parsed.requestId,
      });
      res.status(200).json({ ok: true, taskId: task.id, status: task.status });
    } catch (error) {
      if (chatgptUnauthorized(res, error)) return;
      jsonError(res, error);
    }
  });

  app.get("/chatgpt/task", async (req, res) => {
    try {
      authorizeChatGpt(req, deps, false);
      const id = queryString(req.query.id).trim();
      if (!id) throw new YzBridgeError(400, "invalid_argument", "id is required");
      const task = await deps.store.getTask(id);
      if (!task) throw new YzBridgeError(404, "not_found", "Task not found");
      res.json({ ok: true, task: toChatGptTaskView(task) });
    } catch (error) {
      if (chatgptUnauthorized(res, error)) return;
      jsonError(res, error);
    }
  });

  app.get("/chatgpt/chunks/create", async (req, res) => {
    try {
      authorizeChatGpt(req, deps);
      const title = queryString(req.query.title).trim();
      const projectRaw = queryString(req.query.project).trim();
      const project = projectRaw || CHATGPT_PROJECT;
      const priorityRaw = queryString(req.query.priority).trim();
      const priority = priorityRaw || "normal";
      const requestIdRaw = queryString(req.query.requestId).trim();
      if (!title) throw new YzBridgeError(400, "invalid_argument", "title is required");
      if (title.length > CHATGPT_MAX_TITLE) {
        throw new YzBridgeError(400, "invalid_argument", "title exceeds maximum length");
      }
      if (project !== CHATGPT_PROJECT) {
        throw new YzBridgeError(400, "invalid_argument", "project is not allowed");
      }
      if (!isPriority(priority)) {
        throw new YzBridgeError(400, "invalid_argument", "priority is invalid");
      }
      if (requestIdRaw && requestIdRaw.length > CHATGPT_MAX_REQUEST_ID) {
        throw new YzBridgeError(400, "invalid_argument", "requestId exceeds maximum length");
      }
      const buffer = await deps.store.createPromptBuffer({
        project,
        title,
        priority,
        requestId: requestIdRaw || undefined,
      });
      res.json({
        ok: true,
        bufferId: buffer.bufferId,
        status: buffer.status,
        nextChunk: buffer.nextChunk,
      });
    } catch (error) {
      if (chatgptUnauthorized(res, error)) return;
      jsonError(res, error);
    }
  });

  app.get("/chatgpt/chunks/append", async (req, res) => {
    try {
      authorizeChatGpt(req, deps);
      const bufferId = queryString(req.query.bufferId).trim();
      const indexRaw = queryString(req.query.index);
      if (!/^\d+$/.test(indexRaw)) {
        throw new YzBridgeError(400, "invalid_argument", "index must be a non-negative integer");
      }
      if (typeof req.query.data !== "string") {
        throw new YzBridgeError(400, "invalid_argument", "data is required");
      }
      const result = await deps.store.appendPromptChunk({
        bufferId,
        index: Number(indexRaw),
        data: req.query.data,
      });
      res.json({
        ok: true,
        bufferId: result.bufferId,
        index: result.index,
        receivedChunks: result.receivedChunks,
        totalCharacters: result.totalCharacters,
      });
    } catch (error) {
      if (chatgptUnauthorized(res, error)) return;
      jsonError(res, error);
    }
  });

  app.get("/chatgpt/chunks/status", async (req, res) => {
    try {
      authorizeChatGpt(req, deps, false);
      const bufferId = queryString(req.query.bufferId).trim();
      const buffer = await deps.store.getPromptBufferStatus(bufferId);
      res.json({
        ok: true,
        bufferId: buffer.bufferId,
        status: buffer.status,
        receivedChunks: buffer.receivedChunks,
        chunkCount: buffer.chunkCount,
        totalCharacters: buffer.totalCharacters,
        committedTaskId: buffer.committedTaskId,
        createdAt: buffer.createdAt,
        updatedAt: buffer.updatedAt,
        expiresAt: buffer.expiresAt,
      });
    } catch (error) {
      if (chatgptUnauthorized(res, error)) return;
      jsonError(res, error);
    }
  });

  app.get("/chatgpt/chunks/commit", async (req, res) => {
    try {
      authorizeChatGpt(req, deps);
      const bufferId = queryString(req.query.bufferId).trim();
      const chunkCountRaw = queryString(req.query.chunkCount).trim();
      let chunkCount: number | undefined;
      if (chunkCountRaw) {
        if (!/^\d+$/.test(chunkCountRaw)) {
          throw new YzBridgeError(400, "invalid_argument", "chunkCount must be a non-negative integer");
        }
        chunkCount = Number(chunkCountRaw);
      }
      const result = await deps.store.commitPromptBuffer({ bufferId, chunkCount });
      res.json({
        ok: true,
        bufferId: result.bufferId,
        taskId: result.taskId,
        status: result.status,
      });
    } catch (error) {
      if (chatgptUnauthorized(res, error)) return;
      jsonError(res, error);
    }
  });

  app.use((req, res) => {
    res.status(404).json({ ok: false, error: "Not found", code: "not_found" });
  });

  return app;
}

let cachedApp: express.Express | null = null;

export function getProductionYzBridgeApp(): express.Express {
  if (!cachedApp) {
    if (!admin.apps.length) {
      admin.initializeApp({
        storageBucket: "carexpert-94faa.firebasestorage.app",
      });
    }
    cachedApp = createYzBridgeApp({
      store: createYzBridgeStore(admin.firestore()),
      getExpectedToken: readExpectedApiToken,
      getChatGptKey: readExpectedChatGptKey,
      getChatGptSessionKey: readExpectedChatGptSessionKey,
      getChatGptSessionExpiresAt: readChatGptSessionExpiresAt,
      rateLimiter: new InMemoryRateLimiter(),
      chatGptRateLimiter: new InMemoryRateLimiter({ maxMutating: 30, maxRead: 30 }),
      enableGetEnqueue: process.env.YZ_BRIDGE_ENABLE_GET_ENQUEUE === "true",
    });
  }
  return cachedApp;
}

export function handleYzBridgeRequest(
  req: functions.https.Request,
  res: functions.Response,
): void {
  getProductionYzBridgeApp()(req, res);
}
