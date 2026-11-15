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
    const val COMMISSION_INSTALLMENTS_LIST = "commission.installments.list"
    const val COMMISSION_SUMMARY_TOTALS = "commission.summary.totals"
    const val COMMISSION_FILTER_PAYOUT_MONTH = "commission.filter.payoutMonth"
    const val COMMISSION_ALIGNMENT_PREVIEW = "commission.alignment.preview"
    const val CAR_SALE_LIST = "carSale.list"
    const val CAR_SALE_COMMISSION_TOTALS = "carSale.commission.totals"
    const val REQUEST_LIST = "request.list"
    const val YARD_FLEET_LIST = "yard.fleet.list"
    const val YARD_FLEET_FILTER = "yard.fleet.filter"
    const val REPORT_MONTHLY_VIEW = "report.monthly.view"
    const val AGENT_LIST = "agent.list"
    const val BRANCH_LIST = "branch.list"
    const val SUPPLIER_PICK = "supplier.pick"
    const val PRICE_LIST_LIST = "priceList.list"
    const val RESERVATION_LIST_BY_CUSTOMER = "reservation.list.byCustomer"
    const val RESERVATION_LIST_BY_SUPPLIER = "reservation.list.bySupplier"
    const val RESERVATION_LIST_BY_AGENT = "reservation.list.byAgent"
    const val RESERVATION_LIST_BY_BRANCH = "reservation.list.byBranch"
    const val RESERVATION_PAYMENT_LIST = "reservation.payment.list"
    const val RESERVATION_FILTER_DATE_RANGE = "reservation.filter.dateRange"
    const val RESERVATION_FILTER_SUPPLIER = "reservation.filter.supplier"
    const val RESERVATION_FILTER_STATUS = "reservation.filter.status"
    const val DASHBOARD_OPEN_RESERVATIONS = "dashboard.list.openReservations"
    const val CUSTOMER_HISTORY_RESERVATIONS = "customer.history.reservations"
    const val CUSTOMER_DETAILS_VIEW = "customer.details.view"

    val SUPPLIER_LOCAL_READS: Set<String> = setOf(SUPPLIER_LIST, SUPPLIER_GET)
    val RESERVATION_LOCAL_READS: Set<String> = setOf(RESERVATION_LIST_MANAGE, RESERVATION_GET)
    val CUSTOMER_LOCAL_READS: Set<String> = setOf(CUSTOMER_LIST, CUSTOMER_GET)
    val FINANCE_LOCAL_READS = setOf(
        COMMISSION_INSTALLMENTS_LIST, COMMISSION_SUMMARY_TOTALS,
        COMMISSION_FILTER_PAYOUT_MONTH, COMMISSION_ALIGNMENT_PREVIEW
    )
    val SALES_LOCAL_READS = setOf(CAR_SALE_LIST, CAR_SALE_COMMISSION_TOTALS, REQUEST_LIST)
    val FLEET_LOCAL_READS = setOf(YARD_FLEET_LIST, YARD_FLEET_FILTER)
    val REPORTING_LOCAL_READS = setOf(REPORT_MONTHLY_VIEW)
    val CATALOG_RESERVATION_EXT_LOCAL_READS = setOf(
        AGENT_LIST, BRANCH_LIST, SUPPLIER_PICK, PRICE_LIST_LIST,
        RESERVATION_LIST_BY_CUSTOMER, RESERVATION_LIST_BY_SUPPLIER,
        RESERVATION_LIST_BY_AGENT, RESERVATION_LIST_BY_BRANCH,
        RESERVATION_PAYMENT_LIST, RESERVATION_FILTER_DATE_RANGE,
        RESERVATION_FILTER_SUPPLIER, RESERVATION_FILTER_STATUS,
        DASHBOARD_OPEN_RESERVATIONS, CUSTOMER_HISTORY_RESERVATIONS,
        CUSTOMER_DETAILS_VIEW
    )

    /** Union of all Android-local read ops that may be wired when executors are present. */
    val ANDROID_LOCAL_READS: Set<String> =
        SUPPLIER_LOCAL_READS + RESERVATION_LOCAL_READS + CUSTOMER_LOCAL_READS +
            FINANCE_LOCAL_READS + SALES_LOCAL_READS + FLEET_LOCAL_READS +
            REPORTING_LOCAL_READS + CATALOG_RESERVATION_EXT_LOCAL_READS

    fun isLocalReadEnabled(operationId: String): Boolean = operationId in ANDROID_LOCAL_READS

    fun isSupplierLocalRead(operationId: String): Boolean = operationId in SUPPLIER_LOCAL_READS

    fun isReservationLocalRead(operationId: String): Boolean = operationId in RESERVATION_LOCAL_READS

    fun isCustomerLocalRead(operationId: String): Boolean = operationId in CUSTOMER_LOCAL_READS

    fun isFinanceLocalRead(operationId: String) = operationId in FINANCE_LOCAL_READS
    fun isSalesLocalRead(operationId: String) = operationId in SALES_LOCAL_READS
    fun isFleetLocalRead(operationId: String) = operationId in FLEET_LOCAL_READS
    fun isReportingLocalRead(operationId: String) = operationId in REPORTING_LOCAL_READS
    fun isCatalogReservationExtLocalRead(operationId: String) =
        operationId in CATALOG_RESERVATION_EXT_LOCAL_READS
}
