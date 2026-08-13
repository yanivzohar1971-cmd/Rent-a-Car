package com.rentacar.app.data

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index
import androidx.room.PrimaryKey

/**
 * Per-supplier commission-report parser selection (additive; not on Supplier.importFunctionCode).
 */
@Entity(
    tableName = "supplier_commission_import_config",
    indices = [
        Index(value = ["supplier_id", "user_uid"], unique = true),
        Index(value = ["user_uid"]),
        Index(value = ["parser_code", "parser_version"])
    ],
    foreignKeys = [
        ForeignKey(
            entity = Supplier::class,
            parentColumns = ["id"],
            childColumns = ["supplier_id"],
            onDelete = ForeignKey.CASCADE
        )
    ]
)
data class SupplierCommissionImportConfig(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    @ColumnInfo(name = "supplier_id") val supplierId: Long,
    @ColumnInfo(name = "parser_code") val parserCode: Int,
    @ColumnInfo(name = "parser_version") val parserVersion: Int,
    @ColumnInfo(name = "is_active") val isActive: Boolean = true,
    @ColumnInfo(name = "created_at") val createdAt: Long = System.currentTimeMillis(),
    @ColumnInfo(name = "updated_at") val updatedAt: Long = System.currentTimeMillis(),
    @ColumnInfo(name = "user_uid") val userUid: String
)

/**
 * One imported supplier commission report run.
 */
@Entity(
    tableName = "supplier_commission_report_import",
    indices = [
        Index(value = ["supplier_id", "user_uid"]),
        Index(value = ["supplier_id", "file_hash", "user_uid"]),
        Index(value = ["report_year", "report_month"]),
        Index(value = ["status"]),
        Index(value = ["user_uid"]),
        Index(value = ["imported_at"])
    ],
    foreignKeys = [
        ForeignKey(
            entity = Supplier::class,
            parentColumns = ["id"],
            childColumns = ["supplier_id"],
            onDelete = ForeignKey.RESTRICT
        )
    ]
)
data class SupplierCommissionReportImport(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    @ColumnInfo(name = "supplier_id") val supplierId: Long,
    @ColumnInfo(name = "report_year") val reportYear: Int,
    @ColumnInfo(name = "report_month") val reportMonth: Int,
    @ColumnInfo(name = "departure_cutoff_date") val departureCutoffDate: Long,
    @ColumnInfo(name = "source_file_name") val sourceFileName: String,
    @ColumnInfo(name = "file_hash") val fileHash: String,
    @ColumnInfo(name = "parser_code") val parserCode: Int,
    @ColumnInfo(name = "parser_version") val parserVersion: Int,
    @ColumnInfo(name = "raw_row_count") val rawRowCount: Int,
    @ColumnInfo(name = "normalized_group_count") val normalizedGroupCount: Int,
    @ColumnInfo(name = "supplier_revenue_total") val supplierRevenueTotal: String,
    @ColumnInfo(name = "supplier_commission_total") val supplierCommissionTotal: String,
    @ColumnInfo(name = "internal_commission_total") val internalCommissionTotal: String,
    @ColumnInfo(name = "deviation_total") val deviationTotal: String,
    @ColumnInfo(name = "status") val status: String,
    @ColumnInfo(name = "imported_at") val importedAt: Long = System.currentTimeMillis(),
    @ColumnInfo(name = "approved_at") val approvedAt: Long? = null,
    @ColumnInfo(name = "user_uid") val userUid: String
)

/**
 * Raw supplier commission report detail row (audit).
 */
@Entity(
    tableName = "supplier_commission_report_line",
    indices = [
        Index(value = ["import_id", "user_uid"]),
        Index(value = ["normalized_group_key"]),
        Index(value = ["order_number"]),
        Index(value = ["row_hash", "user_uid"]),
        Index(value = ["user_uid"]),
        Index(value = ["import_id", "source_row_number"], unique = true)
    ],
    foreignKeys = [
        ForeignKey(
            entity = SupplierCommissionReportImport::class,
            parentColumns = ["id"],
            childColumns = ["import_id"],
            onDelete = ForeignKey.CASCADE
        )
    ]
)
data class SupplierCommissionReportLine(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    @ColumnInfo(name = "import_id") val importId: Long,
    @ColumnInfo(name = "source_row_number") val sourceRowNumber: Int,
    @ColumnInfo(name = "order_number") val orderNumber: String,
    @ColumnInfo(name = "invoice_number") val invoiceNumber: String,
    @ColumnInfo(name = "total_days") val totalDays: Int,
    @ColumnInfo(name = "customer_name") val customerName: String,
    @ColumnInfo(name = "revenue_ex_vat") val revenueExVat: String,
    @ColumnInfo(name = "commission_percent") val commissionPercent: String,
    @ColumnInfo(name = "commission_amount") val commissionAmount: String,
    @ColumnInfo(name = "agent_name") val agentName: String,
    @ColumnInfo(name = "normalized_group_key") val normalizedGroupKey: String,
    @ColumnInfo(name = "row_hash") val rowHash: String,
    @ColumnInfo(name = "user_uid") val userUid: String
)

