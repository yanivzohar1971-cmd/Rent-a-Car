package com.rentacar.app.agentapi.mcp

/**
 * Explicit AGENT-020 maturity flags. The adapter is an in-process foundation,
 * not a claim of connectivity to Android or Claude Code.
 */
enum class AgentMcpStatus(val enabled: Boolean) {
    MCP_ADAPTER_IMPLEMENTED(true),
    MCP_TESTED_WITH_FIXTURES(true),
    MCP_CONNECTED_TO_REAL_ANDROID(false),
    MCP_CONNECTED_TO_CLAUDE_CODE(false)
}
