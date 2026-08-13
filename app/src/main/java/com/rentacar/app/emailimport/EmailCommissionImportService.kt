package com.rentacar.app.emailimport

import android.content.Context
import android.util.Log
import com.rentacar.app.commission.domain.CommissionReportParseContext
import com.rentacar.app.commission.parser.CommissionReportImportDispatcher
import com.rentacar.app.data.EmailCommissionReportFingerprint
import com.rentacar.app.data.EmailCommissionReportFingerprintDao
import com.rentacar.app.data.Supplier
import com.rentacar.app.data.auth.CurrentUserProvider
import com.rentacar.app.emailimport.debug.EmailImportDebugHub
import com.rentacar.app.emailimport.debug.EmailImportDebugStage
import com.rentacar.app.emailimport.debug.EmailImportDebugStatus
import com.rentacar.app.mailbox.GmailImapMailboxClient
import com.rentacar.app.mailbox.MailboxCredentials
import com.rentacar.app.mailbox.MailboxConnectionResult
import com.rentacar.app.mailbox.MailboxError
import com.rentacar.app.mailbox.MailboxMessageContent
import com.rentacar.app.mailbox.MailboxMessageRef
import com.rentacar.app.mailbox.MailboxProvider
import com.rentacar.app.mailbox.SecureMailboxCredentialsStore
import com.rentacar.app.emailimport.debug.EmailImportDebugSession
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.security.MessageDigest
import java.time.YearMonth
import java.time.ZoneId

data class EmailReportListItem(
    val ref: MailboxMessageRef,
    val senderMatch: SenderMatchResult,
    val subject: String,
    val receivedAt: Long,
    val configuredSender: String,
    val reportFormat: CommissionReportFormat,
    val classification: EmailReportCandidateClassification = EmailReportCandidateClassification.SUPPLIER_EMAIL_CANDIDATE,
    val classificationNote: String? = null
) {
    /** Stable UI/debug key for candidate preview state (not a secret). */
    fun stableCandidateId(): String {
        val uid = ref.imapUid
        if (uid != null && uid > 0L) return "uid:$uid"
        val mid = ref.messageId?.trim().orEmpty()
        if (mid.isNotBlank()) {
            val digest = MessageDigest.getInstance("SHA-256").digest(mid.toByteArray())
            return "mid:" + digest.joinToString("") { "%02x".format(it) }.take(16)
        }
        return "sub:${subject.hashCode()}:$receivedAt"
    }
}

