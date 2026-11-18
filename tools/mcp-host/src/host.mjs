// Minimal MCP (Model Context Protocol) host logic: JSON-RPC 2.0 over an abstract transport.
// No third-party dependencies. The host never sends a userUid: identity is derived by the
// gateway from the device token (Authorization: Bearer <token>).
//
// AGENT-121: the host never exits because the device is offline. Instead it tracks a connection
// state, exposes only the local `connection.status` tool while the business executor is
// unreachable, returns structured DEVICE_UNAVAILABLE results for business calls, and notifies the
// client (notifications/tools/list_changed) when availability flips. Business calls are never
// retried after they may have reached the device; the only retry is after a 401 when a reloaded
// token differs from the one that was rejected (the gateway rejected the request before execution).

import { randomUUID } from "node:crypto";

export const DEFAULT_GATEWAY_URL = "http://127.0.0.1:8742";
export const SUPPORTED_PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];
export const SERVER_INFO = { name: "rentacar-mcp-host", version: "0.2.0" };

const ERR_PARSE = -32700;
const ERR_INVALID_REQUEST = -32600;
const ERR_METHOD_NOT_FOUND = -32601;
const ERR_INVALID_PARAMS = -32602;
const ERR_INTERNAL = -32603;

// AGENT-101 execution modes.
//  FIXTURE_TEST       (default) legacy behavior: default gateway URL, fake/fixture gateways allowed.
//  EMULATOR_REAL_ROOM talks to the AgentDev APK gateway on an emulator (adb forward tcp:18765).
//                     Requires an explicit gateway URL. There is NO fixture fallback in this mode.
export const EXECUTION_MODES = ["FIXTURE_TEST", "EMULATOR_REAL_ROOM"];
export const DEFAULT_EXECUTION_MODE = "FIXTURE_TEST";
export const AGENTDEV_GATEWAY_PORT = 18765;
export const AGENTDEV_GATEWAY_URL = `http://127.0.0.1:${AGENTDEV_GATEWAY_PORT}`;

// AGENT-132: what kind of data a connector serves. Never inferred from the gateway; configured
// per connector registration so a development connector can never present itself as live data.
export const DATA_ENVIRONMENTS = {
  DEVELOPMENT_DATA: "Synthetic AgentDev fixtures in an isolated emulator Room DB — NOT real business data",
  REAL_LOCAL_DATA: "Owner-authorized real Room data on a paired Android device",
  REAL_CLOUD_DATA: "Owner-authorized synchronized cloud data",
  TEST_FIXTURES: "Unit-test fixtures",
};

export const CONNECTION_STATES = {
  UNKNOWN: "UNKNOWN",
  ONLINE: "ONLINE",
  DEVICE_UNAVAILABLE: "DEVICE_UNAVAILABLE",
  AUTH_FAILED: "AUTH_FAILED",
  NOT_CONFIGURED: "NOT_CONFIGURED",
};

export const STATUS_TOOL_NAME = "connection.status";

export function loadConfig(env = process.env) {
  const rawMode = (env.RENTACAR_EXECUTION_MODE || "").trim().toUpperCase();
  const executionMode = rawMode || DEFAULT_EXECUTION_MODE;
  const explicitUrl = (env.RENTACAR_GATEWAY_URL || "").trim();
  const rawEnv = (env.RENTACAR_DATA_ENVIRONMENT || "").trim().toUpperCase();
  const dataEnvironment =
    rawEnv || (executionMode === "EMULATOR_REAL_ROOM" ? "DEVELOPMENT_DATA" : "TEST_FIXTURES");
  return {
    executionMode,
    dataEnvironment,
    gatewayUrl: (explicitUrl || DEFAULT_GATEWAY_URL).replace(/\/+$/, ""),
    gatewayUrlExplicit: explicitUrl !== "",
    token: env.RENTACAR_DEVICE_TOKEN || "",
    timeoutMs: Number.parseInt(env.RENTACAR_REQUEST_TIMEOUT_MS || "15000", 10) || 15000,
    healthPollMs: Number.parseInt(env.RENTACAR_HEALTH_POLL_MS || "10000", 10) || 10000,
  };
}

