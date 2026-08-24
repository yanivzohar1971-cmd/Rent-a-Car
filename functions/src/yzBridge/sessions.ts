import { createHash, randomBytes, timingSafeEqual } from "crypto";
import {
  ChatGptBootstrapResult,
  ChatGptHandoffCreateResult,
  ChatGptSessionPublic,
  ChatGptSessionStatus,
  HANDOFF_LIMITS,
  SESSION_DURATION_SECONDS,
  YZ_BRIDGE_CHATGPT_HANDOFFS_COLLECTION,
  YZ_BRIDGE_CHATGPT_SESSIONS_COLLECTION,
  YzBridgeError,
} from "./types";

export function sha256Hex(value: string): string {
  return createHash("sha256").update(String(value), "utf8").digest("hex");
}

export function generateSecretToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function normalizeSessionDurationSeconds(raw: unknown): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n) || n <= 0) return SESSION_DURATION_SECONDS.default;
  const allowed = new Set([
    SESSION_DURATION_SECONDS.oneHour,
    SESSION_DURATION_SECONDS.oneDay,
    SESSION_DURATION_SECONDS.sevenDays,
  ]);
  if (allowed.has(n)) return n;
  return Math.min(SESSION_DURATION_SECONDS.max, Math.max(SESSION_DURATION_SECONDS.oneHour, Math.floor(n)));
}

export function normalizeHandoffTtlSeconds(raw: unknown): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n) || n <= 0) return HANDOFF_LIMITS.defaultTtlSeconds;
  return Math.min(HANDOFF_LIMITS.maxTtlSeconds, Math.max(HANDOFF_LIMITS.minTtlSeconds, Math.floor(n)));
}

function toIso(ms: number): string {
  return new Date(ms).toISOString();
}

