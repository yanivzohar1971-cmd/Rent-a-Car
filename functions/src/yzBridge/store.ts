import * as admin from "firebase-admin";
import {
  canTransition,
  CHUNK_LIMITS,
  ChunkLimits,
  CreateTaskInput,
  ClaimTaskInput,
  CreatePromptBufferInput,
  AppendPromptChunkInput,
  CommitPromptBufferInput,
  isPriority,
  isTaskStatus,
  ListTasksQuery,
  PromptBufferPublic,
  PromptBufferStatus,
  ResultInput,
  StatusUpdateInput,
  YZ_BRIDGE_AGENTS_COLLECTION,
  YZ_BRIDGE_PROMPT_BUFFERS_COLLECTION,
  YZ_BRIDGE_TASKS_COLLECTION,
  YzBridgeError,
  YzBridgePriority,
  YzBridgeTask,
  YzBridgeTaskStatus,
} from "./types";

const MAX_TITLE = 200;
const MAX_PROJECT = 120;
const MAX_INSTRUCTIONS = 100_000;
const MAX_SOURCE = 80;
const MAX_REQUEST_ID = 128;
const MAX_ACTOR = 80;
const MAX_LIST = 100;

export interface YzBridgeStore {
  createTask(input: CreateTaskInput): Promise<YzBridgeTask>;
  getTask(id: string): Promise<YzBridgeTask | null>;
  listTasks(query: ListTasksQuery): Promise<YzBridgeTask[]>;
  claimTask(id: string, input: ClaimTaskInput): Promise<YzBridgeTask>;
  updateStatus(id: string, input: StatusUpdateInput): Promise<YzBridgeTask>;
  writeResult(id: string, input: ResultInput): Promise<YzBridgeTask>;
  heartbeat(agentId: string, project: string, lastAction: string): Promise<void>;
  status(): Promise<{ ok: true; service: string; taskCount: number; byStatus: Record<string, number> }>;
  createPromptBuffer(input: CreatePromptBufferInput): Promise<PromptBufferPublic>;
  appendPromptChunk(input: AppendPromptChunkInput): Promise<{
    bufferId: string;
    index: number;
    receivedChunks: number;
    totalCharacters: number;
  }>;
  getPromptBufferStatus(bufferId: string): Promise<PromptBufferPublic>;
  commitPromptBuffer(input: CommitPromptBufferInput): Promise<{
    bufferId: string;
    taskId: string;
    status: "QUEUED";
    instructions: string;
  }>;
}

function trimString(value: unknown, field: string, max: number, required: boolean): string {
  if (value == null) {
    if (required) throw new YzBridgeError(400, "invalid_argument", `${field} is required`);
    return "";
  }
  if (typeof value !== "string") {
    throw new YzBridgeError(400, "invalid_argument", `${field} must be a string`);
  }
  const trimmed = value.trim();
  if (required && !trimmed) {
    throw new YzBridgeError(400, "invalid_argument", `${field} is required`);
  }
  if (trimmed.length > max) {
    throw new YzBridgeError(400, "invalid_argument", `${field} exceeds maximum length ${max}`);
  }
  return trimmed;
}

function sanitizeArray(value: unknown): string[] {
  if (value == null) return [];
  if (!Array.isArray(value)) {
    throw new YzBridgeError(400, "invalid_argument", "expected an array of strings");
  }
  return value.map((item) => String(item)).filter(Boolean).slice(0, 500);
}

function normalizePriority(value: unknown): YzBridgePriority {
  const raw = value == null || value === "" ? "normal" : String(value).toLowerCase();
  if (!isPriority(raw)) {
    throw new YzBridgeError(400, "invalid_argument", `Invalid priority: ${String(value)}`);
  }
  return raw;
}

