package com.rentacar.app.agentapi.mcp

/**
 * Minimal MCP tool declaration derived from one executable Agent API operation.
 */
data class AgentMcpToolDescriptor(
    val name: String,
    val description: String,
    val inputSchema: Map<String, Any?>,
    val operationId: String
)
