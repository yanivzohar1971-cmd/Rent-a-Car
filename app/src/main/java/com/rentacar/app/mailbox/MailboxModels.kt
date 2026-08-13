package com.rentacar.app.mailbox

/**
 * Mailbox credentials for the application's single Gmail connection.
 * Never log or persist the app password via toString/debug JSON.
 */
data class MailboxCredentials(
    val emailAddress: String,
    val appPassword: String
) {
    override fun toString(): String =
        "MailboxCredentials(emailAddress=$emailAddress, appPassword=********)"

    fun maskedForDiagnostics(): Map<String, String> = mapOf(
        "emailAddress" to emailAddress,
        "appPassword" to "********",
        "hasAppPassword" to (appPassword.isNotBlank()).toString(),
        "appPasswordLength" to normalizeAppPassword(appPassword).length.toString()
    )

    fun normalized(): MailboxCredentials = copy(
        emailAddress = emailAddress.trim(),
        appPassword = normalizeAppPassword(appPassword)
    )

    companion object {
        /** Google App Passwords may be pasted with spaces; strip all whitespace. */
        fun normalizeAppPassword(raw: String): String =
            raw.filterNot { it.isWhitespace() }
    }
}

enum class MailboxProvider {
    GMAIL_IMAP
}

sealed class MailboxConnectionResult {
    data object Success : MailboxConnectionResult()
    data class Failure(
        val error: MailboxError,
        val detail: String? = null
    ) : MailboxConnectionResult()
}

enum class MailboxError {
    NOT_CONFIGURED,
    INVALID_ACCOUNT,
    INVALID_APP_PASSWORD,
    AUTHENTICATION_FAILED,
    NETWORK_UNAVAILABLE,
    DNS_FAILURE,
    CONNECTION_TIMEOUT,
    SSL_FAILURE,
    TIMEOUT,
    MAILBOX_UNAVAILABLE,
    IMAP_CONNECTION_FAILED,
    INBOX_OPEN_FAILED,
    SEARCH_FAILED,
    UNKNOWN;

    fun hebrewMessage(): String = when (this) {
        NOT_CONFIGURED -> "תיבת המייל אינה מוגדרת"
        INVALID_ACCOUNT -> "כתובת Gmail אינה תקינה"
        INVALID_APP_PASSWORD -> "סיסמת אפליקציה אינה תקינה"
        AUTHENTICATION_FAILED -> "האימות לתיבת המייל נכשל"
        NETWORK_UNAVAILABLE -> "אין חיבור לרשת"
        DNS_FAILURE -> "לא ניתן לפתור את כתובת שרת המייל"
        CONNECTION_TIMEOUT -> "תם הזמן המוקצב לחיבור לתיבת המייל"
        SSL_FAILURE -> "שגיאת אבטחת חיבור (SSL)"
        TIMEOUT -> "תם הזמן המוקצב לפעולת המייל"
        MAILBOX_UNAVAILABLE -> "תיבת המייל אינה זמינה"
        IMAP_CONNECTION_FAILED -> "החיבור לתיבת המייל נכשל"
        INBOX_OPEN_FAILED -> "לא ניתן לפתוח את תיבת הדואר הנכנס"
        SEARCH_FAILED -> "חיפוש ההודעות נכשל"
        UNKNOWN -> "שגיאה לא ידועה בחיבור לתיבת המייל"
    }
}

/**
 * Replaceable mailbox transport. Future Gmail API client can implement the same contract.
 */
interface MailboxClient {
    val provider: MailboxProvider

    suspend fun testConnection(credentials: MailboxCredentials): MailboxConnectionResult

    suspend fun findMessagesBySender(
        credentials: MailboxCredentials,
        configuredSenderEmail: String,
        sinceEpochMillis: Long,
        limit: Int = 50
    ): MailboxSearchResult
}

data class MailboxSearchResult(
    val success: Boolean,
    val messages: List<MailboxMessageRef> = emptyList(),
    /** Application-local validations performed (not Gmail's internal scan size). */
    val scannedCount: Int = 0,
    val candidateCount: Int = 0,
    val error: MailboxError? = null,
    val errorDetail: String? = null,
    val exceptionClass: String? = null,
    val exceptionMessage: String? = null,
    val causeClass: String? = null,
    val directServerMatches: Int? = null,
    val replyToServerMatches: Int? = null,
    val bodyServerMatches: Int? = null,
    val mergedServerCandidates: Int? = null,
    val localBodyDownloads: Int? = null,
    val fallbackUsed: Boolean = false,
    val searchMode: String? = null,
    val serverSearchMs: Long? = null,
    val candidateMetadataMs: Long? = null,
    val totalSearchMs: Long? = null
)

data class MailboxMessageRef(
    val messageId: String?,
    val imapUid: Long?,
    val subject: String,
    val receivedAt: Long,
    val fromHeader: String?,
    val replyToHeader: String?,
    val folderName: String = "INBOX",
    /**
     * How the server search surfaced this candidate before local deep MIME validation.
     * DIRECT_FROM / REPLY_TO / SERVER_BODY_CANDIDATE / FALLBACK
     */
    val serverOrigin: String? = null
)

/**
 * One MIME body part inventory entry. Text payloads are only kept for text/html and text/plain.
 */
data class MailboxBodyPart(
    val mimePath: String,
    val mimeType: String,
    val disposition: String?,
    val contentId: String?,
    val fileName: String?,
    val sizeBytes: Long,
    val text: String? = null
)

data class MailboxInlineImageInfo(
    val mimeType: String?,
    val contentIdPresent: Boolean,
    val referencedByHtmlCid: Boolean,
    val fileNamePresent: Boolean,
    val sizeBytes: Long
)

data class MailboxMessageContent(
    val ref: MailboxMessageRef,
    /** Backward-compatible primary HTML (best candidate or first). */
    val htmlBody: String?,
    val plainBody: String?,
    val attachments: List<MailboxAttachment>,
    val htmlParts: List<MailboxBodyPart> = emptyList(),
    val plainParts: List<MailboxBodyPart> = emptyList(),
    val mimeInventory: List<MailboxBodyPart> = emptyList(),
    val inlineImages: List<MailboxInlineImageInfo> = emptyList()
)

data class MailboxAttachment(
    val fileName: String,
    val mimeType: String?,
    val sizeBytes: Long,
    val bytes: ByteArray
) {
    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (other !is MailboxAttachment) return false
        return fileName == other.fileName &&
            mimeType == other.mimeType &&
            sizeBytes == other.sizeBytes &&
            bytes.contentEquals(other.bytes)
    }

    override fun hashCode(): Int {
        var result = fileName.hashCode()
        result = 31 * result + (mimeType?.hashCode() ?: 0)
        result = 31 * result + sizeBytes.hashCode()
        result = 31 * result + bytes.contentHashCode()
        return result
    }

    override fun toString(): String =
        "MailboxAttachment(fileName=$fileName, mimeType=$mimeType, sizeBytes=$sizeBytes, bytes=[${bytes.size} bytes])"
}
