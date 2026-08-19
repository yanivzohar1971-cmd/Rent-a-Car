package com.rentacar.app.emailimport.clipboard

/**
 * Enablement + visible Hebrew reason for "בדוק והתאם הזמנות" on Clipboard import.
 * Does not contain matching / commission business rules.
 */
object CommissionReconciliationGate {

    fun canPreview(parse: ClipboardParseResult?, busy: Boolean): Boolean =
        parse?.success == true && parse.parseResult?.success == true && !busy

    fun blockedReason(
        parse: ClipboardParseResult?,
        emptyClipboard: Boolean,
        nonTextClipboard: Boolean,
        busy: Boolean
    ): String? {
        if (busy) return null
        if (emptyClipboard || nonTextClipboard) {
            return ClipboardTextInterpreter.EMPTY_CLIPBOARD_HEBREW
        }
        if (parse == null) return null
        if (parse.clippingDetected) {
            return ClipboardTextInterpreter.CLIPPED_MESSAGE_HEBREW
        }
        if (parse.success && parse.parseResult?.success == true) return null
        val first = parse.errors.firstOrNull()?.trim().orEmpty()
        return when {
            first.contains("חלקי") || first.contains("View entire message") ->
                ClipboardTextInterpreter.CLIPPED_MESSAGE_HEBREW
            first.isNotBlank() ->
                if (first.startsWith("נמצאה שגיאה") || first.startsWith("הדוח אינו")) first
                else "נמצאה שגיאה בדוח: $first"
            else -> "הדוח אינו שלם ולכן לא ניתן לבצע התאמה"
        }
    }
}
