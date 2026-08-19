package com.rentacar.app.emailimport.clipboard

import com.rentacar.app.commission.domain.CommissionReportParseResult
import com.rentacar.app.commission.domain.RawCommissionReportRow
import com.rentacar.app.data.Supplier

/**
 * Supplier-specific Clipboard parser. Implementations must not contain
 * reconciliation logic — they only produce [RawCommissionReportRow] / parse results
 * consumed by the existing normalizer + dispatcher.
 */
interface CommissionClipboardParser {
    val parserName: String
    fun supportsSupplier(supplier: Supplier): Boolean
    fun parse(text: String): ClipboardParseResult
}

data class ClipboardRejectedRow(
    val tokenStartIndex: Int,
    val sourceLine: Int?,
    val expectedField: String?,
    val reason: String
)

data class ClipboardParseResult(
    val parserName: String,
    val supplierKey: String,
    val detected: Boolean,
    val headers: List<String>,
    val parsedRows: List<RawCommissionReportRow>,
    val rejectedRows: List<ClipboardRejectedRow>,
    val warnings: List<String>,
    val errors: List<String>,
    val isComplete: Boolean,
    val sourceFingerprint: String,
    val headerStartIndex: Int?,
    val headerStartLine: Int?,
    val logicalColumnCount: Int,
    val parsedRowCount: Int,
    val rejectedRowCount: Int,
    val clippingDetected: Boolean,
    val footerDetected: Boolean,
    val textLength: Int,
    val parseResult: CommissionReportParseResult?,
    val footerRowIndex: Int? = null
) {
    val success: Boolean
        get() = isComplete && errors.isEmpty() && parseResult?.success == true && parsedRows.isNotEmpty()

    val reconciliationReady: Boolean
        get() = success
}

class CommissionClipboardParserRegistry(
    private val parsers: List<CommissionClipboardParser> = listOf(
        ShagrirClipboardParser()
    )
) {
    fun parserFor(supplier: Supplier): CommissionClipboardParser? =
        parsers.firstOrNull { it.supportsSupplier(supplier) }

    fun parserNames(): List<String> = parsers.map { it.parserName }
}

object ClipboardTextInterpreter {
    data class Read(
        val hasClip: Boolean,
        val isText: Boolean,
        val text: String?
    )

    fun interpret(hasClip: Boolean, mimeTypes: List<String>, coercedText: String?): Read {
        if (!hasClip) return Read(hasClip = false, isText = false, text = null)
        val text = coercedText?.takeIf { it.isNotBlank() }
        val looksText = text != null || mimeTypes.any {
            it.contains("text/", ignoreCase = true) ||
                it.contains("plain", ignoreCase = true)
        }
        return Read(hasClip = true, isText = looksText && text != null, text = text)
    }

    const val EMPTY_CLIPBOARD_HEBREW =
        "לא נמצא טקסט בלוח.\nהעתק את תוכן המייל ונסה שוב."

    const val CLIPPED_MESSAGE_HEBREW =
        "ההודעה הועתקה באופן חלקי.\nלחץ ב-Gmail על \"View entire message\",\nהעתק את כל ההודעה ונסה שוב."
}
