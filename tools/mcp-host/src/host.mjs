// Minimal MCP (Model Context Protocol) host logic: JSON-RPC 2.0 over an abstract transport.
// No third-party dependencies. The host never sends a userUid: identity is derived by the
// gateway from the device token (Authorization: Bearer <token>).

import { randomUUID } from "node:crypto";

export const DEFAULT_GATEWAY_URL = "http://127.0.0.1:8742";
export const SUPPORTED_PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];
export const SERVER_INFO = { name: "rentacar-mcp-host", version: "0.1.0" };

const ERR_PARSE = -32700;
const ERR_INVALID_REQUEST = -32600;
const ERR_METHOD_NOT_FOUND = -32601;
const ERR_INVALID_PARAMS = -32602;
const ERR_INTERNAL = -32603;
const ERR_NOT_CONFIGURED = -32001;

// AGENT-101 execution modes.
//  FIXTURE_TEST       (default) legacy behavior: default gateway URL, fake/fixture gateways allowed.
//  EMULATOR_REAL_ROOM talks to the AgentDev APK gateway on an emulator (adb forward tcp:18765).
//                     Requires an explicit gateway URL + token and fails hard when the gateway is
//                     unreachable. There is NO fixture fallback in this mode.
export const EXECUTION_MODES = ["FIXTURE_TEST", "EMULATOR_REAL_ROOM"];
export const DEFAULT_EXECUTION_MODE = "FIXTURE_TEST";
export const AGENTDEV_GATEWAY_PORT = 18765;
export const AGENTDEV_GATEWAY_URL = `http://127.0.0.1:${AGENTDEV_GATEWAY_PORT}`;

export function loadConfig(env = process.env) {
  const rawMode = (env.RENTACAR_EXECUTION_MODE || "").trim().toUpperCase();
  const executionMode = rawMode || DEFAULT_EXECUTION_MODE;
  const explicitUrl = (env.RENTACAR_GATEWAY_URL || "").trim();
  return {
    executionMode,
    gatewayUrl: (explicitUrl || DEFAULT_GATEWAY_URL).replace(/\/+$/, ""),
    gatewayUrlExplicit: explicitUrl !== "",
    token: env.RENTACAR_DEVICE_TOKEN || "",
    timeoutMs: Number.parseInt(env.RENTACAR_REQUEST_TIMEOUT_MS || "15000", 10) || 15000,
  };
}

/** Returns a list of configuration problems (empty when the config is usable for its mode). */
export function validateConfig(config) {
  const problems = [];
  if (!EXECUTION_MODES.includes(config.executionMode)) {
    problems.push(
      `RENTACAR_EXECUTION_MODE must be one of ${EXECUTION_MODES.join("|")} (got "${config.executionMode}")`,
    );
    return problems;
  }
  if (config.executionMode === "EMULATOR_REAL_ROOM") {
    if (!config.gatewayUrlExplicit) {
      problems.push(`EMULATOR_REAL_ROOM requires RENTACAR_GATEWAY_URL (e.g. ${AGENTDEV_GATEWAY_URL})`);
    }
    if (!config.token) {
      problems.push("EMULATOR_REAL_ROOM requires RENTACAR_DEVICE_TOKEN");
    }
  }
  return problems;
}

/**
 * Probes GET /v1/health (unauthenticated). Throws when the gateway is unreachable or is not an
 * AgentDev/loopback gateway answering `status: ok`. Used to fail hard in EMULATOR_REAL_ROOM.
 */
export async function assertGatewayReachable({ gatewayUrl, timeoutMs = 5000, fetchImpl = globalThis.fetch }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(`${gatewayUrl}/v1/health`, { signal: controller.signal });
    const text = await response.text();
    let body;
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      throw new Error(`gateway health returned non-JSON (HTTP ${response.status})`);
    }
    if (response.status !== 200 || body?.status !== "ok") {
      throw new Error(`gateway health check failed (HTTP ${response.status})`);
    }
    return body;
  } catch (err) {
    const reason = err?.name === "AbortError" ? "timed out" : err?.message || String(err);
    throw new Error(`Gateway ${gatewayUrl} is unreachable: ${reason}`);
  } finally {
    clearTimeout(timer);
  }
}

class RpcError extends Error {
  constructor(code, message, data) {
    super(message);
    this.code = code;
    this.data = data;
  }
}

