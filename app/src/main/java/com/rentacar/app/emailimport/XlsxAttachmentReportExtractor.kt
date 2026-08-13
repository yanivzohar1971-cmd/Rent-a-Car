package com.rentacar.app.emailimport

import com.rentacar.app.mailbox.MailboxAttachment
import java.io.File
import java.util.Locale

data class XlsxAttachmentCandidate(
    val fileName: String,
    val sizeBytes: Long,
    val bytes: ByteArray
) {
    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (other !is XlsxAttachmentCandidate) return false
        return fileName == other.fileName && sizeBytes == other.sizeBytes && bytes.contentEquals(other.bytes)
    }

    override fun hashCode(): Int {
        var result = fileName.hashCode()
        result = 31 * result + sizeBytes.hashCode()
        result = 31 * result + bytes.contentHashCode()
        return result
    }
}

sealed class XlsxExtractionResult {
    data class Success(val candidate: XlsxAttachmentCandidate) : XlsxExtractionResult()
    data class Ambiguous(val candidates: List<XlsxAttachmentCandidate>) : XlsxExtractionResult()
    data class Failure(val errorCode: EmailImportErrorCode, val message: String) : XlsxExtractionResult()
}

/**
 * Locates XLSX attachments. Does not parse Excel — that stays in the existing POI pipeline.
 */
class XlsxAttachmentReportExtractor {

    fun extract(attachments: List<MailboxAttachment>): XlsxExtractionResult {
        val xlsx = attachments.filter { isXlsx(it.fileName) }
        return when {
            xlsx.isEmpty() -> XlsxExtractionResult.Failure(
                EmailImportErrorCode.NO_XLSX_ATTACHMENT,
                EmailImportErrorCode.NO_XLSX_ATTACHMENT.hebrewMessage()
            )
            xlsx.size == 1 -> {
                val a = xlsx.first()
                XlsxExtractionResult.Success(
                    XlsxAttachmentCandidate(a.fileName, a.sizeBytes, a.bytes)
                )
            }
            else -> XlsxExtractionResult.Ambiguous(
                xlsx.map { XlsxAttachmentCandidate(it.fileName, it.sizeBytes, it.bytes) }
            )
        }
    }

    fun writeTempFile(cacheDir: File, candidate: XlsxAttachmentCandidate): File {
        val dir = File(cacheDir, "email_import").apply { mkdirs() }
        val safeName = candidate.fileName.replace(Regex("[^A-Za-z0-9._\\-א-ת]"), "_")
        val file = File(dir, "${System.currentTimeMillis()}_$safeName")
        file.writeBytes(candidate.bytes)
        return file
    }

    companion object {
        fun isXlsx(fileName: String?): Boolean {
            if (fileName.isNullOrBlank()) return false
            val lower = fileName.lowercase(Locale.US)
            return lower.endsWith(".xlsx")
        }
    }
}