/**
 * Returns configuration problems that make the process unusable (empty when usable).
 * A missing token is NOT fatal any more (AGENT-121): the launcher may supply it later from the
 * token file written by the AgentDev runner; until then the host reports NOT_CONFIGURED.
 */
export function validateConfig(config) {
  const problems = [];
  if (!EXECUTION_MODES.includes(config.executionMode)) {
    problems.push(
      `RENTACAR_EXECUTION_MODE must be one of ${EXECUTION_MODES.join("|")} (got "${config.executionMode}")`,
    );
    return problems;
  }
  if (!Object.hasOwn(DATA_ENVIRONMENTS, config.dataEnvironment)) {
    problems.push(
      `RENTACAR_DATA_ENVIRONMENT must be one of ${Object.keys(DATA_ENVIRONMENTS).join("|")} (got "${config.dataEnvironment}")`,
    );
  }
  if (config.executionMode === "EMULATOR_REAL_ROOM") {
    if (!config.gatewayUrlExplicit) {
      problems.push(`EMULATOR_REAL_ROOM requires RENTACAR_GATEWAY_URL (e.g. ${AGENTDEV_GATEWAY_URL})`);
    }
    if (config.dataEnvironment === "TEST_FIXTURES") {
      problems.push("EMULATOR_REAL_ROOM cannot be labelled TEST_FIXTURES");
    }
  }
  return problems;
}

/**
 * Probes GET /v1/health (unauthenticated). Throws when the gateway is unreachable or is not
 * answering `status: ok`.
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

/** Transport failure before any HTTP response was received. */
class GatewayUnreachable extends Error {
  constructor(reason, { maybeDelivered }) {
    super(reason);
    this.maybeDelivered = maybeDelivered;
  }
}

const statusToolDescriptor = (dataEnvironment) => ({
  name: STATUS_TOOL_NAME,
  description:
    `Live connection status of this Rent a Car connector (always available, even when the device is offline). ` +
    `Reports connection state, data environment (${dataEnvironment}), gateway health and how many business tools are executable. ` +
    `Call this first when business tools are missing or return DEVICE_UNAVAILABLE.`,
  inputSchema: { type: "object", additionalProperties: false, properties: {}, required: [] },
});

