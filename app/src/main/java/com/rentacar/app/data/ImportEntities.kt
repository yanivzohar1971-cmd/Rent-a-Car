package com.rentacar.app.data

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey
import androidx.room.ForeignKey
import androidx.room.ColumnInfo

/**
 * Supplier Template - Defines Excel column mapping for each supplier's unique format
 * 
 * Each supplier can have a different Excel layout. This table stores the mapping
 * from their column names to our internal field names in JSON format.
 */
@Entity(
    tableName = "supplier_template",
    indices = [
        Index(value = ["supplier_id"]),
        Index(value = ["is_active"]),
        Index(value = ["supplier_id", "template_name"], unique = true)
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
data class SupplierTemplate(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    
    @ColumnInfo(name = "supplier_id")
    val supplierId: Long,
    
    @ColumnInfo(name = "template_name")
    val templateName: String,
    
    /**
     * JSON mapping of Excel columns to internal fields
     * Example:
     * {
     *   "header": {
     *     "שם סוכן": "agent_name",
     *     "סוג חוזה": "contract_type",
     *     "סכום בשקלים": "total_amount_nis",
     *     "סכום עמלה": "total_commission_nis"
     *   },
     *   "deals": {
     *     "מס החוזה": "contract_number",
     *     "שם מס' לקוח": "customer_name",
     *     "סכום בשקלים": "total_amount",
     *     "אחוז עמלה": "commission_percent",
     *     "סכום עמלה": "commission_amount"
     *   }
     * }
     */
    @ColumnInfo(name = "column_mapping_json")
    val columnMappingJson: String,
    
    @ColumnInfo(name = "is_active")
    val isActive: Boolean = true,
    
    @ColumnInfo(name = "created_at")
    val createdAt: Long = System.currentTimeMillis(),
    
    @ColumnInfo(name = "updated_at")
    val updatedAt: Long = System.currentTimeMillis()
)

/**
 * Supplier Monthly Header - Summary section from monthly Excel reports
 * 
 * This represents the aggregated header/summary rows from supplier Excel files.
 * Typically shows totals per agent and contract type.
 */
@Entity(
    tableName = "supplier_monthly_header",
    indices = [
        Index(value = ["supplier_id"]),
        Index(value = ["year", "month"]),
        Index(value = ["agent_name"]),
        Index(value = ["imported_at_utc"]),
        Index(value = ["supplier_id", "agent_name", "contract_type", "year", "month"], unique = true)
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
data class SupplierMonthlyHeader(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    
    @ColumnInfo(name = "supplier_id")
    val supplierId: Long,
    
    @ColumnInfo(name = "agent_name")
    val agentName: String,
    
    @ColumnInfo(name = "contract_type")
    val contractType: String, // "daily", "weekly", "monthly", "חודשי", "שבועי", "יומי"
    
    @ColumnInfo(name = "total_amount_nis")
    val totalAmountNis: Double,
    
    @ColumnInfo(name = "total_commission_nis")
    val totalCommissionNis: Double,
    
    @ColumnInfo(name = "year")
    val year: Int,
    
    @ColumnInfo(name = "month")
    val month: Int, // 1-12
    
    @ColumnInfo(name = "source_file_name")
    val sourceFileName: String,
    
    @ColumnInfo(name = "imported_at_utc")
    val importedAtUtc: Long,
    
    @ColumnInfo(name = "created_at")
    val createdAt: Long = System.currentTimeMillis(),
    
    @ColumnInfo(name = "header_hash")
    val headerHash: String? = null
)

/**
 * Supplier Monthly Deal - Individual deal rows from monthly Excel reports
 * 
 * This represents the detailed transaction/deal rows from supplier Excel files.
 * Each deal is linked to a header record and contains full transaction details.
 */
@Entity(
    tableName = "supplier_monthly_deal",
    indices = [
        Index(value = ["supplier_id"]),
        Index(value = ["header_id"]),
        Index(value = ["year", "month"]),
        Index(value = ["contract_number"]),
        Index(value = ["customer_name"]),
        Index(value = ["agent_name"]),
        Index(value = ["imported_at_utc"])
    ],
    foreignKeys = [
        ForeignKey(
            entity = Supplier::class,
            parentColumns = ["id"],
            childColumns = ["supplier_id"],
            onDelete = ForeignKey.RESTRICT
        ),
        ForeignKey(
            entity = SupplierMonthlyHeader::class,
            parentColumns = ["id"],
            childColumns = ["header_id"],
            onDelete = ForeignKey.CASCADE
        )
    ]
)
data class SupplierMonthlyDeal(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    
    @ColumnInfo(name = "supplier_id")
    val supplierId: Long,
    
    @ColumnInfo(name = "header_id")
    val headerId: Long,
    
    @ColumnInfo(name = "contract_number")
    val contractNumber: String,
    
    @ColumnInfo(name = "deal_type")
    val dealType: String? = null,
    
    @ColumnInfo(name = "deal_type_name")
    val dealTypeName: String? = null,
    
    @ColumnInfo(name = "contract_status")
    val contractStatus: String? = null,
    
    @ColumnInfo(name = "status_name")
    val statusName: String? = null,
    
    @ColumnInfo(name = "contract_start_date")
    val contractStartDate: Long? = null,
    
    @ColumnInfo(name = "contract_end_date")
    val contractEndDate: Long? = null,
    
    @ColumnInfo(name = "customer_id")
    val customerId: String? = null,
    
    @ColumnInfo(name = "customer_name")
    val customerName: String? = null,
    
    @ColumnInfo(name = "agent_name")
    val agentName: String,
    
    @ColumnInfo(name = "vehicle_type")
    val vehicleType: String? = null,
    
    @ColumnInfo(name = "license_plate")
    val licensePlate: String? = null,
    
    @ColumnInfo(name = "total_amount")
    val totalAmount: Double,
    
    @ColumnInfo(name = "commission_percent")
    val commissionPercent: Double? = null,
    
    @ColumnInfo(name = "commission_amount")
    val commissionAmount: Double,
    
    @ColumnInfo(name = "branch_name")
    val branchName: String? = null,
    
    @ColumnInfo(name = "year")
    val year: Int,
    
    @ColumnInfo(name = "month")
    val month: Int, // 1-12
    
    @ColumnInfo(name = "source_file_name")
    val sourceFileName: String,
    
    @ColumnInfo(name = "imported_at_utc")
    val importedAtUtc: Long,
    
    @ColumnInfo(name = "created_at")
    val createdAt: Long = System.currentTimeMillis(),
    
    @ColumnInfo(name = "row_hash")
    val rowHash: String? = null
)