/**
 * Reconciliation comparison snapshot + review/approval decision.
 */
@Entity(
    tableName = "commission_reconciliation_item",
    indices = [
        Index(value = ["import_id", "user_uid"]),
        Index(value = ["supplier_id", "user_uid"]),
        Index(value = ["reservation_id"]),
        Index(value = ["match_status"]),
        Index(value = ["lifecycle_classification"]),
        Index(value = ["approval_state"]),
        Index(value = ["normalized_group_key"]),
        Index(value = ["user_uid"]),
        Index(value = ["import_id", "normalized_group_key", "internal_event_id"], unique = true)
    ],
    foreignKeys = [
        ForeignKey(
            entity = SupplierCommissionReportImport::class,
            parentColumns = ["id"],
            childColumns = ["import_id"],
            onDelete = ForeignKey.CASCADE
        ),
        ForeignKey(
            entity = Supplier::class,
            parentColumns = ["id"],
            childColumns = ["supplier_id"],
            onDelete = ForeignKey.RESTRICT
        )
    ]
)
data class CommissionReconciliationItem(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    @ColumnInfo(name = "import_id") val importId: Long,
    @ColumnInfo(name = "supplier_id") val supplierId: Long,
    @ColumnInfo(name = "normalized_group_key") val normalizedGroupKey: String?,
    @ColumnInfo(name = "reservation_id") val reservationId: Long?,
    @ColumnInfo(name = "internal_event_id") val internalEventId: String?,
    @ColumnInfo(name = "supplier_order_number") val supplierOrderNumber: String?,
    @ColumnInfo(name = "supplier_invoice_number") val supplierInvoiceNumber: String?,
    @ColumnInfo(name = "supplier_customer_name") val supplierCustomerName: String?,
    @ColumnInfo(name = "supplier_days") val supplierDays: Int?,
    @ColumnInfo(name = "supplier_revenue") val supplierRevenue: String?,
    @ColumnInfo(name = "supplier_percent") val supplierPercent: String?,
    @ColumnInfo(name = "supplier_commission") val supplierCommission: String?,
    @ColumnInfo(name = "internal_period_start") val internalPeriodStart: Long?,
    @ColumnInfo(name = "internal_period_end") val internalPeriodEnd: Long?,
    @ColumnInfo(name = "internal_days") val internalDays: Int?,
    @ColumnInfo(name = "internal_percent") val internalPercent: String?,
    @ColumnInfo(name = "internal_commission") val internalCommission: String?,
    @ColumnInfo(name = "deviation") val deviation: String?,
    @ColumnInfo(name = "match_status") val matchStatus: String,
    @ColumnInfo(name = "lifecycle_classification") val lifecycleClassification: String,
    @ColumnInfo(name = "proposed_actual_return_date") val proposedActualReturnDate: Long?,
    @ColumnInfo(name = "approval_state") val approvalState: String,
    @ColumnInfo(name = "approved_at") val approvedAt: Long? = null,
    @ColumnInfo(name = "notes") val notes: String? = null,
    @ColumnInfo(name = "explanation") val explanation: String? = null,
    @ColumnInfo(name = "app_customer_name") val appCustomerName: String? = null,
    @ColumnInfo(name = "app_supplier_order_number") val appSupplierOrderNumber: String? = null,
    @ColumnInfo(name = "app_date_from") val appDateFrom: Long? = null,
    @ColumnInfo(name = "app_actual_return_date") val appActualReturnDate: Long? = null,
    @ColumnInfo(name = "event_type") val eventType: String? = null,
    @ColumnInfo(name = "user_uid") val userUid: String
)

/**
 * Persistent paid/approved commission ledger — duplicate prevention.
 */
