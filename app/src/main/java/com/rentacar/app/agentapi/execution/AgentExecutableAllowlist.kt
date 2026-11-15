package com.rentacar.app.agentapi.execution

/**
 * Explicit allowlist of operations that may become executable when a local
 * executor handler is wired. Never enable the full registry.
 */
object AgentExecutableAllowlist {
    const val SUPPLIER_LIST: String = "supplier.list"
    const val SUPPLIER_GET: String = "supplier.get"
    const val RESERVATION_LIST_MANAGE: String = "reservation.list.manage"
    const val RESERVATION_GET: String = "reservation.get"
    const val CUSTOMER_LIST: String = "customer.list"
    const val CUSTOMER_GET: String = "customer.get"

    val SUPPLIER_LOCAL_READS: Set<String> = setOf(SUPPLIER_LIST, SUPPLIER_GET)
    val RESERVATION_LOCAL_READS: Set<String> = setOf(RESERVATION_LIST_MANAGE, RESERVATION_GET)
    val CUSTOMER_LOCAL_READS: Set<String> = setOf(CUSTOMER_LIST, CUSTOMER_GET)

    /** Union of all Android-local read ops that may be wired when executors are present. */
    val ANDROID_LOCAL_READS: Set<String> =
        SUPPLIER_LOCAL_READS + RESERVATION_LOCAL_READS + CUSTOMER_LOCAL_READS

    fun isLocalReadEnabled(operationId: String): Boolean = operationId in ANDROID_LOCAL_READS

    fun isSupplierLocalRead(operationId: String): Boolean = operationId in SUPPLIER_LOCAL_READS

    fun isReservationLocalRead(operationId: String): Boolean = operationId in RESERVATION_LOCAL_READS

    fun isCustomerLocalRead(operationId: String): Boolean = operationId in CUSTOMER_LOCAL_READS
}
