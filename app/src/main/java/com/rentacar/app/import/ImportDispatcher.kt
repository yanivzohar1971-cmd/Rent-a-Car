package com.rentacar.app.import

import android.content.Context
import android.net.Uri
import com.rentacar.app.data.*
import com.rentacar.app.sync.ReservationSyncService
import org.apache.poi.ss.usermodel.DateUtil
import org.apache.poi.ss.usermodel.Row
import org.apache.poi.xssf.usermodel.XSSFWorkbook
import java.io.InputStream
import java.security.MessageDigest

/**
 * Import dispatcher - routes to correct handler based on functionCode
 */
class ImportDispatcher(
    private val context: Context,
    private val supplierMonthlyHeaderDao: SupplierMonthlyHeaderDao,
    private val supplierMonthlyDealDao: SupplierMonthlyDealDao,
    private val importLogDao: ImportLogDao,
    private val reservationSyncService: ReservationSyncService
) {
    
    data class ImportResult(
        val success: Boolean,
        val createdCount: Int = 0,
        val updatedCount: Int = 0,
        val skippedCount: Int = 0,
        val errorCount: Int = 0,
        val totalRowsInFile: Int = 0,
        val processedRows: Int = 0,
        val errors: List<String> = emptyList(),
        val warnings: List<String> = emptyList()
    )
    
    suspend fun runImportForSupplier(
        supplierId: Long,
        functionCode: Int,
        fileUri: Uri
    ): ImportResult {
        // Step 1: Compute file hash to detect duplicates
        val fileHash = try {
            context.contentResolver.openInputStream(fileUri)?.use { inputStream ->
                computeFileHash(inputStream)
            } ?: return ImportResult(
                success = false,
                errors = listOf("לא ניתן לקרוא את הקובץ")
            )
        } catch (e: Exception) {
            return ImportResult(
                success = false,
                errors = listOf("שגיאה בקריאת הקובץ: ${e.message}")
            )
        }
        
        // Step 2: Check if this exact file was already imported (warning only, don't block)
        val isDuplicate = importLogDao.hasDuplicateRun(supplierId, fileHash)
        val duplicateWarning = if (isDuplicate) {
            "הקובץ הזה כבר יובא בעבר. המערכת תבדוק שינויים ברמת השורה."
        } else null
        
        // Step 3: Route to correct handler
        return when (functionCode) {
            1 -> importFromSupplier1_Excel(supplierId, fileUri, fileHash)
            2 -> importFromSupplier2_Csv(supplierId, fileUri, fileHash)
            3 -> importFromSupplier3_Txt(supplierId, fileUri, fileHash)
            4 -> importFromSupplier4_Email(supplierId, fileUri, fileHash)
            5 -> importFromSupplier5_Other(supplierId, fileUri, fileHash)
            else -> ImportResult(
                success = false,
                errors = listOf("סוג יבוא לא נתמך: $functionCode")
            )
        }
    }
    
    private fun computeFileHash(inputStream: InputStream): String {
        val digest = MessageDigest.getInstance("MD5")
        val buffer = ByteArray(8192)
        var bytesRead: Int
        while (inputStream.read(buffer).also { bytesRead = it } != -1) {
            digest.update(buffer, 0, bytesRead)
        }
        return digest.digest().joinToString("") { "%02x".format(it) }
    }
    
    private fun computeRowHash(
        supplierId: Long,
        contractNumber: String,
        dateFrom: Long?,
        dateTo: Long?,
        totalAmount: Double,
        status: String,
        agentName: String
    ): String {
        val canonical = "$supplierId|$contractNumber|${dateFrom ?: 0}|${dateTo ?: 0}|$totalAmount|$status|$agentName"
        val digest = MessageDigest.getInstance("MD5")
        digest.update(canonical.toByteArray())
        return digest.digest().joinToString("") { "%02x".format(it) }
    }
    
    private fun computeHeaderHash(
        supplierId: Long,
        agentName: String,
        contractType: String,
        year: Int,
        month: Int,
        totalAmount: Double,
        totalCommission: Double
    ): String {
        val canonical = "$supplierId|$agentName|$contractType|$year|$month|$totalAmount|$totalCommission"
        val digest = MessageDigest.getInstance("MD5")
        digest.update(canonical.toByteArray())
        return digest.digest().joinToString("") { "%02x".format(it) }
    }
    
    /**
     * Handler 1: Standard Excel import for supplier (e.g. פרי)
     */
    private suspend fun importFromSupplier1_Excel(supplierId: Long, fileUri: Uri, fileHash: String): ImportResult {
        val warnings = mutableListOf<String>()
        val fileName = getFileName(fileUri)
        
        try {
            // Open Excel file via ContentResolver
            val inputStream = context.contentResolver.openInputStream(fileUri)
                ?: return ImportResult(success = false, errors = listOf("לא ניתן לפתוח את הקובץ"))
            
            val workbook = XSSFWorkbook(inputStream)
            val sheet = workbook.getSheetAt(0)
            
            // Infer year/month from file or use current
            val calendar = java.util.Calendar.getInstance()
            val year = calendar.get(java.util.Calendar.YEAR)
            val month = calendar.get(java.util.Calendar.MONTH) + 1
            
            // Create import run log
            val importRun = SupplierImportRun(
                supplierId = supplierId,
                importTime = System.currentTimeMillis(),
                fileName = fileName,
                functionCode = 1,
                year = year,
                month = month,
                rowsProcessed = 0,
                rowsCreated = 0,
                rowsUpdated = 0,
                rowsClosed = 0,
                rowsCancelled = 0,
                rowsSkipped = 0,
                success = false,
                errorMessage = null,
                fileHash = fileHash
            )
            val runId = importLogDao.insertRun(importRun)
            
            var created = 0
            var updated = 0
            var skipped = 0
            var errors = 0
            var totalRowsInFile = 0
            
            // Aggregate data for header
            var totalAmount = 0.0
            var totalCommission = 0.0
            val agentSet = mutableSetOf<String>()
            val deals = mutableListOf<Triple<Int, SupplierMonthlyDeal, String>>() // rowNum, deal, hash
            
            // Iterate rows (skip header row 0)
            for (i in 1 until sheet.physicalNumberOfRows) {
                val row = sheet.getRow(i) ?: continue
                totalRowsInFile++
                
                try {
                    // Column A: Contract Number (normalized to avoid scientific notation)
                    val contractNumber = normalizeContractNumber(row, 0).trim()
                    if (contractNumber.isBlank()) {
                        errors++
                        warnings.add("שורה ${i + 1}: מספר חוזה חסר, דולגת")
                        
                        // Log error entry
                        importLogDao.insertEntry(
                            SupplierImportRunEntry(
                                runId = runId,
                                rowNumberInFile = i + 1,
                                externalContractNumber = null,
                                actionTaken = "ERROR",
                                reservationId = null,
                                amount = null,
                                notes = "שורה דולגה - חסר מספר חוזה"
                            )
                        )
                        continue
                    }
                    
                    // Column B: Customer Name
                    val customerName = getCellStringValue(row, 1)?.trim()
                    
                    // Column C: Start Date
                    val startDate = getCellDateValue(row, 2)
                    
                    // Column D: End Date
                    val endDate = getCellDateValue(row, 3)
                    
                    // Column E: Amount
                    val amount = getCellNumericValue(row, 4) ?: 0.0
                    
                    // Column F: Status
                    val status = getCellStringValue(row, 5)?.trim() ?: "לא ידוע"
                    
                    // Column G: Agent Name
                    val agentName = getCellStringValue(row, 6)?.trim() ?: "לא ידוע"
                    
                    agentSet.add(agentName)
                    totalAmount += amount
                    
                    // Compute commission (example: 7%)
                    val commissionPercent = 7.0
                    val commissionAmount = amount * (commissionPercent / 100.0)
                    totalCommission += commissionAmount
                    
                    // Compute row hash
                    val rowHashValue = computeRowHash(
                        supplierId, contractNumber, startDate, endDate, amount, status, agentName
                    )
                    
                    // Build deal object (headerId will be set later)
                    val deal = SupplierMonthlyDeal(
                        headerId = 0, // Placeholder, will update after header insert
                        supplierId = supplierId,
                        year = year,
                        month = month,
                        contractNumber = contractNumber,
                        customerId = null,
                        customerName = customerName,
                        contractStartDate = startDate,
                        contractEndDate = endDate,
                        vehicleType = null,
                        totalAmount = amount,
                        commissionPercent = commissionPercent,
                        commissionAmount = commissionAmount,
                        agentName = agentName,
                        branchName = null,
                        statusName = status,
                        sourceFileName = fileName,
                        importedAtUtc = System.currentTimeMillis(),
                        rowHash = rowHashValue
                    )
                    
                    deals.add(Triple(i + 1, deal, rowHashValue))
                    
                } catch (e: Exception) {
                    errors++
                    warnings.add("שורה ${i + 1}: שגיאה בקריאת נתונים - ${e.message}")
                    
                    // Log error entry
                    importLogDao.insertEntry(
                        SupplierImportRunEntry(
                            runId = runId,
                            rowNumberInFile = i + 1,
                            externalContractNumber = null,
                            actionTaken = "ERROR",
                            reservationId = null,
                            amount = null,
                            notes = "שגיאה בקריאת נתונים: ${e.message}"
                        )
                    )
                }
            }
            
            workbook.close()
            inputStream.close()
            
            if (deals.isEmpty()) {
                return ImportResult(
                    success = false,
                    errors = listOf("לא נמצאו עסקאות תקינות בקובץ")
                )
            }
            
            // Upsert header with hash
            val agentName = agentSet.firstOrNull() ?: "כללי"
            val contractType = "רגיל"
            val headerHashValue = computeHeaderHash(
                supplierId, agentName, contractType, year, month, totalAmount, totalCommission
            )
            val header = SupplierMonthlyHeader(
                supplierId = supplierId,
                year = year,
                month = month,
                agentName = agentName,
                contractType = contractType,
                totalAmountNis = totalAmount,
                totalCommissionNis = totalCommission,
                sourceFileName = fileName,
                importedAtUtc = System.currentTimeMillis(),
                headerHash = headerHashValue
            )
            val headerId = supplierMonthlyHeaderDao.upsert(header)
            
            // Now insert/update deals with correct headerId
            for ((rowNum, dealTemplate, rowHashValue) in deals) {
                val deal = dealTemplate.copy(headerId = headerId)
                
                try {
                    // Check if deal already exists
                    val existingDeal = supplierMonthlyDealDao.findBySupplierAndContract(supplierId, deal.contractNumber)
                    val actionTaken: String
                    val notes: String
                    
                    if (existingDeal == null) {
                        // New deal - insert
                        supplierMonthlyDealDao.insert(deal)
                        created++
                        actionTaken = "CREATED"
                        notes = "הזמנה חדשה נוצרה"
                    } else {
                        // Deal exists - check hash
                        if (existingDeal.rowHash == rowHashValue) {
                            // Identical - skip
                            skipped++
                            actionTaken = "SKIPPED_NO_CHANGE"
                            notes = "רשומה זהה קיימת כבר (ללא שינוי)"
                        } else {
                            // Changed - update
                            val updatedDeal = existingDeal.copy(
                                headerId = headerId,
                                customerName = deal.customerName,
                                contractStartDate = deal.contractStartDate,
                                contractEndDate = deal.contractEndDate,
                                totalAmount = deal.totalAmount,
                                commissionPercent = deal.commissionPercent,
                                commissionAmount = deal.commissionAmount,
                                agentName = deal.agentName,
                                statusName = deal.statusName,
                                rowHash = rowHashValue,
                                importedAtUtc = System.currentTimeMillis()
                            )
                            supplierMonthlyDealDao.update(updatedDeal)
                            updated++
                            actionTaken = "UPDATED"
                            notes = "עודכן עם נתונים חדשים"
                        }
                    }
                    
                    // Log entry
                    importLogDao.insertEntry(
                        SupplierImportRunEntry(
                            runId = runId,
                            rowNumberInFile = rowNum,
                            externalContractNumber = deal.contractNumber,
                            actionTaken = actionTaken,
                            reservationId = null,
                            amount = deal.totalAmount,
                            notes = notes
                        )
                    )
                } catch (e: Exception) {
                    warnings.add("שורה $rowNum: שגיאה בשמירת עסקה - ${e.message}")
                }
            }
            
            // Sync to reservations using strategy 1
            try {
                reservationSyncService.syncSupplierDealsToReservations(
                    supplierId = supplierId,
                    year = year,
                    month = month,
                    functionCode = 1
                )
            } catch (syncError: Exception) {
                android.util.Log.e("ImportDispatcher", "Sync failed: ${syncError.message}", syncError)
                warnings.add("ייבוא הצליח אך סנכרון ההזמנות נכשל: ${syncError.message}")
            }
            
            // Calculate processed rows (created + updated + skipped, excluding errors)
            val processedRows = created + updated + skipped
            
            // Update import run with final counts
            val finalRun = importRun.copy(
                id = runId,
                rowsProcessed = totalRowsInFile,
                rowsCreated = created,
                rowsUpdated = updated,
                rowsClosed = 0, // TODO: track separately if needed
                rowsCancelled = 0, // TODO: track separately if needed
                rowsSkipped = skipped,
                success = true,
                errorMessage = if (errors > 0) "$errors שגיאות" else null
            )
            
            // Update the run record
            importLogDao.insertRun(finalRun)
            
            return ImportResult(
                success = true,
                createdCount = created,
                updatedCount = updated,
                skippedCount = skipped,
                errorCount = errors,
                totalRowsInFile = totalRowsInFile,
                processedRows = processedRows,
                errors = emptyList(),
                warnings = warnings
            )
            
        } catch (e: Exception) {
            android.util.Log.e("ImportDispatcher", "Import failed", e)
            return ImportResult(
                success = false,
                errors = listOf("שגיאה בייבוא: ${e.message}")
            )
        }
    }
    
    private fun getCellStringValue(row: Row, columnIndex: Int): String? {
        return try {
            val cell = row.getCell(columnIndex) ?: return null
            when (cell.cellType) {
                org.apache.poi.ss.usermodel.CellType.STRING -> cell.stringCellValue
                org.apache.poi.ss.usermodel.CellType.NUMERIC -> cell.numericCellValue.toString()
                org.apache.poi.ss.usermodel.CellType.BOOLEAN -> cell.booleanCellValue.toString()
                else -> null
            }
        } catch (e: Exception) {
            null
        }
    }
    
    private fun normalizeContractNumber(row: Row, columnIndex: Int): String {
        val cell = row.getCell(columnIndex)
        if (cell == null) return ""
        
        return try {
            when (cell.cellType) {
                org.apache.poi.ss.usermodel.CellType.STRING -> cell.stringCellValue.trim()
                org.apache.poi.ss.usermodel.CellType.NUMERIC -> {
                    try {
                        // Use BigDecimal to avoid scientific notation
                        val bd = java.math.BigDecimal(cell.numericCellValue)
                        bd.toPlainString().replace(Regex("\\.0$"), "")
                    } catch (e: Exception) {
                        // Fallback: convert to long if possible
                        cell.numericCellValue.toLong().toString()
                    }
                }
                else -> cell.toString().trim()
            }
        } catch (e: Exception) {
            ""
        }
    }
    
    private fun getCellNumericValue(row: Row, columnIndex: Int): Double? {
        return try {
            val cell = row.getCell(columnIndex) ?: return null
            when (cell.cellType) {
                org.apache.poi.ss.usermodel.CellType.NUMERIC -> cell.numericCellValue
                org.apache.poi.ss.usermodel.CellType.STRING -> cell.stringCellValue.toDoubleOrNull()
                else -> null
            }
        } catch (e: Exception) {
            null
        }
    }
    
    private fun getCellDateValue(row: Row, columnIndex: Int): Long? {
        return try {
            val cell = row.getCell(columnIndex) ?: return null
            when (cell.cellType) {
                org.apache.poi.ss.usermodel.CellType.NUMERIC -> {
                    if (DateUtil.isCellDateFormatted(cell)) {
                        cell.dateCellValue.time
                    } else {
                        null
                    }
                }
                else -> null
            }
        } catch (e: Exception) {
            null
        }
    }
    
    private suspend fun importFromSupplier2_Csv(supplierId: Long, fileUri: Uri, fileHash: String): ImportResult {
        // TODO: Implement CSV import
        return ImportResult(
            success = false,
            warnings = listOf("יבוא CSV עדיין לא מיושם - זהו stub")
        )
    }
    
    private suspend fun importFromSupplier3_Txt(supplierId: Long, fileUri: Uri, fileHash: String): ImportResult {
        // TODO: Implement TXT import
        return ImportResult(
            success = false,
            warnings = listOf("יבוא TXT עדיין לא מיושם - זהו stub")
        )
    }
    
    private suspend fun importFromSupplier4_Email(supplierId: Long, fileUri: Uri, fileHash: String): ImportResult {
        // TODO: Implement EMAIL import
        return ImportResult(
            success = false,
            warnings = listOf("יבוא EMAIL עדיין לא מיושם - זהו stub")
        )
    }
    
    private suspend fun importFromSupplier5_Other(supplierId: Long, fileUri: Uri, fileHash: String): ImportResult {
        // TODO: Implement other import
        return ImportResult(
            success = false,
            warnings = listOf("יבוא אחר עדיין לא מיושם - זהו stub")
        )
    }
    
    private fun getFileName(uri: Uri): String {
        val cursor = context.contentResolver.query(uri, null, null, null, null)
        return cursor?.use {
            val nameIndex = it.getColumnIndex(android.provider.OpenableColumns.DISPLAY_NAME)
            if (it.moveToFirst() && nameIndex >= 0) {
                it.getString(nameIndex)
            } else {
                "unknown_file"
            }
        } ?: "unknown_file"
    }
}

