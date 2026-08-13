package com.rentacar.app.emailimport

import android.content.Context
import android.util.Log
import com.rentacar.app.commission.domain.CommissionReportParseContext
import com.rentacar.app.commission.parser.CommissionReportImportDispatcher
import com.rentacar.app.data.EmailCommissionReportFingerprint
import com.rentacar.app.data.EmailCommissionReportFingerprintDao
import com.rentacar.app.data.Supplier
import com.rentacar.app.data.auth.CurrentUserProvider
import com.rentacar.app.mailbox.GmailImapMailboxClient
import com.rentacar.app.mailbox.MailboxClient
import com.rentacar.app.mailbox.MailboxConnectionResult
import com.rentacar.app.mailbox.MailboxCredentials
import com.rentacar.app.mailbox.MailboxError
import com.rentacar.app.mailbox.MailboxMessageContent
import com.rentacar.app.mailbox.MailboxMessageRef
import com.rentacar.app.mailbox.MailboxProvider
import com.rentacar.app.mailbox.SecureMailboxCredentialsStore
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.security.MessageDigest
import java.util.concurrent.TimeUnit

data class EmailReportListItem(
    val ref: MailboxMessageRef,
    val senderMatch: SenderMatchResult,
    val subject: String,
    val receivedAt: Long,
    val configuredSender: String,
    val reportFormat: CommissionReportFormat
)

data class EmailImportPreviewBundle(
    val listItem: EmailReportListItem,
    val dispatcherPreview: CommissionReportImportDispatcher.PreviewResult,
    val diagnostics: EmailImportDiagnostics,
    val contentHash: String,
    val matchedSenderEmail: String?,
    val senderMatchType: SenderMatchType,
    val ambiguousXlsxNames: List<String> = emptyList()
)

/**
 * Orchestrates supplier-configured email commission import.
 * Does not mutate reservations — only produces preview via existing dispatcher.
 */
