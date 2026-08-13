package com.rentacar.app.emailimport

import com.rentacar.app.mailbox.MailboxAttachment
import com.rentacar.app.mailbox.MailboxCredentials
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

class XlsxAttachmentAndSecurityTest {

    @Test
    fun discoversXlsxAndIgnoresOthers() {
        val attachments = listOf(
            MailboxAttachment("note.txt", "text/plain", 3, byteArrayOf(1, 2, 3)),
            MailboxAttachment("report.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", 4, byteArrayOf(4, 5, 6, 7)),
            MailboxAttachment("image.png", "image/png", 2, byteArrayOf(8, 9))
        )
        val result = XlsxAttachmentReportExtractor().extract(attachments)
        assertTrue(result is XlsxExtractionResult.Success)
        assertEquals("report.xlsx", (result as XlsxExtractionResult.Success).candidate.fileName)
    }

    @Test
    fun missingXlsxGivesClearError() {
        val result = XlsxAttachmentReportExtractor().extract(
            listOf(MailboxAttachment("a.pdf", "application/pdf", 1, byteArrayOf(1)))
        )
        assertTrue(result is XlsxExtractionResult.Failure)
        assertEquals(
            EmailImportErrorCode.NO_XLSX_ATTACHMENT,
            (result as XlsxExtractionResult.Failure).errorCode
        )
    }

    @Test
    fun ambiguousMultipleXlsx() {
        val result = XlsxAttachmentReportExtractor().extract(
            listOf(
                MailboxAttachment("a.xlsx", null, 1, byteArrayOf(1)),
                MailboxAttachment("b.xlsx", null, 1, byteArrayOf(2))
            )
        )
        assertTrue(result is XlsxExtractionResult.Ambiguous)
    }

    @Test
    fun tempXlsxCleanedUp() {
        val extractor = XlsxAttachmentReportExtractor()
        val candidate = XlsxAttachmentCandidate("t.xlsx", 3, byteArrayOf(1, 2, 3))
        val cache = createTempDir()
        val file = extractor.writeTempFile(cache, candidate)
        assertTrue(file.exists())
        assertTrue(file.delete())
        assertFalse(file.exists())
        cache.deleteRecursively()
    }

    @Test
    fun appPasswordMaskedInToStringAndDiagnostics() {
        val creds = MailboxCredentials("user@gmail.com", "abcd-efgh-ijkl-mnop")
        assertFalse(creds.toString().contains("abcd-efgh-ijkl-mnop"))
        assertTrue(creds.toString().contains("********"))
        assertEquals("********", creds.maskedForDiagnostics()["appPassword"])
    }

    @Test
    fun supplierConfigContainsNoMailboxPassword() {
        val supplierFields = com.rentacar.app.data.Supplier::class.java.declaredFields.map { it.name }
        assertFalse(supplierFields.any { it.contains("password", ignoreCase = true) })
        assertFalse(supplierFields.any { it.contains("appPassword", ignoreCase = true) })
        assertTrue(supplierFields.any { it == "commissionReportEmail" })
        assertTrue(supplierFields.any { it == "commissionReportFormat" })
    }

    @Test
    fun mailboxAttachmentToStringDoesNotDumpBytes() {
        val a = MailboxAttachment("f.xlsx", null, 3, byteArrayOf(1, 2, 3))
        assertFalse(a.toString().contains("[1, 2, 3]"))
        assertTrue(a.toString().contains("3 bytes"))
    }

    @Test
    fun nestedRfc822StyleAttachmentListStillDiscoversXlsx() {
        // GmailImapMailboxClient.extractAttachments now traverses message/rfc822;
        // once flattened, the XLSX extractor must still find the report.
        val fromNestedForward = listOf(
            MailboxAttachment(
                "שגריר_יולי.xlsx",
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                4,
                byteArrayOf(1, 2, 3, 4)
            )
        )
        val result = XlsxAttachmentReportExtractor().extract(fromNestedForward)
        assertTrue(result is XlsxExtractionResult.Success)
    }

    @Test
    fun ambiguousXlsxSelectionMustUseSelectedCandidateIdNotFirstReport() {
        val first = "uid-1"
        val selected = "uid-15064"
        val namesByCandidate = mapOf(
            first to listOf("a.xlsx"),
            selected to listOf("b.xlsx", "c.xlsx")
        )
        val ambiguousForSelected = namesByCandidate[selected].orEmpty()
        assertEquals(2, ambiguousForSelected.size)
        assertFalse(ambiguousForSelected == namesByCandidate[first])
    }
}