export function createHost({
  gatewayUrl,
  token = "",
  tokenProvider,
  timeoutMs = 15000,
  executionMode = DEFAULT_EXECUTION_MODE,
  dataEnvironment = executionMode === "EMULATOR_REAL_ROOM" ? "DEVELOPMENT_DATA" : "TEST_FIXTURES",
  fetchImpl = globalThis.fetch,
  log = () => {},
  notify = () => {},
  now = () => Date.now(),
}) {
  const readToken = () => {
    if (typeof tokenProvider === "function") {
      try {
        return (tokenProvider() || "").trim();
      } catch {
        return "";
      }
    }
    return token;
  };

  const state = {
    connection: CONNECTION_STATES.UNKNOWN,
    lastError: null,
    lastHealthyAt: null,
    lastCheckedAt: null,
    gatewayHealth: null,
    businessToolCount: 0,
    lastSuccessfulCallAt: null,
  };
  let lastAdvertisedOnline = null;
  let clientInitialized = false;

  function setConnection(next, error = null) {
    const prev = state.connection;
    state.connection = next;
    state.lastError = error;
    state.lastCheckedAt = new Date(now()).toISOString();
    if (next === CONNECTION_STATES.ONLINE) state.lastHealthyAt = state.lastCheckedAt;
    if (prev !== next) log(`connection ${prev} -> ${next}${error ? ` (${error})` : ""}`);
    const online = next === CONNECTION_STATES.ONLINE;
    if (lastAdvertisedOnline !== null && lastAdvertisedOnline !== online && clientInitialized) {
      notify({ jsonrpc: "2.0", method: "notifications/tools/list_changed" });
    }
  }

  async function rawFetch(path, init, authToken) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const headers = { ...(init.headers || {}), Accept: "application/json" };
      if (authToken) headers.Authorization = `Bearer ${authToken}`;
      const response = await fetchImpl(`${gatewayUrl}${path}`, { ...init, headers, signal: controller.signal });
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
      const timedOut = err?.name === "AbortError";
      // undici nests the socket error; with happy-eyeballs it is an AggregateError of attempts.
      const code =
        err?.cause?.code || err?.cause?.errors?.find((e) => e?.code)?.code || err?.code || "";
      // Connection refused / reset before connect means the request never reached the device.
      const causeMessage = err?.cause?.message || "";
      const neverSent =
        ["ECONNREFUSED", "ENOTFOUND", "EHOSTUNREACH", "ENETUNREACH", "EAI_AGAIN"].includes(code) ||
        causeMessage === "bad port"; // fetch refuses blocked ports before opening a socket
      throw new GatewayUnreachable(timedOut ? "timed out" : code || causeMessage || err?.message || String(err), {
        maybeDelivered: !neverSent,
      });
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Authenticated request. On 401 the token source is re-read once; the request is repeated only
   * when the token actually changed (the gateway rejected the old one before executing anything).
   */
  async function authedFetch(path, init = {}) {
    let current = readToken();
    if (!current) {
      setConnection(CONNECTION_STATES.NOT_CONFIGURED, "RENTACAR_DEVICE_TOKEN not available");
      return { notConfigured: true };
    }
    let result = await rawFetch(path, init, current);
    if (result.status === 401) {
      const reloaded = readToken();
      if (reloaded && reloaded !== current) {
        log("gateway rejected token; retrying once with reloaded token");
        current = reloaded;
        result = await rawFetch(path, init, current);
      }
    }
    return result;
  }

  async function probeHealth() {
    try {
      const { status, body } = await rawFetch("/v1/health", { method: "GET" }, null);
      state.gatewayHealth = status === 200 && body?.status === "ok" ? body : null;
      return state.gatewayHealth !== null;
    } catch (err) {
      if (!(err instanceof GatewayUnreachable)) throw err;
      state.gatewayHealth = null;
      return false;
    }
  }

  function decorate(tool) {
    const label = `[${dataEnvironment}] `;
    return {
      name: tool.name,
      description: label + (tool.description || ""),
      inputSchema: tool.inputSchema && typeof tool.inputSchema === "object" ? tool.inputSchema : { type: "object" },
    };
  }

  /** Fetches business tools; never throws for availability problems. */
  async function fetchBusinessTools() {
    let res;
    try {
      res = await authedFetch("/v1/tools", { method: "GET" });
    } catch (err) {
      if (err instanceof GatewayUnreachable) {
        setConnection(CONNECTION_STATES.DEVICE_UNAVAILABLE, err.message);
        state.businessToolCount = 0;
        return [];
      }
      setConnection(CONNECTION_STATES.DEVICE_UNAVAILABLE, err.message);
      state.businessToolCount = 0;
      return [];
    }
    if (res.notConfigured) {
      state.businessToolCount = 0;
      return [];
    }
    if (res.status === 401 || res.status === 403) {
      const code = res.body?.error?.code || `HTTP_${res.status}`;
      setConnection(CONNECTION_STATES.AUTH_FAILED, code);
      state.businessToolCount = 0;
      return [];
    }
    if (res.status !== 200 || !Array.isArray(res.body?.tools)) {
      setConnection(CONNECTION_STATES.DEVICE_UNAVAILABLE, `tools endpoint HTTP ${res.status}`);
      state.businessToolCount = 0;
      return [];
    }
    setConnection(CONNECTION_STATES.ONLINE);
    state.businessToolCount = res.body.tools.length;
    return res.body.tools.filter((t) => t && typeof t.name === "string" && t.name !== STATUS_TOOL_NAME);
  }

  async function listTools() {
    const business = await fetchBusinessTools();
    lastAdvertisedOnline = state.connection === CONNECTION_STATES.ONLINE;
    return [statusToolDescriptor(dataEnvironment), ...business.map(decorate)];
  }

  function connectorInfo() {
    return {
      name: SERVER_INFO.name,
      executionMode,
      dataEnvironment,
      dataEnvironmentMeaning: DATA_ENVIRONMENTS[dataEnvironment] || null,
    };
  }

  function unavailableResult(operation, code, message, extra = {}) {
    const body = {
      success: false,
      operation,
      error: { code, message, retryable: code === "DEVICE_UNAVAILABLE", ...extra },
      data: null,
      metadata: {
        source: null,
        executionTarget: null,
        syncStatus: "UNKNOWN",
        resultCompleteness: "NONE",
        lastSuccessfulSyncEpochMs: null,
        deviceAvailability: state.connection,
        warnings: ["No business data was returned. Do not answer from memory or invent records."],
      },
      connector: connectorInfo(),
    };
    return { content: [{ type: "text", text: JSON.stringify(body) }], isError: true };
  }

  async function statusTool() {
    const healthy = await probeHealth();
    if (healthy) {
      await fetchBusinessTools();
    } else {
      setConnection(CONNECTION_STATES.DEVICE_UNAVAILABLE, "health probe failed");
      state.businessToolCount = 0;
    }
    const body = {
      success: true,
      operation: STATUS_TOOL_NAME,
      data: {
        connection: state.connection,
        gatewayUrl,
        gatewayReachable: healthy,
        gatewayMode: state.gatewayHealth?.mode ?? null,
        tokenConfigured: Boolean(readToken()),
        executableBusinessTools: state.businessToolCount,
        lastHealthyAt: state.lastHealthyAt,
        lastCheckedAt: state.lastCheckedAt,
        lastSuccessfulCallAt: state.lastSuccessfulCallAt,
        lastError: state.lastError,
        writesEnabled: false,
      },
      connector: connectorInfo(),
    };
    return { content: [{ type: "text", text: JSON.stringify(body) }], isError: false };
  }

  async function callTool(name, args) {
    if (name === STATUS_TOOL_NAME) return statusTool();
    const payload = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ operation: name, parameters: args || {}, requestId: `mcp-${randomUUID()}` }),
    };
    let res;
    try {
      res = await authedFetch("/v1/execute", payload);
    } catch (err) {
      if (err instanceof GatewayUnreachable) {
        setConnection(CONNECTION_STATES.DEVICE_UNAVAILABLE, err.message);
        return unavailableResult(
          name,
          "DEVICE_UNAVAILABLE",
          `The Rent a Car device gateway is not reachable (${err.message}). Not retried automatically.`,
          { maybeDelivered: err.maybeDelivered },
        );
      }
      throw err;
    }
    if (res.notConfigured) {
      return unavailableResult(name, "NOT_CONFIGURED", "No device token is configured for this connector.");
    }
    if (res.status === 401 || res.status === 403) {
      setConnection(CONNECTION_STATES.AUTH_FAILED, res.body?.error?.code || `HTTP_${res.status}`);
      return unavailableResult(name, "AUTH_FAILED", "The device gateway rejected this connector's credentials.");
    }
    const body = res.body && typeof res.body === "object" ? res.body : {};
    const isError = !(res.status === 200 && body.success === true);
    if (state.connection !== CONNECTION_STATES.ONLINE) setConnection(CONNECTION_STATES.ONLINE);
    if (!isError) state.lastSuccessfulCallAt = new Date(now()).toISOString();
    const metadata = { ...(body.metadata || {}), deviceAvailability: CONNECTION_STATES.ONLINE };
    return {
      content: [{ type: "text", text: JSON.stringify({ ...body, metadata, connector: connectorInfo() }) }],
      isError,
    };
  }

  /** Background availability probe; emits tools/list_changed when ONLINE status flips. */
  async function refreshAvailability() {
    const healthy = await probeHealth();
    if (healthy) await fetchBusinessTools();
    else setConnection(CONNECTION_STATES.DEVICE_UNAVAILABLE, "health probe failed");
    return state.connection;
  }

  const methods = {
    async initialize(params) {
      const requested = params?.protocolVersion;
      const protocolVersion = SUPPORTED_PROTOCOL_VERSIONS.includes(requested)
        ? requested
        : SUPPORTED_PROTOCOL_VERSIONS[0];
      return {
        protocolVersion,
        capabilities: { tools: { listChanged: true } },
        serverInfo: { ...SERVER_INFO, executionMode, dataEnvironment },
        instructions:
          `Rent a Car connector. Data environment: ${dataEnvironment} — ${DATA_ENVIRONMENTS[dataEnvironment] || ""}. ` +
          `Always state the data source and environment when answering. Read-only.`,
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
      if (message.method === "notifications/initialized") clientInitialized = true;
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

  return {
    handleMessage,
    handleLine,
    listTools,
    callTool,
    refreshAvailability,
    getState: () => ({ ...state }),
    executionMode,
    dataEnvironment,
  };
}
