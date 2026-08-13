package com.rentacar.app.mailbox

import android.util.Log
import com.rentacar.app.emailimport.EmailAddressNormalizer
import com.rentacar.app.emailimport.ForwardedSenderResolver
import com.sun.mail.imap.IMAPFolder
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout
import java.io.ByteArrayOutputStream
import java.util.Date
import java.util.Properties
import javax.mail.AuthenticationFailedException
import javax.mail.Folder
import javax.mail.Message
import javax.mail.MessagingException
import javax.mail.Multipart
import javax.mail.Part
import javax.mail.Session
import javax.mail.Store
import javax.mail.internet.MimeMessage
import javax.mail.search.ComparisonTerm
import javax.mail.search.ReceivedDateTerm

/**
 * Gmail IMAP mailbox client (SSL/TLS on port 993, App Password auth).
 * Replaceable later with a Gmail API implementation of [MailboxClient].
 */
class GmailImapMailboxClient(
    private val connectTimeoutMs: Long = 20_000L,
    private val operationTimeoutMs: Long = 60_000L
) : MailboxClient {

    override val provider: MailboxProvider = MailboxProvider.GMAIL_IMAP

    override suspend fun testConnection(credentials: MailboxCredentials): MailboxConnectionResult =
        withContext(Dispatchers.IO) {
            if (!EmailAddressNormalizer.isSyntacticallyValid(credentials.emailAddress)) {
                return@withContext MailboxConnectionResult.Failure(MailboxError.INVALID_ACCOUNT)
            }
            if (credentials.appPassword.isBlank() || credentials.appPassword.length < 8) {
                return@withContext MailboxConnectionResult.Failure(MailboxError.INVALID_APP_PASSWORD)
            }
            try {
                withTimeout(connectTimeoutMs) {
                    openStore(credentials).use { store ->
                        store.getFolder("INBOX").use { folder ->
                            folder.open(Folder.READ_ONLY)
                        }
                    }
                }
                MailboxConnectionResult.Success
            } catch (e: AuthenticationFailedException) {
                Log.w(TAG, "auth failed")
                MailboxConnectionResult.Failure(MailboxError.AUTHENTICATION_FAILED)
            } catch (e: java.net.UnknownHostException) {
                MailboxConnectionResult.Failure(MailboxError.NETWORK_UNAVAILABLE)
            } catch (e: java.net.SocketTimeoutException) {
                MailboxConnectionResult.Failure(MailboxError.TIMEOUT)
            } catch (e: javax.net.ssl.SSLException) {
                MailboxConnectionResult.Failure(MailboxError.SSL_FAILURE)
            } catch (e: kotlinx.coroutines.TimeoutCancellationException) {
                MailboxConnectionResult.Failure(MailboxError.TIMEOUT)
            } catch (e: MessagingException) {
                Log.w(TAG, "mailbox unavailable: ${e.javaClass.simpleName}")
                MailboxConnectionResult.Failure(MailboxError.MAILBOX_UNAVAILABLE)
            } catch (e: Exception) {
                Log.w(TAG, "connection error: ${e.javaClass.simpleName}")
                MailboxConnectionResult.Failure(MailboxError.UNKNOWN)
            }
        }

    override suspend fun findMessagesBySender(
        credentials: MailboxCredentials,
        configuredSenderEmail: String,
        sinceEpochMillis: Long,
        limit: Int
    ): MailboxSearchResult = withContext(Dispatchers.IO) {
        val configured = EmailAddressNormalizer.normalize(configuredSenderEmail)
            ?: return@withContext MailboxSearchResult(
                success = false,
                error = MailboxError.INVALID_ACCOUNT,
                errorDetail = "configured sender invalid"
            )
        try {
            withTimeout(operationTimeoutMs) {
                openStore(credentials).use { store ->
                    store.getFolder("INBOX").use { folder ->
                        folder.open(Folder.READ_ONLY)
                        val since = Date(sinceEpochMillis)
                        val dateTerm = ReceivedDateTerm(ComparisonTerm.GE, since)
                        // Broad date search; exact sender match (incl. forwarded) done in-process
                        val candidates = folder.search(dateTerm)
                            .sortedByDescending { it.receivedDate?.time ?: 0L }
                        var scanned = 0
                        val matches = mutableListOf<MailboxMessageRef>()
                        for (message in candidates) {
                            if (matches.size >= limit) break
                            scanned++
                            val ref = toRef(folder, message)
                            val bodies = extractBodiesShallow(message)
                            val match = ForwardedSenderResolver.resolveMatch(
                                configuredSenderEmail = configured,
                                fromHeader = ref.fromHeader,
                                replyToHeader = ref.replyToHeader,
                                plainBody = bodies.plain,
                                htmlBody = bodies.html
                            )
                            if (match.matched) {
                                matches += ref
                            }
                        }
                        MailboxSearchResult(
                            success = true,
                            messages = matches,
                            scannedCount = scanned
                        )
                    }
                }
            }
        } catch (e: AuthenticationFailedException) {
            MailboxSearchResult(success = false, error = MailboxError.AUTHENTICATION_FAILED)
        } catch (e: java.net.UnknownHostException) {
            MailboxSearchResult(success = false, error = MailboxError.NETWORK_UNAVAILABLE)
        } catch (e: java.net.SocketTimeoutException) {
            MailboxSearchResult(success = false, error = MailboxError.TIMEOUT)
        } catch (e: javax.net.ssl.SSLException) {
            MailboxSearchResult(success = false, error = MailboxError.SSL_FAILURE)
        } catch (e: kotlinx.coroutines.TimeoutCancellationException) {
            MailboxSearchResult(success = false, error = MailboxError.TIMEOUT)
        } catch (e: Exception) {
            Log.w(TAG, "search failed: ${e.javaClass.simpleName}")
            MailboxSearchResult(
                success = false,
                error = MailboxError.UNKNOWN,
                errorDetail = e.javaClass.simpleName
            )
        }
    }

    suspend fun fetchMessageContent(
        credentials: MailboxCredentials,
        ref: MailboxMessageRef
    ): MailboxMessageContent? = withContext(Dispatchers.IO) {
        try {
            withTimeout(operationTimeoutMs) {
                openStore(credentials).use { store ->
                    store.getFolder(ref.folderName).use { folder ->
                        folder.open(Folder.READ_ONLY)
                        val message = resolveMessage(folder, ref)
                        if (message == null) {
                            null
                        } else {
                            val bodies = extractBodiesDeep(message)
                            val attachments = extractAttachments(message)
                            MailboxMessageContent(
                                ref = ref,
                                htmlBody = bodies.html,
                                plainBody = bodies.plain,
                                attachments = attachments
                            )
                        }
                    }
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "fetch failed: ${e.javaClass.simpleName}")
            null
        }
    }

    private fun openStore(credentials: MailboxCredentials): Store {
        val props = Properties().apply {
            put("mail.store.protocol", "imaps")
            put("mail.imaps.host", HOST)
            put("mail.imaps.port", PORT.toString())
            put("mail.imaps.ssl.enable", "true")
            put("mail.imaps.ssl.trust", HOST)
            put("mail.imaps.connectiontimeout", connectTimeoutMs.toString())
            put("mail.imaps.timeout", operationTimeoutMs.toString())
            put("mail.imaps.writetimeout", operationTimeoutMs.toString())
        }
        val session = Session.getInstance(props)
        val store = session.getStore("imaps")
        store.connect(HOST, credentials.emailAddress.trim(), credentials.appPassword)
        return store
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
            val all = folder.messages
            for (m in all) {
                val id = (m as? MimeMessage)?.messageID
                if (id != null && id == ref.messageId) return m
            }
        }
        return null
    }

    private data class Bodies(val html: String?, val plain: String?)

    private fun extractBodiesShallow(part: Part): Bodies {
        // Limit work during search — prefer text parts without decoding huge attachments
        return extractBodiesDeep(part, maxDepth = 8, includeAttachments = false)
    }

    private fun extractBodiesDeep(
        part: Part,
        maxDepth: Int = 12,
        includeAttachments: Boolean = true,
        depth: Int = 0
    ): Bodies {
        if (depth > maxDepth) return Bodies(null, null)
        var html: String? = null
        var plain: String? = null

        fun merge(other: Bodies) {
            if (html == null) html = other.html
            if (plain == null) plain = other.plain
        }

        try {
            when {
                part.isMimeType("text/html") -> {
                    html = part.content?.toString()
                }
                part.isMimeType("text/plain") -> {
                    plain = part.content?.toString()
                }
                part.isMimeType("multipart/*") -> {
                    val mp = part.content as? Multipart ?: return Bodies(html, plain)
                    for (i in 0 until mp.count) {
                        val bodyPart = mp.getBodyPart(i)
                        if (!includeAttachments && Part.ATTACHMENT.equals(bodyPart.disposition, true)) {
                            continue
                        }
                        merge(extractBodiesDeep(bodyPart, maxDepth, includeAttachments, depth + 1))
                        if (html != null && plain != null) break
                    }
                }
                part.content is Part -> {
                    merge(extractBodiesDeep(part.content as Part, maxDepth, includeAttachments, depth + 1))
                }
            }
        } catch (_: Exception) {
            // Ignore malformed parts during extraction
        }
        return Bodies(html, plain)
    }

    private fun extractAttachments(part: Part, depth: Int = 0): List<MailboxAttachment> {
        if (depth > 12) return emptyList()
        val result = mutableListOf<MailboxAttachment>()
        try {
            when {
                part.isMimeType("multipart/*") -> {
                    val mp = part.content as? Multipart ?: return result
                    for (i in 0 until mp.count) {
                        result += extractAttachments(mp.getBodyPart(i), depth + 1)
                    }
                }
                else -> {
                    val fileName = part.fileName
                    val disposition = part.disposition
                    val isAttach = Part.ATTACHMENT.equals(disposition, true) ||
                        (!fileName.isNullOrBlank() && !part.isMimeType("text/*"))
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

    private fun readPartBytes(part: Part): ByteArray? {
        return try {
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
    }

    private inline fun <T> Store.use(block: (Store) -> T): T {
        try {
            return block(this)
        } finally {
            try {
                if (isConnected) close()
            } catch (_: Exception) {
            }
        }
    }

    private inline fun <T> Folder.use(block: (Folder) -> T): T {
        try {
            return block(this)
        } finally {
            try {
                if (isOpen) close(false)
            } catch (_: Exception) {
            }
        }
    }

    companion object {
        private const val TAG = "GmailImapMailbox"
        const val HOST = "imap.gmail.com"
        const val PORT = 993
        private const val MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024
    }
}
