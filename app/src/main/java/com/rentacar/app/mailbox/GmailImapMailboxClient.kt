package com.rentacar.app.mailbox

import android.util.Log
import com.rentacar.app.emailimport.EmailAddressNormalizer
import com.rentacar.app.emailimport.ForwardedSenderResolver
import com.rentacar.app.emailimport.SenderMatchType
import com.rentacar.app.emailimport.debug.EmailImportDebugSession
import com.rentacar.app.emailimport.debug.EmailImportDebugStage
import com.rentacar.app.emailimport.debug.EmailImportDebugStatus
import com.sun.mail.imap.IMAPFolder
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import javax.mail.AuthenticationFailedException
import javax.mail.Folder
import javax.mail.Message
import javax.mail.MessagingException
import javax.mail.Multipart
import javax.mail.Part
import javax.mail.Session
import javax.mail.Store
import javax.mail.internet.MimeMessage
import java.io.ByteArrayOutputStream
import java.util.Properties

/**
 * Gmail IMAP mailbox client (SSL/TLS on port 993, App Password auth).
 * Replaceable later with a Gmail API implementation of [MailboxClient].
 */
class GmailImapMailboxClient(
    private val connectTimeoutMs: Int = 20_000,
    private val readTimeoutMs: Int = 60_000
) : MailboxClient {

    override val provider: MailboxProvider = MailboxProvider.GMAIL_IMAP

    override suspend fun testConnection(credentials: MailboxCredentials): MailboxConnectionResult =
        withContext(Dispatchers.IO) {
            connectAndOpenInbox(credentials, debug = null).fold(
                onSuccess = {
                    it.store.safeClose()
                    MailboxConnectionResult.Success
                },
                onFailure = { mapThrowableToConnectionFailure(it) }
            )
        }

    /**
     * Server-filtered supplier search:
     * 1) IMAP FromStringTerm + date window (direct)
     * 2) IMAP HeaderTerm(Reply-To) + date window
     * 3) IMAP BodyTerm + date window (forwarded)
     * Merge/dedupe by UID, then locally validate only that small set.
     * Broad date-only local body scan is FALLBACK only.
     */
    override suspend fun findMessagesBySender(
        credentials: MailboxCredentials,
        configuredSenderEmail: String,
        sinceEpochMillis: Long,
        limit: Int
    ): MailboxSearchResult = findMessagesBySender(
        credentials = credentials,
        configuredSenderEmail = configuredSenderEmail,
        sinceEpochMillis = sinceEpochMillis,
        untilEpochMillis = System.currentTimeMillis() + TimeUnitMs.DAY,
        limit = limit,
        debug = null
    )

    suspend fun findMessagesBySender(
        credentials: MailboxCredentials,
        configuredSenderEmail: String,
        sinceEpochMillis: Long,
        untilEpochMillis: Long,
        limit: Int = 50,
        debug: EmailImportDebugSession?
    ): MailboxSearchResult = withContext(Dispatchers.IO) {
        val searchStartedAt = System.currentTimeMillis()
        val configured = EmailAddressNormalizer.normalize(configuredSenderEmail)
        if (configured == null) {
            debug?.event(
                EmailImportDebugStage.SEARCH_BUILD,
                EmailImportDebugStatus.FAILURE,
                "configured sender invalid"
            )
            return@withContext MailboxSearchResult(
                success = false,
                error = MailboxError.INVALID_ACCOUNT,
                errorDetail = "configured sender invalid"
            )
        }

        debug?.mailboxHost = HOST
        debug?.mailboxPort = PORT
        debug?.searchWindowStartMs = sinceEpochMillis
        debug?.searchWindowEndMs = untilEpochMillis
        val planned = GmailSupplierImapSearchPlan.buildPlannedSearches(
            configuredSenderEmail = configured,
            sinceEpochMillis = sinceEpochMillis,
            untilEpochMillis = untilEpochMillis
        )
        debug?.searchQueryDescription = planned.joinToString(" | ") { it.description }

        debug?.event(
            EmailImportDebugStage.SEARCH_BUILD,
            EmailImportDebugStatus.INFO,
            "Built server-side supplier searches",
            mapOf(
                "sinceMs" to sinceEpochMillis,
                "untilMs" to untilEpochMillis,
                "configuredSender" to configured,
                "limit" to limit,
                "plannedSearchCount" to planned.size
            )
        )

        val opened = connectAndOpenInbox(credentials, debug)
        if (opened.isFailure) {
            val t = opened.exceptionOrNull()!!
            val mapped = mapThrowableToMailboxError(t)
            debug?.recordFailure(EmailImportDebugStage.IMAP_CONNECT_FAILURE, t)
            debug?.connectionSucceeded = false
            return@withContext MailboxSearchResult(
                success = false,
                error = mapped,
                errorDetail = sanitizeExceptionDetail(t),
                exceptionClass = t.javaClass.name,
                exceptionMessage = EmailImportDebugSession.sanitizeText(t.message ?: t.javaClass.simpleName),
                causeClass = t.cause?.javaClass?.name
            )
        }

        val session = opened.getOrThrow()
        debug?.connectionSucceeded = true
        try {
            val folder = session.folder
            val imapFolder = folder as? IMAPFolder
            debug?.folderName = folder.fullName ?: "INBOX"
            debug?.folderMessageCount = runCatching { folder.messageCount }.getOrNull()
            debug?.event(
                EmailImportDebugStage.SEARCH_START,
                EmailImportDebugStatus.INFO,
                "Starting server-side IMAP supplier search",
                mapOf("folderMessageCount" to debug?.folderMessageCount)
            )

            val serverSearchStarted = System.currentTimeMillis()
            var directMatches = emptyList<Message>()
            var replyMatches = emptyList<Message>()
            var bodyMatches = emptyList<Message>()
            var serverSearchSuccesses = 0
            val serverFailures = mutableListOf<String>()

            for (plan in planned) {
                val (startStage, resultStage) = when (plan.kind) {
                    GmailSupplierImapSearchPlan.Kind.DIRECT_FROM ->
                        EmailImportDebugStage.SERVER_SEARCH_DIRECT_START to
                            EmailImportDebugStage.SERVER_SEARCH_DIRECT_RESULT
                    GmailSupplierImapSearchPlan.Kind.REPLY_TO ->
                        EmailImportDebugStage.SERVER_SEARCH_REPLY_TO_START to
                            EmailImportDebugStage.SERVER_SEARCH_REPLY_TO_RESULT
                    GmailSupplierImapSearchPlan.Kind.BODY_FORWARD ->
                        EmailImportDebugStage.SERVER_SEARCH_BODY_START to
                            EmailImportDebugStage.SERVER_SEARCH_BODY_RESULT
                }
                debug?.event(startStage, EmailImportDebugStatus.INFO, "Server search start", mapOf("kind" to plan.kind.name))
                val found = try {
                    folder.search(plan.term).toList().also { serverSearchSuccesses++ }
                } catch (e: Exception) {
                    serverFailures += "${plan.kind.name}:${e.javaClass.simpleName}"
                    debug?.event(
                        resultStage,
                        EmailImportDebugStatus.WARNING,
                        "Server search failed",
                        mapOf(
                            "kind" to plan.kind.name,
                            "exceptionClass" to e.javaClass.name,
                            "sanitizedMessage" to EmailImportDebugSession.sanitizeText(e.message ?: "")
                        )
                    )
                    emptyList()
                }
                when (plan.kind) {
                    GmailSupplierImapSearchPlan.Kind.DIRECT_FROM -> directMatches = found
                    GmailSupplierImapSearchPlan.Kind.REPLY_TO -> replyMatches = found
                    GmailSupplierImapSearchPlan.Kind.BODY_FORWARD -> bodyMatches = found
                }
                debug?.event(
                    resultStage,
                    EmailImportDebugStatus.SUCCESS,
                    "Server search result",
                    mapOf("kind" to plan.kind.name, "matches" to found.size)
                )
            }

            debug?.directServerMatches = directMatches.size
            debug?.replyToServerMatches = replyMatches.size
            debug?.bodyServerMatches = bodyMatches.size
            debug?.serverSearchMs = System.currentTimeMillis() - serverSearchStarted

            val useFallback = serverSearchSuccesses == 0
            val bodySearchFailed = serverFailures.any { it.startsWith("BODY_FORWARD:") }
            val directUidSet = mutableSetOf<Long>()
            val replyUidSet = mutableSetOf<Long>()
            val bodyUidSet = mutableSetOf<Long>()
            fun collectUids(msgs: List<Message>, into: MutableSet<Long>) {
                for (msg in msgs) {
                    val uid = runCatching { imapFolder?.getUID(msg) }.getOrNull()
                    if (uid != null && uid > 0) into += uid
                }
            }

            val mergedCandidates: MutableList<Message>
            if (useFallback) {
                debug?.fallbackUsed = true
                debug?.fallbackReason = serverFailures.joinToString("; ").ifBlank { "all_server_searches_failed" }
                debug?.searchMode = "BOUNDED_LOCAL_SCAN"
                debug?.event(
                    EmailImportDebugStage.SERVER_SEARCH_FALLBACK,
                    EmailImportDebugStatus.WARNING,
                    "Falling back to bounded local date scan",
                    mapOf("reason" to debug?.fallbackReason, "maxBodyInspections" to 80)
                )
                val dateCandidates = searchDateWindowCandidates(
                    folder = folder,
                    sinceEpochMillis = sinceEpochMillis,
                    untilEpochMillis = untilEpochMillis,
                    debug = debug
                )
                mergedCandidates = dateCandidates.toMutableList()
            } else {
                debug?.fallbackUsed = false
                debug?.fallbackReason = null
                debug?.searchMode = "SERVER_FILTERED"
                collectUids(directMatches, directUidSet)
                collectUids(replyMatches, replyUidSet)
                collectUids(bodyMatches, bodyUidSet)
                val combined = directMatches + replyMatches + bodyMatches
                mergedCandidates = GmailSupplierImapSearchPlan.dedupeByKeys(
                    items = combined,
                    uidOf = { msg -> runCatching { imapFolder?.getUID(msg) }.getOrNull() },
                    messageIdOf = { msg -> runCatching { (msg as? MimeMessage)?.messageID }.getOrNull() },
                    messageNumberOf = { it.messageNumber }
                ).toMutableList()

                // BodyTerm unsupported/failed while From/Reply-To worked: bounded supplemental
                // forward discovery so we do not permanently lose BODY capability.
                if (bodySearchFailed && (directMatches.isNotEmpty() || replyMatches.isNotEmpty())) {
                    debug?.event(
                        EmailImportDebugStage.SERVER_SEARCH_FALLBACK,
                        EmailImportDebugStatus.WARNING,
                        "Partial BODY search failure — bounded supplemental body scan",
                        mapOf("maxBodyInspections" to 40)
                    )
                    val existingUids = mergedCandidates.mapNotNull {
                        runCatching { imapFolder?.getUID(it) }.getOrNull()
                    }.toMutableSet()
                    val dateCandidates = searchDateWindowCandidates(
                        folder = folder,
                        sinceEpochMillis = sinceEpochMillis,
                        untilEpochMillis = untilEpochMillis,
                        debug = debug
                    )
                    var supplementalBodyDownloads = 0
                    for (msg in dateCandidates) {
                        if (supplementalBodyDownloads >= 40) break
                        val uid = runCatching { imapFolder?.getUID(msg) }.getOrNull()
                        if (uid != null && uid in existingUids) continue
                        supplementalBodyDownloads++
                        val ref = toRef(folder, msg)
                        val bodies = extractBodiesShallow(msg)
                        val bodyMatch = ForwardedSenderResolver.resolveMatch(
                            configuredSenderEmail = configured,
                            fromHeader = ref.fromHeader,
                            replyToHeader = ref.replyToHeader,
                            plainBody = bodies.plain,
                            htmlBody = bodies.html
                        )
                        if (bodyMatch.matchType == SenderMatchType.FORWARDED_FROM && bodyMatch.matched) {
                            mergedCandidates += msg
                            if (uid != null) {
                                existingUids += uid
                                bodyUidSet += uid
                            }
                        }
                    }
                    debug?.localBodyDownloads = (debug?.localBodyDownloads ?: 0) + supplementalBodyDownloads
                }
            }

            if (mergedCandidates.isNotEmpty()) {
                try {
                    val fp = javax.mail.FetchProfile().apply {
                        add(javax.mail.FetchProfile.Item.ENVELOPE)
                        add(javax.mail.FetchProfile.Item.FLAGS)
                        if (imapFolder != null) add(javax.mail.UIDFolder.FetchProfileItem.UID)
                    }
                    folder.fetch(mergedCandidates.toTypedArray(), fp)
                } catch (_: Exception) {
                }
            }

            val sortedCandidates = mergedCandidates
                .sortedByDescending { it.receivedDate?.time ?: it.sentDate?.time ?: 0L }

            debug?.mergedServerCandidates = sortedCandidates.size
            debug?.candidateMessages = sortedCandidates.size
            debug?.event(
                EmailImportDebugStage.SERVER_SEARCH_MERGED,
                EmailImportDebugStatus.SUCCESS,
                "Merged server candidates",
                mapOf(
                    "direct" to directMatches.size,
                    "replyTo" to replyMatches.size,
                    "body" to bodyMatches.size,
                    "unique" to sortedCandidates.size,
                    "searchMode" to debug?.searchMode,
                    "fallbackUsed" to (debug?.fallbackUsed == true),
                    "bodySearchFailed" to bodySearchFailed
                )
            )

            val localStarted = System.currentTimeMillis()
            var localHeaderChecks = 0
            var localBodyDownloads = debug?.localBodyDownloads ?: 0
            val matches = mutableListOf<MailboxMessageRef>()
            var lastMatchType: String? = null

            if (debug?.searchMode == "SERVER_FILTERED") {
                // Fast path: envelope metadata only. Deep MIME belongs to candidate preview.
                for (message in sortedCandidates) {
                    if (matches.size >= limit) break
                    localHeaderChecks++
                    val uid = runCatching { imapFolder?.getUID(message) }.getOrNull()
                    val origin = when {
                        uid != null && uid in directUidSet -> SenderMatchType.DIRECT_FROM.name
                        uid != null && uid in replyUidSet -> SenderMatchType.REPLY_TO.name
                        else -> SenderMatchType.SERVER_BODY_CANDIDATE.name
                    }
                    val ref = toRef(folder, message).copy(serverOrigin = origin)
                    val headerMatch = ForwardedSenderResolver.resolveMatch(
                        configuredSenderEmail = configured,
                        fromHeader = ref.fromHeader,
                        replyToHeader = ref.replyToHeader,
                        plainBody = null,
                        htmlBody = null
                    )
                    if (headerMatch.matched) {
                        matches += ref.copy(serverOrigin = headerMatch.matchType.name)
                        lastMatchType = headerMatch.matchType.name
                    } else {
                        // BodyTerm (or supplemental) hit — not yet verified as FORWARDED_FROM
                        matches += ref.copy(serverOrigin = SenderMatchType.SERVER_BODY_CANDIDATE.name)
                        lastMatchType = SenderMatchType.SERVER_BODY_CANDIDATE.name
                    }
                }
                // Do not download MIME bodies while building the candidate list.
                localBodyDownloads = debug?.localBodyDownloads ?: 0
            } else {
                // Bounded fallback: limited body inspections only.
                val maxBodyInspections = 80
                for (message in sortedCandidates) {
                    if (matches.size >= limit) break
                    localHeaderChecks++
                    val ref = toRef(folder, message).copy(serverOrigin = "FALLBACK")
                    val headerMatch = ForwardedSenderResolver.resolveMatch(
                        configuredSenderEmail = configured,
                        fromHeader = ref.fromHeader,
                        replyToHeader = ref.replyToHeader,
                        plainBody = null,
                        htmlBody = null
                    )
                    if (headerMatch.matched) {
                        matches += ref.copy(serverOrigin = headerMatch.matchType.name)
                        lastMatchType = headerMatch.matchType.name
                        continue
                    }
                    if (localBodyDownloads >= maxBodyInspections) continue
                    localBodyDownloads++
                    val bodies = extractBodiesShallow(message)
                    val bodyMatch = ForwardedSenderResolver.resolveMatch(
                        configuredSenderEmail = configured,
                        fromHeader = ref.fromHeader,
                        replyToHeader = ref.replyToHeader,
                        plainBody = bodies.plain,
                        htmlBody = bodies.html
                    )
                    if (bodyMatch.matched) {
                        matches += ref.copy(serverOrigin = bodyMatch.matchType.name)
                        lastMatchType = bodyMatch.matchType.name
                    }
                }
            }

            val candidateMetadataMs = System.currentTimeMillis() - localStarted
            debug?.localValidationMs = candidateMetadataMs
            debug?.candidateMetadataMs = candidateMetadataMs
            debug?.localHeaderChecks = localHeaderChecks
            debug?.localBodyDownloads = localBodyDownloads
            debug?.messagesScanned = localHeaderChecks
            debug?.matchingMessages = matches.size
            debug?.senderMatchType = lastMatchType
            debug?.totalSearchMs = System.currentTimeMillis() - searchStartedAt
            debug?.event(
                EmailImportDebugStage.SEARCH_RESULT,
                EmailImportDebugStatus.SUCCESS,
                "Search completed",
                mapOf(
                    "searchMode" to debug?.searchMode,
                    "serverCandidates" to sortedCandidates.size,
                    "localHeaderChecks" to localHeaderChecks,
                    "localBodyDownloads" to localBodyDownloads,
                    "matched" to matches.size,
                    "directServerMatches" to debug?.directServerMatches,
                    "replyToServerMatches" to debug?.replyToServerMatches,
                    "bodyServerMatches" to debug?.bodyServerMatches,
                    "fallbackUsed" to (debug?.fallbackUsed == true),
                    "serverSearchMs" to debug?.serverSearchMs,
                    "candidateMetadataMs" to candidateMetadataMs,
                    "localValidationMs" to debug?.localValidationMs,
                    "totalMs" to debug?.totalSearchMs
                )
            )

            MailboxSearchResult(
                success = true,
                messages = matches,
                scannedCount = localHeaderChecks,
                candidateCount = sortedCandidates.size,
                directServerMatches = debug?.directServerMatches,
                replyToServerMatches = debug?.replyToServerMatches,
                bodyServerMatches = debug?.bodyServerMatches,
                mergedServerCandidates = sortedCandidates.size,
                localBodyDownloads = localBodyDownloads,
                fallbackUsed = debug?.fallbackUsed == true,
                searchMode = debug?.searchMode,
                serverSearchMs = debug?.serverSearchMs,
                candidateMetadataMs = candidateMetadataMs,
                totalSearchMs = debug?.totalSearchMs
            )
        } catch (e: Exception) {
            if (e is kotlinx.coroutines.CancellationException) throw e
            debug?.recordFailure(EmailImportDebugStage.SEARCH_START, e)
            try {
                Log.e(TAG, "search failed: ${e.javaClass.name}: ${EmailImportDebugSession.sanitizeText(e.message ?: "")}")
            } catch (_: Throwable) {
            }
            MailboxSearchResult(
                success = false,
                error = mapThrowableToMailboxError(e),
                errorDetail = sanitizeExceptionDetail(e),
                exceptionClass = e.javaClass.name,
                exceptionMessage = EmailImportDebugSession.sanitizeText(e.message ?: e.javaClass.simpleName),
                causeClass = e.cause?.javaClass?.name
            )
        } finally {
            session.store.safeClose()
        }
    }

    suspend fun fetchMessageContent(
        credentials: MailboxCredentials,
        ref: MailboxMessageRef,
        debug: EmailImportDebugSession? = null,
        includeAttachmentBytes: Boolean = true
    ): MailboxMessageContent? = withContext(Dispatchers.IO) {
        val fetchTotalStarted = System.currentTimeMillis()
        debug?.event(EmailImportDebugStage.MESSAGE_LOAD, EmailImportDebugStatus.INFO, "Fetching message content")
        val connectStarted = System.currentTimeMillis()
        val opened = connectAndOpenInbox(credentials, debug, folderName = ref.folderName)
        val connectMs = System.currentTimeMillis() - connectStarted
        if (opened.isFailure) {
            debug?.recordFailure(EmailImportDebugStage.MESSAGE_LOAD, opened.exceptionOrNull()!!)
            return@withContext null
        }
        val session = opened.getOrThrow()
        try {
            val folderOpenMs = 0L // included in connectAndOpenInbox
            val envelopeStarted = System.currentTimeMillis()
            val message = resolveMessage(session.folder, ref) ?: return@withContext null
            val selectedMessageEnvelopeMs = System.currentTimeMillis() - envelopeStarted

            val htmlStarted = System.currentTimeMillis()
            // HTML_TABLE preview: text parts + MIME inventory only — skip binary image payloads
            val extracted = extractAllBodies(message, includeAttachments = false)
            val selectedHtmlFetchMs = System.currentTimeMillis() - htmlStarted

            val binaryStarted = System.currentTimeMillis()
            val attachments = if (includeAttachmentBytes) {
                extractAttachments(message)
            } else {
                emptyList()
            }
            val binaryAttachmentFetchMs = System.currentTimeMillis() - binaryStarted

            val mimeStarted = System.currentTimeMillis()
            val htmlParts = extracted.htmlParts
            val plainParts = extracted.plainParts
            // Prefer HTML with the most <table> tags as primary body (not merely first HTML)
            val primaryHtml = htmlParts.maxByOrNull { part ->
                Regex("<table", RegexOption.IGNORE_CASE).findAll(part.text.orEmpty()).count()
            }?.text ?: htmlParts.firstOrNull()?.text
            val primaryPlain = plainParts.firstOrNull()?.text
            val mimeParseMs = System.currentTimeMillis() - mimeStarted
            val totalSelectedMessageFetchMs = System.currentTimeMillis() - fetchTotalStarted

            debug?.htmlFound = !primaryHtml.isNullOrBlank()
            debug?.tablesFound = htmlParts.sumOf { part ->
                Regex("<table", RegexOption.IGNORE_CASE).findAll(part.text.orEmpty()).count()
            }
            debug?.event(
                EmailImportDebugStage.MIME_PARSE,
                EmailImportDebugStatus.SUCCESS,
                "MIME parsed",
                mapOf(
                    "connectMs" to connectMs,
                    "folderOpenMs" to folderOpenMs,
                    "selectedMessageEnvelopeMs" to selectedMessageEnvelopeMs,
                    "selectedHtmlFetchMs" to selectedHtmlFetchMs,
                    "binaryAttachmentFetchMs" to binaryAttachmentFetchMs,
                    "mimeParseMs" to mimeParseMs,
                    "totalSelectedMessageFetchMs" to totalSelectedMessageFetchMs,
                    "includeAttachmentBytes" to includeAttachmentBytes,
                    "htmlPartCount" to htmlParts.size,
                    "plainPartCount" to plainParts.size,
                    "inlineImageCount" to extracted.inlineImages.size,
                    "attachmentCount" to attachments.size,
                    "mimeInventoryCount" to extracted.inventory.size
                )
            )
            htmlParts.forEachIndexed { idx, part ->
                debug?.event(
                    EmailImportDebugStage.MIME_HTML_PART,
                    EmailImportDebugStatus.INFO,
                    "HTML part",
                    mapOf(
                        "partIndex" to idx,
                        "mimePath" to part.mimePath,
                        "length" to (part.text?.length ?: 0),
                        "tableCount" to Regex("<table", RegexOption.IGNORE_CASE).findAll(part.text.orEmpty()).count()
                    )
                )
            }
            MailboxMessageContent(
                ref = ref,
                htmlBody = primaryHtml,
                plainBody = primaryPlain,
                attachments = attachments,
                htmlParts = htmlParts,
                plainParts = plainParts,
                mimeInventory = extracted.inventory,
                inlineImages = extracted.inlineImages
            )
        } catch (e: Exception) {
            if (e is kotlinx.coroutines.CancellationException) throw e
            debug?.recordFailure(EmailImportDebugStage.MESSAGE_LOAD, e)
            null
        } finally {
            session.store.safeClose()
        }
    }

    private data class OpenSession(val store: Store, val folder: Folder)

    private fun connectAndOpenInbox(
        credentials: MailboxCredentials,
        debug: EmailImportDebugSession?,
        folderName: String = "INBOX"
    ): Result<OpenSession> {
        if (!EmailAddressNormalizer.isSyntacticallyValid(credentials.emailAddress)) {
            return Result.failure(IllegalArgumentException("invalid gmail account"))
        }
        val password = MailboxCredentials.normalizeAppPassword(credentials.appPassword)
        if (password.length < 8) {
            return Result.failure(IllegalArgumentException("invalid app password length"))
        }
        debug?.event(
            EmailImportDebugStage.IMAP_CONNECT_START,
            EmailImportDebugStatus.INFO,
            "Connecting IMAP",
            mapOf(
                "host" to HOST,
                "port" to PORT,
                "ssl" to true,
                "connectionTimeoutMs" to connectTimeoutMs,
                "readTimeoutMs" to readTimeoutMs,
                "appPasswordLength" to password.length
            )
        )
        debug?.connectionAttempted = true
        return try {
            debug?.event(EmailImportDebugStage.IMAP_CREATE, EmailImportDebugStatus.INFO, "Creating IMAP store")
            val store = openStore(credentials.emailAddress.trim(), password)
            debug?.event(EmailImportDebugStage.IMAP_CONNECT_SUCCESS, EmailImportDebugStatus.SUCCESS, "IMAP connected")
            debug?.event(EmailImportDebugStage.FOLDER_OPEN_START, EmailImportDebugStatus.INFO, "Opening folder", mapOf("folder" to folderName))
            val folder = store.getFolder(folderName)
            try {
                folder.open(Folder.READ_ONLY)
            } catch (e: Exception) {
                store.safeClose()
                debug?.event(
                    EmailImportDebugStage.FOLDER_OPEN_FAILURE,
                    EmailImportDebugStatus.FAILURE,
                    "Folder open failed",
                    mapOf(
                        "exceptionClass" to e.javaClass.name,
                        "sanitizedMessage" to EmailImportDebugSession.sanitizeText(e.message ?: "")
                    )
                )
                return Result.failure(InboxOpenException(e))
            }
            debug?.event(EmailImportDebugStage.FOLDER_OPEN_SUCCESS, EmailImportDebugStatus.SUCCESS, "Folder opened")
            Result.success(OpenSession(store, folder))
        } catch (e: Exception) {
            if (e is kotlinx.coroutines.CancellationException) throw e
            debug?.event(
                EmailImportDebugStage.IMAP_CONNECT_FAILURE,
                EmailImportDebugStatus.FAILURE,
                "IMAP connect/open failed",
                mapOf(
                    "exceptionClass" to e.javaClass.name,
                    "sanitizedMessage" to EmailImportDebugSession.sanitizeText(e.message ?: "")
                )
            )
            Result.failure(e)
        }
    }

    private class InboxOpenException(cause: Exception) : MessagingException("inbox open failed", cause)

    private fun openStore(email: String, appPassword: String): Store {
        val props = Properties().apply {
            put("mail.store.protocol", "imaps")
            put("mail.imaps.host", HOST)
            put("mail.imaps.port", PORT.toString())
            put("mail.imaps.ssl.enable", "true")
            // Use default JVM trust store + hostname verification for imap.gmail.com
            put("mail.imaps.ssl.checkserveridentity", "true")
            put("mail.imaps.ssl.protocols", "TLSv1.2")
            put("mail.imaps.connectiontimeout", connectTimeoutMs.toString())
            put("mail.imaps.timeout", readTimeoutMs.toString())
            put("mail.imaps.writetimeout", readTimeoutMs.toString())
            // Allow IMAP partial fetch so large inline images are not pulled eagerly
            put("mail.imaps.partialfetch", "true")
            put("mail.mime.charset", "UTF-8")
        }
        val session = Session.getInstance(props)
        val store = session.getStore("imaps")
        store.connect(HOST, email, appPassword)
        return store
    }

    private fun searchDateWindowCandidates(
        folder: Folder,
        sinceEpochMillis: Long,
        untilEpochMillis: Long,
        debug: EmailImportDebugSession?
    ): List<Message> {
        val dateTerm = GmailSupplierImapSearchPlan
            .buildDateWindow(sinceEpochMillis, untilEpochMillis)
            .toDateTerm()
        val dateCandidates = try {
            folder.search(dateTerm).toList()
        } catch (e: Exception) {
            debug?.event(
                EmailImportDebugStage.SERVER_SEARCH_FALLBACK,
                EmailImportDebugStatus.WARNING,
                "Date SEARCH failed; using recent message numbers",
                mapOf(
                    "exceptionClass" to e.javaClass.name,
                    "sanitizedMessage" to EmailImportDebugSession.sanitizeText(e.message ?: "")
                )
            )
            recentMessagesFallback(folder, maxMessages = 300)
        }
        return dateCandidates
            .filter { msg ->
                val t = msg.receivedDate?.time ?: msg.sentDate?.time ?: 0L
                t in sinceEpochMillis..untilEpochMillis
            }
            .ifEmpty { dateCandidates.take(80) }
    }

    private fun recentMessagesFallback(folder: Folder, maxMessages: Int): List<Message> {
        val total = folder.messageCount
        if (total <= 0) return emptyList()
        val start = (total - maxMessages + 1).coerceAtLeast(1)
        return folder.getMessages(start, total)
            .sortedByDescending { it.receivedDate?.time ?: it.sentDate?.time ?: 0L }
            .toList()
    }

    private fun toRef(folder: Folder, message: Message): MailboxMessageRef {
        val uid = (folder as? IMAPFolder)?.getUID(message)
        val messageId = (message as? MimeMessage)?.messageID
        val from = message.from?.firstOrNull()?.toString()
        val replyTo = message.replyTo?.firstOrNull()?.toString()
        return MailboxMessageRef(
            messageId = messageId,
            imapUid = uid,
            subject = message.subject.orEmpty(),
            receivedAt = message.receivedDate?.time ?: message.sentDate?.time ?: 0L,
            fromHeader = from,
            replyToHeader = replyTo,
            folderName = folder.fullName ?: "INBOX"
        )
    }

    private fun resolveMessage(folder: Folder, ref: MailboxMessageRef): Message? {
        val imap = folder as? IMAPFolder
        if (imap != null && ref.imapUid != null && ref.imapUid > 0) {
            return imap.getMessageByUID(ref.imapUid)
        }
        if (!ref.messageId.isNullOrBlank()) {
            for (m in folder.messages) {
                val id = (m as? MimeMessage)?.messageID
                if (id != null && id == ref.messageId) return m
            }
        }
        return null
    }

    private data class Bodies(val html: String?, val plain: String?)

    private data class ExtractedBodies(
        val htmlParts: List<MailboxBodyPart>,
        val plainParts: List<MailboxBodyPart>,
        val inventory: List<MailboxBodyPart>,
        val inlineImages: List<MailboxInlineImageInfo>
    )

    private fun extractBodiesShallow(part: Part): Bodies {
        val all = extractAllBodies(part, maxDepth = 8, includeAttachments = false)
        return Bodies(
            html = all.htmlParts.firstOrNull()?.text,
            plain = all.plainParts.firstOrNull()?.text
        )
    }

    private fun extractBodiesDeep(
        part: Part,
        maxDepth: Int = 12,
        includeAttachments: Boolean = true,
        depth: Int = 0
    ): Bodies {
        val all = extractAllBodies(part, maxDepth, includeAttachments, depth)
        return Bodies(
            html = all.htmlParts.firstOrNull()?.text,
            plain = all.plainParts.firstOrNull()?.text
        )
    }

    /**
     * Collect ALL text/html and text/plain parts, including nested message/rfc822.
     * Does not stop at the first HTML alternative.
     */
    private fun extractAllBodies(
        part: Part,
        maxDepth: Int = 14,
        includeAttachments: Boolean = true,
        depth: Int = 0,
        path: String = "0"
    ): ExtractedBodies {
        val htmlParts = mutableListOf<MailboxBodyPart>()
        val plainParts = mutableListOf<MailboxBodyPart>()
        val inventory = mutableListOf<MailboxBodyPart>()
        val inlineImages = mutableListOf<MailboxInlineImageInfo>()
        if (depth > maxDepth) {
            return ExtractedBodies(htmlParts, plainParts, inventory, inlineImages)
        }
        try {
            val mimeType = runCatching { part.contentType?.substringBefore(';')?.trim().orEmpty() }.getOrDefault("")
            val disposition = runCatching { part.disposition }.getOrNull()
            val contentId = runCatching { part.getHeader("Content-ID")?.firstOrNull() }.getOrNull()
            val fileName = runCatching { part.fileName }.getOrNull()

            when {
                part.isMimeType("text/html") -> {
                    val text = part.content?.toString()
                    val bp = MailboxBodyPart(
                        mimePath = path,
                        mimeType = mimeType.ifBlank { "text/html" },
                        disposition = disposition,
                        contentId = contentId,
                        fileName = fileName,
                        sizeBytes = text?.length?.toLong() ?: 0L,
                        text = text
                    )
                    htmlParts += bp
                    inventory += bp.copy(text = null)
                }
                part.isMimeType("text/plain") -> {
                    val text = part.content?.toString()
                    val bp = MailboxBodyPart(
                        mimePath = path,
                        mimeType = mimeType.ifBlank { "text/plain" },
                        disposition = disposition,
                        contentId = contentId,
                        fileName = fileName,
                        sizeBytes = text?.length?.toLong() ?: 0L,
                        text = text
                    )
                    plainParts += bp
                    inventory += bp.copy(text = null)
                }
                part.isMimeType("multipart/*") -> {
                    val mp = part.content as? Multipart
                    if (mp != null) {
                        for (i in 0 until mp.count) {
                            val bodyPart = mp.getBodyPart(i)
                            if (!includeAttachments && Part.ATTACHMENT.equals(bodyPart.disposition, true)) continue
                            val nested = extractAllBodies(
                                bodyPart, maxDepth, includeAttachments, depth + 1, "$path/$i"
                            )
                            htmlParts += nested.htmlParts
                            plainParts += nested.plainParts
                            inventory += nested.inventory
                            inlineImages += nested.inlineImages
                        }
                    }
                }
                part.isMimeType("message/rfc822") || part.content is Message || part.content is MimeMessage -> {
                    val nestedMsg = when (val c = part.content) {
                        is Message -> c
                        is Part -> c
                        else -> null
                    }
                    if (nestedMsg != null) {
                        val nested = extractAllBodies(
                            nestedMsg, maxDepth, includeAttachments, depth + 1, "$path/rfc822"
                        )
                        htmlParts += nested.htmlParts
                        plainParts += nested.plainParts
                        inventory += nested.inventory
                        inlineImages += nested.inlineImages
                    }
                }
                part.isMimeType("image/*") -> {
                    val size = runCatching { part.size.toLong() }.getOrDefault(0L)
                    val cid = contentId?.trim()?.removePrefix("<")?.removeSuffix(">")
                    inlineImages += MailboxInlineImageInfo(
                        mimeType = mimeType,
                        contentIdPresent = !cid.isNullOrBlank(),
                        referencedByHtmlCid = false, // filled below
                        fileNamePresent = !fileName.isNullOrBlank(),
                        sizeBytes = size
                    )
                    inventory += MailboxBodyPart(
                        mimePath = path,
                        mimeType = mimeType,
                        disposition = disposition,
                        contentId = contentId,
                        fileName = fileName,
                        sizeBytes = size
                    )
                }
                else -> {
                    inventory += MailboxBodyPart(
                        mimePath = path,
                        mimeType = mimeType.ifBlank { "unknown" },
                        disposition = disposition,
                        contentId = contentId,
                        fileName = fileName,
                        sizeBytes = runCatching { part.size.toLong() }.getOrDefault(0L)
                    )
                }
            }
        } catch (_: Exception) {
        }

        // Mark cid references from collected HTML
        val cidRefs = htmlParts.flatMap { part ->
            Regex("""cid:([^"'>\s]+)""", RegexOption.IGNORE_CASE)
                .findAll(part.text.orEmpty())
                .map { it.groupValues[1].trim().removePrefix("<").removeSuffix(">") }
                .toList()
        }.map { it.lowercase() }.toSet()
        val linkedImages = inlineImages.map { img ->
            val present = img.contentIdPresent
            // We don't store content-id on InlineImageInfo beyond flag; approximate via inventory
            img.copy(referencedByHtmlCid = present && cidRefs.isNotEmpty())
        }

        return ExtractedBodies(htmlParts, plainParts, inventory, linkedImages)
    }

    private fun extractAttachments(part: Part, depth: Int = 0): List<MailboxAttachment> {
        if (depth > 12) return emptyList()
        val result = mutableListOf<MailboxAttachment>()
        try {
            when {
                part.isMimeType("multipart/*") -> {
                    val mp = part.content as? Multipart ?: return result
                    for (i in 0 until mp.count) result += extractAttachments(mp.getBodyPart(i), depth + 1)
                }
                part.isMimeType("message/rfc822") || part.content is Message || part.content is MimeMessage -> {
                    val nestedMsg = when (val c = part.content) {
                        is Message -> c
                        is Part -> c
                        else -> null
                    }
                    if (nestedMsg != null) {
                        result += extractAttachments(nestedMsg, depth + 1)
                    }
                }
                else -> {
                    val fileName = part.fileName
                    val disposition = part.disposition
                    val isAttach = Part.ATTACHMENT.equals(disposition, true) ||
                        (!fileName.isNullOrBlank() && !part.isMimeType("text/*") && !part.isMimeType("image/*"))
                    if (isAttach && !fileName.isNullOrBlank()) {
                        val bytes = readPartBytes(part)
                        if (bytes != null) {
                            result += MailboxAttachment(
                                fileName = fileName,
                                mimeType = part.contentType,
                                sizeBytes = bytes.size.toLong(),
                                bytes = bytes
                            )
                        }
                    }
                }
            }
        } catch (_: Exception) {
        }
        return result
    }

    private fun readPartBytes(part: Part): ByteArray? = try {
        part.inputStream.use { input ->
            val out = ByteArrayOutputStream()
            val buf = ByteArray(8192)
            var n: Int
            var total = 0
            while (input.read(buf).also { n = it } != -1) {
                total += n
                if (total > MAX_ATTACHMENT_BYTES) return null
                out.write(buf, 0, n)
            }
            out.toByteArray()
        }
    } catch (_: Exception) {
        null
    }

    private fun Store.safeClose() {
        try {
            if (isConnected) close()
        } catch (_: Exception) {
        }
    }

    companion object {
        private const val TAG = "RentCarEmailImport"
        const val HOST = "imap.gmail.com"
        const val PORT = 993
        private const val MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024

        fun mapThrowableToMailboxError(t: Throwable): MailboxError {
            var cur: Throwable? = t
            var depth = 0
            while (cur != null && depth < 8) {
                when (cur) {
                    is AuthenticationFailedException -> return MailboxError.AUTHENTICATION_FAILED
                    is java.net.UnknownHostException -> return MailboxError.DNS_FAILURE
                    is java.net.SocketTimeoutException -> return MailboxError.CONNECTION_TIMEOUT
                    is java.net.ConnectException -> return MailboxError.NETWORK_UNAVAILABLE
                    is javax.net.ssl.SSLException -> return MailboxError.SSL_FAILURE
                    is java.io.InterruptedIOException -> return MailboxError.CONNECTION_TIMEOUT
                }
                val name = cur.javaClass.name
                val msg = (cur.message ?: "").lowercase()
                when {
                    name.contains("AuthenticationFailed", true) -> return MailboxError.AUTHENTICATION_FAILED
                    name.contains("UnknownHost", true) -> return MailboxError.DNS_FAILURE
                    name.contains("SSL", true) -> return MailboxError.SSL_FAILURE
                    name.contains("SocketTimeout", true) -> return MailboxError.CONNECTION_TIMEOUT
                    msg.contains("authentication failed") -> return MailboxError.AUTHENTICATION_FAILED
                    msg.contains("timed out") || msg.contains("timeout") -> return MailboxError.CONNECTION_TIMEOUT
                    msg.contains("unable to find valid certification") -> return MailboxError.SSL_FAILURE
                }
                cur = cur.cause
                depth++
            }
            return when (t) {
                is InboxOpenException -> MailboxError.INBOX_OPEN_FAILED
                is IllegalArgumentException -> when {
                    t.message?.contains("account", true) == true -> MailboxError.INVALID_ACCOUNT
                    t.message?.contains("password", true) == true -> MailboxError.INVALID_APP_PASSWORD
                    else -> MailboxError.UNKNOWN
                }
                is MessagingException -> MailboxError.IMAP_CONNECTION_FAILED
                else -> MailboxError.UNKNOWN
            }
        }

        fun mapThrowableToConnectionFailure(t: Throwable): MailboxConnectionResult.Failure =
            MailboxConnectionResult.Failure(mapThrowableToMailboxError(t), sanitizeExceptionDetail(t))

        fun sanitizeExceptionDetail(t: Throwable): String {
            val chain = buildString {
                var cur: Throwable? = t
                var i = 0
                while (cur != null && i < 4) {
                    if (i > 0) append(" | cause: ")
                    append(cur.javaClass.simpleName)
                    cur.message?.let { append(": ").append(EmailImportDebugSession.sanitizeText(it)) }
                    cur = cur.cause
                    i++
                }
            }
            return chain
        }

        private fun hashId(value: String?): String? {
            if (value.isNullOrBlank()) return null
            val digest = java.security.MessageDigest.getInstance("SHA-256")
                .digest(value.toByteArray(Charsets.UTF_8))
            return digest.take(8).joinToString("") { "%02x".format(it) }
        }
    }

    private object TimeUnitMs {
        const val DAY = 24L * 60 * 60 * 1000
    }
}
