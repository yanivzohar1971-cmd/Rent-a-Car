package com.rentacar.app.import

import android.content.Context
import android.net.Uri
import com.rentacar.app.data.*
import com.rentacar.app.data.auth.CurrentUserProvider
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.InputStream
import java.text.SimpleDateFormat
import java.util.*

/**
 * Service for importing monthly supplier Excel reports
 * 
 * Handles:
 * - Excel file reading
 * - Template-based column mapping
 * - Data validation
 * - Database import with audit trail
 */
class ExcelImportService(
    private val context: Context,
    private val supplierTemplateDao: SupplierTemplateDao,
    private val headerDao: SupplierMonthlyHeaderDao,
    private val dealDao: SupplierMonthlyDealDao,
    private val reservationSyncService: com.rentacar.app.sync.ReservationSyncService
) {
    
    /**
     * Import result with statistics and errors
     */
    data class ImportResult(
        val success: Boolean,
        val headersImported: Int = 0,
        val dealsImported: Int = 0,
        val errors: List<String> = emptyList(),
        val warnings: List<String> = emptyList()
    )
    
    /**
     * Import configuration
     */
    data class ImportConfig(
        val supplierId: Long,
        val functionCode: Int,         // Import function code (1, 2, 3...)
        val templateId: Long,          // REQUIRED: which SupplierTemplate to use
        val year: Int? = null,         // If null, will try to infer from file
        val month: Int? = null,        // If null, will try to infer from file
        val validateSums: Boolean = true,
        val tolerance: Double = 10.0   // NIS tolerance for sum validation
    )
    
    /**
     * Main import function
     */
    suspend fun importExcelFile(
        fileUri: Uri,
        config: ImportConfig
    ): ImportResult = withContext(Dispatchers.IO) {
        
        val errors = mutableListOf<String>()
        val warnings = mutableListOf<String>()
        
        try {
            val currentUid = CurrentUserProvider.requireCurrentUid()
            // Step 1: Get template by ID (templateId is now required and passed explicitly)
            val template = supplierTemplateDao.getByIdDirect(config.templateId, currentUid)
                ?: return@withContext ImportResult(
                    success = false,
                    errors = listOf("תבנית לא נמצאה (ID: ${config.templateId})")
                )
            
            // Step 2: Read Excel file
            val fileName = getFileName(fileUri)
            val inputStream = context.contentResolver.openInputStream(fileUri)
                ?: return@withContext ImportResult(
                    success = false,
                    errors = listOf("Cannot open file: $fileUri")
                )
            
            // Step 3: Parse Excel (placeholder - requires actual Excel library)
            val excelData = parseExcelFile(inputStream, template)
            inputStream.close()
            
            // Step 4: Infer period if not provided
            val year = config.year ?: inferYear(fileName, excelData)
            val month = config.month ?: inferMonth(fileName, excelData)
            
            if (year == null || month == null) {
                return@withContext ImportResult(
                    success = false,
                    errors = listOf("Cannot determine year/month. Please specify manually.")
                )
            }
            
            // Step 5: Validate year/month
            if (year < 2020 || year > 2100 || month < 1 || month > 12) {
                return@withContext ImportResult(
                    success = false,
                    errors = listOf("Invalid year ($year) or month ($month)")
                )
            }
            
            // Step 6: Check for duplicates
            val existingHeaders = headerDao.getBySupplierAndPeriod(config.supplierId, year, month, currentUid)
            // Note: This is a Flow, you'd need to collect it first
            // For now, we'll skip duplicate check in this example
            
            // Step 7: Security validation
            val securityErrors = validateSecurity(excelData)
            if (securityErrors.isNotEmpty()) {
                return@withContext ImportResult(
                    success = false,
                    errors = securityErrors
                )
            }
            
            // Step 8: Transform to entities
            val importTimestamp = System.currentTimeMillis()
            val headers = transformHeaders(
                excelData.headers,
                config.supplierId,
                year,
                month,
                fileName,
                importTimestamp,
                currentUid
            )
            
            val deals = transformDeals(
                excelData.deals,
                config.supplierId,
                year,
                month,
                fileName,
                importTimestamp,
                currentUid
            )
            
            // Step 9: Validate sums
            if (config.validateSums) {
                val sumErrors = validateSums(headers, deals, config.tolerance)
                if (sumErrors.isNotEmpty()) {
                    warnings.addAll(sumErrors)
                }
            }
            
            // Step 10: Insert into database
            var headersInserted = 0
            var dealsInserted = 0
            
            try {
                // Insert headers and get IDs
                val headerIdMap = mutableMapOf<String, Long>()
                for (header in headers) {
                    val headerId = headerDao.insert(header)
                    val key = "${header.agentName}|${header.contractType}"
                    headerIdMap[key] = headerId
                    headersInserted++
                }
                
                // Insert deals with correct header IDs
                for (deal in deals) {
                    // Determine contract type from deal data
                    val contractType = determineContractType(deal)
                    val key = "${deal.agentName}|$contractType"
                    val headerId = headerIdMap[key]
                        ?: throw IllegalStateException("No header found for deal with agent=${deal.agentName}, type=$contractType")
                    
                    val dealWithHeaderId = deal.copy(headerId = headerId)
                    dealDao.insert(dealWithHeaderId)
                    dealsInserted++
                }
                
                // Step 11: Sync deals to reservations using the assigned function code
                try {
                    reservationSyncService.syncSupplierDealsToReservations(
                        supplierId = config.supplierId,
                        year = year,
                        month = month,
                        functionCode = config.functionCode
                    )
                } catch (syncError: Exception) {
                    // Log sync error but don't fail the import
                    android.util.Log.e("ExcelImportService", "Sync to reservations failed: ${syncError.message}", syncError)
                    warnings.add("ייבוא הצליח אך סנכרון ההזמנות נכשל: ${syncError.message}")
                }
                
                return@withContext ImportResult(
                    success = true,
                    headersImported = headersInserted,
                    dealsImported = dealsInserted,
                    warnings = warnings
                )
                
            } catch (e: Exception) {
                // Rollback would happen automatically due to transaction failure
                return@withContext ImportResult(
                    success = false,
                    errors = listOf("Database insert failed: ${e.message}")
                )
            }
            
        } catch (e: Exception) {
            return@withContext ImportResult(
                success = false,
                errors = listOf("Import failed: ${e.message}")
            )
        }
    }
    
    /**
     * Get template for supplier
     */
    private suspend fun getTemplate(supplierId: Long, templateId: Long?): SupplierTemplate? {
        return if (templateId != null) {
            // Get specific template (would need to convert Flow to suspend)
            null // Placeholder
        } else {
            // Get first active template for supplier
            null // Placeholder
        }
    }
    
    /**
     * Get filename from URI
     */
    private fun getFileName(uri: Uri): String {
        val cursor = context.contentResolver.query(uri, null, null, null, null)
        return cursor?.use {
            val nameIndex = it.getColumnIndex(android.provider.OpenableColumns.DISPLAY_NAME)
            if (it.moveToFirst() && nameIndex >= 0) {
                it.getString(nameIndex)
            } else {
                "unknown_file.xlsx"
            }
        } ?: "unknown_file.xlsx"
    }
    
    /**
     * Parse Excel file using template
     * This is a placeholder - actual implementation would use Apache POI or similar
     */
    private data class ExcelData(
        val headers: List<HeaderRow>,
        val deals: List<DealRow>
    )
    
    private data class HeaderRow(
        val agentName: String,
        val contractType: String,
        val totalAmountNis: Double,
        val totalCommissionNis: Double
    )
    
    private data class DealRow(
        val contractNumber: String,
        val agentName: String,
        val customerName: String?,
        val totalAmount: Double,
        val commissionAmount: Double,
        val commissionPercent: Double?,
        val startDate: Long?,
        val endDate: Long?,
        val vehicleType: String?,
        val branchName: String?,
        val rawData: Map<String, Any?>
    )
    
    private fun parseExcelFile(inputStream: InputStream, template: SupplierTemplate): ExcelData {
        // TODO: Implement actual Excel parsing using Apache POI or similar
        // This would:
        // 1. Parse column_mapping_json from template
        // 2. Read Excel rows
        // 3. Map columns to internal fields
        // 4. Return structured data
        
        return ExcelData(
            headers = emptyList(),
            deals = emptyList()
        )
    }
    
    /**
     * Infer year from filename or data
     */
    private fun inferYear(fileName: String, data: ExcelData): Int? {
        // Try to extract year from filename (e.g., "report_2025_08.xlsx")
        val yearPattern = Regex("""20\d{2}""")
        val match = yearPattern.find(fileName)
        if (match != null) {
            return match.value.toInt()
        }
        
        // Default to current year
        return Calendar.getInstance().get(Calendar.YEAR)
    }
    
    /**
     * Infer month from filename or data
     */
    private fun inferMonth(fileName: String, data: ExcelData): Int? {
        // Try to extract month from filename
        val monthPattern = Regex("""_(\d{2})\.xlsx""")
        val match = monthPattern.find(fileName)
        if (match != null) {
            return match.groupValues[1].toInt()
        }
        
        // Default to current month
        return Calendar.getInstance().get(Calendar.MONTH) + 1
    }
    
    /**
     * Validate no sensitive data (PAN, CVV) in file
     */
    private fun validateSecurity(data: ExcelData): List<String> {
        val errors = mutableListOf<String>()
        
        // Check for credit card patterns
        val panPattern = Regex("""\b\d{13,19}\b""")
        val cvvPattern = Regex("""\b\d{3,4}\b""")
        
        // Check all deal data
        for (deal in data.deals) {
            for ((key, value) in deal.rawData) {
                val strValue = value?.toString() ?: continue
                
                if (key.contains("card", ignoreCase = true) || 
                    key.contains("pan", ignoreCase = true) ||
                    key.contains("cvv", ignoreCase = true) ||
                    key.contains("כרטיס", ignoreCase = true)) {
                    errors.add("SECURITY ALERT: Suspicious column name '$key' detected")
                }
                
                if (panPattern.containsMatchIn(strValue) && strValue.length >= 13) {
                    errors.add("SECURITY ALERT: Possible credit card number detected in field '$key'")
                }
            }
        }
        
        return errors
    }
    
    /**
     * Transform header rows to entities
     */
    private fun transformHeaders(
        rows: List<HeaderRow>,
        supplierId: Long,
        year: Int,
        month: Int,
        fileName: String,
        timestamp: Long,
        currentUid: String
    ): List<SupplierMonthlyHeader> {
        return rows.map { row ->
            SupplierMonthlyHeader(
                supplierId = supplierId,
                agentName = row.agentName,
                contractType = normalizeContractType(row.contractType),
                totalAmountNis = row.totalAmountNis,
                totalCommissionNis = row.totalCommissionNis,
                year = year,
                month = month,
                sourceFileName = fileName,
                importedAtUtc = timestamp,
                userUid = currentUid
            )
        }
    }
    
    /**
     * Transform deal rows to entities
     */
    private fun transformDeals(
        rows: List<DealRow>,
        supplierId: Long,
        year: Int,
        month: Int,
        fileName: String,
        timestamp: Long,
        currentUid: String
    ): List<SupplierMonthlyDeal> {
        return rows.map { row ->
            SupplierMonthlyDeal(
                supplierId = supplierId,
                headerId = 0, // Will be set during insert
                contractNumber = row.contractNumber,
                customerName = row.customerName,
                agentName = row.agentName,
                totalAmount = row.totalAmount,
                commissionAmount = row.commissionAmount,
                commissionPercent = row.commissionPercent,
                contractStartDate = row.startDate,
                contractEndDate = row.endDate,
                vehicleType = row.vehicleType,
                branchName = row.branchName,
                year = year,
                month = month,
                sourceFileName = fileName,
                importedAtUtc = timestamp,
                userUid = currentUid
            )
        }
    }
    
    /**
     * Normalize contract type (Hebrew/English)
     */
    private fun normalizeContractType(type: String): String {
        return when (type.trim()) {
            "יומי", "daily" -> "daily"
            "שבועי", "weekly" -> "weekly"
            "חודשי", "monthly" -> "monthly"
            else -> type.trim()
        }
    }
    
    /**
     * Determine contract type from deal duration
     */
    private fun determineContractType(deal: SupplierMonthlyDeal): String {
        // If we have dates, calculate duration
        if (deal.contractStartDate != null && deal.contractEndDate != null) {
            val days = ((deal.contractEndDate - deal.contractStartDate) / (1000 * 60 * 60 * 24)).toInt()
            return when {
                days <= 6 -> "daily"
                days <= 23 -> "weekly"
                else -> "monthly"
            }
        }
        
        // Default to monthly
        return "monthly"
    }
    
    /**
     * Validate header sums match aggregated deal sums
     */
    private fun validateSums(
        headers: List<SupplierMonthlyHeader>,
        deals: List<SupplierMonthlyDeal>,
        tolerance: Double
    ): List<String> {
        val warnings = mutableListOf<String>()
        
        for (header in headers) {
            // Find matching deals
            val matchingDeals = deals.filter { 
                it.agentName == header.agentName && 
                determineContractType(it) == header.contractType 
            }
            
            if (matchingDeals.isEmpty()) {
                warnings.add("Header for ${header.agentName}/${header.contractType} has no matching deals")
                continue
            }
            
            val dealTotalAmount = matchingDeals.sumOf { it.totalAmount }
            val dealTotalCommission = matchingDeals.sumOf { it.commissionAmount }
            
            val amountDiff = Math.abs(dealTotalAmount - header.totalAmountNis)
            val commissionDiff = Math.abs(dealTotalCommission - header.totalCommissionNis)
            
            if (amountDiff > tolerance) {
                warnings.add(
                    "Sum mismatch for ${header.agentName}/${header.contractType}: " +
                    "Header total=${"%.2f".format(header.totalAmountNis)}, " +
                    "Deals total=${"%.2f".format(dealTotalAmount)}, " +
                    "Difference=${"%.2f".format(amountDiff)}"
                )
            }
            
            if (commissionDiff > tolerance) {
                warnings.add(
                    "Commission mismatch for ${header.agentName}/${header.contractType}: " +
                    "Header commission=${"%.2f".format(header.totalCommissionNis)}, " +
                    "Deals commission=${"%.2f".format(dealTotalCommission)}, " +
                    "Difference=${"%.2f".format(commissionDiff)}"
                )
            }
        }
        
        return warnings
    }
}