export function createHost({
  gatewayUrl,
  token,
  timeoutMs = 15000,
  executionMode = DEFAULT_EXECUTION_MODE,
  fetchImpl = globalThis.fetch,
  log = () => {},
}) {
  async function gatewayFetch(path, init = {}) {
    if (!token) {
      throw new RpcError(ERR_NOT_CONFIGURED, "RENTACAR_DEVICE_TOKEN is not set");
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(`${gatewayUrl}${path}`, {
        ...init,
        headers: { ...(init.headers || {}), Authorization: `Bearer ${token}`, Accept: "application/json" },
        signal: controller.signal,
      });
      const text = await response.text();
      let body;
      try {
        body = text ? JSON.parse(text) : {};
      } catch {
        throw new RpcError(ERR_INTERNAL, `Gateway returned non-JSON (HTTP ${response.status})`);
      }
      return { status: response.status, body };
    } catch (err) {
      if (err instanceof RpcError) throw err;
      const reason = err?.name === "AbortError" ? "timed out" : err?.message || String(err);
      throw new RpcError(ERR_INTERNAL, `Gateway request failed: ${reason}`);
    } finally {
      clearTimeout(timer);
    }
  }

  async function listTools() {
    const { status, body } = await gatewayFetch("/v1/tools", { method: "GET" });
    if (status !== 200) {
      const err = body?.error || {};
      throw new RpcError(ERR_INTERNAL, `Gateway rejected tools/list: ${err.code || status} ${err.message || ""}`.trim());
    }
    return (body.tools || []).map((t) => ({
      name: t.name,
      description: t.description || "",
      inputSchema: t.inputSchema && typeof t.inputSchema === "object" ? t.inputSchema : { type: "object" },
    }));
  }

  async function callTool(name, args) {
    const { status, body } = await gatewayFetch("/v1/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        operation: name,
        parameters: args || {},
        requestId: `mcp-${randomUUID()}`,
      }),
    });
    const isError = !(status === 200 && body?.success === true);
    return {
      content: [{ type: "text", text: JSON.stringify(body) }],
      isError,
    };
  }

  const methods = {
    async initialize(params) {
      const requested = params?.protocolVersion;
      const protocolVersion = SUPPORTED_PROTOCOL_VERSIONS.includes(requested)
        ? requested
        : SUPPORTED_PROTOCOL_VERSIONS[0];
      return {
        protocolVersion,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { ...SERVER_INFO, executionMode },
      };
    },
    async ping() {
      return {};
    },
    async "tools/list"() {
      return { tools: await listTools() };
    },
    async "tools/call"(params) {
      if (!params || typeof params.name !== "string" || !params.name) {
        throw new RpcError(ERR_INVALID_PARAMS, "tools/call requires a tool name");
      }
      if (params.arguments != null && (typeof params.arguments !== "object" || Array.isArray(params.arguments))) {
        throw new RpcError(ERR_INVALID_PARAMS, "tools/call arguments must be an object");
      }
      return callTool(params.name, params.arguments);
    },
  };

  /** Handles one parsed JSON-RPC message; returns a response object or null (notification). */
  async function handleMessage(message) {
    if (!message || typeof message !== "object" || Array.isArray(message) || message.jsonrpc !== "2.0") {
      return { jsonrpc: "2.0", id: message?.id ?? null, error: { code: ERR_INVALID_REQUEST, message: "Invalid Request" } };
    }
    const isNotification = message.id === undefined || message.id === null;
    if (typeof message.method !== "string") {
      return isNotification
        ? null
        : { jsonrpc: "2.0", id: message.id, error: { code: ERR_INVALID_REQUEST, message: "Invalid Request" } };
    }
    if (isNotification) {
      log(`notification ${message.method}`);
      return null;
    }
    const handler = methods[message.method];
    if (!handler) {
      return { jsonrpc: "2.0", id: message.id, error: { code: ERR_METHOD_NOT_FOUND, message: `Method not found: ${message.method}` } };
    }
    try {
      return { jsonrpc: "2.0", id: message.id, result: await handler(message.params) };
    } catch (err) {
      if (err instanceof RpcError) {
        return { jsonrpc: "2.0", id: message.id, error: { code: err.code, message: err.message } };
      }
      return { jsonrpc: "2.0", id: message.id, error: { code: ERR_INTERNAL, message: err?.message || "Internal error" } };
    }
  }

  /** Handles one raw line of text from stdio; returns serialized response or null. */
  async function handleLine(line) {
    const trimmed = line.trim();
    if (!trimmed) return null;
    let parsed;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      return JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: ERR_PARSE, message: "Parse error" } });
    }
    const response = await handleMessage(parsed);
    return response ? JSON.stringify(response) : null;
  }

  return { handleMessage, handleLine, listTools, callTool, executionMode };
}
