package com.rentacar.app.emailimport.clipboard

import android.content.Context
import com.rentacar.app.commission.parser.CommissionReportImportDispatcher
import com.rentacar.app.data.Supplier
import com.rentacar.app.emailimport.debug.EmailImportDebugHub
import com.rentacar.app.emailimport.debug.EmailImportDebugSession
import com.rentacar.app.emailimport.debug.EmailImportDebugStage
import com.rentacar.app.emailimport.debug.EmailImportDebugStatus
import com.rentacar.app.emailimport.debug.EmailImportDebugStore
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * Clipboard import orchestrator. Parses via supplier-specific parsers, then
 * feeds the existing dispatcher / normalizer / reconciliation pipeline.
 * Never logs raw clipboard text or customer rows.
 */
class ClipboardCommissionImportService(
    private val dispatcher: CommissionReportImportDispatcher,
    private val context: Context,
    private val registry: CommissionClipboardParserRegistry = CommissionClipboardParserRegistry()
) {

    data class ClipboardPreviewBundle(
        val parse: ClipboardParseResult,
        val dispatcherPreview: CommissionReportImportDispatcher.PreviewResult?,
        val parserName: String?
    )

    fun parseOnly(supplier: Supplier, text: String): ClipboardParseResult {
        val started = System.currentTimeMillis()
        val debug = EmailImportDebugHub.beginClipboard()
        debug.supplierId = supplier.id
        debug.supplierName = supplier.name
        debug.sourceType = "CLIPBOARD"
        debug.clipboardAttempted = true
        debug.clipboardTextLength = text.length
        debug.event(
            EmailImportDebugStage.CLIPBOARD_READ,
            EmailImportDebugStatus.INFO,
            "Clipboard text received",
            mapOf("textLength" to text.length)
        )
        val parser = registry.parserFor(supplier)
        if (parser == null) {
            debug.failureCode = "NO_CLIPBOARD_PARSER"
            debug.parseComplete = false
            debug.reconciliationReady = false
            debug.event(
                EmailImportDebugStage.CLIPBOARD_PARSE_FAILURE,
                EmailImportDebugStatus.FAILURE,
                "No clipboard parser for supplier",
                mapOf("supplierId" to supplier.id, "elapsedMs" to (System.currentTimeMillis() - started))
            )
            EmailImportDebugStore.persist(context, debug)
            return ClipboardParseResult(
                parserName = "",
                supplierKey = "",
                detected = false,
                headers = emptyList(),
                parsedRows = emptyList(),
                rejectedRows = emptyList(),
                warnings = emptyList(),
                errors = listOf("אין פרסר לוח לספק זה"),
                isComplete = false,
                sourceFingerprint = "",
                headerStartIndex = null,
                headerStartLine = null,
                logicalColumnCount = 0,
                parsedRowCount = 0,
                rejectedRowCount = 0,
                clippingDetected = false,
                footerDetected = false,
                textLength = text.length,
                parseResult = null
            )
        }
        debug.clipboardParser = parser.parserName
        debug.parserName = parser.parserName
        debug.event(
            EmailImportDebugStage.CLIPBOARD_PARSER_SELECTED,
            EmailImportDebugStatus.SUCCESS,
            "Clipboard parser selected",
            mapOf("parserName" to parser.parserName, "supplierId" to supplier.id)
        )
        debug.event(
            EmailImportDebugStage.CLIPBOARD_HEADER_SCAN,
            EmailImportDebugStatus.INFO,
            "Scanning clipboard tokens for supplier header fingerprint",
            mapOf("parserName" to parser.parserName, "textLength" to text.length)
        )
        val parsed = if (parser is ShagrirClipboardParser) {
            parser.parse(text, debug)
        } else {
            parser.parse(text)
        }
        applyParseSnapshot(debug, parsed, started)
        EmailImportDebugStore.persist(context, debug)
        return parsed
    }

    suspend fun previewReconciliation(
        supplier: Supplier,
        parse: ClipboardParseResult
    ): CommissionReportImportDispatcher.PreviewResult = withContext(Dispatchers.IO) {
        val started = System.currentTimeMillis()
        val debug = EmailImportDebugHub.latest
        debug?.event(
            EmailImportDebugStage.RECONCILIATION_STARTED,
            EmailImportDebugStatus.INFO,
            "Clipboard reconciliation start",
            mapOf(
                "parserName" to parse.parserName,
                "parsedRows" to parse.parsedRowCount,
                "fingerprintPresent" to parse.sourceFingerprint.isNotBlank()
            )
        )
        debug?.event(
            EmailImportDebugStage.CLIPBOARD_RECONCILIATION_START,
            EmailImportDebugStatus.INFO,
            "Clipboard reconciliation start",
            mapOf(
                "parserName" to parse.parserName,
                "parsedRows" to parse.parsedRowCount,
                "fingerprintPresent" to parse.sourceFingerprint.isNotBlank()
            )
        )
        val commissionParse = parse.parseResult
            ?: return@withContext CommissionReportImportDispatcher.PreviewResult(
                success = false,
                fileHash = parse.sourceFingerprint,
                sourceFileName = "clipboard:${supplier.name}",
                isDuplicateFile = false,
                parseResult = null,
                errors = parse.errors.ifEmpty { listOf("פענוח הלוח נכשל") }
            )
        val preview = dispatcher.previewImportFromParseResult(
            supplierId = supplier.id,
            sourceFileName = "clipboard:${supplier.name}",
            fileHash = parse.sourceFingerprint,
            parseResult = commissionParse
        )
        debug?.reconciliationReady = preview.success
        debug?.event(
            if (preview.success) EmailImportDebugStage.RECONCILIATION_PREVIEW_READY
            else EmailImportDebugStage.RECONCILIATION_FAILURE,
            if (preview.success) EmailImportDebugStatus.SUCCESS else EmailImportDebugStatus.FAILURE,
            if (preview.success) "Clipboard reconciliation ready" else "Clipboard reconciliation blocked",
            mapOf(
                "parserName" to parse.parserName,
                "parsedRows" to parse.parsedRowCount,
                "duplicate" to preview.isDuplicateFile,
                "elapsedMs" to (System.currentTimeMillis() - started)
            )
        )
        debug?.event(
            if (preview.success) EmailImportDebugStage.CLIPBOARD_RECONCILIATION_SUCCESS
            else EmailImportDebugStage.CLIPBOARD_PARSE_FAILURE,
            if (preview.success) EmailImportDebugStatus.SUCCESS else EmailImportDebugStatus.FAILURE,
            if (preview.success) "Clipboard reconciliation ready" else "Clipboard reconciliation blocked",
            mapOf(
                "parserName" to parse.parserName,
                "parsedRows" to parse.parsedRowCount,
                "duplicate" to preview.isDuplicateFile,
                "elapsedMs" to (System.currentTimeMillis() - started)
            )
        )
        if (debug != null) EmailImportDebugStore.persist(context, debug)
        preview
    }

    private fun applyParseSnapshot(
        debug: EmailImportDebugSession,
        parsed: ClipboardParseResult,
        started: Long
    ) {
        val elapsed = System.currentTimeMillis() - started
        debug.elapsedMs = elapsed
        debug.clipboardHeaderDetected = parsed.detected
        debug.clipboardColumnCount = parsed.logicalColumnCount
        debug.clipboardParsedRows = parsed.parsedRowCount
        debug.clipboardRejectedRows = parsed.rejectedRowCount
        debug.clipboardClippingDetected = parsed.clippingDetected
        debug.clipboardComplete = parsed.isComplete
        debug.parsedRows = parsed.parsedRowCount
        debug.rejectedRows = parsed.rejectedRowCount
        debug.footerDetected = parsed.footerDetected
        debug.footerRowIndex = parsed.footerRowIndex
        debug.parseComplete = parsed.isComplete
        debug.clippingDetected = parsed.clippingDetected
        debug.reconciliationReady = parsed.reconciliationReady
        debug.matchedHeaderCount = if (parsed.detected) parsed.logicalColumnCount else 0
        debug.expectedHeaderCount = 8
        debug.dataStartRow = 2
        if (parsed.clippingDetected) {
            debug.failureCode = "MESSAGE_CLIPPED"
            debug.event(
                EmailImportDebugStage.CLIPBOARD_CLIPPED_DETECTED,
                EmailImportDebugStatus.FAILURE,
                "Clipboard message clipped",
                mapOf(
                    "parserName" to parsed.parserName,
                    "textLength" to parsed.textLength,
                    "clippingDetected" to true,
                    "elapsedMs" to elapsed
                )
            )
        }
        if (parsed.detected) {
            debug.event(
                EmailImportDebugStage.CLIPBOARD_HEADER_FOUND,
                EmailImportDebugStatus.SUCCESS,
                "Clipboard header fingerprint found",
                mapOf(
                    "parserName" to parsed.parserName,
                    "headerStartIndex" to parsed.headerStartIndex,
                    "headerStartLine" to parsed.headerStartLine,
                    "columnCount" to parsed.logicalColumnCount
                )
            )
        }
        debug.event(
            EmailImportDebugStage.CLIPBOARD_ROW_PARSE,
            EmailImportDebugStatus.INFO,
            "Clipboard rows parsed",
            mapOf(
                "parserName" to parsed.parserName,
                "parsedRows" to parsed.parsedRowCount,
                "rejectedRows" to parsed.rejectedRowCount,
                "footerDetected" to parsed.footerDetected,
                "footerRowIndex" to parsed.footerRowIndex
            )
        )
        if (!parsed.success) {
            debug.failureCode = debug.failureCode
                ?: if (parsed.clippingDetected) "MESSAGE_CLIPPED" else "CLIPBOARD_PARSE_FAILED"
        }
    }
}
