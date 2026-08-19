package com.rentacar.app.emailimport

import com.rentacar.app.mailbox.MailboxInlineImageInfo

/**
 * Classification of an HTML commission email AFTER table detection is exhausted.
 * Images/logos never outrank a valid or even a plausible commission table.
 */
data class HtmlReportClassification(
    val classification: EmailReportCandidateClassification,
    val hebrewNote: String,
    val imageOnlyHighConfidence: Boolean
)

object HtmlReportClassifier {

    const val PLAUSIBLE_HEADER_MATCH_MIN = 3
    const val REPORT_LIKE_IMAGE_MIN_BYTES = 20_000L

    fun classify(
        extraction: HtmlTableExtractionResult,
        presence: HtmlCommissionPresenceResult,
        inlineImages: List<MailboxInlineImageInfo>
    ): HtmlReportClassification {
        val selected = extraction.selectedTable
        if (selected != null && selected.missingRequiredHeaders.isEmpty()) {
            return HtmlReportClassification(
                classification = EmailReportCandidateClassification.VALID_REPORT,
                hebrewNote = "טבלת עמלות תקינה (${selected.rows.size} שורות)",
                imageOnlyHighConfidence = false
            )
        }

        val best = extraction.tables.maxByOrNull { it.matchedRequiredHeaders.size }
        val plausibleTable = best != null && (
            best.matchedRequiredHeaders.size >= PLAUSIBLE_HEADER_MATCH_MIN ||
                (best.columnCount >= 6 && best.matchedRequiredHeaders.isNotEmpty())
            )

        if (plausibleTable) {
            val missing = best!!.missingRequiredHeaders
            return HtmlReportClassification(
                classification = EmailReportCandidateClassification.TABLE_FOUND_MISSING_COLUMNS,
                hebrewNote = if (missing.isNotEmpty()) {
                    "נמצאה טבלה אך חסרות העמודות: ${missing.joinToString(", ")}"
                } else {
                    "נמצאה טבלה אך לא זוהו כל העמודות הנדרשות"
                },
                imageOnlyHighConfidence = false
            )
        }

        if (extraction.tables.isNotEmpty() &&
            (presence.anyRequiredHeaderTextPresent || (best?.matchedRequiredHeaders?.isNotEmpty() == true))
        ) {
            return HtmlReportClassification(
                classification = EmailReportCandidateClassification.TABLE_PARSE_FAILED,
                hebrewNote = extraction.errors.firstOrNull()
                    ?: "נמצאה טבלה אך פענוח דוח העמלות נכשל",
                imageOnlyHighConfidence = false
            )
        }

        if (isHighConfidenceImageOnly(extraction, presence, inlineImages)) {
            return HtmlReportClassification(
                classification = EmailReportCandidateClassification.IMAGE_ONLY_REPORT,
                hebrewNote = "דוח העמלות במייל נמצא כתמונה ולא כטבלה הניתנת לקריאה",
                imageOnlyHighConfidence = true
            )
        }

        val emptyTables = extraction.tables.isEmpty()
        return HtmlReportClassification(
            classification = EmailReportCandidateClassification.SUPPLIER_EMAIL_NO_REPORT,
            hebrewNote = if (emptyTables) {
                "נמצאה הודעה משגריר אך לא נמצאה בה טבלת עמלות"
            } else {
                extraction.errors.firstOrNull()
                    ?: "נמצאה הודעה משגריר אך לא נמצאה בה טבלת עמלות"
            },
            imageOnlyHighConfidence = false
        )
    }

    /**
     * IMAGE_ONLY requires: no machine-readable table, no plausible header set,
     * AND report-like image evidence (not merely a logo/signature PNG).
     */
    fun isHighConfidenceImageOnly(
        extraction: HtmlTableExtractionResult,
        presence: HtmlCommissionPresenceResult,
        inlineImages: List<MailboxInlineImageInfo>
    ): Boolean {
        if (presence.anyRequiredHeaderTextPresent) return false
        if (extraction.tables.any { it.matchedRequiredHeaders.size >= 2 }) return false
        if (extraction.selectedTable != null) return false
        return hasReportLikeImage(inlineImages, presence)
    }

    fun hasReportLikeImage(
        inlineImages: List<MailboxInlineImageInfo>,
        presence: HtmlCommissionPresenceResult
    ): Boolean {
        val largeInline = inlineImages.any { it.sizeBytes >= REPORT_LIKE_IMAGE_MIN_BYTES }
        if (largeInline) return true
        val onlyTinyLogos = inlineImages.isNotEmpty() &&
            inlineImages.all { it.sizeBytes in 1 until REPORT_LIKE_IMAGE_MIN_BYTES }
        if (onlyTinyLogos) return false
        // Screenshot-like: CID image(s), no real table structure, no headers.
        val cidScreenshot = presence.cidReferenceCount >= 1 &&
            presence.imageTagCount >= 1 &&
            presence.tableCount == 0 &&
            presence.maxTableColumns < 3 &&
            inlineImages.any { it.sizeBytes >= 8_000L }
        return cidScreenshot
    }
}