@Entity(
    tableName = "commission_settlement_event",
    indices = [
        Index(value = ["stable_id", "user_uid"], unique = true),
        Index(value = ["reservation_id", "user_uid"]),
        Index(value = ["supplier_id", "user_uid"]),
        Index(value = ["import_id"]),
        Index(value = ["reconciliation_item_id"]),
        Index(value = ["payout_year", "payout_month"]),
        Index(value = ["status"]),
        Index(value = ["user_uid"])
    ],
    foreignKeys = [
        ForeignKey(
            entity = Reservation::class,
            parentColumns = ["id"],
            childColumns = ["reservation_id"],
            onDelete = ForeignKey.RESTRICT
        ),
        ForeignKey(
            entity = Supplier::class,
            parentColumns = ["id"],
            childColumns = ["supplier_id"],
            onDelete = ForeignKey.RESTRICT
        )
    ]
)
data class CommissionSettlementEvent(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    @ColumnInfo(name = "stable_id") val stableId: String,
    @ColumnInfo(name = "reservation_id") val reservationId: Long,
    @ColumnInfo(name = "supplier_id") val supplierId: Long,
    @ColumnInfo(name = "import_id") val importId: Long?,
    @ColumnInfo(name = "reconciliation_item_id") val reconciliationItemId: Long?,
    @ColumnInfo(name = "event_type") val eventType: String,
    @ColumnInfo(name = "period_start") val periodStart: Long,
    @ColumnInfo(name = "period_end") val periodEnd: Long,
    @ColumnInfo(name = "number_of_days") val numberOfDays: Int,
    @ColumnInfo(name = "payout_year") val payoutYear: Int,
    @ColumnInfo(name = "payout_month") val payoutMonth: Int,
    @ColumnInfo(name = "supplier_amount") val supplierAmount: String,
    @ColumnInfo(name = "internal_amount") val internalAmount: String,
    @ColumnInfo(name = "status") val status: String,
    @ColumnInfo(name = "approved_at") val approvedAt: Long,
    @ColumnInfo(name = "user_uid") val userUid: String
)

/**
 * Historical commission-only closure/cap without inventing actualReturnDate.
 */
@Entity(
    tableName = "commission_tracking_override",
    indices = [
        Index(value = ["reservation_id", "user_uid"], unique = true),
        Index(value = ["supplier_id", "user_uid"]),
        Index(value = ["source_import_id"]),
        Index(value = ["user_uid"])
    ],
    foreignKeys = [
        ForeignKey(
            entity = Reservation::class,
            parentColumns = ["id"],
            childColumns = ["reservation_id"],
            onDelete = ForeignKey.CASCADE
        ),
        ForeignKey(
            entity = Supplier::class,
            parentColumns = ["id"],
            childColumns = ["supplier_id"],
            onDelete = ForeignKey.RESTRICT
        )
    ]
)
data class CommissionTrackingOverride(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    @ColumnInfo(name = "reservation_id") val reservationId: Long,
    @ColumnInfo(name = "supplier_id") val supplierId: Long,
    @ColumnInfo(name = "commission_cap_date") val commissionCapDate: Long,
    @ColumnInfo(name = "reason") val reason: String,
    @ColumnInfo(name = "source_import_id") val sourceImportId: Long?,
    @ColumnInfo(name = "approved_at") val approvedAt: Long,
    @ColumnInfo(name = "user_uid") val userUid: String
)

/**
 * Fingerprint for email commission-report imports (duplicate protection).
 * Does not store credentials or raw email bodies.
 */
@Entity(
    tableName = "email_commission_report_fingerprint",
    indices = [
        Index(value = ["supplier_id", "user_uid"]),
        Index(value = ["supplier_id", "content_hash", "user_uid"]),
        Index(value = ["supplier_id", "message_id", "user_uid"]),
        Index(value = ["user_uid"])
    ],
    foreignKeys = [
        ForeignKey(
            entity = Supplier::class,
            parentColumns = ["id"],
            childColumns = ["supplier_id"],
            onDelete = ForeignKey.CASCADE
        )
    ]
)
data class EmailCommissionReportFingerprint(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    @ColumnInfo(name = "supplier_id") val supplierId: Long,
    @ColumnInfo(name = "configured_sender") val configuredSender: String,
    @ColumnInfo(name = "mailbox_provider") val mailboxProvider: String,
    @ColumnInfo(name = "message_id") val messageId: String? = null,
    @ColumnInfo(name = "imap_uid") val imapUid: Long? = null,
    @ColumnInfo(name = "received_at") val receivedAt: Long? = null,
    @ColumnInfo(name = "content_hash") val contentHash: String,
    @ColumnInfo(name = "report_format") val reportFormat: String,
    @ColumnInfo(name = "imported_at") val importedAt: Long = System.currentTimeMillis(),
    @ColumnInfo(name = "result") val result: String,
    @ColumnInfo(name = "user_uid") val userUid: String
)
