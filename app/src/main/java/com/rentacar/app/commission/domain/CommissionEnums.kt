package com.rentacar.app.commission.domain

enum class CommissionReportImportStatus {
    DRAFT,
    REVIEWED,
    APPROVED,
    REJECTED
}

enum class ReconciliationMatchStatus {
    FULL_MATCH,
    AMOUNT_MISMATCH,
    DAYS_MISMATCH,
    RATE_MISMATCH,
    SUPPLIER_ONLY,
    APPLICATION_ONLY,
    MULTIPLE_RESERVATION_MATCHES,
    CUSTOMER_NAME_WARNING,
    RETURN_DATE_CONFLICT,
    ALREADY_SETTLED,
    POSSIBLE_DUPLICATE_PAYMENT,
    INVALID_SUPPLIER_GROUP,
    NEEDS_REVIEW,
    /** Transient UI overlay after the user picks among engine candidates. Not produced by auto-match. */
    MANUALLY_MATCHED
}

enum class CommissionLifecycleClassification {
    DAILY_WEEKLY_FINAL_SETTLEMENT,
    OPEN_MONTHLY_30_DAY_CYCLE,
    FINAL_MONTHLY_SETTLEMENT,
    HISTORICAL_BASELINE_CANDIDATE,
    AMBIGUOUS,
    NEEDS_REVIEW
}

enum class CommissionEventType {
    MONTHLY_CYCLE,
    FINAL_REMAINDER,
    FINAL_RENTAL
}

enum class ReconciliationApprovalState {
    PENDING,
    APPROVED,
    HELD,
    REJECTED
}

enum class SettlementEventStatus {
    APPROVED,
    PAID,
    VOID
}
