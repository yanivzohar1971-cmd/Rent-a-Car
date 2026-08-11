package com.rentacar.app.commission.parser

import android.content.Context
import android.net.Uri
import android.util.Log
import com.rentacar.app.commission.CommissionReportParserCodes
import com.rentacar.app.commission.domain.CommissionReportParseContext
import com.rentacar.app.commission.domain.CommissionReportParseResult
import com.rentacar.app.data.SupplierCommissionImportConfigDao
import com.rentacar.app.data.SupplierCommissionReportImportDao
import com.rentacar.app.data.auth.CurrentUserProvider
import org.apache.poi.xssf.usermodel.XSSFWorkbook
import java.security.MessageDigest

/**
 * Dedicated commission-report import dispatcher.
 * Never writes reservations, never calls ReservationSyncService,
 * never routes through the invoice ImportDispatcher.
 */
class CommissionReportImportDispatcher(
    private val context: Context,
    private val configDao: SupplierCommissionImportConfigDao,
    private val importDao: SupplierCommissionReportImportDao,
    private val parsers: List<SupplierCommissionReportParser> = listOf(
        ShagrirCommissionReportParser()
    )
) {

    data class PreviewResult(
        val success: Boolean,
        val fileHash: String,
        val sourceFileName: String,
        val isDuplicateFile: Boolean,
        val parseResult: CommissionReportParseResult?,
        val errors: List<String> = emptyList(),
        val warnings: List<String> = emptyList()
    )

    suspend fun previewImport(
        supplierId: Long,
        reportYear: Int,
        reportMonth: Int,
        fileUri: Uri,
        sourceFileName: String
    ): PreviewResult {
        val userUid = CurrentUserProvider.requireCurrentUid()
        val config = configDao.getActiveForSupplier(supplierId, userUid)
            ?: return PreviewResult(
                success = false,
                fileHash = "",
                sourceFileName = sourceFileName,
                isDuplicateFile = false,
                parseResult = null,
                errors = listOf(
                    "לא הוגדרה תבנית דוח עמלות לספק. יש לבחור תבנית דוח עמלות לפני הייבוא."
                )
            )

        val parser = parsers.firstOrNull {
            it.parserCode == config.parserCode && it.parserVersion == config.parserVersion
        } ?: return PreviewResult(
            success = false,
            fileHash = "",
            sourceFileName = sourceFileName,
            isDuplicateFile = false,
            parseResult = null,
            errors = listOf("פרסר דוח עמלות לא נמצא: code=${config.parserCode} v=${config.parserVersion}")
        )

        val fileHash = try {
            context.contentResolver.openInputStream(fileUri)?.use { computeFileHash(it) }
                ?: return PreviewResult(
                    success = false,
                    fileHash = "",
                    sourceFileName = sourceFileName,
                    isDuplicateFile = false,
                    parseResult = null,
                    errors = listOf("לא ניתן לקרוא את הקובץ")
                )
        } catch (e: Exception) {
            Log.e(TAG, "hash failed", e)
            return PreviewResult(
                success = false,
                fileHash = "",
                sourceFileName = sourceFileName,
                isDuplicateFile = false,
                parseResult = null,
                errors = listOf("שגיאה בקריאת הקובץ")
            )
        }

        val isDuplicate = importDao.existsByFileHash(supplierId, fileHash, userUid)
        val warnings = mutableListOf<String>()
        if (isDuplicate) {
            warnings += "קובץ זהה (אותו hash) כבר יובא בעבר לספק זה"
        }

        return try {
            context.contentResolver.openInputStream(fileUri)?.use { input ->
                XSSFWorkbook(input).use { workbook ->
                    if (!parser.canParse(workbook)) {
                        return PreviewResult(
                            success = false,
                            fileHash = fileHash,
                            sourceFileName = sourceFileName,
                            isDuplicateFile = isDuplicate,
                            parseResult = null,
                            errors = listOf("מבנה הקובץ אינו תואם לתבנית ${parser.displayName}"),
                            warnings = warnings
                        )
                    }
                    val parseContext = CommissionReportParseContext(
                        supplierId = supplierId,
                        reportYear = reportYear,
                        reportMonth = reportMonth,
                        sourceFileName = sourceFileName,
                        fileHash = fileHash,
                        userUid = userUid
                    )
                    val parsed = parser.parse(workbook, parseContext)
                    PreviewResult(
                        success = parsed.success,
                        fileHash = fileHash,
                        sourceFileName = sourceFileName,
                        isDuplicateFile = isDuplicate,
                        parseResult = parsed,
                        errors = parsed.errors,
                        warnings = warnings + parsed.warnings
                    )
                }
            } ?: PreviewResult(
                success = false,
                fileHash = fileHash,
                sourceFileName = sourceFileName,
                isDuplicateFile = isDuplicate,
                parseResult = null,
                errors = listOf("לא ניתן לפתוח את הקובץ"),
                warnings = warnings
            )
        } catch (e: Exception) {
            Log.e(TAG, "parse failed", e)
            PreviewResult(
                success = false,
                fileHash = fileHash,
                sourceFileName = sourceFileName,
                isDuplicateFile = isDuplicate,
                parseResult = null,
                errors = listOf("שגיאה בפענוח הקובץ"),
                warnings = warnings
            )
        }
    }

    fun resolveParser(parserCode: Int, parserVersion: Int): SupplierCommissionReportParser? =
        parsers.firstOrNull { it.parserCode == parserCode && it.parserVersion == parserVersion }

    companion object {
        private const val TAG = "CommissionReportImport"

        fun computeFileHash(input: java.io.InputStream): String {
            val digest = MessageDigest.getInstance("SHA-256")
            val buffer = ByteArray(8192)
            var read: Int
            while (input.read(buffer).also { read = it } != -1) {
                digest.update(buffer, 0, read)
            }
            return digest.digest().joinToString("") { "%02x".format(it) }
        }

        fun availableParserLabels(): List<String> =
            CommissionReportParserCodes.availableParsers.map { it.label }
    }
}