class EmailCommissionImportService(
    private val context: Context,
    private val credentialsStore: SecureMailboxCredentialsStore,
    private val dispatcher: CommissionReportImportDispatcher,
    private val fingerprintDao: EmailCommissionReportFingerprintDao,
    private val mailboxClient: GmailImapMailboxClient = GmailImapMailboxClient(),
    private val htmlParser: ShagrirHtmlTableReportParser = ShagrirHtmlTableReportParser(),
    private val xlsxExtractor: XlsxAttachmentReportExtractor = XlsxAttachmentReportExtractor(),
    private val lookbackDays: Long = 60L
) {

    suspend fun testMailboxConnection(): MailboxConnectionResult = withContext(Dispatchers.IO) {
        val creds = credentialsStore.load()
            ?: return@withContext MailboxConnectionResult.Failure(MailboxError.NOT_CONFIGURED)
        mailboxClient.testConnection(creds)
    }

    suspend fun searchReportsForSupplier(supplier: Supplier): Pair<List<EmailReportListItem>, EmailImportDiagnostics> =
        withContext(Dispatchers.IO) {
            val configuredEmail = supplier.commissionReportEmail?.trim()
            val format = CommissionReportFormat.fromStored(supplier.commissionReportFormat)
            var diagnostics = EmailImportDiagnostics(
                supplierName = supplier.name,
                supplierId = supplier.id,
                configuredSender = configuredEmail,
                reportFormat = format?.name
            )

            if (configuredEmail.isNullOrBlank()) {
                return@withContext emptyList<EmailReportListItem>() to diagnostics.copy(
                    notes = listOf(EmailImportErrorCode.SUPPLIER_EMAIL_NOT_CONFIGURED.hebrewMessage())
                )
            }
            if (format == null) {
                return@withContext emptyList<EmailReportListItem>() to diagnostics.copy(
                    notes = listOf(EmailImportErrorCode.SUPPLIER_FORMAT_NOT_CONFIGURED.hebrewMessage())
                )
            }
            val creds = credentialsStore.load()
            if (creds == null) {
                return@withContext emptyList<EmailReportListItem>() to diagnostics.copy(
                    mailboxConnectionOk = false,
                    notes = listOf(EmailImportErrorCode.MAILBOX_NOT_CONFIGURED.hebrewMessage())
                )
            }

            val since = System.currentTimeMillis() - TimeUnit.DAYS.toMillis(lookbackDays)
            val search = mailboxClient.findMessagesBySender(
                credentials = creds,
                configuredSenderEmail = configuredEmail,
                sinceEpochMillis = since
            )
            if (!search.success) {
                val code = mapMailboxError(search.error)
                return@withContext emptyList<EmailReportListItem>() to diagnostics.copy(
                    mailboxConnectionOk = false,
                    messagesScanned = search.scannedCount,
                    notes = listOf(code.hebrewMessage())
                )
            }

            val items = search.messages.map { ref ->
                // Match type already validated during search; recompute lightly from headers for UI
                val match = ForwardedSenderResolver.resolveMatch(
                    configuredSenderEmail = configuredEmail,
                    fromHeader = ref.fromHeader,
                    replyToHeader = ref.replyToHeader,
                    plainBody = null,
                    htmlBody = null
                ).let { headerOnly ->
                    if (headerOnly.matched) headerOnly
                    else SenderMatchResult(
                        matched = true,
                        matchType = SenderMatchType.FORWARDED_FROM,
                        configuredEmail = EmailAddressNormalizer.normalize(configuredEmail) ?: configuredEmail,
                        matchedEmail = EmailAddressNormalizer.normalize(configuredEmail),
                        outerFrom = ref.fromHeader,
                        diagnosticNote = "matched_during_mailbox_search"
                    )
                }
                EmailReportListItem(
                    ref = ref,
                    senderMatch = match,
                    subject = ref.subject,
                    receivedAt = ref.receivedAt,
                    configuredSender = configuredEmail,
                    reportFormat = format
                )
            }

            diagnostics = diagnostics.copy(
                mailboxConnectionOk = true,
                messagesScanned = search.scannedCount,
                matchingMessages = items.size,
                notes = if (items.isEmpty()) {
                    listOf(EmailImportErrorCode.NO_MATCHING_MESSAGES.hebrewMessage())
                } else emptyList()
            )
            items to diagnostics
        }

    suspend fun previewSelectedReport(
        supplier: Supplier,
        item: EmailReportListItem,
        reportYear: Int,
        reportMonth: Int,
        selectedXlsxFileName: String? = null
    ): EmailImportPreviewBundle = withContext(Dispatchers.IO) {
        val userUid = CurrentUserProvider.requireCurrentUid()
        val configuredEmail = supplier.commissionReportEmail?.trim().orEmpty()
        val format = item.reportFormat
        var diagnostics = EmailImportDiagnostics(
            mailboxConnectionOk = true,
            supplierName = supplier.name,
            supplierId = supplier.id,
            configuredSender = configuredEmail,
            reportFormat = format.name
        )

        val creds = credentialsStore.load()
            ?: return@withContext failureBundle(
                item,
                EmailImportErrorCode.MAILBOX_NOT_CONFIGURED,
                diagnostics.copy(mailboxConnectionOk = false)
            )

        val content = mailboxClient.fetchMessageContent(creds, item.ref)
            ?: return@withContext failureBundle(
                item,
                EmailImportErrorCode.MAILBOX_UNAVAILABLE,
                diagnostics
            )

        val senderMatch = ForwardedSenderResolver.resolveMatch(
            configuredSenderEmail = configuredEmail,
            fromHeader = content.ref.fromHeader,
            replyToHeader = content.ref.replyToHeader,
            plainBody = content.plainBody,
            htmlBody = content.htmlBody
        )
        diagnostics = diagnostics.copy(senderMatchType = senderMatch.matchType.name)

        if (!senderMatch.matched) {
            return@withContext failureBundle(
                item.copy(senderMatch = senderMatch),
                EmailImportErrorCode.SENDER_MISMATCH,
                diagnostics
            )
        }

        when (format) {
            CommissionReportFormat.HTML_TABLE ->
                previewHtml(supplier, item, content, senderMatch, reportYear, reportMonth, userUid, diagnostics)
            CommissionReportFormat.XLSX_ATTACHMENT ->
                previewXlsx(
                    supplier, item, content, senderMatch, reportYear, reportMonth, userUid,
                    diagnostics, selectedXlsxFileName
                )
        }
    }

    suspend fun recordSuccessfulImportFingerprint(
        supplier: Supplier,
        bundle: EmailImportPreviewBundle,
        result: String = "PREVIEW_CONFIRMED"
    ) = withContext(Dispatchers.IO) {
        val uid = CurrentUserProvider.requireCurrentUid()
        fingerprintDao.insert(
            EmailCommissionReportFingerprint(
                supplierId = supplier.id,
                configuredSender = EmailAddressNormalizer.normalize(supplier.commissionReportEmail)
                    ?: supplier.commissionReportEmail.orEmpty(),
                mailboxProvider = MailboxProvider.GMAIL_IMAP.name,
                messageId = bundle.listItem.ref.messageId,
                imapUid = bundle.listItem.ref.imapUid,
                receivedAt = bundle.listItem.receivedAt,
                contentHash = bundle.contentHash,
                reportFormat = bundle.listItem.reportFormat.name,
                result = result,
                userUid = uid
            )
        )
    }

    private suspend fun previewHtml(
        supplier: Supplier,
        item: EmailReportListItem,
        content: MailboxMessageContent,
        senderMatch: SenderMatchResult,
        reportYear: Int,
        reportMonth: Int,
        userUid: String,
        diagnostics: EmailImportDiagnostics
    ): EmailImportPreviewBundle {
        val extraction = HtmlTableReportExtractor().extract(
            html = content.htmlBody,
            requiredHeaders = ShagrirHtmlTableReportParser.REQUIRED_HEADERS,
            headerAliases = ShagrirHtmlTableReportParser.HEADER_ALIASES
        )
        val table = extraction.selectedTable
        if (table == null) {
            return failureBundle(
                item,
                if (extraction.tables.isEmpty()) EmailImportErrorCode.NO_HTML_TABLE
                else EmailImportErrorCode.MISSING_REQUIRED_COLUMNS,
                diagnostics.copy(htmlTablesFound = extraction.tables.size)
            )
        }

        val contentHash = htmlParser.contentHash(table)
        val duplicate = isDuplicate(supplier.id, content.ref.messageId, contentHash, userUid)
        if (duplicate) {
            return EmailImportPreviewBundle(
                listItem = item,
                dispatcherPreview = CommissionReportImportDispatcher.PreviewResult(
                    success = false,
                    fileHash = contentHash,
                    sourceFileName = "email:${item.subject}",
                    isDuplicateFile = true,
                    parseResult = null,
                    errors = listOf(EmailImportErrorCode.DUPLICATE_REPORT.hebrewMessage())
                ),
                diagnostics = diagnostics.copy(
                    htmlTablesFound = extraction.tables.size,
                    duplicate = true,
                    senderMatchType = senderMatch.matchType.name
                ),
                contentHash = contentHash,
                matchedSenderEmail = senderMatch.matchedEmail,
                senderMatchType = senderMatch.matchType
            )
        }

        val parseContext = CommissionReportParseContext(
            supplierId = supplier.id,
            reportYear = reportYear,
            reportMonth = reportMonth,
            sourceFileName = "email:${item.subject}",
            fileHash = contentHash,
            userUid = userUid
        )
        val parsed = htmlParser.parse(content.htmlBody, parseContext)
        val preview = dispatcher.previewImportFromParseResult(
            supplierId = supplier.id,
            sourceFileName = "email:${item.subject}",
            fileHash = contentHash,
            parseResult = parsed
        )
        return EmailImportPreviewBundle(
            listItem = item,
            dispatcherPreview = preview,
            diagnostics = diagnostics.copy(
                htmlTablesFound = extraction.tables.size,
                parsedRows = parsed.rawRows.size,
                invalidRows = parsed.errors.size,
                duplicate = preview.isDuplicateFile,
                senderMatchType = senderMatch.matchType.name
            ),
            contentHash = contentHash,
            matchedSenderEmail = senderMatch.matchedEmail,
            senderMatchType = senderMatch.matchType
        )
    }

    private suspend fun previewXlsx(
        supplier: Supplier,
        item: EmailReportListItem,
        content: MailboxMessageContent,
        senderMatch: SenderMatchResult,
        reportYear: Int,
        reportMonth: Int,
        userUid: String,
        diagnostics: EmailImportDiagnostics,
        selectedXlsxFileName: String?
    ): EmailImportPreviewBundle {
        val xlsxCount = content.attachments.count { XlsxAttachmentReportExtractor.isXlsx(it.fileName) }
        val extraction = xlsxExtractor.extract(content.attachments)
        val baseDiag = diagnostics.copy(
            attachmentsFound = content.attachments.size,
            xlsxAttachmentsFound = xlsxCount,
            senderMatchType = senderMatch.matchType.name
        )

        val candidate = when (extraction) {
            is XlsxExtractionResult.Failure -> {
                return failureBundle(item, extraction.errorCode, baseDiag)
            }
            is XlsxExtractionResult.Ambiguous -> {
                if (selectedXlsxFileName != null) {
                    extraction.candidates.firstOrNull { it.fileName == selectedXlsxFileName }
                        ?: return EmailImportPreviewBundle(
                            listItem = item,
                            dispatcherPreview = CommissionReportImportDispatcher.PreviewResult(
                                success = false,
                                fileHash = "",
                                sourceFileName = item.subject,
                                isDuplicateFile = false,
                                parseResult = null,
                                errors = listOf(EmailImportErrorCode.AMBIGUOUS_XLSX_ATTACHMENTS.hebrewMessage())
                            ),
                            diagnostics = baseDiag,
                            contentHash = "",
                            matchedSenderEmail = senderMatch.matchedEmail,
                            senderMatchType = senderMatch.matchType,
                            ambiguousXlsxNames = extraction.candidates.map { it.fileName }
                        )
                } else {
                    return EmailImportPreviewBundle(
                        listItem = item,
                        dispatcherPreview = CommissionReportImportDispatcher.PreviewResult(
                            success = false,
                            fileHash = "",
                            sourceFileName = item.subject,
                            isDuplicateFile = false,
                            parseResult = null,
                            errors = listOf(EmailImportErrorCode.AMBIGUOUS_XLSX_ATTACHMENTS.hebrewMessage())
                        ),
                        diagnostics = baseDiag,
                        contentHash = "",
                        matchedSenderEmail = senderMatch.matchedEmail,
                        senderMatchType = senderMatch.matchType,
                        ambiguousXlsxNames = extraction.candidates.map { it.fileName }
                    )
                }
            }
            is XlsxExtractionResult.Success -> extraction.candidate
        }

        val contentHash = sha256(candidate.bytes)
        val duplicate = isDuplicate(supplier.id, content.ref.messageId, contentHash, userUid)
        if (duplicate) {
            return EmailImportPreviewBundle(
                listItem = item,
                dispatcherPreview = CommissionReportImportDispatcher.PreviewResult(
                    success = false,
                    fileHash = contentHash,
                    sourceFileName = candidate.fileName,
                    isDuplicateFile = true,
                    parseResult = null,
                    errors = listOf(EmailImportErrorCode.DUPLICATE_REPORT.hebrewMessage())
                ),
                diagnostics = baseDiag.copy(duplicate = true),
                contentHash = contentHash,
                matchedSenderEmail = senderMatch.matchedEmail,
                senderMatchType = senderMatch.matchType
            )
        }

        var tempFile: java.io.File? = null
        return try {
            tempFile = xlsxExtractor.writeTempFile(context.cacheDir, candidate)
            val preview = dispatcher.previewImportFromXlsxBytes(
                supplierId = supplier.id,
                reportYear = reportYear,
                reportMonth = reportMonth,
                xlsxBytes = candidate.bytes,
                sourceFileName = candidate.fileName,
                contentHashOverride = contentHash
            )
            EmailImportPreviewBundle(
                listItem = item,
                dispatcherPreview = preview,
                diagnostics = baseDiag.copy(
                    parsedRows = preview.parseResult?.rawRows?.size,
                    invalidRows = preview.parseResult?.errors?.size,
                    duplicate = preview.isDuplicateFile
                ),
                contentHash = contentHash,
                matchedSenderEmail = senderMatch.matchedEmail,
                senderMatchType = senderMatch.matchType
            )
        } catch (e: Exception) {
            Log.w(TAG, "xlsx preview failed: ${e.javaClass.simpleName}")
            failureBundle(item, EmailImportErrorCode.MALFORMED_XLSX, baseDiag)
        } finally {
            try {
                tempFile?.delete()
            } catch (_: Exception) {
            }
        }
    }

    private suspend fun isDuplicate(
        supplierId: Long,
        messageId: String?,
        contentHash: String,
        userUid: String
    ): Boolean {
        if (contentHash.isNotBlank() && fingerprintDao.existsByContentHash(supplierId, contentHash, userUid)) {
            return true
        }
        if (!messageId.isNullOrBlank() && fingerprintDao.existsByMessageId(supplierId, messageId, userUid)) {
            return true
        }
        return false
    }

    private fun failureBundle(
        item: EmailReportListItem,
        code: EmailImportErrorCode,
        diagnostics: EmailImportDiagnostics
    ): EmailImportPreviewBundle =
        EmailImportPreviewBundle(
            listItem = item,
            dispatcherPreview = CommissionReportImportDispatcher.PreviewResult(
                success = false,
                fileHash = "",
                sourceFileName = item.subject,
                isDuplicateFile = code == EmailImportErrorCode.DUPLICATE_REPORT,
                parseResult = null,
                errors = listOf(code.hebrewMessage())
            ),
            diagnostics = diagnostics.copy(notes = diagnostics.notes + code.hebrewMessage()),
            contentHash = "",
            matchedSenderEmail = item.senderMatch.matchedEmail,
            senderMatchType = item.senderMatch.matchType
        )

    private fun mapMailboxError(error: MailboxError?): EmailImportErrorCode = when (error) {
        MailboxError.NOT_CONFIGURED -> EmailImportErrorCode.MAILBOX_NOT_CONFIGURED
        MailboxError.INVALID_ACCOUNT -> EmailImportErrorCode.INVALID_GMAIL_ACCOUNT
        MailboxError.INVALID_APP_PASSWORD -> EmailImportErrorCode.INVALID_APP_PASSWORD
        MailboxError.AUTHENTICATION_FAILED -> EmailImportErrorCode.AUTHENTICATION_FAILED
        MailboxError.NETWORK_UNAVAILABLE -> EmailImportErrorCode.NETWORK_UNAVAILABLE
        MailboxError.SSL_FAILURE -> EmailImportErrorCode.SSL_FAILURE
        MailboxError.TIMEOUT -> EmailImportErrorCode.TIMEOUT
        MailboxError.MAILBOX_UNAVAILABLE -> EmailImportErrorCode.MAILBOX_UNAVAILABLE
        MailboxError.UNKNOWN, null -> EmailImportErrorCode.UNKNOWN
    }

    private fun sha256(bytes: ByteArray): String {
        val digest = MessageDigest.getInstance("SHA-256").digest(bytes)
        return digest.joinToString("") { "%02x".format(it) }
    }

    companion object {
        private const val TAG = "EmailCommissionImport"
    }
}
