package com.rentacar.app.emailimport.debug

/**
 * Stable Compose testTag / UIAutomator resource-id identifiers for email import.
 * Keep values ASCII; enable via semantics { testTagsAsResourceId = true }.
 */
object EmailImportUiTags {
    const val COMMISSION_IMPORT_SCREEN = "commission_import_screen"
    const val SUPPLIER_SUMMARY_CARD = "supplier_summary_card"
    const val REPORT_MONTH_SELECTOR = "report_month_selector"
    const val PREVIOUS_MONTH_BUTTON = "previous_month_button"
    const val NEXT_MONTH_BUTTON = "next_month_button"
    const val EMAIL_IMPORT_BUTTON = "email_import_button"
    const val MANUAL_EXCEL_IMPORT_BUTTON = "manual_excel_import_button"
    const val CLIPBOARD_IMPORT_BUTTON = "clipboard_import_button"
    const val CLIPBOARD_IMPORT_DIALOG = "clipboard_import_dialog"
    const val CLIPBOARD_TEXT_PREVIEW = "clipboard_text_preview"
    const val CLIPBOARD_REPARSE_BUTTON = "clipboard_reparse_button"
    const val CLIPBOARD_PARSE_STATUS = "clipboard_parse_status"
    const val CLIPBOARD_PREVIEW_BUTTON = "clipboard_preview_button"
    const val CLIPBOARD_ERROR = "clipboard_error"
    const val CLIPBOARD_BLOCKED_REASON = "clipboard_blocked_reason"
    const val RECONCILIATION_BLOCKED_REASON = "reconciliation_blocked_reason"
    const val MAILBOX_SETTINGS_BUTTON = "mailbox_settings_button"
    const val REPORT_HISTORY_BUTTON = "report_history_button"
    const val EMAIL_DIAGNOSTICS_BUTTON = "email_diagnostics_button"
    const val DEBUG_JSON_COPY_BUTTON = "debug_json_copy_button"
    const val DEBUG_JSON_SHARE_BUTTON = "debug_json_share_button"
    const val JSON_EXPORT_BUTTON = "reconciliation_json_export_button"
    const val MANUAL_MATCH_BUTTON = "manual_match_button"
    const val MANUAL_MATCH_DIALOG = "manual_match_dialog"
    const val MANUAL_MATCH_CONFIRM = "manual_match_confirm"
    const val MANUAL_MATCH_CLEAR = "manual_match_clear"
    const val RECONCILIATION_SUMMARY_CARD = "reconciliation_summary_card"
    const val FINAL_IMPORT_BLOCKED_REASON = "final_import_blocked_reason"
    const val EMAIL_IMPORT_ERROR_CARD = "email_import_error_card"
    const val EMAIL_IMPORT_RESULT_CARD = "email_import_result_card"
    const val EMAIL_REPORT_CANDIDATE_LIST = "email_report_candidate_list"
    const val SUPPLIERS_TAB = "suppliers_tab"
    const val SUPPLIER_IMPORT_BUTTON = "supplier_import_button"
    const val IMPORT_TYPE_COMMISSION = "import_type_commission"

    fun emailReportCandidate(index: Int): String = "email_report_candidate_$index"
    fun emailReportCandidateUid(uid: Long?): String =
        if (uid != null && uid > 0) "email_report_candidate_uid_$uid" else "email_report_candidate_uid_unknown"
    fun emailReportCandidatePreview(index: Int): String = "email_report_candidate_preview_$index"
    fun emailReportCandidateStatus(index: Int): String = "email_report_candidate_status_$index"
    fun emailReportCandidateProgress(index: Int): String = "email_report_candidate_progress_$index"
    fun emailReportCandidateError(index: Int): String = "email_report_candidate_error_$index"
}