function readExpiresAtMs(data: Record<string, unknown> | undefined, nowMs: number): number {
  if (!data) return 0;
  if (typeof data.expiresAtMs === "number" && Number.isFinite(data.expiresAtMs)) return data.expiresAtMs;
  if (typeof data.expiresAt === "string") {
    const parsed = Date.parse(data.expiresAt);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function deriveStatus(data: Record<string, unknown>, nowMs: number): ChatGptSessionStatus {
  if (data.revokedAt || data.status === "REVOKED") return "REVOKED";
  const expiresAtMs = readExpiresAtMs(data, nowMs);
  if (expiresAtMs > 0 && nowMs >= expiresAtMs) return "EXPIRED";
  if (data.status === "EXPIRED") return "EXPIRED";
  return "ACTIVE";
}

function toPublicSession(id: string, data: Record<string, unknown>, nowMs: number): ChatGptSessionPublic {
  const status = deriveStatus(data, nowMs);
  return {
    id,
    schemaVersion: 1,
    createdAt: String(data.createdAt || ""),
    expiresAt: String(data.expiresAt || ""),
    revokedAt: data.revokedAt ? String(data.revokedAt) : null,
    lastUsedAt: data.lastUsedAt ? String(data.lastUsedAt) : null,
    createdVia: String(data.createdVia || "dashboard-handoff"),
    label: data.label == null || data.label === "" ? null : String(data.label),
    status,
  };
}

export interface ChatGptSessionStore {
  createHandoff(input?: {
    sessionDurationSeconds?: number;
    handoffTtlSeconds?: number;
    label?: string | null;
  }): Promise<ChatGptHandoffCreateResult>;
  exchangeHandoff(code: unknown): Promise<ChatGptBootstrapResult>;
  findActiveSessionByKey(providedKey: unknown): Promise<ChatGptSessionPublic | null>;
  touchSession(sessionId: string): Promise<void>;
  listSessions(limit?: number): Promise<ChatGptSessionPublic[]>;
  revokeSession(sessionId: string): Promise<ChatGptSessionPublic>;
  revokeAllSessions(): Promise<{ revoked: number }>;
}

export interface ChatGptSessionStoreOptions {
  now?: () => number;
  generateToken?: (bytes?: number) => string;
}

export function createChatGptSessionStore(
  db: FirebaseFirestore.Firestore,
  options: ChatGptSessionStoreOptions = {},
): ChatGptSessionStore {
  const now = options.now || Date.now;
  const generateToken = options.generateToken || generateSecretToken;
  const handoffs = () => db.collection(YZ_BRIDGE_CHATGPT_HANDOFFS_COLLECTION);
  const sessions = () => db.collection(YZ_BRIDGE_CHATGPT_SESSIONS_COLLECTION);

  return {
    async createHandoff(input = {}) {
      const sessionDurationSeconds = normalizeSessionDurationSeconds(input.sessionDurationSeconds);
      const handoffTtlSeconds = normalizeHandoffTtlSeconds(input.handoffTtlSeconds);
      const label = input.label == null ? null : String(input.label).trim().slice(0, 120) || null;
      const code = generateToken(32);
      const handoffId = sha256Hex(code);
      const createdMs = now();
      const expiresAtMs = createdMs + handoffTtlSeconds * 1000;
      await handoffs().doc(handoffId).set({
        schemaVersion: 1,
        createdAt: toIso(createdMs),
        expiresAt: toIso(expiresAtMs),
        expiresAtMs,
        // Firestore TTL field (optional future auto-delete). Not required for correctness.
        expireAt: toIso(expiresAtMs),
        consumedAt: null,
        requestedSessionDurationSeconds: sessionDurationSeconds,
        label,
        status: "OPEN",
        createdVia: "dashboard-handoff",
      });
      return {
        handoffId,
        code,
        bootstrapPath: `/chatgpt/bootstrap?code=${encodeURIComponent(code)}`,
        expiresAt: toIso(expiresAtMs),
        expiresInSeconds: handoffTtlSeconds,
        requestedSessionDurationSeconds: sessionDurationSeconds,
        label,
      };
    },

    async exchangeHandoff(code: unknown) {
      if (typeof code !== "string" || !code.trim()) {
        throw new YzBridgeError(400, "invalid_argument", "code is required");
      }
      const trimmed = code.trim();
      if (trimmed.length < 16 || trimmed.length > 256) {
        throw new YzBridgeError(401, "unauthorized", "unauthorized");
      }
      const handoffId = sha256Hex(trimmed);
      const handoffRef = handoffs().doc(handoffId);

      return db.runTransaction(async (tx) => {
        const snap = await tx.get(handoffRef);
        if (!snap.exists) {
          throw new YzBridgeError(401, "unauthorized", "unauthorized");
        }
        const data = (snap.data() || {}) as Record<string, unknown>;
        const nowMs = now();
        const expiresAtMs = readExpiresAtMs(data, nowMs);
        if (data.status === "CONSUMED" || data.consumedAt) {
          throw new YzBridgeError(409, "already_used", "Handoff already used");
        }
        if (data.status === "EXPIRED" || (expiresAtMs > 0 && nowMs >= expiresAtMs)) {
          tx.update(handoffRef, { status: "EXPIRED" });
          throw new YzBridgeError(410, "expired", "Handoff expired");
        }
        if (data.status !== "OPEN") {
          throw new YzBridgeError(401, "unauthorized", "unauthorized");
        }

        const sessionKey = generateToken(32);
        const sessionId = sha256Hex(sessionKey);
        const sessionRef = sessions().doc(sessionId);
        const sessionDurationSeconds = normalizeSessionDurationSeconds(data.requestedSessionDurationSeconds);
        const sessionExpiresAtMs = nowMs + sessionDurationSeconds * 1000;
        const label = data.label == null || data.label === "" ? null : String(data.label);

        tx.update(handoffRef, {
          status: "CONSUMED",
          consumedAt: toIso(nowMs),
          consumedSessionId: sessionId,
        });
        tx.set(sessionRef, {
          schemaVersion: 1,
          createdAt: toIso(nowMs),
          expiresAt: toIso(sessionExpiresAtMs),
          expiresAtMs: sessionExpiresAtMs,
          expireAt: toIso(sessionExpiresAtMs),
          revokedAt: null,
          lastUsedAt: null,
          createdVia: "dashboard-handoff",
          label,
          status: "ACTIVE",
          handoffId,
        });

        return {
          sessionKey,
          expiresAt: toIso(sessionExpiresAtMs),
          sessionId,
          label,
        };
      });
    },

    async findActiveSessionByKey(providedKey: unknown) {
      if (typeof providedKey !== "string" || !providedKey.trim()) return null;
      const sessionId = sha256Hex(providedKey.trim());
      const snap = await sessions().doc(sessionId).get();
      if (!snap.exists) return null;
      const data = (snap.data() || {}) as Record<string, unknown>;
      const nowMs = now();
      const status = deriveStatus(data, nowMs);
      if (status !== "ACTIVE") return null;
      // Confirm hash id matches stored path (defense in depth).
      if (!timingSafeEqual(Buffer.from(sessionId), Buffer.from(snap.id))) return null;
      return toPublicSession(snap.id, data, nowMs);
    },

    async touchSession(sessionId: string) {
      const id = String(sessionId || "").trim();
      if (!id) return;
      try {
        await sessions().doc(id).update({ lastUsedAt: toIso(now()) });
      } catch {
        // best-effort metadata only
      }
    },

    async listSessions(limit = 50) {
      const capped = Math.max(1, Math.min(100, Number(limit) || 50));
      const snap = await sessions().limit(capped).get();
      const nowMs = now();
      const list = snap.docs.map((doc) => toPublicSession(doc.id, (doc.data() || {}) as Record<string, unknown>, nowMs));
      list.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
      return list;
    },

    async revokeSession(sessionId: string) {
      const id = String(sessionId || "").trim();
      if (!id) throw new YzBridgeError(400, "invalid_argument", "session id is required");
      const ref = sessions().doc(id);
      const snap = await ref.get();
      if (!snap.exists) throw new YzBridgeError(404, "not_found", "Session not found");
      const nowMs = now();
      const data = (snap.data() || {}) as Record<string, unknown>;
      if (!data.revokedAt) {
        await ref.update({
          status: "REVOKED",
          revokedAt: toIso(nowMs),
        });
      }
      const after = await ref.get();
      return toPublicSession(id, (after.data() || {}) as Record<string, unknown>, nowMs);
    },

    async revokeAllSessions() {
      const snap = await sessions().limit(200).get();
      const nowMs = now();
      let revoked = 0;
      for (const doc of snap.docs) {
        const data = (doc.data() || {}) as Record<string, unknown>;
        if (data.revokedAt || data.status === "REVOKED") continue;
        await sessions().doc(doc.id).update({
          status: "REVOKED",
          revokedAt: toIso(nowMs),
        });
        revoked += 1;
      }
      return { revoked };
    },
  };
}
