package com.rentacar.app.agentapi.execution

/**
 * Explicit allowlist of operations that may become executable when a local
 * executor handler is wired. Never enable the full registry.
 */
object AgentExecutableAllowlist {
    const val SUPPLIER_LIST: String = "supplier.list"
    const val SUPPLIER_GET: String = "supplier.get"

    val ANDROID_LOCAL_READS: Set<String> = setOf(SUPPLIER_LIST, SUPPLIER_GET)

    fun isLocalReadEnabled(operationId: String): Boolean = operationId in ANDROID_LOCAL_READS
}
