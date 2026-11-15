package com.rentacar.app.agentapi.mcp

/**
 * Explicit maturity flags. The adapter and gateway are foundations, not a claim of
 * connectivity to a real Android device or to Claude Code.
 */
enum class AgentMcpStatus(val enabled: Boolean) {
    MCP_ADAPTER_IMPLEMENTED(true),
    MCP_TESTED_WITH_FIXTURES(true),

    /** AGENT-022..025: token-authenticated pure-Kotlin gateway (fixture/JVM tested). */
    AUTHENTICATED_GATEWAY_IMPLEMENTED(true),

    /** AGENT-026: Node stdio MCP host under tools/mcp-host (forwards to a gateway URL). */
    WINDOWS_MCP_HOST_IMPLEMENTED(true),

    /** Loopback HTTP server exists only in the unit-test source set (development only). */
    LOOPBACK_HTTP_DEV_ONLY(true),
    MCP_CONNECTED_TO_REAL_ANDROID(false),
    MCP_CONNECTED_TO_CLAUDE_CODE(false)
}
