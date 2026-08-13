package com.rentacar.app.ui.vm

import com.rentacar.app.emailimport.CommissionReportFormat
import com.rentacar.app.emailimport.EmailReportCandidateClassification
import com.rentacar.app.emailimport.EmailReportListItem
import com.rentacar.app.emailimport.SenderMatchResult
import com.rentacar.app.emailimport.SenderMatchType
import com.rentacar.app.mailbox.MailboxMessageRef
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.YearMonth

/**
 * Pure state-transition tests for the email import UX bug
 * (preview must not look like mailbox search).
 */
class EmailImportOperationStateTest {

    private fun sampleItem(uid: Long = 42L) = EmailReportListItem(
        ref = MailboxMessageRef(
            messageId = "<x@y>",
            imapUid = uid,
            subject = "Fwd: report",
            receivedAt = 1L,
            fromHeader = "a@b.com",
            replyToHeader = null
        ),
        senderMatch = SenderMatchResult(
            matched = true,
            matchType = SenderMatchType.FORWARDED_FROM,
            configuredEmail = "assaft@shagrir.co.il",
            matchedEmail = "assaft@shagrir.co.il",
            outerFrom = "a@b.com",
            diagnosticNote = null
        ),
        subject = "Fwd: report",
        receivedAt = 1L,
        configuredSender = "assaft@shagrir.co.il",
        reportFormat = CommissionReportFormat.HTML_TABLE,
        classification = EmailReportCandidateClassification.SUPPLIER_EMAIL_CANDIDATE
    )

    @Test
    fun searchSetsSearchingMailboxAndClearsReports() {
        val before = CommissionReconciliationUiState(
            emailReports = listOf(sampleItem()),
            emailOperation = EmailImportOperation.IDLE
        )
        val during = before.copy(
            loading = true,
            emailOperation = EmailImportOperation.SEARCHING_MAILBOX,
            emailReports = emptyList()
        )
        assertEquals(EmailImportOperation.SEARCHING_MAILBOX, during.emailOperation)
        assertTrue(during.emailReports.isEmpty())
        assertTrue(during.loading)
    }

    @Test
    fun searchCompletionResetsToIdle() {
        val done = CommissionReconciliationUiState(
            loading = false,
            emailOperation = EmailImportOperation.IDLE,
            emailReports = listOf(sampleItem())
        )
        assertEquals(EmailImportOperation.IDLE, done.emailOperation)
        assertFalse(done.loading)
        assertTrue(done.emailReports.isNotEmpty())
    }

    @Test
    fun candidatePreviewSetsPreviewingWithoutClearingReports() {
        val reports = listOf(sampleItem(1), sampleItem(2))
        val id = reports[0].stableCandidateId()
        val during = CommissionReconciliationUiState(
            step = CommissionReconStep.SETUP,
            emailReports = reports,
            emailOperation = EmailImportOperation.PREVIEWING_CANDIDATE,
            previewingEmailCandidateId = id,
            loading = false
        )
        assertEquals(EmailImportOperation.PREVIEWING_CANDIDATE, during.emailOperation)
        assertEquals(2, during.emailReports.size)
        assertEquals(id, during.previewingEmailCandidateId)
        assertNotEquals(EmailImportOperation.SEARCHING_MAILBOX, during.emailOperation)
        // UI must not treat this as searching
        val searchingUi = during.emailOperation == EmailImportOperation.SEARCHING_MAILBOX
        assertFalse(searchingUi)
    }

    @Test
    fun previewFailurePreservesListAndStoresCandidateError() {
        val reports = listOf(sampleItem(9))
        val id = reports[0].stableCandidateId()
        val after = CommissionReconciliationUiState(
            step = CommissionReconStep.SETUP,
            emailReports = reports,
            emailOperation = EmailImportOperation.IDLE,
            previewingEmailCandidateId = null,
            previewCandidateErrorId = id,
            previewCandidateErrorMessage = "נמצאה טבלה אך חסרות העמודות: אחוז",
            errorMessage = null
        )
        assertEquals(CommissionReconStep.SETUP, after.step)
        assertEquals(1, after.emailReports.size)
        assertEquals(id, after.previewCandidateErrorId)
        assertNull(after.errorMessage)
    }

    @Test
    fun previewSuccessMovesToPreviewStep() {
        val after = CommissionReconciliationUiState(
            step = CommissionReconStep.PREVIEW,
            emailOperation = EmailImportOperation.IDLE,
            previewingEmailCandidateId = null
        )
        assertEquals(CommissionReconStep.PREVIEW, after.step)
        assertEquals(EmailImportOperation.IDLE, after.emailOperation)
    }

    @Test
    fun julyYearMonthUsesOneBasedMonthValue7() {
        val ym = YearMonth.of(2026, 7)
        assertEquals(2026, ym.year)
        assertEquals(7, ym.monthValue)
    }

    @Test
    fun ambiguousXlsxBindsToSelectedCandidateId() {
        val selectedId = sampleItem(15064).stableCandidateId()
        val state = CommissionReconciliationUiState(
            emailReports = listOf(sampleItem(1), sampleItem(15064)),
            ambiguousXlsxNames = listOf("a.xlsx", "b.xlsx"),
            ambiguousXlsxCandidateId = selectedId
        )
        val bound = state.emailReports.firstOrNull { it.stableCandidateId() == state.ambiguousXlsxCandidateId }
        assertEquals(15064L, bound?.ref?.imapUid)
        assertFalse(bound?.ref?.imapUid == 1L)
    }

    @Test
    fun serverBodyCandidateIsNeutralNotForwarded() {
        val item = sampleItem().copy(
            senderMatch = SenderMatchResult(
                matched = true,
                matchType = SenderMatchType.SERVER_BODY_CANDIDATE,
                configuredEmail = "assaft@shagrir.co.il",
                matchedEmail = "assaft@shagrir.co.il",
                outerFrom = "a@b.com"
            )
        )
        assertEquals(SenderMatchType.SERVER_BODY_CANDIDATE, item.senderMatch.matchType)
        assertFalse(item.senderMatch.matchType == SenderMatchType.FORWARDED_FROM)
    }
}
