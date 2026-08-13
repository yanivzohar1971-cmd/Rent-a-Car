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
    const val MAILBOX_SETTINGS_BUTTON = "mailbox_settings_button"
    const val REPORT_HISTORY_BUTTON = "report_history_button"
    const val EMAIL_DIAGNOSTICS_BUTTON = "email_diagnostics_button"
    const val DEBUG_JSON_COPY_BUTTON = "debug_json_copy_button"
    const val DEBUG_JSON_SHARE_BUTTON = "debug_json_share_button"
    const val PREVIEW_RECONCILIATION_BUTTON = "preview_reconciliation_button"
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
