package com.rentacar.app.data

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(
    tableName = "supplier_import_run",
    indices = [
        Index(value = ["supplier_id"]),
        Index(value = ["import_time"])
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
data class SupplierImportRun(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    
    @ColumnInfo(name = "supplier_id")
    val supplierId: Long,
    
    @ColumnInfo(name = "import_time")
    val importTime: Long,
    
    @ColumnInfo(name = "file_name")
    val fileName: String,
    
    @ColumnInfo(name = "function_code")
    val functionCode: Int,
    
    @ColumnInfo(name = "year")
    val year: Int,
    
    @ColumnInfo(name = "month")
    val month: Int,
    
    @ColumnInfo(name = "rows_processed")
    val rowsProcessed: Int,
    
    @ColumnInfo(name = "rows_created")
    val rowsCreated: Int,
    
    @ColumnInfo(name = "rows_updated")
    val rowsUpdated: Int,
    
    @ColumnInfo(name = "rows_closed")
    val rowsClosed: Int,
    
    @ColumnInfo(name = "rows_cancelled")
    val rowsCancelled: Int,
    
    @ColumnInfo(name = "rows_skipped")
    val rowsSkipped: Int,
    
    @ColumnInfo(name = "success")
    val success: Boolean,
    
    @ColumnInfo(name = "error_message")
    val errorMessage: String?,
    
    @ColumnInfo(name = "file_hash")
    val fileHash: String?,
    
    @ColumnInfo(name = "user_uid") val userUid: String? = null
)

@Entity(
    tableName = "supplier_import_run_entry",
    indices = [
        Index(value = ["run_id"]),
        Index(value = ["row_number_in_file"])
    ],
    foreignKeys = [
        ForeignKey(
            entity = SupplierImportRun::class,
            parentColumns = ["id"],
            childColumns = ["run_id"],
            onDelete = ForeignKey.CASCADE
        )
    ]
)
data class SupplierImportRunEntry(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    
    @ColumnInfo(name = "run_id")
    val runId: Long,
    
    @ColumnInfo(name = "row_number_in_file")
    val rowNumberInFile: Int,
    
    @ColumnInfo(name = "external_contract_number")
    val externalContractNumber: String?,
    
    @ColumnInfo(name = "action_taken")
    val actionTaken: String, // "CREATED", "UPDATED", "CLOSED", "CANCELLED", "SKIPPED"
    
    @ColumnInfo(name = "reservation_id")
    val reservationId: Long?,
    
    @ColumnInfo(name = "amount")
    val amount: Double?,
    
    @ColumnInfo(name = "notes")
    val notes: String?,
    
    @ColumnInfo(name = "user_uid") val userUid: String? = null
)