function toPublicTask(id: string, data: FirebaseFirestore.DocumentData | undefined): YzBridgeTask {
  const fallbackStatus = data?.status;
  const status: YzBridgeTaskStatus = isTaskStatus(fallbackStatus) ? fallbackStatus : "QUEUED";
  return {
    id,
    project: String(data?.project || ""),
    title: String(data?.title || ""),
    instructions: String(data?.instructions || ""),
    priority: isPriority(data?.priority) ? data.priority : "normal",
    status,
    createdAt: data?.createdAt ?? null,
    updatedAt: data?.updatedAt ?? null,
    claimedAt: data?.claimedAt ?? null,
    completedAt: data?.completedAt ?? null,
    claimedBy: data?.claimedBy ?? null,
    resultSummary: data?.resultSummary ?? null,
    changedFiles: Array.isArray(data?.changedFiles) ? data.changedFiles.map(String) : [],
    tests: Array.isArray(data?.tests) ? data.tests.map(String) : [],
    error: data?.error ?? null,
    source: String(data?.source || "unknown"),
    requestId: data?.requestId ?? null,
    metadata: data?.metadata && typeof data.metadata === "object" ? data.metadata : {},
  };
}

export function createYzBridgeStore(
  db: FirebaseFirestore.Firestore,
  limitOverrides: Partial<ChunkLimits> = {},
): YzBridgeStore {
  const limits: ChunkLimits = { ...CHUNK_LIMITS, ...limitOverrides };
  const tasks = () => db.collection(YZ_BRIDGE_TASKS_COLLECTION);
  const agents = () => db.collection(YZ_BRIDGE_AGENTS_COLLECTION);
  const buffers = () => db.collection(YZ_BRIDGE_PROMPT_BUFFERS_COLLECTION);

  async function findByRequestId(requestId: string): Promise<YzBridgeTask | null> {
    const snap = await tasks().where("requestId", "==", requestId).limit(1).get();
    if (snap.empty) return null;
    const doc = snap.docs[0];
    return toPublicTask(doc.id, doc.data());
  }

  function nextMissingIndex(indexes: number[]): number {
    const set = new Set(indexes);
    let i = 0;
    while (set.has(i)) i += 1;
    return i;
  }

  function toBufferPublic(id: string, data: FirebaseFirestore.DocumentData, indexes: number[]): PromptBufferPublic {
    return {
      bufferId: id,
      status: data.status as PromptBufferStatus,
      receivedChunks: Number(data.receivedChunks || 0),
      chunkCount: data.chunkCount == null ? null : Number(data.chunkCount),
      totalCharacters: Number(data.totalCharacters || 0),
      committedTaskId: data.committedTaskId || null,
      createdAt: data.createdAt ?? null,
      updatedAt: data.updatedAt ?? null,
      expiresAt: data.expiresAt ?? null,
      nextChunk: nextMissingIndex(indexes),
      title: data.title,
      project: data.project,
      priority: data.priority,
      requestId: data.requestId ?? null,
    };
  }

  async function loadChunkIndexes(bufferId: string): Promise<number[]> {
    const snap = await buffers().doc(bufferId).collection("chunks").get();
    return snap.docs.map((doc) => Number(doc.data().index)).filter((n) => Number.isInteger(n)).sort((a, b) => a - b);
  }

  async function expireIfNeeded(
    ref: FirebaseFirestore.DocumentReference,
    data: FirebaseFirestore.DocumentData,
  ): Promise<FirebaseFirestore.DocumentData> {
    if (data.status !== "OPEN") return data;
    const expiresAtMs = Number(data.expiresAtMs || 0);
    if (expiresAtMs > 0 && Date.now() >= expiresAtMs) {
      const patch = {
        status: "EXPIRED" as PromptBufferStatus,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        error: "expired",
      };
      await ref.update(patch);
      return { ...data, ...patch };
    }
    return data;
  }

  async function findBufferByRequestId(requestId: string): Promise<PromptBufferPublic | null> {
    const snap = await buffers().where("requestId", "==", requestId).limit(5).get();
    for (const doc of snap.docs) {
      let data = doc.data();
      data = await expireIfNeeded(doc.ref, data);
      if (data.status === "OPEN" || data.status === "COMMITTED") {
        const indexes = await loadChunkIndexes(doc.id);
        return toBufferPublic(doc.id, data, indexes);
      }
    }
    return null;
  }

  return {
    async createTask(input: CreateTaskInput): Promise<YzBridgeTask> {
      const project = trimString(input.project, "project", MAX_PROJECT, true);
      const title = trimString(input.title, "title", MAX_TITLE, true);
      const maxInstructions = input.exactInstructions ? limits.maxAssembledChars : MAX_INSTRUCTIONS;
      let instructions: string;
      if (input.exactInstructions) {
        if (typeof input.instructions !== "string") {
          throw new YzBridgeError(400, "invalid_argument", "instructions is required");
        }
        instructions = input.instructions;
        if (!instructions) {
          throw new YzBridgeError(400, "invalid_argument", "instructions is required");
        }
        if (instructions.length > maxInstructions) {
          throw new YzBridgeError(413, "too_large", "assembled prompt exceeds maximum length");
        }
      } else {
        instructions = trimString(input.instructions, "instructions", maxInstructions, true);
      }
      const source = trimString(input.source || "chatgpt", "source", MAX_SOURCE, true) || "chatgpt";
      const requestId = trimString(input.requestId || "", "requestId", MAX_REQUEST_ID, false) || null;
      const priority = normalizePriority(input.priority);
      const metadata = input.metadata && typeof input.metadata === "object" ? input.metadata : {};

      if (requestId && !input.skipRequestIdDedup) {
        const existing = await findByRequestId(requestId);
        if (existing) return existing;
      }

      const ref = tasks().doc();
      const payload = {
        id: ref.id,
        project,
        title,
        instructions,
        priority,
        status: "QUEUED" as YzBridgeTaskStatus,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        claimedAt: null,
        completedAt: null,
        claimedBy: null,
        resultSummary: null,
        changedFiles: [],
        tests: [],
        error: null,
        source,
        requestId,
        metadata,
      };
      await ref.set(payload);
      const created = await ref.get();
      return toPublicTask(ref.id, created.data());
    },

    async getTask(id: string): Promise<YzBridgeTask | null> {
      const cleanId = trimString(id, "id", 128, true);
      const snap = await tasks().doc(cleanId).get();
      if (!snap.exists) return null;
      return toPublicTask(snap.id, snap.data());
    },

    async listTasks(query: ListTasksQuery): Promise<YzBridgeTask[]> {
      const limit = Math.max(1, Math.min(Number(query.limit) || 50, MAX_LIST));
      // Use a single equality filter so this works before composite indexes are deployed.
      let ref: FirebaseFirestore.Query = tasks();
      if (query.status) {
        if (!isTaskStatus(query.status)) {
          throw new YzBridgeError(400, "invalid_argument", `Invalid status: ${query.status}`);
        }
        ref = ref.where("status", "==", query.status);
      } else if (query.claimedBy) {
        ref = ref.where("claimedBy", "==", trimString(query.claimedBy, "claimedBy", MAX_ACTOR, true));
      } else if (query.project) {
        ref = ref.where("project", "==", trimString(query.project, "project", MAX_PROJECT, true));
      }
      const snap = await ref.limit(MAX_LIST).get();
      const projectFilter = query.project
        ? trimString(query.project, "project", MAX_PROJECT, true)
        : "";
      const claimedByFilter = query.claimedBy
        ? trimString(query.claimedBy, "claimedBy", MAX_ACTOR, true)
        : "";
      return snap.docs
        .map((doc) => toPublicTask(doc.id, doc.data()))
        .filter((task) => !projectFilter || task.project === projectFilter)
        .filter((task) => !query.status || task.status === query.status)
        .filter((task) => !claimedByFilter || task.claimedBy === claimedByFilter)
        .slice(0, limit);
    },

    async claimTask(id: string, input: ClaimTaskInput): Promise<YzBridgeTask> {
      const cleanId = trimString(id, "id", 128, true);
      const actor = trimString(input.actor || input.agentId || "local-bridge", "actor", MAX_ACTOR, true);
      const ref = tasks().doc(cleanId);

      await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) {
          throw new YzBridgeError(404, "not_found", `Task not found: ${cleanId}`);
        }
        const data = snap.data() || {};
        if (data.status !== "QUEUED") {
          throw new YzBridgeError(
            409,
            "already_claimed",
            `Task ${cleanId} cannot be claimed from status ${data.status}`,
          );
        }
        tx.update(ref, {
          status: "CLAIMED",
          claimedBy: actor,
          claimedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      });

      const updated = await ref.get();
      return toPublicTask(ref.id, updated.data());
    },

    async updateStatus(id: string, input: StatusUpdateInput): Promise<YzBridgeTask> {
      const cleanId = trimString(id, "id", 128, true);
      if (!isTaskStatus(input.status)) {
        throw new YzBridgeError(400, "invalid_argument", `Invalid status: ${String(input.status)}`);
      }
      const ref = tasks().doc(cleanId);
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) {
          throw new YzBridgeError(404, "not_found", `Task not found: ${cleanId}`);
        }
        const data = snap.data() || {};
        const from = data.status as YzBridgeTaskStatus;
        if (!canTransition(from, input.status)) {
          throw new YzBridgeError(
            409,
            "invalid_transition",
            `Cannot transition ${from} -> ${input.status}`,
          );
        }
        const patch: FirebaseFirestore.UpdateData<FirebaseFirestore.DocumentData> = {
          status: input.status,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };
        if (input.error !== undefined) patch.error = input.error;
        if (input.status === "COMPLETED" || input.status === "FAILED" || input.status === "CANCELLED") {
          patch.completedAt = admin.firestore.FieldValue.serverTimestamp();
        }
        tx.update(ref, patch);
      });
      const updated = await ref.get();
      return toPublicTask(ref.id, updated.data());
    },

    async writeResult(id: string, input: ResultInput): Promise<YzBridgeTask> {
      const cleanId = trimString(id, "id", 128, true);
      if (input.status !== "COMPLETED" && input.status !== "FAILED" && input.status !== "CANCELLED") {
        throw new YzBridgeError(400, "invalid_argument", "result status must be COMPLETED, FAILED, or CANCELLED");
      }
      const ref = tasks().doc(cleanId);
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) {
          throw new YzBridgeError(404, "not_found", `Task not found: ${cleanId}`);
        }
        const data = snap.data() || {};
        const from = data.status as YzBridgeTaskStatus;
        if (!canTransition(from, input.status) && from !== input.status) {
          throw new YzBridgeError(
            409,
            "invalid_transition",
            `Cannot write result ${input.status} from ${from}`,
          );
        }
        tx.update(ref, {
          status: input.status,
          resultSummary: input.resultSummary != null ? String(input.resultSummary) : data.resultSummary ?? null,
          changedFiles: sanitizeArray(input.changedFiles),
          tests: sanitizeArray(input.tests),
          error: input.error != null ? String(input.error) : null,
          completedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      });
      const updated = await ref.get();
      return toPublicTask(ref.id, updated.data());
    },

    async heartbeat(agentId: string, project: string, lastAction: string): Promise<void> {
      const id = trimString(agentId, "agentId", MAX_ACTOR, true);
      await agents().doc(id).set(
        {
          id,
          project: trimString(project || "Rent_a_Car", "project", MAX_PROJECT, true),
          lastAction: trimString(lastAction || "poll", "lastAction", 80, true),
          lastSeenAt: admin.firestore.FieldValue.serverTimestamp(),
          status: "online",
        },
        { merge: true },
      );
    },

    async status() {
      const snap = await tasks().limit(MAX_LIST).get();
      const byStatus: Record<string, number> = {};
      for (const doc of snap.docs) {
        const status = String(doc.data().status || "UNKNOWN");
        byStatus[status] = (byStatus[status] || 0) + 1;
      }
      return {
        ok: true as const,
        service: "yzBridgeApi",
        taskCount: snap.size,
        byStatus,
      };
    },

    async createPromptBuffer(input: CreatePromptBufferInput): Promise<PromptBufferPublic> {
      const project = trimString(input.project, "project", MAX_PROJECT, true);
      const title = trimString(input.title, "title", MAX_TITLE, true);
      const priority = normalizePriority(input.priority);
      const requestId = trimString(input.requestId || "", "requestId", MAX_REQUEST_ID, false) || null;
      if (requestId) {
        const existing = await findBufferByRequestId(requestId);
        if (existing) return existing;
      }
      const ref = buffers().doc();
      const expiresAtMs = Date.now() + limits.ttlMs;
      const payload = {
        id: ref.id,
        project,
        title,
        priority,
        requestId,
        source: "chatgpt-chunks",
        status: "OPEN" as PromptBufferStatus,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        expiresAt: admin.firestore.Timestamp.fromMillis(expiresAtMs),
        expiresAtMs,
        chunkCount: null,
        receivedChunks: 0,
        totalCharacters: 0,
        committedTaskId: null,
        error: null,
      };
      await ref.set(payload);
      return toBufferPublic(ref.id, payload, []);
    },

    async appendPromptChunk(input: AppendPromptChunkInput) {
      const bufferId = trimString(input.bufferId, "bufferId", 128, true);
      if (!Number.isInteger(input.index) || input.index < 0) {
        throw new YzBridgeError(400, "invalid_argument", "index must be a non-negative integer");
      }
      if (typeof input.data !== "string") {
        throw new YzBridgeError(400, "invalid_argument", "data is required");
      }
      const content = input.data;
      if (content.length > limits.maxChunkChars) {
        throw new YzBridgeError(413, "too_large", "chunk exceeds maximum length");
      }
      if (input.index >= limits.maxChunks) {
        throw new YzBridgeError(413, "too_large", "too many chunks");
      }

      const ref = buffers().doc(bufferId);
      const chunkRef = ref.collection("chunks").doc(String(input.index));
      let receivedChunks = 0;
      let totalCharacters = 0;

      await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) throw new YzBridgeError(404, "not_found", "unknown buffer");
        let data = snap.data() || {};
        if (data.status === "OPEN") {
          const expiresAtMs = Number(data.expiresAtMs || 0);
          if (expiresAtMs > 0 && Date.now() >= expiresAtMs) {
            tx.update(ref, {
              status: "EXPIRED",
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              error: "expired",
            });
            throw new YzBridgeError(409, "expired", "buffer expired");
          }
        }
        if (data.status !== "OPEN") {
          throw new YzBridgeError(409, "invalid_state", `buffer is ${data.status}`);
        }
        const existingChunk = await tx.get(chunkRef);
        if (existingChunk.exists) {
          const previous = String(existingChunk.data()?.content ?? "");
          if (previous === content) {
            receivedChunks = Number(data.receivedChunks || 0);
            totalCharacters = Number(data.totalCharacters || 0);
            return;
          }
          throw new YzBridgeError(409, "conflict", "chunk index already exists with different content");
        }
        if (Number(data.receivedChunks || 0) >= limits.maxChunks) {
          throw new YzBridgeError(413, "too_large", "too many chunks");
        }
        const nextTotal = Number(data.totalCharacters || 0) + content.length;
        if (nextTotal > limits.maxAssembledChars) {
          throw new YzBridgeError(413, "too_large", "assembled prompt exceeds maximum length");
        }
        receivedChunks = Number(data.receivedChunks || 0) + 1;
        totalCharacters = nextTotal;
        tx.set(chunkRef, {
          index: input.index,
          content,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          characterCount: content.length,
        });
        tx.update(ref, {
          receivedChunks,
          totalCharacters,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      });

      return { bufferId, index: input.index, receivedChunks, totalCharacters };
    },

    async getPromptBufferStatus(bufferId: string): Promise<PromptBufferPublic> {
      const id = trimString(bufferId, "bufferId", 128, true);
      const ref = buffers().doc(id);
      const snap = await ref.get();
      if (!snap.exists) throw new YzBridgeError(404, "not_found", "unknown buffer");
      const data = await expireIfNeeded(ref, snap.data() || {});
      const indexes = await loadChunkIndexes(id);
      return toBufferPublic(id, data, indexes);
    },

    async commitPromptBuffer(input: CommitPromptBufferInput) {
      const bufferId = trimString(input.bufferId, "bufferId", 128, true);
      const ref = buffers().doc(bufferId);
      const snap = await ref.get();
      if (!snap.exists) throw new YzBridgeError(404, "not_found", "unknown buffer");
      let data = await expireIfNeeded(ref, snap.data() || {});
      if (data.status === "COMMITTED" && data.committedTaskId) {
        const existing = await tasks().doc(String(data.committedTaskId)).get();
        return {
          bufferId,
          taskId: String(data.committedTaskId),
          status: "QUEUED" as const,
          instructions: String(existing.data()?.instructions || ""),
        };
      }
      if (data.status !== "OPEN") {
        throw new YzBridgeError(409, "invalid_state", `buffer is ${data.status}`);
      }

      const chunkSnap = await ref.collection("chunks").get();
      const chunks = chunkSnap.docs
        .map((doc) => ({
          index: Number(doc.data().index),
          content: String(doc.data().content ?? ""),
        }))
        .sort((a, b) => a.index - b.index);

      if (chunks.length === 0) {
        throw new YzBridgeError(400, "invalid_argument", "no chunks to commit");
      }
      if (chunks[0].index !== 0) {
        throw new YzBridgeError(409, "invalid_state", "chunk sequence must start at 0");
      }
      for (let i = 0; i < chunks.length; i += 1) {
        if (chunks[i].index !== i) {
          throw new YzBridgeError(409, "invalid_state", "chunk sequence has gaps");
        }
      }
      if (input.chunkCount != null && input.chunkCount !== chunks.length) {
        throw new YzBridgeError(400, "invalid_argument", "chunkCount mismatch");
      }
      const instructions = chunks.map((chunk) => chunk.content).join("");
      if (instructions.length > limits.maxAssembledChars) {
        throw new YzBridgeError(413, "too_large", "assembled prompt exceeds maximum length");
      }

      const storeApi = this as YzBridgeStore;
      const task = await storeApi.createTask({
        project: String(data.project || "Rent_a_Car"),
        title: String(data.title || ""),
        instructions,
        priority: String(data.priority || "normal"),
        source: "chatgpt-chunks",
        requestId: data.requestId || null,
        exactInstructions: true,
        skipRequestIdDedup: true,
        metadata: {
          transport: "chunks",
          promptBufferId: bufferId,
          requestId: data.requestId || null,
        },
      });

      const latest = await ref.get();
      const latestData = latest.data() || {};
      if (latestData.status === "COMMITTED" && latestData.committedTaskId) {
        return {
          bufferId,
          taskId: String(latestData.committedTaskId),
          status: "QUEUED" as const,
          instructions: String((await tasks().doc(String(latestData.committedTaskId)).get()).data()?.instructions || instructions),
        };
      }

      await ref.update({
        status: "COMMITTED",
        committedTaskId: task.id,
        chunkCount: chunks.length,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        error: null,
      });

      return {
        bufferId,
        taskId: task.id,
        status: "QUEUED" as const,
        instructions,
      };
    },
  };
}
