package com.rentacar.app.import

import android.content.Context
import android.net.Uri
import com.rentacar.app.data.AppDatabase
import com.rentacar.app.data.SupplierImportRun
import com.rentacar.app.data.SupplierPriceListHeader
import com.rentacar.app.data.SupplierPriceListItem
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.apache.poi.xssf.usermodel.XSSFWorkbook
import org.apache.poi.ss.usermodel.Row
import java.util.*
import com.rentacar.app.import.ImportDispatcher.ImportResult
import androidx.room.withTransaction

class PriceListImportDispatcher(
    private val context: Context,
    private val db: AppDatabase
) {

    suspend fun importPriceListFromExcel(
        supplierId: Long,
        fileUri: Uri
    ): ImportResult = withContext(Dispatchers.IO) {
        val supplierPriceListDao = db.supplierPriceListDao()
        val importLogDao = db.importLogDao()

        val fileName = getFileName(fileUri)

        val inputStream = context.contentResolver.openInputStream(fileUri)
            ?: return@withContext ImportResult(
                success = false,
                errors = listOf("לא ניתן לפתוח את הקובץ")
            )

        val workbook = XSSFWorkbook(inputStream)
        val sheet = workbook.getSheet("מחירון שקלי ודולרי") ?: workbook.getSheetAt(0)

        // Exchange rate from AA1 (row 0, column 26)
        val exchangeRate = sheet.getRow(0)?.getCell(26)?.numericCellValue ?: 1.0

        // Infer year/month from current date (for now)
        val calendar = Calendar.getInstance()
        val year = calendar.get(Calendar.YEAR)
        val month = calendar.get(Calendar.MONTH) + 1

        // Create import run log (similar to ImportDispatcher)
        val timestamp = System.currentTimeMillis()
        val importRun = SupplierImportRun(
            supplierId = supplierId,
            importTime = timestamp,
            fileName = fileName,
            functionCode = 100, // distinct code for price list import
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
            fileHash = null // optional, not required
        )

        val runId = importLogDao.insertRun(importRun)

        try {
            val items = parsePriceListSheet(
                sheet = sheet,
                supplierId = supplierId,
                year = year,
                month = month,
                exchangeRate = exchangeRate
            )

            // Insert header + items in a transaction
            db.withTransaction {
                val header = SupplierPriceListHeader(
                    supplierId = supplierId,
                    year = year,
                    month = month,
                    createdAt = timestamp,
                    isActive = true,
                    sourceFileName = fileName,
                    notes = null
                )
                val headerId = supplierPriceListDao.insertHeader(header)

                // Deactivate other lists for different periods for this supplier
                supplierPriceListDao.deactivateOtherPriceListsForPeriod(
                    supplierId = supplierId,
                    year = year,
                    month = month
                )

                val itemsWithHeader = items.map { base ->
                    base.copy(
                        headerId = headerId
                    )
                }
                supplierPriceListDao.insertItems(itemsWithHeader)

                // Update import run stats
                val updatedRun = importRun.copy(
                    id = runId,
                    rowsProcessed = items.size,
                    rowsCreated = items.size,
                    success = true
                )
                importLogDao.updateRun(updatedRun)
            }

            workbook.close()
            inputStream.close()

            return@withContext ImportResult(
                success = true,
                errors = emptyList(),
                warnings = emptyList(),
                totalRowsInFile = items.size,
                processedRows = items.size,
                createdCount = items.size,
                updatedCount = 0,
                skippedCount = 0
            )
        } catch (e: Exception) {
            workbook.close()
            inputStream.close()

            val updatedRun = importRun.copy(
                id = runId,
                success = false,
                errorMessage = e.message ?: "Unknown error"
            )
            importLogDao.updateRun(updatedRun)

            return@withContext ImportResult(
                success = false,
                errors = listOf("שגיאה ביבוא מחירון: ${e.message}"),
                warnings = emptyList()
            )
        }
    }

    // Implement getFileName similar to ExcelImportService
    private fun getFileName(uri: Uri): String {
        val cursor = context.contentResolver.query(uri, null, null, null, null)
        return cursor?.use {
            val nameIndex = it.getColumnIndex(android.provider.OpenableColumns.DISPLAY_NAME)
            if (it.moveToFirst() && nameIndex >= 0) {
                it.getString(nameIndex)
            } else {
                "unknown_price_list.xlsx"
            }
        } ?: "unknown_price_list.xlsx"
    }

    /**
     * Parse the "מחירון שקלי ודולרי" sheet into SupplierPriceListItem rows.
     */
    private fun parsePriceListSheet(
        sheet: org.apache.poi.ss.usermodel.Sheet,
        supplierId: Long,
        year: Int,
        month: Int,
        exchangeRate: Double
    ): List<SupplierPriceListItem> {
        val items = mutableListOf<SupplierPriceListItem>()

        data class GroupContext(
            val carGroupCode: String?,
            val carGroupName: String?,
            val dailyPriceNis: Double?,
            val weeklyPriceNis: Double?,
            val monthlyPriceNis: Double?,
            val dailyPriceUsd: Double?,
            val weeklyPriceUsd: Double?,
            val monthlyPriceUsd: Double?,
            val shabbatInsuranceNis: Double?,
            val shabbatInsuranceUsd: Double?,
            val includedKmPerDay: Int?,
            val includedKmPerWeek: Int?,
            val includedKmPerMonth: Int?,
            val extraKmPriceNis: Double?,
            val extraKmPriceUsd: Double?,
            val deductibleNis: Double?
        )

        var currentGroup: GroupContext? = null

        // Data starts at row index 5 (Excel row 6)
        val firstDataRow = 5
        val lastRow = sheet.lastRowNum

        for (rowIndex in firstDataRow..lastRow) {
            val row = sheet.getRow(rowIndex) ?: continue

            val colC = getCellStringValue(row, 2)?.trim()
            val colD = getCellStringValue(row, 3)?.trim()

            val dailyNis = getCellNumericValue(row, 4)
            val isGroupRow = colC?.isNotEmpty() == true && colD.isNullOrEmpty() && (dailyNis != null)

            if (colC.isNullOrEmpty() && colD.isNullOrEmpty() && dailyNis == null) {
                // Empty / comment row – skip
                continue
            }

            if (isGroupRow) {
                // Parse "B 100/101 - רכב קטן" into code + name
                val (groupCode, groupName) = parseGroupCodeAndName(colC ?: "")
                val weeklyNis = getCellNumericValue(row, 5)
                val monthlyNis = getCellNumericValue(row, 6)

                val dailyUsd = getCellNumericValue(row, 7) ?: convertToUsd(dailyNis, exchangeRate)
                val weeklyUsd = getCellNumericValue(row, 8) ?: convertToUsd(weeklyNis, exchangeRate)
                val monthlyUsd = getCellNumericValue(row, 9) ?: convertToUsd(monthlyNis, exchangeRate)

                val shabbatNis = getCellNumericValue(row, 10)
                val shabbatUsd = getCellNumericValue(row, 11) ?: convertToUsd(shabbatNis, exchangeRate)

                val kmDay = getCellNumericValue(row, 12)?.toInt()
                val kmWeek = getCellNumericValue(row, 13)?.toInt()
                val kmMonth = getCellNumericValue(row, 14)?.toInt()

                val extraKmNis = getCellNumericValue(row, 15)
                val extraKmUsd = getCellNumericValue(row, 16) ?: convertToUsd(extraKmNis, exchangeRate)

                val deductibleNis = getCellNumericValue(row, 17)

                currentGroup = GroupContext(
                    carGroupCode = groupCode,
                    carGroupName = groupName,
                    dailyPriceNis = dailyNis,
                    weeklyPriceNis = weeklyNis,
                    monthlyPriceNis = monthlyNis,
                    dailyPriceUsd = dailyUsd,
                    weeklyPriceUsd = weeklyUsd,
                    monthlyPriceUsd = monthlyUsd,
                    shabbatInsuranceNis = shabbatNis,
                    shabbatInsuranceUsd = shabbatUsd,
                    includedKmPerDay = kmDay,
                    includedKmPerWeek = kmWeek,
                    includedKmPerMonth = kmMonth,
                    extraKmPriceNis = extraKmNis,
                    extraKmPriceUsd = extraKmUsd,
                    deductibleNis = deductibleNis
                )
            } else {
                // Vehicle row – needs a current group
                val group = currentGroup ?: continue

                if (colC.isNullOrEmpty() || colD.isNullOrEmpty()) {
                    // Not a proper vehicle row
                    continue
                }

                val item = SupplierPriceListItem(
                    id = 0L,
                    headerId = 0L, // set later
                    supplierId = supplierId,
                    carGroupCode = group.carGroupCode,
                    carGroupName = group.carGroupName,
                    manufacturer = colC,
                    model = colD,
                    dailyPriceNis = group.dailyPriceNis,
                    weeklyPriceNis = group.weeklyPriceNis,
                    monthlyPriceNis = group.monthlyPriceNis,
                    dailyPriceUsd = group.dailyPriceUsd,
                    weeklyPriceUsd = group.weeklyPriceUsd,
                    monthlyPriceUsd = group.monthlyPriceUsd,
                    shabbatInsuranceNis = group.shabbatInsuranceNis,
                    shabbatInsuranceUsd = group.shabbatInsuranceUsd,
                    includedKmPerDay = group.includedKmPerDay,
                    includedKmPerWeek = group.includedKmPerWeek,
                    includedKmPerMonth = group.includedKmPerMonth,
                    extraKmPriceNis = group.extraKmPriceNis,
                    extraKmPriceUsd = group.extraKmPriceUsd,
                    deductibleNis = group.deductibleNis
                )

                items.add(item)
            }
        }

        return items
    }

    private fun parseGroupCodeAndName(raw: String): Pair<String?, String?> {
        val parts = raw.split(" - ", limit = 2)
        return if (parts.size == 2) {
            parts[0].trim() to parts[1].trim()
        } else {
            raw.trim() to null
        }
    }

    private fun convertToUsd(nisValue: Double?, exchangeRate: Double): Double? {
        if (nisValue == null) return null
        if (exchangeRate <= 0.0) return null
        // Excel uses formulas like "=38*AA1" so AA1 is probably the USD rate factor.
        // Here we just invert: NIS / rate, or you can adjust to match your business rule.
        return nisValue / exchangeRate
    }

    // Reuse helpers from ImportDispatcher if they are top-level; otherwise re-implement:

    private fun getCellStringValue(row: Row, columnIndex: Int): String? {
        return try {
            val cell = row.getCell(columnIndex) ?: return null
            when (cell.cellType) {
                org.apache.poi.ss.usermodel.CellType.STRING -> cell.stringCellValue
                org.apache.poi.ss.usermodel.CellType.NUMERIC -> cell.numericCellValue.toString()
                org.apache.poi.ss.usermodel.CellType.BOOLEAN -> cell.booleanCellValue.toString()
                org.apache.poi.ss.usermodel.CellType.FORMULA -> cell.stringCellValue
                else -> null
            }
        } catch (e: Exception) {
            null
        }
    }

    private fun getCellNumericValue(row: Row, columnIndex: Int): Double? {
        return try {
            val cell = row.getCell(columnIndex) ?: return null
            when (cell.cellType) {
                org.apache.poi.ss.usermodel.CellType.NUMERIC -> cell.numericCellValue
                org.apache.poi.ss.usermodel.CellType.STRING -> cell.stringCellValue.toDoubleOrNull()
                org.apache.poi.ss.usermodel.CellType.FORMULA -> {
                    // Try to read cached numeric result if present
                    cell.numericCellValue
                }
                else -> null
            }
        } catch (e: Exception) {
            null
        }
    }
}

