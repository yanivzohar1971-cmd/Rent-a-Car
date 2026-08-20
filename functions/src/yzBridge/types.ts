export const YZ_BRIDGE_TASKS_COLLECTION = "yzDevBridgeTasks";
export const YZ_BRIDGE_AGENTS_COLLECTION = "yzDevBridgeAgents";
export const YZ_BRIDGE_PROMPT_BUFFERS_COLLECTION = "yzDevBridgePromptBuffers";

export const CHUNK_LIMITS = {
  maxChunkChars: 6000,
  maxChunks: 100,
  maxAssembledChars: 300_000,
  ttlMs: 24 * 60 * 60 * 1000,
} as const;

export const BUFFER_STATUSES = ["OPEN", "COMMITTED", "EXPIRED", "FAILED"] as const;
export type PromptBufferStatus = typeof BUFFER_STATUSES[number];

export const TASK_STATUSES = [
  "QUEUED",
  "CLAIMED",
  "RUNNING",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
] as const;

export type YzBridgeTaskStatus = typeof TASK_STATUSES[number];

export const PRIORITIES = ["low", "normal", "high", "critical"] as const;
export type YzBridgePriority = typeof PRIORITIES[number];

export const TERMINAL_STATUSES: readonly YzBridgeTaskStatus[] = [
  "COMPLETED",
  "FAILED",
  "CANCELLED",
];

export const ALLOWED_TRANSITIONS: Record<YzBridgeTaskStatus, readonly YzBridgeTaskStatus[]> = {
  QUEUED: ["CLAIMED", "CANCELLED"],
  CLAIMED: ["RUNNING", "COMPLETED", "FAILED", "CANCELLED", "QUEUED"],
  RUNNING: ["COMPLETED", "FAILED", "CANCELLED"],
  COMPLETED: [],
  FAILED: [],
  CANCELLED: [],
};

export interface YzBridgeTask {
  id: string;
  project: string;
  title: string;
  instructions: string;
  priority: YzBridgePriority;
  status: YzBridgeTaskStatus;
  createdAt: FirebaseFirestore.Timestamp | FirebaseFirestore.FieldValue | Date | string | null;
  updatedAt: FirebaseFirestore.Timestamp | FirebaseFirestore.FieldValue | Date | string | null;
  claimedAt: FirebaseFirestore.Timestamp | FirebaseFirestore.FieldValue | Date | string | null;
  completedAt: FirebaseFirestore.Timestamp | FirebaseFirestore.FieldValue | Date | string | null;
  claimedBy: string | null;
  resultSummary: string | null;
  changedFiles: string[];
  tests: string[];
  error: string | null;
  source: string;
  requestId: string | null;
  metadata?: Record<string, unknown>;
}

export interface CreateTaskInput {
  project: string;
  title: string;
  instructions: string;
  priority?: string;
  source?: string;
  requestId?: string | null;
  metadata?: Record<string, unknown>;
  exactInstructions?: boolean;
  skipRequestIdDedup?: boolean;
}

export interface ClaimTaskInput {
  actor: string;
  agentId?: string;
}

export interface StatusUpdateInput {
  status: YzBridgeTaskStatus;
  actor?: string;
  error?: string | null;
}

export interface ResultInput {
  status: "COMPLETED" | "FAILED" | "CANCELLED";
  resultSummary?: string | null;
  changedFiles?: string[];
  tests?: string[];
  error?: string | null;
  actor?: string;
}

export interface ListTasksQuery {
  project?: string;
  status?: YzBridgeTaskStatus;
  claimedBy?: string;
  limit?: number;
}

export class YzBridgeError extends Error {
  constructor(
    public readonly httpStatus: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "YzBridgeError";
  }
}

export function isTaskStatus(value: unknown): value is YzBridgeTaskStatus {
  return typeof value === "string" && (TASK_STATUSES as readonly string[]).includes(value);
}

export function isPriority(value: unknown): value is YzBridgePriority {
  return typeof value === "string" && (PRIORITIES as readonly string[]).includes(value);
}

export function canTransition(from: YzBridgeTaskStatus, to: YzBridgeTaskStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function isTerminalStatus(status: YzBridgeTaskStatus): boolean {
  return (TERMINAL_STATUSES as readonly string[]).includes(status);
}

export interface PromptBufferPublic {
  bufferId: string;
  status: PromptBufferStatus;
  receivedChunks: number;
  chunkCount: number | null;
  totalCharacters: number;
  committedTaskId: string | null;
  createdAt: unknown;
  updatedAt: unknown;
  expiresAt: unknown;
  nextChunk: number;
  title?: string;
  project?: string;
  priority?: string;
  requestId?: string | null;
}

export interface CreatePromptBufferInput {
  project: string;
  title: string;
  priority?: string;
  requestId?: string | null;
}

export interface AppendPromptChunkInput {
  bufferId: string;
  index: number;
  data: string;
}

export interface CommitPromptBufferInput {
  bufferId: string;
  chunkCount?: number;
}

export interface ChunkLimits {
  maxChunkChars: number;
  maxChunks: number;
  maxAssembledChars: number;
  ttlMs: number;
}