enum class EmailReportCandidateClassification {
    SUPPLIER_EMAIL_CANDIDATE,
    VALID_REPORT,
    SUPPLIER_EMAIL_NO_REPORT,
    TABLE_FOUND_MISSING_COLUMNS,
    IMAGE_ONLY_REPORT,
    MALFORMED_REPORT,
    DUPLICATE_REPORT
}

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
    private val xlsxExtractor: XlsxAttachmentReportExtractor = XlsxAttachmentReportExtractor()
) {

    suspend fun testMailboxConnection(): MailboxConnectionResult = withContext(Dispatchers.IO) {
        val creds = try {
            credentialsStore.load()
        } catch (e: Exception) {
            return@withContext MailboxConnectionResult.Failure(
                MailboxError.UNKNOWN,
                "credential_store: ${e.javaClass.simpleName}"
            )
        } ?: return@withContext MailboxConnectionResult.Failure(MailboxError.NOT_CONFIGURED)
        mailboxClient.testConnection(creds)
    }

    /**
     * Search mailbox for supplier commission reports.
     * Delivery window: first day of report month → end of report month + 14 days
     * (July report may arrive in early August).
     */
    suspend fun searchReportsForSupplier(
        supplier: Supplier,
        reportYear: Int,
        reportMonth: Int
    ): Pair<List<EmailReportListItem>, EmailImportDiagnostics> =
        withContext(Dispatchers.IO) {
            val debug = EmailImportDebugHub.begin()
            debug.supplierId = supplier.id
            debug.supplierName = supplier.name
            debug.event(
                EmailImportDebugStage.SUPPLIER_CONFIG,
                EmailImportDebugStatus.INFO,
                "Supplier config loaded",
                mapOf(
                    "supplierId" to supplier.id,
                    "supplierName" to supplier.name,
                    "configuredSender" to supplier.commissionReportEmail,
                    "reportFormat" to supplier.commissionReportFormat,
                    "reportYear" to reportYear,
                    "reportMonth" to reportMonth
                )
            )

            val configuredEmail = supplier.commissionReportEmail?.trim()
            val format = CommissionReportFormat.fromStored(supplier.commissionReportFormat)
            debug.configuredSender = configuredEmail
            debug.reportFormat = format?.name

            fun diag(notes: List<String>) = EmailImportDiagnostics.fromSession(debug, notes).also {
                persistDebugSnapshot(debug)
            }

            if (configuredEmail.isNullOrBlank()) {
                return@withContext emptyList<EmailReportListItem>() to diag(
                    listOf(EmailImportErrorCode.SUPPLIER_EMAIL_NOT_CONFIGURED.hebrewMessage())
                )
            }
            if (format == null) {
                return@withContext emptyList<EmailReportListItem>() to diag(
                    listOf(EmailImportErrorCode.SUPPLIER_FORMAT_NOT_CONFIGURED.hebrewMessage())
                )
            }

            debug.event(EmailImportDebugStage.CREDENTIAL_LOAD, EmailImportDebugStatus.INFO, "Loading mailbox credentials")
            val creds = try {
                credentialsStore.load()
            } catch (e: Exception) {
                debug.recordFailure(EmailImportDebugStage.CREDENTIAL_LOAD, e)
                return@withContext emptyList<EmailReportListItem>() to diag(
                    listOf(EmailImportErrorCode.CREDENTIAL_STORE_FAILURE.hebrewMessage())
                )
            }
            if (creds == null) {
                debug.credentialsConfigured = false
                debug.appPasswordLength = 0
                debug.connectionSucceeded = false
                debug.event(
                    EmailImportDebugStage.CREDENTIAL_LOAD,
                    EmailImportDebugStatus.FAILURE,
                    "No mailbox credentials stored"
                )
                return@withContext emptyList<EmailReportListItem>() to diag(
                    listOf(EmailImportErrorCode.MAILBOX_NOT_CONFIGURED.hebrewMessage())
                )
            }
            debug.credentialsConfigured = true
            debug.appPasswordLength = creds.appPassword.length
            debug.event(
                EmailImportDebugStage.CREDENTIAL_LOAD,
                EmailImportDebugStatus.SUCCESS,
                "Credentials loaded",
                mapOf(
                    "emailAddress" to creds.emailAddress,
                    "appPasswordLength" to creds.appPassword.length,
                    "appPasswordPresent" to true
                )
            )

            val (sinceMs, untilMs) = searchWindowForReportMonth(reportYear, reportMonth)
            debug.searchWindowStartMs = sinceMs
            debug.searchWindowEndMs = untilMs
            debug.event(
                EmailImportDebugStage.SEARCH_WINDOW,
                EmailImportDebugStatus.INFO,
                "Report-month delivery window",
                mapOf(
                    "reportYear" to reportYear,
                    "reportMonth" to reportMonth,
                    "sinceMs" to sinceMs,
                    "untilMs" to untilMs,
                    "graceDaysAfterMonthEnd" to 14
                )
            )
            val search = mailboxClient.findMessagesBySender(
                credentials = creds,
                configuredSenderEmail = configuredEmail,
                sinceEpochMillis = sinceMs,
                untilEpochMillis = untilMs,
                limit = 50,
                debug = debug
            )
            if (!search.success) {
                val code = mapMailboxError(search.error)
                val note = buildString {
                    append(code.hebrewMessage())
                    if (!search.exceptionClass.isNullOrBlank()) {
                        append(" (")
                        append(search.exceptionClass.substringAfterLast('.'))
                        if (!search.exceptionMessage.isNullOrBlank()) {
                            append(": ")
                            append(search.exceptionMessage)
                        }
                        append(")")
                    }
                }
                // Preserve connectionSucceeded from the IMAP client; only force false for connect-stage failures.
                val connectFailed = search.error in setOf(
                    MailboxError.NOT_CONFIGURED,
                    MailboxError.INVALID_ACCOUNT,
                    MailboxError.INVALID_APP_PASSWORD,
                    MailboxError.AUTHENTICATION_FAILED,
                    MailboxError.NETWORK_UNAVAILABLE,
                    MailboxError.DNS_FAILURE,
                    MailboxError.CONNECTION_TIMEOUT,
                    MailboxError.SSL_FAILURE,
                    MailboxError.IMAP_CONNECTION_FAILED,
                    MailboxError.INBOX_OPEN_FAILED,
                    MailboxError.MAILBOX_UNAVAILABLE
                )
                if (connectFailed) {
                    debug.connectionSucceeded = false
                }
                debug.messagesScanned = search.scannedCount
                debug.candidateMessages = search.candidateCount
                if (debug.failureExceptionClass == null && search.exceptionClass != null) {
                    debug.failureStage = EmailImportDebugStage.ERROR
                    debug.failureExceptionClass = search.exceptionClass
                    debug.failureMessage = search.exceptionMessage
                    debug.failureCauseClass = search.causeClass
                }
                return@withContext emptyList<EmailReportListItem>() to diag(listOf(note))
            }

            val items = mutableListOf<EmailReportListItem>()
            for (ref in search.messages) {
                val headerOnly = ForwardedSenderResolver.resolveMatch(
                    configuredSenderEmail = configuredEmail,
                    fromHeader = ref.fromHeader,
                    replyToHeader = ref.replyToHeader,
                    plainBody = null,
                    htmlBody = null
                )
                val match = when {
                    headerOnly.matched -> headerOnly
                    else -> SenderMatchResult(
                        matched = true,
                        matchType = SenderMatchType.SERVER_BODY_CANDIDATE,
                        configuredEmail = EmailAddressNormalizer.normalize(configuredEmail) ?: configuredEmail,
                        matchedEmail = EmailAddressNormalizer.normalize(configuredEmail),
                        outerFrom = ref.fromHeader,
                        diagnosticNote = "server_body_or_origin=${ref.serverOrigin ?: "SERVER_BODY_CANDIDATE"}"
                    )
                }
                // List search stays fast: server-filtered refs only.
                // Full MIME/table preflight runs on preview ("בדוק והתאם הזמנות").
                val note = when (match.matchType) {
                    SenderMatchType.DIRECT_FROM, SenderMatchType.REPLY_TO ->
                        "מועמד מסנן-שרת — אימות דוח בלחיצה על בדיקה"
                    SenderMatchType.SERVER_BODY_CANDIDATE ->
                        "מועמד לפי תוכן בשרת — טרם אומת כהעברה"
                    else -> "מועמד מסנן-שרת — אימות דוח בלחיצה על בדיקה"
                }
                items += EmailReportListItem(
                    ref = ref,
                    senderMatch = match,
                    subject = ref.subject,
                    receivedAt = ref.receivedAt,
                    configuredSender = configuredEmail,
                    reportFormat = format,
                    classification = EmailReportCandidateClassification.SUPPLIER_EMAIL_CANDIDATE,
                    classificationNote = note
                )
            }
            // Prefer direct sender matches (real HTML reports) ahead of body-term candidates
            items.sortWith(
                compareByDescending<EmailReportListItem> {
                    when (it.senderMatch.matchType) {
                        SenderMatchType.DIRECT_FROM -> 3
                        SenderMatchType.REPLY_TO -> 2
                        SenderMatchType.FORWARDED_FROM -> 1
                        else -> 0
                    }
                }.thenByDescending { it.receivedAt }
            )

            debug.connectionSucceeded = true
            debug.messagesScanned = search.scannedCount
            debug.matchingMessages = items.size
            debug.candidateMessages = search.candidateCount
            debug.directServerMatches = search.directServerMatches
            debug.replyToServerMatches = search.replyToServerMatches
            debug.bodyServerMatches = search.bodyServerMatches
            debug.mergedServerCandidates = search.mergedServerCandidates
            debug.localBodyDownloads = search.localBodyDownloads
            debug.fallbackUsed = search.fallbackUsed
            debug.searchMode = search.searchMode
            debug.serverSearchMs = search.serverSearchMs
            debug.candidateMetadataMs = search.candidateMetadataMs
            debug.localValidationMs = search.candidateMetadataMs
            debug.totalSearchMs = search.totalSearchMs
            if (items.isNotEmpty()) {
                debug.senderMatchType = items.first().senderMatch.matchType.name
            }
            debug.event(
                EmailImportDebugStage.COMPLETE,
                EmailImportDebugStatus.SUCCESS,
                "Search complete",
                mapOf(
                    "matched" to items.size,
                    "serverCandidates" to search.candidateCount,
                    "localBodyDownloads" to search.localBodyDownloads,
                    "searchMode" to search.searchMode,
                    "fallbackUsed" to search.fallbackUsed,
                    "serverSearchMs" to search.serverSearchMs,
                    "candidateMetadataMs" to search.candidateMetadataMs,
                    "totalSearchMs" to search.totalSearchMs,
                    "scanned" to search.scannedCount
                )
            )

            val notes = when {
                items.isEmpty() -> listOf(EmailImportErrorCode.NO_MATCHING_MESSAGES.hebrewMessage())
                else -> emptyList()
            }
            items to diag(notes)
        }

    suspend fun previewSelectedReport(
        supplier: Supplier,
        item: EmailReportListItem,
        reportYear: Int,
        reportMonth: Int,
        selectedXlsxFileName: String? = null
    ): EmailImportPreviewBundle = withContext(Dispatchers.IO) {
        val previewStartedAt = System.currentTimeMillis()
        val parentSearchSessionId = EmailImportDebugHub.lastSearchSessionId
            ?: EmailImportDebugHub.latest?.parentSearchSessionId
            ?: EmailImportDebugHub.latest?.sessionId
        val debug = EmailImportDebugHub.beginPreview(parentSessionId = parentSearchSessionId)
        debug.supplierId = supplier.id
        debug.supplierName = supplier.name
        debug.configuredSender = supplier.commissionReportEmail
        debug.reportFormat = item.reportFormat.name
        debug.candidateMessageIdHash = item.ref.messageId?.let {
            MessageDigest.getInstance("SHA-256").digest(it.toByteArray())
                .joinToString("") { b -> "%02x".format(b) }.take(16)
        }
        debug.event(
            EmailImportDebugStage.CANDIDATE_PREVIEW_START,
            EmailImportDebugStatus.INFO,
            "Candidate preview start — not a mailbox search",
            mapOf(
                "candidateId" to item.stableCandidateId(),
                "candidateHash" to debug.candidateMessageIdHash,
                "parentSearchSession" to parentSearchSessionId,
                "uiYearMonth" to "%04d-%02d".format(reportYear, reportMonth),
                "serviceReportMonth" to reportMonth,
                "imapUid" to item.ref.imapUid,
                "senderMatchType" to item.senderMatch.matchType.name,
                "receivedAt" to item.receivedAt
            )
        )
        require(reportMonth in 1..12) { "reportMonth must be 1-based (1..12), got $reportMonth" }

        val userUid = CurrentUserProvider.requireCurrentUid()
        val configuredEmail = supplier.commissionReportEmail?.trim().orEmpty()
        val format = item.reportFormat
        var diagnostics = EmailImportDiagnostics(
            mailboxConnectionOk = true,
            supplierName = supplier.name,
            supplierId = supplier.id,
            configuredSender = configuredEmail,
            reportFormat = format.name,
            sessionId = debug.sessionId
        )

        val creds = try {
            credentialsStore.load()
        } catch (e: Exception) {
            debug.recordFailure(EmailImportDebugStage.CREDENTIAL_LOAD, e)
            persistDebugSnapshot(debug)
            return@withContext failureBundle(
                item,
                EmailImportErrorCode.CREDENTIAL_STORE_FAILURE,
                diagnostics.copy(mailboxConnectionOk = false, sessionId = debug.sessionId)
            )
        } ?: run {
            persistDebugSnapshot(debug)
            return@withContext failureBundle(
                item,
                EmailImportErrorCode.MAILBOX_NOT_CONFIGURED,
                diagnostics.copy(mailboxConnectionOk = false, sessionId = debug.sessionId)
            )
        }

        debug.event(
            EmailImportDebugStage.SELECTED_MESSAGE_FETCH_START,
            EmailImportDebugStatus.INFO,
            "Fetching selected message only — no mailbox search",
            mapOf(
                "imapUid" to item.ref.imapUid,
                "candidateId" to item.stableCandidateId(),
                "mailboxSearchRerun" to false,
                "includeAttachmentBytes" to (format == CommissionReportFormat.XLSX_ATTACHMENT)
            )
        )
        val fetchStarted = System.currentTimeMillis()
        val content = mailboxClient.fetchMessageContent(
            credentials = creds,
            ref = item.ref,
            debug = debug,
            includeAttachmentBytes = format == CommissionReportFormat.XLSX_ATTACHMENT
        )
        val selectedMessageFetchMs = System.currentTimeMillis() - fetchStarted
        if (content == null) {
            debug.event(
                EmailImportDebugStage.CANDIDATE_PREVIEW_FAILURE,
                EmailImportDebugStatus.FAILURE,
                "Selected message fetch failed",
                mapOf("selectedMessageFetchMs" to selectedMessageFetchMs)
            )
            persistDebugSnapshot(debug)
            return@withContext failureBundle(
                item,
                EmailImportErrorCode.MESSAGE_LOAD_FAILED,
                diagnostics.copy(sessionId = debug.sessionId)
            )
        }
        debug.event(
            EmailImportDebugStage.SELECTED_MESSAGE_FETCH_SUCCESS,
            EmailImportDebugStatus.SUCCESS,
            "Selected message fetched",
            mapOf(
                "selectedMessageFetchMs" to selectedMessageFetchMs,
                "htmlPartCount" to content.htmlParts.size,
                "inlineImageCount" to content.inlineImages.size,
                "attachmentCount" to content.attachments.size,
                "mailboxSearchRerun" to false
            )
        )

        var senderMatch = ForwardedSenderResolver.resolveMatch(
            configuredSenderEmail = configuredEmail,
            fromHeader = content.ref.fromHeader,
            replyToHeader = content.ref.replyToHeader,
            plainBody = content.plainBody,
            htmlBody = content.htmlBody
        )
        diagnostics = diagnostics.copy(senderMatchType = senderMatch.matchType.name)
        debug.senderMatchType = senderMatch.matchType.name

        if (!senderMatch.matched) {
            // BodyTerm list candidates may still be image-only reports without a strict forwarded From.
            val allowProvisional = item.senderMatch.matchType == SenderMatchType.SERVER_BODY_CANDIDATE ||
                item.ref.serverOrigin == SenderMatchType.SERVER_BODY_CANDIDATE.name
            if (allowProvisional && format == CommissionReportFormat.HTML_TABLE) {
                senderMatch = SenderMatchResult(
                    matched = true,
                    matchType = SenderMatchType.SERVER_BODY_CANDIDATE,
                    configuredEmail = EmailAddressNormalizer.normalize(configuredEmail) ?: configuredEmail,
                    matchedEmail = EmailAddressNormalizer.normalize(configuredEmail),
                    outerFrom = content.ref.fromHeader,
                    diagnosticNote = "provisional_server_body_for_content_classification"
                )
                diagnostics = diagnostics.copy(senderMatchType = senderMatch.matchType.name)
                debug.senderMatchType = senderMatch.matchType.name
            } else {
                debug.event(
                    EmailImportDebugStage.CANDIDATE_PREVIEW_FAILURE,
                    EmailImportDebugStatus.FAILURE,
                    "Sender mismatch on selected message"
                )
                persistDebugSnapshot(debug)
                return@withContext failureBundle(
                    item.copy(senderMatch = senderMatch),
                    EmailImportErrorCode.SENDER_MISMATCH,
                    diagnostics.copy(sessionId = debug.sessionId)
                )
            }
        }

        val result = when (format) {
            CommissionReportFormat.HTML_TABLE -> {
                val htmlParts = content.htmlParts.mapNotNull { it.text?.takeIf { t -> t.isNotBlank() } }
                    .ifEmpty { listOfNotNull(content.htmlBody?.takeIf { it.isNotBlank() }) }
                if (htmlParts.isEmpty() && content.htmlBody.isNullOrBlank()) {
                    failureBundle(
                        item,
                        EmailImportErrorCode.NO_HTML_BODY,
                        diagnostics.copy(sessionId = debug.sessionId)
                    )
                } else {
                    previewHtml(supplier, item, content, senderMatch, reportYear, reportMonth, userUid, diagnostics)
                }
            }
            CommissionReportFormat.XLSX_ATTACHMENT ->
                previewXlsx(
                    supplier, item, content, senderMatch, reportYear, reportMonth, userUid,
                    diagnostics, selectedXlsxFileName
                )
        }
        debug.event(
            if (result.dispatcherPreview.success) EmailImportDebugStage.CANDIDATE_PREVIEW_COMPLETE
            else EmailImportDebugStage.CANDIDATE_PREVIEW_FAILURE,
            if (result.dispatcherPreview.success) EmailImportDebugStatus.SUCCESS else EmailImportDebugStatus.FAILURE,
            "Candidate preview finished",
            mapOf(
                "totalPreviewMs" to (System.currentTimeMillis() - previewStartedAt),
                "selectedMessageFetchMs" to selectedMessageFetchMs,
                "success" to result.dispatcherPreview.success,
                "parsedRows" to result.dispatcherPreview.parseResult?.rawRows?.size,
                "reconciliationReady" to (result.dispatcherPreview.parseResult != null && result.dispatcherPreview.success)
            )
        )
        persistDebugSnapshot(debug)
        result
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

    private suspend fun preflightHtmlCandidate(
        credentials: MailboxCredentials,
        item: EmailReportListItem,
        debug: EmailImportDebugSession
    ): EmailReportListItem {
        return try {
            val content = mailboxClient.fetchMessageContent(credentials, item.ref, debug)
                ?: return item.copy(
                    classification = EmailReportCandidateClassification.MALFORMED_REPORT,
                    classificationNote = "לא ניתן לטעון את תוכן ההודעה"
                )
            val htmlParts = content.htmlParts.mapNotNull { it.text?.takeIf { t -> t.isNotBlank() } }
                .ifEmpty { listOfNotNull(content.htmlBody?.takeIf { it.isNotBlank() }) }
            val presence = HtmlCommissionPresenceProbe.probe(htmlParts)
            debug.event(
                EmailImportDebugStage.HTML_PART_SCAN,
                EmailImportDebugStatus.INFO,
                "HTML presence probe",
                mapOf(
                    "messageIdHash" to (item.ref.messageId?.let { sha256(it.toByteArray()).take(16) }),
                    "htmlLength" to presence.htmlLength,
                    "tableCount" to presence.tableCount,
                    "imageTagCount" to presence.imageTagCount,
                    "cidReferenceCount" to presence.cidReferenceCount,
                    "maxTableColumns" to presence.maxTableColumns,
                    "maxTableRows" to presence.maxTableRows,
                    "keywordHits" to presence.keywordHits,
                    "anyRequiredHeaderTextPresent" to presence.anyRequiredHeaderTextPresent,
                    "inlineImageCount" to content.inlineImages.size,
                    "cellSnippets" to presence.sampleNonEmptyCellSnippets
                )
            )
            if (htmlParts.isEmpty()) {
                val imageOnly = content.inlineImages.isNotEmpty()
                return item.copy(
                    classification = if (imageOnly) {
                        EmailReportCandidateClassification.IMAGE_ONLY_REPORT
                    } else {
                        EmailReportCandidateClassification.SUPPLIER_EMAIL_NO_REPORT
                    },
                    classificationNote = if (imageOnly) {
                        "דוח העמלות במייל נמצא כתמונה ולא כטבלה הניתנת לקריאה"
                    } else {
                        "נמצאה הודעה משגריר אך לא נמצאה בה טבלת עמלות"
                    }
                )
            }
            val extraction = HtmlTableReportExtractor().extractFromHtmlParts(
                htmlParts = htmlParts,
                requiredHeaders = ShagrirHtmlTableReportParser.REQUIRED_HEADERS,
                headerAliases = ShagrirHtmlTableReportParser.HEADER_ALIASES
            )
            val selected = extraction.selectedTable
            when {
                selected != null && selected.missingRequiredHeaders.isEmpty() ->
                    item.copy(
                        classification = EmailReportCandidateClassification.VALID_REPORT,
                        classificationNote = "טבלת עמלות תקינה (${selected.rows.size} שורות)"
                    )
                !presence.anyRequiredHeaderTextPresent &&
                    (content.inlineImages.isNotEmpty() || presence.imageTagCount > 0) ->
                    item.copy(
                        classification = EmailReportCandidateClassification.IMAGE_ONLY_REPORT,
                        classificationNote = "דוח העמלות במייל נמצא כתמונה ולא כטבלה הניתנת לקריאה"
                    )
                extraction.tables.isEmpty() ->
                    item.copy(
                        classification = EmailReportCandidateClassification.SUPPLIER_EMAIL_NO_REPORT,
                        classificationNote = "נמצאה הודעה משגריר אך לא נמצאה בה טבלת עמלות"
                    )
                else -> {
                    val missing = extraction.tables
                        .maxByOrNull { it.matchedRequiredHeaders.size }
                        ?.missingRequiredHeaders
                        .orEmpty()
                    item.copy(
                        classification = EmailReportCandidateClassification.TABLE_FOUND_MISSING_COLUMNS,
                        classificationNote = if (missing.isNotEmpty()) {
                            "נמצאה טבלה אך חסרות העמודות: ${missing.joinToString(", ")}"
                        } else {
                            "נמצאה טבלה אך לא זוהו כל העמודות הנדרשות"
                        }
                    )
                }
            }
        } catch (e: Exception) {
            debug.event(
                EmailImportDebugStage.HTML_PART_SCAN,
                EmailImportDebugStatus.WARNING,
                "Preflight failed for candidate",
                mapOf("exception" to e.javaClass.simpleName)
            )
            item.copy(
                classification = EmailReportCandidateClassification.MALFORMED_REPORT,
                classificationNote = "בדיקת מוקדמת נכשלה"
            )
        }
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
        // Preview session already started in previewSelectedReport — reuse it.
        val debug = EmailImportDebugHub.latest ?: EmailImportDebugHub.beginPreview(
            parentSessionId = diagnostics.sessionId
        )
        debug.supplierId = supplier.id
        debug.supplierName = supplier.name
        debug.configuredSender = diagnostics.configuredSender
        debug.reportFormat = "HTML_TABLE"
        debug.senderMatchType = senderMatch.matchType.name
        debug.selectedRepresentation = "HTML_TABLE"
        if (debug.candidateMessageIdHash.isNullOrBlank()) {
            debug.candidateMessageIdHash = item.ref.messageId?.let { sha256(it.toByteArray()).take(16) }
        }

        val htmlParts = content.htmlParts.mapNotNull { it.text?.takeIf { t -> t.isNotBlank() } }
            .ifEmpty { listOfNotNull(content.htmlBody?.takeIf { it.isNotBlank() }) }

        debug.event(
            EmailImportDebugStage.MIME_TREE,
            EmailImportDebugStatus.INFO,
            "MIME inventory",
            mapOf(
                "mimeInventoryCount" to content.mimeInventory.size,
                "htmlPartCount" to content.htmlParts.size,
                "plainPartCount" to content.plainParts.size,
                "inlineImageCount" to content.inlineImages.size,
                "attachmentCount" to content.attachments.size,
                "mimePaths" to content.mimeInventory.take(40).map { "${it.mimePath}:${it.mimeType}" }
            )
        )

        val presence = HtmlCommissionPresenceProbe.probe(htmlParts)
        debug.event(
            EmailImportDebugStage.HTML_PART_SCAN,
            EmailImportDebugStatus.INFO,
            "Scanning HTML parts for commission tables",
            mapOf(
                "htmlPartCount" to htmlParts.size,
                "inlineImageCount" to content.inlineImages.size,
                "attachmentCount" to content.attachments.size,
                "messageIdHash" to (item.ref.messageId?.let { sha256(it.toByteArray()).take(16) }),
                "keywordHits" to presence.keywordHits,
                "anyRequiredHeaderTextPresent" to presence.anyRequiredHeaderTextPresent,
                "imageTagCount" to presence.imageTagCount,
                "cidReferenceCount" to presence.cidReferenceCount,
                "tableCount" to presence.tableCount,
                "maxTableColumns" to presence.maxTableColumns,
                "cellSnippets" to presence.sampleNonEmptyCellSnippets
            )
        )

        if (htmlParts.isEmpty()) {
            val imageOnly = content.inlineImages.isNotEmpty()
            val code = if (imageOnly) EmailImportErrorCode.NO_HTML_TABLE else EmailImportErrorCode.NO_HTML_BODY
            val msg = if (imageOnly) {
                "דוח העמלות במייל נמצא כתמונה ולא כטבלה הניתנת לקריאה"
            } else {
                code.hebrewMessage()
            }
            debug.event(
                EmailImportDebugStage.TABLE_PARSE_FAILURE,
                EmailImportDebugStatus.FAILURE,
                msg,
                mapOf("inlineImageCount" to content.inlineImages.size)
            )
            persistDebugSnapshot(debug)
            return failureBundle(
                item,
                code,
                diagnostics.copy(
                    notes = listOf(msg),
                    sessionId = debug.sessionId
                )
            )
        }

        val extraction = HtmlTableReportExtractor().extractFromHtmlParts(
            htmlParts = htmlParts,
            requiredHeaders = ShagrirHtmlTableReportParser.REQUIRED_HEADERS,
            headerAliases = ShagrirHtmlTableReportParser.HEADER_ALIASES
        )

        extraction.tables.forEach { t ->
            debug.event(
                EmailImportDebugStage.TABLE_HEADER_CANDIDATE,
                EmailImportDebugStatus.INFO,
                "Table header candidate",
                mapOf(
                    "htmlPart" to t.htmlPartIndex,
                    "table" to t.index,
                    "headerRow" to t.headerRowIndex,
                    "matched" to t.matchedRequiredHeaders.size,
                    "missing" to t.missingRequiredHeaders.size,
                    "rows" to t.rows.size,
                    "score" to t.score,
                    "rawHeaders" to t.rawHeaderCells.take(12),
                    "missingHeaders" to t.missingRequiredHeaders
                )
            )
        }

        val table = extraction.selectedTable
        if (table == null) {
            val imageOnly = !presence.anyRequiredHeaderTextPresent &&
                (content.inlineImages.isNotEmpty() || presence.imageTagCount > 0)
            val err = when {
                imageOnly -> "דוח העמלות במייל נמצא כתמונה ולא כטבלה הניתנת לקריאה"
                extraction.tables.isEmpty() -> "נמצאה הודעה משגריר אך לא נמצאה בה טבלת עמלות"
                else -> extraction.errors.firstOrNull()
                    ?: EmailImportErrorCode.MISSING_REQUIRED_COLUMNS.hebrewMessage()
            }
            debug.event(
                if (imageOnly) EmailImportDebugStage.TABLE_PARSE_FAILURE
                else EmailImportDebugStage.REQUIRED_HEADER_MISSING,
                EmailImportDebugStatus.FAILURE,
                err,
                mapOf(
                    "tablesFound" to extraction.tables.size,
                    "imageOnly" to imageOnly,
                    "keywordHits" to presence.keywordHits,
                    "bestMissing" to (extraction.tables.maxByOrNull { it.matchedRequiredHeaders.size }?.missingRequiredHeaders
                        ?: emptyList<String>())
                )
            )
            persistDebugSnapshot(debug)
            return failureBundle(
                item,
                if (extraction.tables.isEmpty() || imageOnly) EmailImportErrorCode.NO_HTML_TABLE
                else EmailImportErrorCode.MISSING_REQUIRED_COLUMNS,
                diagnostics.copy(
                    htmlTablesFound = extraction.tables.size,
                    notes = listOf(err),
                    sessionId = debug.sessionId,
                    failureStage = EmailImportDebugStage.REQUIRED_HEADER_MISSING.name,
                    failureMessage = err
                )
            )
        }

        debug.event(
            EmailImportDebugStage.TABLE_SELECTED,
            EmailImportDebugStatus.SUCCESS,
            "Selected commission table",
            mapOf(
                "htmlPart" to table.htmlPartIndex,
                "table" to table.index,
                "headerRow" to table.headerRowIndex,
                "matched" to table.matchedRequiredHeaders.size,
                "rows" to table.rows.size,
                "rawHeaders" to table.rawHeaderCells
            )
        )
        debug.tablesFound = extraction.tables.size
        debug.selectedTableRows = table.rows.size
        debug.htmlFound = true
        debug.selectedHtmlPartIndex = table.htmlPartIndex
        debug.selectedTableIndex = table.index
        debug.selectedHeaderRowIndex = table.headerRowIndex
        debug.event(
            EmailImportDebugStage.REQUIRED_HEADER_MATCH,
            EmailImportDebugStatus.SUCCESS,
            "All required headers matched",
            mapOf("matchedHeaders" to table.matchedRequiredHeaders, "rawHeaders" to table.rawHeaderCells)
        )

        val contentHash = htmlParser.contentHash(table)
        val duplicate = isDuplicate(supplier.id, content.ref.messageId, contentHash, userUid)
        if (duplicate) {
            persistDebugSnapshot(debug)
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
                    senderMatchType = senderMatch.matchType.name,
                    sessionId = debug.sessionId
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
        val parsed = htmlParser.parseHtmlParts(htmlParts, parseContext)
        if (!parsed.success) {
            debug.event(
                EmailImportDebugStage.TABLE_PARSE_FAILURE,
                EmailImportDebugStatus.FAILURE,
                "Table parse failed",
                mapOf("errors" to parsed.errors.take(5))
            )
        } else {
            debug.event(
                EmailImportDebugStage.TABLE_PARSE_SUCCESS,
                EmailImportDebugStatus.SUCCESS,
                "Table parsed",
                mapOf("parsedRows" to parsed.rawRows.size, "warnings" to parsed.warnings.size)
            )
            debug.parsedRows = parsed.rawRows.size
        }
        persistDebugSnapshot(debug)

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
                senderMatchType = senderMatch.matchType.name,
                sessionId = debug.sessionId,
                notes = preview.errors.ifEmpty { parsed.errors }
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
    ): EmailImportPreviewBundle {
        val userErrors = diagnostics.notes
            .map { it.trim() }
            .filter { it.isNotBlank() }
            .distinct()
            .ifEmpty { listOf(code.hebrewMessage()) }
        return EmailImportPreviewBundle(
            listItem = item,
            dispatcherPreview = CommissionReportImportDispatcher.PreviewResult(
                success = false,
                fileHash = "",
                sourceFileName = item.subject,
                isDuplicateFile = code == EmailImportErrorCode.DUPLICATE_REPORT,
                parseResult = null,
                errors = userErrors
            ),
            diagnostics = diagnostics.copy(notes = userErrors),
            contentHash = "",
            matchedSenderEmail = item.senderMatch.matchedEmail,
            senderMatchType = item.senderMatch.matchType
        )
    }

    private fun mapMailboxError(error: MailboxError?): EmailImportErrorCode = when (error) {
        MailboxError.NOT_CONFIGURED -> EmailImportErrorCode.MAILBOX_NOT_CONFIGURED
        MailboxError.INVALID_ACCOUNT -> EmailImportErrorCode.INVALID_GMAIL_ACCOUNT
        MailboxError.INVALID_APP_PASSWORD -> EmailImportErrorCode.INVALID_APP_PASSWORD
        MailboxError.AUTHENTICATION_FAILED -> EmailImportErrorCode.AUTHENTICATION_FAILED
        MailboxError.NETWORK_UNAVAILABLE -> EmailImportErrorCode.NETWORK_UNAVAILABLE
        MailboxError.DNS_FAILURE -> EmailImportErrorCode.DNS_FAILURE
        MailboxError.CONNECTION_TIMEOUT, MailboxError.TIMEOUT -> EmailImportErrorCode.CONNECTION_TIMEOUT
        MailboxError.SSL_FAILURE -> EmailImportErrorCode.SSL_FAILURE
        MailboxError.MAILBOX_UNAVAILABLE -> EmailImportErrorCode.MAILBOX_UNAVAILABLE
        MailboxError.IMAP_CONNECTION_FAILED -> EmailImportErrorCode.IMAP_CONNECTION_FAILED
        MailboxError.INBOX_OPEN_FAILED -> EmailImportErrorCode.INBOX_OPEN_FAILED
        MailboxError.SEARCH_FAILED -> EmailImportErrorCode.SEARCH_FAILED
        MailboxError.UNKNOWN, null -> EmailImportErrorCode.UNKNOWN
    }

    private fun searchWindowForReportMonth(reportYear: Int, reportMonth: Int): Pair<Long, Long> {
        val ym = YearMonth.of(reportYear, reportMonth)
        val zone = ZoneId.systemDefault()
        val start = ym.atDay(1).atStartOfDay(zone).toInstant().toEpochMilli()
        // Allow delivery up to 14 days after month end (July report may arrive early August)
        val end = ym.plusMonths(1).atDay(1).plusDays(14).atStartOfDay(zone).toInstant().toEpochMilli()
        return start to end
    }

    private fun persistDebugSnapshot(session: com.rentacar.app.emailimport.debug.EmailImportDebugSession) {
        try {
            val dir = java.io.File(context.cacheDir, "email_import_debug").apply { mkdirs() }
            val json = com.rentacar.app.emailimport.debug.EmailImportDebugJsonExporter.toJson(
                session = session,
                appVersionName = try {
                    context.packageManager.getPackageInfo(context.packageName, 0).versionName ?: "1.0"
                } catch (_: Exception) { "1.0" },
                appVersionCode = 1,
                buildType = if (com.rentacar.app.BuildConfig.DEBUG) "debug" else "release",
                deviceManufacturer = android.os.Build.MANUFACTURER,
                deviceModel = android.os.Build.MODEL,
                androidVersion = android.os.Build.VERSION.RELEASE,
                sdkInt = android.os.Build.VERSION.SDK_INT
            )
            java.io.File(dir, "email-import-debug-latest.json").writeText(json, Charsets.UTF_8)
            val hash = session.candidateMessageIdHash?.take(12)
            if (!hash.isNullOrBlank()) {
                java.io.File(dir, "email-import-debug-${session.sessionId}-$hash.json").writeText(json, Charsets.UTF_8)
            }
            // Keep latest + a handful of candidate snapshots
            dir.listFiles()
                ?.filter { it.name != "email-import-debug-latest.json" }
                ?.sortedByDescending { it.lastModified() }
                ?.drop(8)
                ?.forEach { it.delete() }
        } catch (e: Exception) {
            Log.w(TAG, "debug snapshot write failed: ${e.javaClass.simpleName}")
        }
    }

    private fun sha256(bytes: ByteArray): String {
        val digest = MessageDigest.getInstance("SHA-256").digest(bytes)
        return digest.joinToString("") { "%02x".format(it) }
    }

    companion object {
        private const val TAG = "RentCarEmailImport"
    }
}
